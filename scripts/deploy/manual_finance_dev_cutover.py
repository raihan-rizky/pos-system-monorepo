"""Validation and durable state for the manual-finance development cutover.

This module does not apply migrations or alter services by itself.
"""
import copy
import hashlib
import json
import os
import pathlib
import re
import secrets
import stat
import tempfile


class CutoverError(Exception):
    pass


MIGRATIONS = (
    '20261121010000_manual_finance_categories',
    '20261121020000_manual_payable_create_idempotency',
    '20261121030000_payable_ledger_version',
    '20261121040000_managed_proof_registry_disabled',
)

PHASES = (
    'gate_intent', 'gate_closed', 'fence_intent', 'fenced', 'backup_verified',
    'migrating', 'migrated', 'ci_ready', 'switching', 'activated', 'thawing', 'complete',
)


def _hex(value, length):
    return isinstance(value, str) and re.fullmatch('[a-f0-9]{' + str(length) + '}', value) is not None


def _identity(value):
    return (isinstance(value, dict) and set(value) == {'cluster', 'database'}
            and isinstance(value['cluster'], str) and re.fullmatch('[1-9][0-9]{0,29}', value['cluster']) is not None
            and isinstance(value['database'], str) and re.fullmatch('[A-Za-z0-9_]{1,63}', value['database']) is not None)


def _role_name(value):
    return isinstance(value, str) and re.fullmatch('[a-z][a-z0-9_]{0,62}', value) is not None


def safe_role_settings(settings):
    return (isinstance(settings, list) and all(isinstance(value, str) and '=' in value
            and value.split('=', 1)[0].strip().lower() not in ('role', 'session_authorization')
            for value in settings))


def validate_plan(plan):
    keys = {'version', 'target', 'dev_database', 'prod_database', 'database_roles', 'active_release', 'candidate', 'migrations'}
    if isinstance(plan, dict) and 'database_baseline' in plan:
        keys.add('database_baseline')
    if (not isinstance(plan, dict) or set(plan) != keys or type(plan['version']) is not int
            or plan['version'] != 1 or plan['target'] != 'dev'
            or not _identity(plan['dev_database']) or not _identity(plan['prod_database'])
            or plan['dev_database']['cluster'] == plan['prod_database']['cluster']):
        raise CutoverError('Identitas target development tidak valid')
    roles = plan['database_roles']
    if (not isinstance(roles, dict) or set(roles) != {'owner', 'admin', 'writers'}
            or not _role_name(roles['owner']) or not _role_name(roles['admin'])
            or roles['owner'] == roles['admin'] or not isinstance(roles['writers'], list)
            or not 1 <= len(roles['writers']) <= 16 or any(not _role_name(role) for role in roles['writers'])
            or roles['writers'] != sorted(set(roles['writers'])) or roles['owner'] not in roles['writers']
            or roles['admin'] in roles['writers']):
        raise CutoverError('Daftar role penulis development tidak valid')
    active = plan['active_release']
    candidate = plan['candidate']
    if (not isinstance(active, dict) or set(active) != {'id', 'commit', 'schema_sha256', 'database_fingerprint'}
            or not _hex(active['commit'], 40) or not _hex(active['schema_sha256'], 64)
            or not _hex(active['database_fingerprint'], 64)
            or not isinstance(active['id'], str)
            or re.fullmatch('dev-' + active['commit'][:16] + '-[1-9][0-9]{0,15}', active['id']) is None):
        raise CutoverError('Identitas release development tidak valid')
    if (not isinstance(candidate, dict) or set(candidate) != {'tree', 'schema_sha256', 'database_fingerprint', 'prisma_bundle_sha256'}
            or not _hex(candidate['tree'], 40) or not _hex(candidate['schema_sha256'], 64)
            or not _hex(candidate['database_fingerprint'], 64) or not _hex(candidate['prisma_bundle_sha256'], 64)
            or candidate['schema_sha256'] == active['schema_sha256']
            or candidate['database_fingerprint'] == active['database_fingerprint']):
        raise CutoverError('Identitas kandidat development tidak valid')
    if 'database_baseline' in plan:
        baseline = plan['database_baseline']
        if (not isinstance(baseline, dict) or set(baseline) != {'commit', 'fingerprint'}
                or not _hex(baseline['commit'], 40) or not _hex(baseline['fingerprint'], 64)
                or baseline['fingerprint'] == candidate['database_fingerprint']):
            raise CutoverError('Baseline database development tidak valid')
    migrations = plan['migrations']
    if (not isinstance(migrations, list) or len(migrations) != len(MIGRATIONS)
            or any(not isinstance(item, dict) or set(item) != {'name', 'sha256'}
                   or item['name'] != expected or not _hex(item['sha256'], 64)
                   for item, expected in zip(migrations, MIGRATIONS))):
        raise CutoverError('Daftar migrasi development tidak valid')
    return copy.deepcopy(plan)


