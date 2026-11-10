#!/usr/bin/env python3
"""Fixed-purpose SSH endpoint and systemd/GitHub adapters for native releases."""
import contextlib
import hashlib
import html
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys
import tarfile
import time
import urllib.request
import uuid
import zipfile

from release_engine import ReleaseManager
from release_policy import BRANCHES, REPOSITORY, ReleaseError, validate_metadata, validate_run

CONFIG = pathlib.Path('/etc/pos-system/deploy.json')
LIB = pathlib.Path('/usr/local/lib/pos-deploy')


def command(args, cwd=None, timeout=40):
    try:
        result = subprocess.run(args, cwd=cwd, capture_output=True, text=True, timeout=timeout,
                                env={**os.environ, 'GH_CONFIG_DIR': '/root/.config/gh'})
        if result.returncode:
            raise ReleaseError('Perintah gagal: ' + pathlib.Path(args[0]).name)
        return result.stdout.strip()
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise ReleaseError('Perintah tidak selesai: ' + pathlib.Path(args[0]).name) from exc


def write_json(path, data):
    path = pathlib.Path(path)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    tmp = path.with_suffix('.tmp')
    with open(tmp, 'w', encoding='utf-8') as stream:
        os.chmod(tmp, 0o600)
        json.dump(data, stream, indent=2)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(tmp, path)


def validate_request(request, bound):
    allowed = {'action', 'target', 'run_id', 'artifact_id', 'operation_id', 'manual'}
    if (not isinstance(request, dict) or set(request) - allowed or bound not in BRANCHES
            or request.get('target') != bound or request.get('action') not in ('deploy', 'rollback', 'status')):
        raise ReleaseError('Permintaan SSH ditolak')
    if 'manual' in request and not isinstance(request['manual'], bool):
        raise ReleaseError('Penanda manual tidak valid')
    if request['action'] == 'status':
        if not re.fullmatch(re.escape(bound) + '-[a-f0-9]{16}', request.get('operation_id', '')):
            raise ReleaseError('Identitas operasi tidak valid')
    else:
        for key in ('run_id', 'artifact_id'):
            value = request.get(key)
            if value is None and request['action'] == 'rollback':
                continue
            if type(value) is not int or not 0 < value < 10 ** 16:
                raise ReleaseError('Identitas run/artefak tidak valid')
    return request


