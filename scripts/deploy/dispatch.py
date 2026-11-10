"""Actions client. The server independently verifies all deployment claims."""
import json
import os
import pathlib
import subprocess
import tempfile
import time
import urllib.request

REPOSITORY = 'raihan-rizky/pos-system-monorepo'


def select_request(event_name, event):
    if event_name == 'workflow_run':
        run = event['workflow_run']
        if (run.get('conclusion') != 'success' or run.get('event') not in ('push', 'workflow_dispatch')
                or run.get('head_branch') not in ('main', 'dev')
                or run.get('head_repository', {}).get('full_name') != REPOSITORY
                or run.get('path') != '.github/workflows/ci.yml'):
            return None
        return dict(action='deploy', target='prod' if run['head_branch'] == 'main' else 'dev',
                    run_id=run['id'], manual=False)
    if event_name != 'workflow_dispatch':
        return None
    inputs = event['inputs']
    action, target = inputs.get('action'), inputs.get('target')
    if action not in ('deploy', 'rollback') or target not in ('prod', 'dev'):
        raise ValueError('Pilihan operasi tidak valid')
    request = dict(action=action, target=target, manual=True)
    if inputs.get('run_id'):
        if not inputs['run_id'].isdigit() or int(inputs['run_id']) <= 0:
            raise ValueError('Run ID harus berupa angka positif')
        request['run_id'] = int(inputs['run_id'])
    elif action != 'rollback':
        raise ValueError('Run CI sukses wajib dipilih untuk deploy manual')
    return request


def github(path):
    request = urllib.request.Request('https://api.github.com/repos/' + REPOSITORY + '/' + path,
                                    headers={'Authorization': 'Bearer ' + os.environ['GH_TOKEN'],
                                             'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28'})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def main():
    event = json.loads(pathlib.Path(os.environ['GITHUB_EVENT_PATH']).read_text())
    request = select_request(os.environ['GITHUB_EVENT_NAME'], event)
    if request is None:
        print('Run ini tidak memenuhi syarat deployment.')
        return
    if request.get('run_id'):
        name = f'pos-runtime-{request["target"]}-{request["run_id"]}'
        artifacts = github(f'actions/runs/{request["run_id"]}/artifacts?per_page=100')['artifacts']
        matches = [a for a in artifacts if a['name'] == name and not a['expired']]
        if len(matches) != 1:
            raise RuntimeError('Artefak target tidak ditemukan atau ambigu')
        request['artifact_id'] = matches[0]['id']
    with tempfile.TemporaryDirectory() as tmp:
        private = pathlib.Path(tmp) / 'deploy.key'
        known = pathlib.Path(tmp) / 'known_hosts'
        private.write_text(os.environ['VPS_SSH_KEY'].rstrip() + '\n')
        known.write_text(os.environ['VPS_KNOWN_HOSTS'].rstrip() + '\n')
        private.chmod(0o600)
        known.chmod(0o600)
        args = ['ssh', '-T', '-i', str(private), '-p', os.environ.get('VPS_PORT', '29922'),
                '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-o', 'StrictHostKeyChecking=yes',
                '-o', 'UserKnownHostsFile=' + str(known), 'pos-deploy@' + os.environ['VPS_HOST'], 'request']
        def ssh(payload):
            result = subprocess.run(args, input=json.dumps(payload), text=True, capture_output=True, timeout=40)
            if result.returncode:
                raise RuntimeError('SSH deployment gagal; periksa akses helper VPS')
            data = json.loads(result.stdout)
            if data.get('state') == 'failure' and 'operation_id' not in data:
                raise RuntimeError(data.get('error', 'Permintaan ditolak'))
            return data
        queued = ssh(request)
        operation = queued['operation_id']
        print('Operasi VPS: ' + operation, flush=True)
        until = time.monotonic() + 40 * 60
        while time.monotonic() < until:
            result = ssh(dict(action='status', target=request['target'], operation_id=operation))
            if result['state'] in ('success', 'failure'):
                summary = '# Deployment ' + request['target'] + '\n\n```json\n' + json.dumps(result, indent=2) + '\n```\n'
                with open(os.environ['GITHUB_STEP_SUMMARY'], 'a', encoding='utf-8') as output:
                    output.write(summary)
                print(json.dumps(result), flush=True)
                if result['state'] != 'success':
                    raise RuntimeError(result.get('error', 'Deployment gagal'))
                return
            time.sleep(5)
        raise RuntimeError('Batas tunggu runner habis; operasi VPS tetap persisten. Periksa status sebelum mencoba ulang.')


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print('Deployment gagal: ' + str(exc) if isinstance(exc, (ValueError, RuntimeError)) else 'Deployment gagal: ' + type(exc).__name__)
        raise SystemExit(1)