def _positive_id(value):
    return type(value) is int and 0 < value < 10 ** 16


def _evidence_valid(phase, evidence):
    if not isinstance(evidence, dict):
        return False
    if phase in ('gate_intent', 'fence_intent', 'migrating', 'thawing'):
        return not evidence
    if phase == 'gate_closed':
        return evidence == {'ingress_verified': True} and type(evidence['ingress_verified']) is bool
    if phase == 'fenced':
        return evidence == {'db_fenced': True, 'old_writers_stopped': True} and all(type(v) is bool for v in evidence.values())
    if phase == 'backup_verified':
        return (set(evidence) == {'backup_sha256', 'restore_verified'} and _hex(evidence['backup_sha256'], 64)
                and evidence['restore_verified'] is True)
    if phase == 'migrated':
        return set(evidence) == {'database_fingerprint'} and _hex(evidence['database_fingerprint'], 64)
    if phase == 'ci_ready':
        return (set(evidence) == {'commit', 'run_id', 'artifact_id', 'schema_sha256'}
                and _hex(evidence['commit'], 40) and _positive_id(evidence['run_id'])
                and _positive_id(evidence['artifact_id']) and _hex(evidence['schema_sha256'], 64))
    if phase in ('switching', 'activated'):
        keys = {'candidate_release'} if phase == 'switching' else {'candidate_release', 'readiness_verified'}
        return (set(evidence) == keys and isinstance(evidence['candidate_release'], str)
                and re.fullmatch('dev-[a-f0-9]{16}-[1-9][0-9]{0,15}', evidence['candidate_release']) is not None
                and (phase != 'activated' or evidence['readiness_verified'] is True))
    if phase == 'complete':
        return evidence == {'ingress_verified': True, 'writer_fence_released': True} and all(type(v) is bool for v in evidence.values())
    return False


class Journal:
    def __init__(self, path, binding):
        if not _hex(binding, 64):
            raise CutoverError('Identitas jurnal development tidak valid')
        self.path = pathlib.Path(path)
        self.binding = binding

    def _check_parent(self):
        parent = self.path.parent
        if parent.is_symlink() or not parent.is_dir():
            raise CutoverError('Direktori jurnal tidak aman')
        if os.name == 'posix':
            info = parent.stat()
            if info.st_uid != os.geteuid() or info.st_mode & 0o077 or parent.resolve() != parent.absolute():
                raise CutoverError('Direktori jurnal tidak aman')

    def load(self):
        self._check_parent()
        if self.path.is_symlink():
            raise CutoverError('Jurnal tidak aman')
        try:
            info = self.path.lstat()
        except FileNotFoundError:
            return None
        if (not stat.S_ISREG(info.st_mode) or info.st_size > 65536
                or (os.name == 'posix' and (info.st_uid != os.geteuid() or info.st_mode & 0o077))):
            raise CutoverError('Jurnal tidak aman')
        try:
            data = json.loads(self.path.read_text(encoding='utf-8'))
        except (OSError, ValueError, UnicodeError) as exc:
            raise CutoverError('Jurnal tidak dapat dibaca') from exc
        if (not isinstance(data, dict) or set(data) != {'version', 'target', 'binding', 'phase', 'events'}
                or type(data['version']) is not int or data['version'] != 1 or data['target'] != 'dev'
                or data['binding'] != self.binding or not isinstance(data['events'], list)
                or not 0 < len(data['events']) <= len(PHASES)):
            raise CutoverError('Identitas jurnal tidak cocok')
        for event, phase in zip(data['events'], PHASES):
            if (not isinstance(event, dict) or set(event) != {'phase', 'evidence'}
                    or event['phase'] != phase or not _evidence_valid(phase, event['evidence'])):
                raise CutoverError('Riwayat jurnal tidak valid')
        if data['phase'] != data['events'][-1]['phase']:
            raise CutoverError('Status jurnal tidak cocok')
        return data

    def advance(self, expected, next_phase, evidence):
        current = self.load()
        phase = current['phase'] if current else None
        if phase == next_phase and current:
            position = PHASES.index(phase)
            previous = PHASES[position - 1] if position else None
            if (expected == previous and current['events'][-1]['evidence'] == evidence
                    and _evidence_valid(next_phase, evidence)):
                return
        index = 0 if phase is None else PHASES.index(phase) + 1
        if (phase != expected or index >= len(PHASES) or PHASES[index] != next_phase
                or not _evidence_valid(next_phase, evidence)):
            raise CutoverError('Urutan atau bukti jurnal tidak valid')
        events = list(current['events']) if current else []
        events.append({'phase': next_phase, 'evidence': copy.deepcopy(evidence)})
        data = {'version': 1, 'target': 'dev', 'binding': self.binding, 'phase': next_phase, 'events': events}
        fd, temporary = tempfile.mkstemp(prefix='.manual-finance-journal-', dir=self.path.parent)
        try:
            with os.fdopen(fd, 'w', encoding='utf-8', newline='\n') as stream:
                if hasattr(os, 'fchmod'):
                    os.fchmod(stream.fileno(), 0o600)
                json.dump(data, stream, sort_keys=True, separators=(',', ':'))
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, self.path)
            if os.name == 'posix':
                directory = os.open(self.path.parent, os.O_RDONLY | getattr(os, 'O_DIRECTORY', 0))
                try:
                    os.fsync(directory)
                finally:
                    os.close(directory)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)