class Services:
    def __init__(self, config):
        self.config = config

    def settings(self, target):
        return self.config['targets'][target]

    def properties(self, unit):
        output = command(['systemctl', 'show', unit, '--property=WorkingDirectory,ActiveState,MainPID,ControlGroup'])
        return dict(line.split('=', 1) for line in output.splitlines() if '=' in line)

    def environment(self, target):
        result = {}
        for line in pathlib.Path(self.settings(target)['env_file']).read_text().splitlines():
            key, sep, value = line.partition('=')
            if sep and not key.lstrip().startswith('#'):
                result[key.strip()] = value.strip().strip('"').strip("'")
        return result

    def expected(self, target, runtime):
        env = self.environment(target)
        schema = pathlib.Path(runtime) / 'packages/db/prisma/schema.prisma'
        return dict(publicAuthUrl=env['NEXT_PUBLIC_SUPABASE_URL'],
                    publicAnonKeySha256=hashlib.sha256(env['NEXT_PUBLIC_SUPABASE_ANON_KEY'].encode()).hexdigest(),
                    publicR2BaseUrl=env['R2_PUBLIC_BASE_URL'],
                    schemaSha256=hashlib.sha256(schema.read_bytes()).hexdigest())

    def database_fingerprint(self, target, runtime):
        value = command(['/usr/local/bin/node', '--env-file=' + self.settings(target)['env_file'],
                         str(LIB / 'probe-db.cjs'), str(runtime)], timeout=30)
        if not re.fullmatch('[a-f0-9]{64}', value):
            raise ReleaseError('Fingerprint database tidak valid')
        return value

    def compatible(self, record):
        try:
            expected = self.expected(record['target'], record['runtime'])
            return (all(record['metadata'].get(k) == v for k, v in expected.items())
                    and record['database_fingerprint'] == self.database_fingerprint(record['target'], record['runtime']))
        except (ReleaseError, KeyError, OSError):
            return False

    def live_paths(self):
        paths = set()
        for target in BRANCHES:
            for key in ('web', 'worker'):
                paths.add(self.properties(self.settings(target)[key]).get('WorkingDirectory', ''))
        prefix = self.config['root'].rstrip('/') + '/'
        for proc in pathlib.Path('/proc').iterdir():
            if not proc.name.isdigit():
                continue
            entries = [proc / 'cwd', proc / 'exe']
            try:
                entries.extend((proc / 'fd').iterdir())
            except OSError:
                pass
            for entry in entries:
                try:
                    path = os.readlink(entry)
                    if path.startswith(prefix):
                        paths.add(path)
                except OSError:
                    pass
            try:
                for line in (proc / 'maps').read_text().splitlines():
                    fields = line.split(None, 5)
                    if len(fields) == 6 and fields[5].startswith(prefix):
                        paths.add(fields[5])
            except OSError:
                pass
        return paths

    def worker_stopped(self, target):
        props = self.properties(self.settings(target)['worker'])
        if props.get('ActiveState') not in ('inactive', 'failed') or props.get('MainPID') != '0':
            return False
        group = props.get('ControlGroup', '')
        procs = pathlib.Path('/sys/fs/cgroup' + group) / 'cgroup.procs'
        return not group or not procs.exists() or not procs.read_text().strip()

    def drain(self, target, timeout):
        command(['systemctl', 'stop', '--no-block', self.settings(target)['worker']])
        until = time.monotonic() + timeout
        while time.monotonic() < until:
            if self.worker_stopped(target):
                return True
            time.sleep(1)
        return False

    def start_worker(self, target):
        command(['systemctl', 'start', self.settings(target)['worker']])

    def switch(self, target, record):
        runtime = pathlib.Path(record['runtime'])
        root = pathlib.Path(self.config['root']) / 'releases'
        if not runtime.is_dir() or not runtime.resolve().is_relative_to(root.resolve()):
            raise ReleaseError('Runtime keluar direktori release')
        for name in ('web', 'worker'):
            unit = self.settings(target)[name]
            directory = pathlib.Path('/etc/systemd/system') / (unit + '.service.d')
            directory.mkdir(exist_ok=True, parents=True)
            path = directory / 'zz-cicd-release.conf'
            temp = path.with_suffix('.tmp')
            temp.write_text('[Service]\nWorkingDirectory=' + str(runtime) + '\n')
            os.replace(temp, path)
        command(['systemctl', 'daemon-reload'])
        command(['systemctl', 'restart', self.settings(target)['web']], timeout=100)
        self.start_worker(target)

    def http(self, url, headers=None):
        request = urllib.request.Request(url, headers=headers or {})
        with urllib.request.urlopen(request, timeout=8) as response:
            if response.status != 200:
                raise ReleaseError('HTTP readiness gagal')
            return response.read(2 * 1024 * 1024).decode('utf-8', errors='replace')

    def page(self, base):
        body = self.http(base + '/login')
        scripts = re.findall(r'<script[^>]+src="([^\"]+)"', body)
        assets = [html.unescape(s) for s in scripts if s.startswith('/_next/')][:2]
        if len(assets) != 2:
            raise ReleaseError('Aset Next.js belum tersedia')
        for asset in assets:
            self.http(base + asset)

    def canary(self, record):
        target, runtime = record['target'], record['runtime']
        available = next(int(line.split()[1]) * 1024 for line in pathlib.Path('/proc/meminfo').read_text().splitlines() if line.startswith('MemAvailable:'))
        if available < 768 * 1024 ** 2:
            raise ReleaseError('Headroom RAM tidak cukup untuk canary')
        unit = 'pos-canary-' + uuid.uuid4().hex[:12]
        port = 3102 if target == 'prod' else 3103
        command(['systemd-run', '--quiet', '--collect', '--unit=' + unit,
                 '--property=WorkingDirectory=' + runtime, '--property=MemoryMax=512M',
                 '--setenv=NODE_ENV=production', '/usr/local/bin/node',
                 '--env-file=' + self.settings(target)['env_file'], '/usr/local/bin/pnpm',
                 '--filter', '@pos/web', 'exec', 'next', 'start', '-H', '127.0.0.1', '-p', str(port)])
        try:
            until = time.monotonic() + 60
            while True:
                try:
                    self.page('http://127.0.0.1:' + str(port))
                    if not self.compatible(record):
                        raise ReleaseError('Canary database/konfigurasi tidak kompatibel')
                    return
                except Exception:
                    if time.monotonic() >= until:
                        raise ReleaseError('Canary tidak siap dalam 60 detik')
                    time.sleep(2)
        finally:
            command(['systemctl', 'stop', unit], timeout=30)

    def ready(self, target, record):
        until = time.monotonic() + 60
        while time.monotonic() < until:
            try:
                for key in ('web', 'worker'):
                    props = self.properties(self.settings(target)[key])
                    if props.get('ActiveState') != 'active' or props.get('WorkingDirectory') != record['runtime']:
                        raise ReleaseError('Service belum sesuai build')
                self.page(self.settings(target)['url'])
                env = self.environment(target)
                self.http(env['NEXT_PUBLIC_SUPABASE_URL'] + '/auth/v1/health',
                          {'apikey': env['NEXT_PUBLIC_SUPABASE_ANON_KEY']})
                if not self.compatible(record):
                    raise ReleaseError('Database/konfigurasi tidak sesuai')
                return True
            except Exception:
                time.sleep(2)
        return False


