"""Deployment checks without network or service side effects."""
import datetime as dt
import pathlib
import re
import tarfile

REPOSITORY = 'raihan-rizky/pos-system-monorepo'
BRANCHES = {'prod': 'main', 'dev': 'dev'}
RETENTION = 72 * 3600


class ReleaseError(Exception):
    """Safe, operator-facing failure; never include credentials."""


def timestamp(value):
    return dt.datetime.fromisoformat(value.replace('Z', '+00:00')).timestamp()


def validate_run(run, target, artifact, now):
    if target not in BRANCHES or run.get('head_branch') != BRANCHES[target]:
        raise ReleaseError('Branch tidak sesuai lingkungan')
    if (run.get('event') not in ('push', 'workflow_dispatch') or run.get('conclusion') != 'success'
            or run.get('head_repository', {}).get('full_name') != REPOSITORY
            or run.get('path') != '.github/workflows/ci.yml'
            or not re.fullmatch('[a-f0-9]{40}', run.get('head_sha', ''))):
        raise ReleaseError('Provenance CI tidak valid')
    if (artifact.get('name') != f'pos-runtime-{target}-{run["id"]}'
            or artifact.get('expired') or not 0 < artifact.get('size_in_bytes', 0) <= 1024 ** 3
            or not 0 <= now - timestamp(artifact['created_at']) < RETENTION):
        raise ReleaseError('Artefak tidak sesuai atau kedaluwarsa')


def validate_metadata(meta, target, expected, run):
    if (meta.get('target') != target or meta.get('checkedOutSha') != run['head_sha']
            or meta.get('sourceBranch') != BRANCHES[target]
            or meta.get('sourceRepository') != REPOSITORY or str(meta.get('runId')) != str(run['id'])
            or not re.fullmatch('[A-Za-z0-9_-]{1,200}', meta.get('buildId', ''))):
        raise ReleaseError('Identitas build tidak sesuai')
    for key in ('publicAuthUrl', 'publicAnonKeySha256', 'publicR2BaseUrl', 'schemaSha256'):
        if not expected.get(key) or meta.get(key) != expected[key]:
            raise ReleaseError('Konfigurasi atau schema berubah: ' + key)


def cleanup_plan(records, protected, now):
    rollback = {}
    for record in records:
        inactive = record.get('inactive_at')
        if (record.get('healthy') and inactive is not None and 0 <= now - inactive < RETENTION
                and record.get('target') in BRANCHES):
            old = rollback.get(record['target'])
            if old is None or inactive > old['inactive_at']:
                rollback[record['target']] = record
    keep = protected | {r['id'] for r in rollback.values()}
    result = []
    for record in records:
        if record['id'] in keep or record.get('in_flight'):
            continue
        inactive, failed = record.get('inactive_at'), record.get('failed_at')
        if ((failed is not None and now - failed >= 24 * 3600)
                or (inactive is not None and now - inactive >= RETENTION)
                or (inactive is not None and record.get('remote_verified'))):
            result.append(record['id'])
    return result


def extract_runtime(archive, destination):
    destination = pathlib.Path(destination)
    destination.mkdir(parents=True, exist_ok=True)
    try:
        with tarfile.open(archive, 'r:gz') as tar:
            for member in tar.getmembers():
                path = pathlib.PurePosixPath(member.name)
                if (path.is_absolute() or '..' in path.parts or not path.parts or path.parts[0] != 'runtime'
                        or not (member.isfile() or member.isdir() or member.issym() or member.islnk())):
                    raise ReleaseError('Path atau tipe arsip tidak aman')
                if member.issym() or member.islnk():
                    link = pathlib.PurePosixPath(member.linkname)
                    target = destination / (path.parent / link if member.issym() else link)
                    if link.is_absolute() or not target.resolve().is_relative_to((destination / 'runtime').resolve()):
                        raise ReleaseError('Link arsip keluar runtime')
            tar.extractall(destination, filter='data')
    except (tarfile.TarError, OSError, ValueError) as exc:
        raise ReleaseError('Ekstraksi arsip ditolak') from exc