def plan_binding(plan):
    validated = validate_plan(plan)
    encoded = json.dumps(validated, sort_keys=True, separators=(',', ':')).encode('utf-8')
    return hashlib.sha256(encoded).hexdigest()


class FenceCredential:
    """Persist the temporary migrator secret so an interrupted fence can resume."""

    def __init__(self, path, binding):
        if not _hex(binding, 64):
            raise CutoverError('Identitas kredensial pelindung tidak valid')
        self.path = pathlib.Path(path)
        self.binding = binding

    def _check_parent(self):
        try:
            parent = self.path.parent.lstat()
        except OSError as error:
            raise CutoverError('Direktori kredensial pelindung tidak tersedia') from error
        if stat.S_ISLNK(parent.st_mode) or not stat.S_ISDIR(parent.st_mode):
            raise CutoverError('Direktori kredensial pelindung tidak aman')
        if os.name == 'posix' and (parent.st_uid != os.geteuid() or parent.st_mode & 0o077):
            raise CutoverError('Izin direktori kredensial pelindung tidak aman')

    def read(self):
        self._check_parent()
        flags = os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0) | getattr(os, 'O_BINARY', 0)
        try:
            descriptor = os.open(self.path, flags)
            with os.fdopen(descriptor, 'rb') as stream:
                info = os.fstat(stream.fileno())
                if (not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_size > 4096
                        or (os.name == 'posix' and
                            (info.st_uid != os.geteuid() or stat.S_IMODE(info.st_mode) != 0o600))):
                    raise CutoverError('Berkas kredensial pelindung tidak aman')
                raw = stream.read(4097)
                if len(raw) > 4096:
                    raise CutoverError('Berkas kredensial pelindung terlalu besar')
            record = json.loads(raw.decode('utf-8'))
        except CutoverError:
            raise
        except (OSError, ValueError, UnicodeError) as error:
            raise CutoverError('Berkas kredensial pelindung tidak dapat dibaca') from error
        if (not isinstance(record, dict) or set(record) != {'version', 'binding', 'password'}
                or type(record['version']) is not int or record['version'] != 1
                or record['binding'] != self.binding or not _hex(record['password'], 48)):
            raise CutoverError('Berkas kredensial pelindung tidak terikat pada rencana')
        return record['password']

    def get_or_create(self):
        self._check_parent()
        if self.path.exists() or self.path.is_symlink():
            return self.read()
        record = {'version': 1, 'binding': self.binding, 'password': secrets.token_hex(24)}
        payload = json.dumps(record, sort_keys=True, separators=(',', ':')).encode('utf-8')
        flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, 'O_NOFOLLOW', 0) | getattr(os, 'O_BINARY', 0)
        try:
            descriptor = os.open(self.path, flags, 0o600)
        except FileExistsError:
            return self.read()
        except OSError as error:
            raise CutoverError('Berkas kredensial pelindung tidak dapat dibuat') from error
        try:
            with os.fdopen(descriptor, 'wb') as stream:
                written = stream.write(payload)
                if written != len(payload):
                    raise CutoverError('Berkas kredensial pelindung tidak tersimpan lengkap')
                stream.flush()
                os.fsync(stream.fileno())
            if os.name == 'posix':
                directory = os.open(self.path.parent, os.O_RDONLY | getattr(os, 'O_DIRECTORY', 0))
                try:
                    os.fsync(directory)
                finally:
                    os.close(directory)
        except Exception as error:
            try:
                self.path.unlink()
            except OSError:
                pass
            if isinstance(error, CutoverError):
                raise
            raise CutoverError('Kredensial pelindung tidak dapat disimpan secara persisten') from error
        return self.read()


class DatabaseFence:
    """Install and verify the PostgreSQL writer fence with resumable credentials."""

    def __init__(self, plan, binding, credential, admin):
        self.plan, _, _ = _fence_context(plan, binding)
        if not isinstance(credential, FenceCredential) or not callable(admin):
            raise CutoverError('Pelaksana pelindung database tidak valid')
        self.binding = binding
        self.credential = credential
        self.admin = admin

    @staticmethod
    def _last_result(value):
        if not isinstance(value, str) or not value.strip():
            raise CutoverError('Pemeriksaan pelindung database tidak mengembalikan status')
        return value.strip().splitlines()[-1].strip()

    def install(self):
        state = self._last_result(self.admin(role_fence_probe_sql(self.plan, self.binding)))
        if state == 'absent':
            password = self.credential.get_or_create()
            self.admin(role_fence_sql(self.plan, self.binding, password))
            state = self._last_result(self.admin(role_fence_probe_sql(self.plan, self.binding)))
        else:
            # Never mint a replacement secret for a fence that may already be committed.
            self.credential.read()
        if state != 'fenced':
            raise CutoverError('Status pelindung database tidak dapat dipulihkan dengan aman')
        self.admin(role_fence_drain_sql(self.plan, self.binding))
        if self._last_result(self.admin(role_fence_status_sql(self.plan, self.binding))) != 'fenced':
            raise CutoverError('Sesi penulis lama belum berhenti setelah pagar dipasang')
        return True