class Github:
    def __init__(self, config, services):
        self.config, self.services = config, services

    def api(self, suffix):
        return json.loads(command(['gh', 'api', 'repos/' + REPOSITORY + '/' + suffix]))

    def head(self, target):
        return self.api('git/ref/heads/' + BRANCHES[target])['object']['sha']

    def prepare(self, request, active):
        target, run_id, artifact_id = request['target'], request['run_id'], request['artifact_id']
        run = self.api(f'actions/runs/{run_id}')
        artifacts = self.api(f'actions/runs/{run_id}/artifacts?per_page=100')['artifacts']
        artifact = next((a for a in artifacts if a['id'] == artifact_id), None)
        if artifact is None:
            raise ReleaseError('Artefak tidak ditemukan pada run CI')
        validate_run(run, target, artifact, time.time())
        if active.get('run_id') == run_id and active.get('artifact_id') == artifact_id:
            return dict(active)
        root = pathlib.Path(self.config['root'])
        if shutil.disk_usage(root).free < 4 * 1024 ** 3:
            raise ReleaseError('Ruang kosong sebelum staging kurang dari 4 GiB')
        staging = root / 'staging' / (target + '-' + uuid.uuid4().hex)
        staging.mkdir(parents=True, mode=0o700)
        write_json(staging / 'receipt.json', {'created_at': time.time(), 'target': target})
        archive_zip = staging / 'artifact.zip'
        with open(archive_zip, 'wb') as output:
            result = subprocess.run(['gh', 'api', f'repos/{REPOSITORY}/actions/artifacts/{artifact_id}/zip'],
                                    stdout=output, stderr=subprocess.PIPE, timeout=240,
                                    env={**os.environ, 'GH_CONFIG_DIR': '/root/.config/gh'})
        if result.returncode or archive_zip.stat().st_size > 1024 ** 3:
            raise ReleaseError('Unduhan artefak gagal')
        tarname = 'pos-web-runtime-' + run['head_sha'] + '.tar.gz'
        expected_names = {tarname, 'metadata.json', 'sha256sums.txt'}
        with zipfile.ZipFile(archive_zip) as package:
            if set(package.namelist()) != expected_names or len(package.infolist()) != 3:
                raise ReleaseError('Isi ZIP tidak sesuai manifest')
            for item in package.infolist():
                limit = 1024 ** 3 if item.filename == tarname else 65536
                if item.file_size > limit:
                    raise ReleaseError('Ukuran item ZIP tidak valid')
                with package.open(item) as source, open(staging / item.filename, 'wb') as output:
                    shutil.copyfileobj(source, output)
        sums = (staging / 'sha256sums.txt').read_text().splitlines()
        checked = set()
        for line in sums:
            match = re.fullmatch(r'([a-f0-9]{64})  ([A-Za-z0-9._-]+)', line)
            if not match or match[2] not in {tarname, 'metadata.json'} or match[2] in checked:
                raise ReleaseError('Manifest checksum tidak valid')
            with open(staging / match[2], 'rb') as stream:
                digest = hashlib.file_digest(stream, 'sha256').hexdigest()
            if digest != match[1]:
                raise ReleaseError('Checksum artefak berbeda')
            checked.add(match[2])
        if checked != {tarname, 'metadata.json'}:
            raise ReleaseError('Checksum tidak lengkap')
        meta = json.loads((staging / 'metadata.json').read_text())
        validate_metadata(meta, target, self.services.expected(target, active['runtime']), run)
        release_id = target + '-' + run['head_sha'][:16] + '-' + str(run_id)
        parent = root / 'releases' / release_id
        record = dict(id=release_id, target=target, runtime=str(parent / 'runtime'), metadata=meta,
                      run_id=run_id, artifact_id=artifact_id, remote_verified=True,
                      database_fingerprint=active['database_fingerprint'])
        if parent.exists():
            receipt = json.loads((parent / 'release.json').read_text())
            if receipt != record:
                raise ReleaseError('Identitas release yang ada berbeda')
            shutil.rmtree(staging)
            return record
        with tarfile.open(staging / tarname, 'r:gz') as tar:
            needed = sum(item.size for item in tar.getmembers())
        if shutil.disk_usage(root).free - needed < 1024 ** 3:
            raise ReleaseError('Ruang kosong setelah staging akan kurang dari 1 GiB')
        from release_policy import extract_runtime
        extract_runtime(staging / tarname, staging / 'unpacked')
        runtime = staging / 'unpacked/runtime'
        if (runtime / 'apps/web/.next/BUILD_ID').read_text().strip() != meta['buildId']:
            raise ReleaseError('Build ID runtime berbeda')
        if hashlib.sha256((runtime / 'packages/db/prisma/schema.prisma').read_bytes()).hexdigest() != meta['schemaSha256']:
            raise ReleaseError('Schema runtime berbeda')
        parent.mkdir()
        os.replace(runtime, parent / 'runtime')
        write_json(parent / 'release.json', record)
        shutil.rmtree(staging)
        return record