def _file_digest(path):
    try:
        flags = os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0) | getattr(os, 'O_BINARY', 0)
        fd = os.open(path, flags)
        with os.fdopen(fd, 'rb') as stream:
            before = os.fstat(stream.fileno())
            if not stat.S_ISREG(before.st_mode) or not 0 < before.st_size <= 4 * 1024 * 1024:
                raise CutoverError('Berkas Prisma tidak valid')
            digest = hashlib.sha256()
            while block := stream.read(128 * 1024):
                digest.update(block)
            after = os.fstat(stream.fileno())
            if (before.st_ino, before.st_size, before.st_mtime_ns) != (after.st_ino, after.st_size, after.st_mtime_ns):
                raise CutoverError('Berkas Prisma berubah saat diperiksa')
            return digest.hexdigest()
    except OSError as exc:
        raise CutoverError('Berkas Prisma tidak dapat diperiksa') from exc


def bundle_digest(prisma_directory):
    root = pathlib.Path(prisma_directory)
    try:
        if root.is_symlink() or not root.is_dir():
            raise CutoverError('Direktori Prisma tidak aman')
        migrations = root / 'migrations'
        if migrations.is_symlink() or not migrations.is_dir():
            raise CutoverError('Direktori migrasi tidak aman')
        if {p.name for p in root.iterdir()} != {'schema.prisma', 'migrations'}:
            raise CutoverError('Isi direktori Prisma tidak sesuai')
        entries = [('schema.prisma', _file_digest(root / 'schema.prisma')),
                   ('migrations/migration_lock.toml', _file_digest(migrations / 'migration_lock.toml'))]
        names = set()
        for path in sorted(migrations.iterdir(), key=lambda item: item.name):
            if path.name == 'migration_lock.toml':
                continue
            if (path.is_symlink() or not path.is_dir()
                    or re.fullmatch('[0-9]{8,14}_[A-Za-z0-9_]+', path.name) is None
                    or {item.name for item in path.iterdir()} != {'migration.sql'}):
                raise CutoverError('Isi direktori migrasi tidak sesuai')
            names.add(path.name)
            entries.append((f'migrations/{path.name}/migration.sql', _file_digest(path / 'migration.sql')))
        if not set(MIGRATIONS).issubset(names):
            raise CutoverError('Migrasi yang ditinjau tidak lengkap')
        encoded = json.dumps(entries, separators=(',', ':')).encode('utf-8')
        return hashlib.sha256(encoded).hexdigest()
    except OSError as exc:
        raise CutoverError('Direktori Prisma tidak dapat diperiksa') from exc


def verify_bundle(plan, prisma_directory):
    plan = validate_plan(plan)
    root = pathlib.Path(prisma_directory)
    if (bundle_digest(root) != plan['candidate']['prisma_bundle_sha256']
            or _file_digest(root / 'schema.prisma') != plan['candidate']['schema_sha256']):
        raise CutoverError('Bundle Prisma berbeda dari tree yang ditinjau')
    for migration in plan['migrations']:
        if _file_digest(root / 'migrations' / migration['name'] / 'migration.sql') != migration['sha256']:
            raise CutoverError('Checksum migrasi berbeda dari rencana')
    return True


def _fence_context(plan, binding):
    plan = validate_plan(plan)
    if not _hex(binding, 64) or plan_binding(plan) != binding:
        raise CutoverError('Pelindung database tidak terikat pada rencana')
    return plan, 'mfc_guard_' + binding[:24], 'mfc_migrator_' + binding[:24]


def _database_identity_sql(plan):
    dev = plan['dev_database']
    admin = plan['database_roles']['admin']
    return f"""
    IF session_user <> '{admin}' OR current_user <> '{admin}'
       OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='{admin}' AND rolsuper)
       OR pg_catalog.pg_is_in_recovery()
       OR (SELECT system_identifier::text FROM pg_catalog.pg_control_system()) <> '{dev['cluster']}'
       OR pg_catalog.current_database() <> '{dev['database']}' THEN
      RAISE EXCEPTION 'Identitas database development tidak sesuai';
    END IF;
    """


def _writer_inventory_sql(excluded=()):
    names = ','.join("'" + name + "'" for name in excluded)
    exclusion = f'AND login.rolname NOT IN ({names})' if names else ''
    return f"""
      SELECT COALESCE(array_agg(login.rolname::text ORDER BY login.rolname::text), ARRAY[]::text[])
      FROM pg_catalog.pg_roles login
      WHERE login.rolcanlogin AND NOT login.rolsuper {exclusion}
        AND EXISTS (
          SELECT 1 FROM pg_catalog.pg_roles delegated
          WHERE pg_catalog.pg_has_role(login.oid, delegated.oid, 'SET')
            AND EXISTS (
              SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
              WHERE n.nspname='public' AND c.relkind IN ('r','p')
                AND c.relname LIKE 'pos\\_%' ESCAPE '\\'
                AND pg_catalog.has_table_privilege(delegated.oid,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE')
            )
        )
    """


def role_fence_sql(plan, binding, password):
    plan, schema, migrator = _fence_context(plan, binding)
    if not _hex(password, 48):
        raise CutoverError('Kredensial migrasi uji tidak valid')
    roles = plan['database_roles']
    writers = roles['writers']
    writer_array = 'ARRAY[' + ','.join("'" + role + "'" for role in writers) + ']::text[]'
    disables = '\n'.join(f'ALTER ROLE "{role}" NOLOGIN;' for role in writers)
    return f"""
BEGIN;
SET LOCAL lock_timeout='5s';
DO $check$ BEGIN
    {_database_identity_sql(plan)}
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname='{schema}')
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='{migrator}')
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=ANY({writer_array}) AND (rolsuper OR NOT rolcanlogin))
       OR (SELECT count(*) FROM pg_catalog.pg_roles WHERE rolname=ANY({writer_array})) <> {len(writers)}
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_db_role_setting setting JOIN pg_catalog.pg_roles r ON r.oid=setting.setrole
                  CROSS JOIN LATERAL pg_catalog.unnest(setting.setconfig) config(value)
                  WHERE r.rolname=ANY({writer_array}) AND pg_catalog.lower(pg_catalog.split_part(config.value,'=',1))
                    IN ('role','session_authorization'))
       OR ({_writer_inventory_sql()}) IS DISTINCT FROM {writer_array} THEN
      RAISE EXCEPTION 'Daftar penulis development berubah';
    END IF;
END $check$;
CREATE SCHEMA "{schema}" AUTHORIZATION "{roles['admin']}";
REVOKE ALL ON SCHEMA "{schema}" FROM PUBLIC;
CREATE TABLE "{schema}".meta(binding text PRIMARY KEY, owner_oid oid NOT NULL, migrator_oid oid NOT NULL,
                             phase text NOT NULL CHECK (phase IN ('fenced','sealed')));
CREATE TABLE "{schema}".writers(role_oid oid PRIMARY KEY, role_name text NOT NULL UNIQUE);
REVOKE ALL ON ALL TABLES IN SCHEMA "{schema}" FROM PUBLIC;
CREATE ROLE "{migrator}" LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '{password}';
GRANT "{roles['owner']}" TO "{migrator}";
ALTER ROLE "{migrator}" SET role = "{roles['owner']}";
INSERT INTO "{schema}".meta SELECT '{binding}', owner.oid, migrator.oid, 'fenced'
  FROM pg_catalog.pg_roles owner, pg_catalog.pg_roles migrator
  WHERE owner.rolname='{roles['owner']}' AND migrator.rolname='{migrator}';
INSERT INTO "{schema}".writers SELECT oid,rolname FROM pg_catalog.pg_roles WHERE rolname=ANY({writer_array});
{disables}
COMMIT;
"""