@contextlib.contextmanager
def locked(wait=True):
    import fcntl
    fd = os.open('/run/lock/pos-system-deployment.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'a+') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | (0 if wait else fcntl.LOCK_NB))
        except BlockingIOError:
            raise ReleaseError('Operasi deployment lain sedang berjalan')
        yield


def job_path(config, operation_id):
    if not re.fullmatch('(prod|dev)-[a-f0-9]{16}', operation_id):
        raise ReleaseError('Identitas operasi ditolak')
    return pathlib.Path(config['state_file']).parent / 'jobs' / (operation_id + '.json')


def bootstrap(config, services):
    path = pathlib.Path(config['state_file'])
    if path.exists():
        raise ReleaseError('Registry sudah ada; bootstrap tidak menimpa state')
    state = dict(version=1, environments={}, releases={}, blocked={})
    root = pathlib.Path(config['root'])
    for target in BRANCHES:
        settings = config['targets'][target]
        props = services.properties(settings['web'])
        worker = services.properties(settings['worker'])
        runtime = pathlib.Path(props['WorkingDirectory'])
        if (props['ActiveState'] != 'active' or worker['ActiveState'] != 'active'
                or worker['WorkingDirectory'] != str(runtime)
                or not runtime.resolve().is_relative_to((root / 'releases').resolve())):
            raise ReleaseError('Baseline service belum konsisten')
        build_id = (runtime / 'apps/web/.next/BUILD_ID').read_text().strip()
        metadata = None
        paths = [runtime.parent / 'metadata.json'] + list((root / 'artifacts').glob('*/metadata.json'))
        for meta_path in paths:
            if meta_path.exists():
                possible = json.loads(meta_path.read_text())
                if possible.get('buildId') == build_id and possible.get('target') == target:
                    metadata = possible
                    break
        if not metadata:
            raise ReleaseError('Metadata baseline tidak ditemukan; tinjau manual')
        expected = services.expected(target, runtime)
        for key in ('publicAuthUrl', 'publicAnonKeySha256'):
            if metadata.get(key) != expected[key]:
                raise ReleaseError('Konfigurasi baseline berbeda: ' + key)
        metadata.update(expected)
        metadata.update(sourceBranch=BRANCHES[target], sourceRepository=REPOSITORY)
        record = dict(id=runtime.parent.name, target=target, runtime=str(runtime), metadata=metadata,
                      healthy=True, activated_at=time.time(),
                      database_fingerprint=services.database_fingerprint(target, runtime))
        if not services.ready(target, record):
            raise ReleaseError('Baseline readiness belum lulus')
        state['environments'][target] = record['id']
        state['releases'][record['id']] = record
    write_json(path, state)
    return {'result': 'baseline_registered', 'active': state['environments']}


def cleanup_staging(config):
    root = pathlib.Path(config['root']) / 'staging'
    if not root.exists():
        return []
    deleted = []
    for path in root.iterdir():
        if path.is_symlink() or not path.is_dir() or not re.fullmatch('(prod|dev)-[a-f0-9]{32}', path.name):
            continue
        try:
            receipt = json.loads((path / 'receipt.json').read_text())
            if time.time() - receipt['created_at'] < 24 * 3600:
                continue
        except (OSError, ValueError, KeyError):
            continue
        shutil.rmtree(path)
        deleted.append(path.name)
    return deleted


def main(argv):
    if argv == ['--help']:
        print('pos-release: bootstrap | recover | cleanup [--apply] | ssh TARGET | execute OPERATION_ID')
        return
    if os.geteuid() != 0:
        raise ReleaseError('Helper harus dijalankan melalui sudo terbatas')
    config = json.loads(CONFIG.read_text())
    services = Services(config)
    manager = ReleaseManager(config, services, Github(config, services))
    action = argv[0] if argv else ''
    if action == 'ssh' and len(argv) == 2:
        raw = sys.stdin.read(8193)
        if len(raw) > 8192:
            raise ReleaseError('Permintaan terlalu besar')
        request = validate_request(json.loads(raw), argv[1])
        if request['action'] == 'status':
            result = json.loads(job_path(config, request['operation_id']).read_text())
            print(json.dumps(result))
            return
        operation_id = request['target'] + '-' + uuid.uuid4().hex[:16]
        write_json(job_path(config, operation_id), dict(operation_id=operation_id, state='queued', request=request))
        command(['systemd-run', '--quiet', '--collect', '--unit=pos-deploy-' + operation_id,
                 '--property=UMask=0077', '/usr/local/sbin/pos-release', 'execute', operation_id])
        print(json.dumps({'operation_id': operation_id, 'state': 'queued'}))
        return
    if action == 'execute' and len(argv) == 2:
        path = job_path(config, argv[1])
        job = json.loads(path.read_text())
        with locked():
            job.update(state='running', started_at=time.time())
            write_json(path, job)
            try:
                request = job['request']
                result = manager.rollback(request) if request['action'] == 'rollback' else manager.deploy(request)
                result['cleanup'] = manager.cleanup(apply=True)
                result['free_bytes'] = shutil.disk_usage(config['root']).free
                job.update(state='success', result=result)
            except Exception as exc:
                message = str(exc) if isinstance(exc, ReleaseError) else 'Kesalahan helper: ' + type(exc).__name__
                job.update(state='failure', error=message)
            job['finished_at'] = time.time()
            write_json(path, job)
            print(json.dumps(job))
        return
    with locked(wait=False):
        if action == 'bootstrap':
            result = bootstrap(config, services)
        elif action == 'recover':
            manager.recover()
            result = {'pending': bool(manager.load().get('pending'))}
        elif action == 'cleanup':
            result = {'releases': manager.cleanup(apply='--apply' in argv)}
            if '--apply' in argv:
                result['staging'] = cleanup_staging(config)
        else:
            raise ReleaseError('Perintah helper tidak dikenal')
        print(json.dumps(result))


if __name__ == '__main__':
    try:
        main(sys.argv[1:])
    except Exception as exc:
        message = str(exc) if isinstance(exc, ReleaseError) else 'Kesalahan helper: ' + type(exc).__name__
        print(json.dumps({'state': 'failure', 'error': message}))
        sys.exit(1)