def _fence_guard_sql(plan, binding, schema, migrator, drained, phase='fenced'):
    roles = plan['database_roles']
    writers = roles['writers']
    if phase not in ('fenced', 'sealed'):
        raise CutoverError('Status pelindung database tidak valid')
    login_state = 'true' if phase == 'fenced' else 'false'
    writer_array = 'ARRAY[' + ','.join("'" + role + "'" for role in writers) + ']::text[]'
    drain_check = f"OR EXISTS (SELECT 1 FROM pg_catalog.pg_stat_activity WHERE usename=ANY({writer_array}) AND pid<>pg_catalog.pg_backend_pid())" if drained else ''
    return f"""
    {_database_identity_sql(plan)}
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_namespace n JOIN pg_catalog.pg_roles r ON r.oid=n.nspowner
                   WHERE n.nspname='{schema}' AND r.rolname='{roles['admin']}')
       OR pg_catalog.to_regclass('{schema}.meta') IS NULL OR pg_catalog.to_regclass('{schema}.writers') IS NULL THEN
      RAISE EXCEPTION 'Jurnal pelindung database tidak tersedia';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles r JOIN pg_catalog.pg_namespace n ON n.nspname='{schema}'
               WHERE NOT r.rolsuper AND r.rolname NOT LIKE 'pg\\_%' ESCAPE '\\'
                 AND (pg_catalog.has_schema_privilege(r.oid,n.oid,'CREATE')
                   OR pg_catalog.has_table_privilege(r.oid,'{schema}.meta','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
                   OR pg_catalog.has_table_privilege(r.oid,'{schema}.writers','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')))
       OR (SELECT count(*) FROM "{schema}".meta m JOIN pg_catalog.pg_roles owner ON owner.oid=m.owner_oid
           JOIN pg_catalog.pg_roles migrator ON migrator.oid=m.migrator_oid
           WHERE m.binding='{binding}' AND m.phase='{phase}' AND owner.rolname='{roles['owner']}' AND migrator.rolname='{migrator}'
             AND migrator.rolcanlogin={login_state} AND NOT migrator.rolsuper AND NOT migrator.rolcreaterole
             AND NOT migrator.rolcreatedb AND NOT migrator.rolbypassrls AND NOT migrator.rolinherit) <> 1
       OR (SELECT count(*) FROM "{schema}".meta) <> 1
       OR (SELECT array_agg(w.role_name ORDER BY w.role_name) FROM "{schema}".writers w
           JOIN pg_catalog.pg_roles r ON r.oid=w.role_oid AND r.rolname=w.role_name
           WHERE NOT r.rolcanlogin AND NOT r.rolsuper) IS DISTINCT FROM {writer_array}
       OR (SELECT count(*) FROM "{schema}".writers) <> {len(writers)}
       OR NOT pg_catalog.pg_has_role('{migrator}', '{roles['owner']}', 'SET')
       OR (SELECT count(*) FROM pg_catalog.pg_auth_members membership
           JOIN pg_catalog.pg_roles member ON member.oid=membership.member
           JOIN pg_catalog.pg_roles granted ON granted.oid=membership.roleid
           WHERE member.rolname='{migrator}' AND granted.rolname='{roles['owner']}'
             AND membership.set_option AND NOT membership.admin_option) <> 1
       OR (SELECT count(*) FROM pg_catalog.pg_auth_members membership
           JOIN pg_catalog.pg_roles member ON member.oid=membership.member
           WHERE member.rolname='{migrator}') <> 1
       OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_db_role_setting s JOIN pg_catalog.pg_roles r ON r.oid=s.setrole
                      WHERE r.rolname='{migrator}' AND s.setdatabase=0
                        AND s.setconfig=ARRAY['role={roles['owner']}'])
       OR ({_writer_inventory_sql((migrator,))}) <> ARRAY[]::text[]
       {drain_check} THEN
      RAISE EXCEPTION 'Pelindung penulisan development berubah atau belum lengkap';
    END IF;
    """


def role_fence_status_sql(plan, binding):
    plan, schema, migrator = _fence_context(plan, binding)
    return f"SET search_path=pg_catalog; DO $verify$ BEGIN {_fence_guard_sql(plan, binding, schema, migrator, True)} END $verify$; SELECT 'fenced';"


def role_fence_probe_sql(plan, binding):
    plan, schema, migrator = _fence_context(plan, binding)
    return f"""
SET search_path=pg_catalog;
DO $probe$ BEGIN
    {_database_identity_sql(plan)}
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname='{schema}') THEN
      IF pg_catalog.to_regclass('{schema}.meta') IS NULL THEN
        RAISE EXCEPTION 'Jurnal pelindung database tidak lengkap';
      END IF;
      IF (SELECT phase FROM "{schema}".meta) = 'fenced' THEN
        {_fence_guard_sql(plan, binding, schema, migrator, False, 'fenced')}
        PERFORM pg_catalog.set_config('pos_manual_finance.fence_status','fenced',false);
      ELSIF (SELECT phase FROM "{schema}".meta) = 'sealed' THEN
        {_fence_guard_sql(plan, binding, schema, migrator, False, 'sealed')}
        PERFORM pg_catalog.set_config('pos_manual_finance.fence_status','sealed',false);
      ELSE
        RAISE EXCEPTION 'Status pelindung database tidak valid';
      END IF;
    ELSIF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='{migrator}') THEN
      RAISE EXCEPTION 'Role migrasi tanpa jurnal pelindung';
    ELSE
      PERFORM pg_catalog.set_config('pos_manual_finance.fence_status','absent',false);
    END IF;
END $probe$;
SELECT pg_catalog.current_setting('pos_manual_finance.fence_status');
"""


def role_fence_drain_sql(plan, binding):
    plan, schema, migrator = _fence_context(plan, binding)
    writers = ','.join("'" + role + "'" for role in plan['database_roles']['writers'])
    return f"""
SET search_path=pg_catalog;
DO $drain$ DECLARE session record; BEGIN
    {_fence_guard_sql(plan, binding, schema, migrator, False)}
    FOR session IN SELECT pid FROM pg_catalog.pg_stat_activity WHERE usename IN ({writers}) AND pid<>pg_catalog.pg_backend_pid() LOOP
      IF NOT pg_catalog.pg_terminate_backend(session.pid,5000) THEN
        RAISE EXCEPTION 'Sesi penulis development belum berhenti';
      END IF;
    END LOOP;
END $drain$;
"""


def role_fence_seal_sql(plan, binding):
    plan, schema, migrator = _fence_context(plan, binding)
    return f"""
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL search_path=pg_catalog;
DO $verify$ BEGIN {_fence_guard_sql(plan, binding, schema, migrator, True, 'fenced')} END $verify$;
ALTER ROLE "{migrator}" NOLOGIN;
UPDATE "{schema}".meta SET phase='sealed';
DO $verify$ BEGIN {_fence_guard_sql(plan, binding, schema, migrator, True, 'sealed')} END $verify$;
COMMIT;
"""


def role_fence_drain_migrator_sql(plan, binding):
    plan, schema, migrator = _fence_context(plan, binding)
    return f"""
SET search_path=pg_catalog;
DO $drain$ DECLARE session record; BEGIN
    {_fence_guard_sql(plan, binding, schema, migrator, True, 'sealed')}
    FOR session IN SELECT pid FROM pg_catalog.pg_stat_activity WHERE usename='{migrator}' AND pid<>pg_catalog.pg_backend_pid() LOOP
      IF NOT pg_catalog.pg_terminate_backend(session.pid,5000) THEN
        RAISE EXCEPTION 'Sesi migrator development belum berhenti';
      END IF;
    END LOOP;
END $drain$;
"""


def role_fence_release_sql(plan, binding):
    plan, schema, migrator = _fence_context(plan, binding)
    enables = '\n'.join(f'ALTER ROLE "{role}" LOGIN;' for role in plan['database_roles']['writers'])
    return f"""
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL search_path=pg_catalog;
DO $verify$ BEGIN {_fence_guard_sql(plan, binding, schema, migrator, True, 'sealed')} END $verify$;
DO $sessions$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_stat_activity WHERE usename='{migrator}' AND pid<>pg_catalog.pg_backend_pid()) THEN
    RAISE EXCEPTION 'Sesi migrator development belum berhenti';
  END IF;
END $sessions$;
{enables}
DROP ROLE "{migrator}";
DROP TABLE "{schema}".writers;
DROP TABLE "{schema}".meta;
DROP SCHEMA "{schema}";
COMMIT;
"""


def _checked_plan(plan, adapters, journal):
    checked = validate_plan(plan)
    if journal.binding != plan_binding(checked):
        raise CutoverError('Jurnal tidak terikat pada rencana yang ditinjau')
    if adapters.verify_target(checked) is not True:
        raise CutoverError('Target development tidak dapat diverifikasi')
    return checked


def _verify_fenced(plan, adapters):
    if (adapters.verify_gate(plan) is not True
            or adapters.verify_old_writers_stopped(plan) is not True
            or adapters.verify_database_fence(plan) is not True):
        raise CutoverError('Gerbang atau pelindung penulisan development belum terverifikasi')


def fence(plan, adapters, journal):
    plan = _checked_plan(plan, adapters, journal)
    current = journal.load()
    phase = current['phase'] if current else None
    if phase is None:
        journal.advance(None, 'gate_intent', {})
        phase = 'gate_intent'
    if phase == 'gate_intent':
        adapters.close_gate(plan)
        if adapters.verify_gate(plan) is not True:
            raise CutoverError('Gerbang development belum tertutup')
        journal.advance('gate_intent', 'gate_closed', {'ingress_verified': True})
        phase = 'gate_closed'
    if phase == 'gate_closed':
        if adapters.verify_gate(plan) is not True:
            raise CutoverError('Gerbang development berubah')
        journal.advance('gate_closed', 'fence_intent', {})
        phase = 'fence_intent'
    if phase == 'fence_intent':
        if adapters.verify_gate(plan) is not True:
            raise CutoverError('Gerbang development berubah')
        adapters.stop_old_writers(plan)
        if adapters.verify_old_writers_stopped(plan) is not True:
            raise CutoverError('Penulis lama belum berhenti')
        adapters.install_database_fence(plan)
        _verify_fenced(plan, adapters)
        journal.advance('fence_intent', 'fenced', {'db_fenced': True, 'old_writers_stopped': True})
        phase = 'fenced'
    if phase != 'fenced':
        raise CutoverError('Tahap pelindung development tidak sesuai')
    _verify_fenced(plan, adapters)


def migrate(plan, adapters, journal):
    plan = _checked_plan(plan, adapters, journal)
    current = journal.load()
    phase = current['phase'] if current else None
    if phase not in ('fenced', 'backup_verified', 'migrating', 'migrated'):
        raise CutoverError('Migrasi memerlukan pelindung development')
    _verify_fenced(plan, adapters)
    if phase == 'fenced':
        backup = adapters.create_verified_backup(plan)
        if not _evidence_valid('backup_verified', backup) or adapters.verify_backup(plan, backup) is not True:
            raise CutoverError('Backup development belum terverifikasi')
        _verify_fenced(plan, adapters)
        journal.advance('fenced', 'backup_verified', backup)
        current = journal.load()
        phase = 'backup_verified'
    backup = next(item['evidence'] for item in current['events'] if item['phase'] == 'backup_verified')
    if (adapters.verify_backup(plan, backup) is not True
            or adapters.verify_migration_files(plan) is not True):
        raise CutoverError('Backup atau berkas migrasi berubah')
    _verify_fenced(plan, adapters)
    if phase == 'backup_verified':
        journal.advance('backup_verified', 'migrating', {})
        phase = 'migrating'
    if phase == 'migrating':
        adapters.apply_migrations(plan)
        _verify_fenced(plan, adapters)
        if adapters.verify_migrated(plan) != plan['candidate']['database_fingerprint']:
            raise CutoverError('Fingerprint database hasil migrasi berbeda')
        journal.advance('migrating', 'migrated', {'database_fingerprint': plan['candidate']['database_fingerprint']})
    elif adapters.verify_migrated(plan) != plan['candidate']['database_fingerprint']:
        raise CutoverError('Fingerprint database hasil migrasi berubah')


def activate(plan, adapters, journal, evidence):
    plan = _checked_plan(plan, adapters, journal)
    current = journal.load()
    phase = current['phase'] if current else None
    if phase not in ('migrated', 'ci_ready', 'switching', 'activated', 'thawing', 'complete'):
        raise CutoverError('Migrasi development belum siap untuk aktivasi')
    if (not _evidence_valid('ci_ready', evidence)
            or evidence['schema_sha256'] != plan['candidate']['schema_sha256']):
        raise CutoverError('Identitas artefak development tidak valid')
    previous = next((event['evidence'] for event in current['events'] if event['phase'] == 'ci_ready'), None)
    if previous is not None and previous != evidence:
        raise CutoverError('Artefak berbeda dari jurnal development')
    if adapters.verify_ci_artifact(plan, evidence) is not True:
        raise CutoverError('Artefak CI development belum terverifikasi')
    candidate = f"dev-{evidence['commit'][:16]}-{evidence['run_id']}"
    if phase in ('migrated', 'ci_ready', 'switching', 'activated'):
        _verify_fenced(plan, adapters)
        if adapters.verify_migrated(plan) != plan['candidate']['database_fingerprint']:
            raise CutoverError('Fingerprint database hasil migrasi berubah')
    if phase == 'migrated':
        journal.advance('migrated', 'ci_ready', evidence)
        phase = 'ci_ready'
    if phase == 'ci_ready':
        journal.advance('ci_ready', 'switching', {'candidate_release': candidate})
        phase = 'switching'
    if phase == 'switching':
        adapters.switch_candidate(plan, evidence)
        _verify_fenced(plan, adapters)
        if adapters.verify_candidate_active(plan, evidence) is not True:
            raise CutoverError('Release kandidat development belum sehat')
        journal.advance('switching', 'activated', {'candidate_release': candidate, 'readiness_verified': True})
        phase = 'activated'
    if phase == 'activated':
        if adapters.verify_candidate_active(plan, evidence) is not True:
            raise CutoverError('Release kandidat development berubah')
        journal.advance('activated', 'thawing', {})
        phase = 'thawing'
    if phase == 'thawing':
        if (adapters.verify_thaw_state(plan, evidence) is not True
                or adapters.verify_candidate_active(plan, evidence) is not True):
            raise CutoverError('Status pelepasan development tidak dapat diverifikasi')
        if adapters.verify_gate_open(plan) is not True:
            if adapters.verify_gate(plan) is not True:
                raise CutoverError('Gerbang development tidak dapat diverifikasi')
            adapters.release_database_fence(plan, evidence)
            if adapters.verify_database_released(plan) is not True or adapters.verify_candidate_active(plan, evidence) is not True:
                raise CutoverError('Pelepasan pelindung database belum terverifikasi')
            adapters.open_gate(plan, evidence)
        if (adapters.verify_gate_open(plan) is not True or adapters.verify_database_released(plan) is not True
                or adapters.verify_candidate_active(plan, evidence) is not True):
            raise CutoverError('Pelepasan development belum terverifikasi')
        journal.advance('thawing', 'complete', {'ingress_verified': True, 'writer_fence_released': True})
    elif phase == 'complete':
        if (adapters.verify_database_released(plan) is not True or adapters.verify_gate_open(plan) is not True
                or adapters.verify_candidate_active(plan, evidence) is not True):
            raise CutoverError('Release development tidak lagi konsisten')


def recover(plan, adapters, journal):
    current = journal.load()
    if not current:
        raise CutoverError('Jurnal pemulihan development tidak tersedia')
    evidence = next((event['evidence'] for event in current['events'] if event['phase'] == 'ci_ready'), None)
    if evidence is None:
        raise CutoverError('Artefak pemulihan development belum tersedia')
    return activate(plan, adapters, journal, evidence)
