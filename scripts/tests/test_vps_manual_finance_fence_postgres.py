"""Opt-in integration test against the explicitly named isolated VPS container."""
import os
import pathlib
import re
import secrets
import subprocess
import time
import unittest
import uuid

from test_vps_manual_finance_cutover import load_cutover, valid_plan


CONTAINER = 'codex-finance-test-20261116'


@unittest.skipUnless(os.environ.get('MFC_TEST_CONTAINER') == CONTAINER, 'isolated test container not selected')
class RoleFencePostgresTests(unittest.TestCase):
    def setUp(self):
        self.cutover = load_cutover()
        for name in ('role_fence_sql', 'role_fence_probe_sql', 'role_fence_status_sql', 'role_fence_drain_sql', 'role_fence_seal_sql', 'role_fence_drain_migrator_sql', 'role_fence_release_sql'):
            self.assertTrue(hasattr(self.cutover, name), f'{name} must exist')
        token = uuid.uuid4().hex[:16]
        self.database = 'codex_mfc_test_' + token
        self.app = 'mfc_test_app_' + token
        self.api = 'mfc_test_api_' + token
        self.storage = 'mfc_test_storage_' + token
        self.writer = 'mfc_test_writer_' + token
        self.app_password = secrets.token_hex(24)
        self.api_password = secrets.token_hex(24)
        self.storage_password = secrets.token_hex(24)
        self.migrator_password = secrets.token_hex(24)
        self.created_roles = False
        self.created_database = False
        cluster = self.admin('postgres', 'SELECT system_identifier::text FROM pg_control_system();').strip()
        self.plan = valid_plan()
        self.plan['dev_database'] = {'cluster': cluster, 'database': self.database}
        self.plan['prod_database'] = {'cluster': '1' if cluster != '1' else '2', 'database': 'postgres'}
        self.plan['database_roles'] = {'owner': self.app, 'admin': 'supabase_admin', 'writers': sorted([self.app, self.api, self.storage])}
        self.binding = self.cutover.plan_binding(self.plan)
        self.addCleanup(self.cleanup)
        self.admin('postgres', f"BEGIN; CREATE ROLE {self.app} LOGIN PASSWORD '{self.app_password}'; CREATE ROLE {self.api} LOGIN PASSWORD '{self.api_password}'; CREATE ROLE {self.storage} LOGIN PASSWORD '{self.storage_password}'; CREATE ROLE {self.writer} NOLOGIN; GRANT {self.writer} TO {self.api}, {self.storage}; COMMIT;")
        self.created_roles = True
        result = subprocess.run(['docker', 'exec', CONTAINER, 'createdb', '-U', 'supabase_admin', '-T', 'template0', '-O', self.app, self.database], capture_output=True, text=True)
        if result.returncode:
            raise RuntimeError('Could not create isolated database')
        self.created_database = True
        self.admin(self.database, f'''CREATE TABLE public.pos_fence_test (id integer);
          ALTER TABLE public.pos_fence_test OWNER TO {self.app};
          GRANT INSERT, UPDATE, DELETE, TRUNCATE ON public.pos_fence_test TO {self.writer};
          CREATE FUNCTION public.pos_fence_test_trigger() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;
          CREATE TRIGGER pos_fence_existing_trigger AFTER INSERT ON public.pos_fence_test FOR EACH STATEMENT EXECUTE FUNCTION public.pos_fence_test_trigger();''')

    def admin(self, db, sql):
        result = subprocess.run(['docker', 'exec', '-i', CONTAINER, 'psql', '-U', 'supabase_admin', '-d', db,
                                 '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], input=sql, text=True, capture_output=True)
        if result.returncode:
            errors = [line for line in result.stderr.splitlines() if 'ERROR:' in line]
            detail = re.sub(r'[a-f0-9]{48}', '[redacted]', errors[0]) if errors else 'unknown error'
            raise RuntimeError('Isolated PostgreSQL command failed: ' + detail)
        return result.stdout.strip()

    def login(self, role, password, sql='SELECT current_user'):
        return subprocess.run(['docker', 'exec', '-e', 'PGPASSWORD=' + password, CONTAINER, 'psql', '-h', '127.0.0.1',
                               '-U', role, '-d', self.database, '-X', '-qAt', '-c', sql], capture_output=True, text=True)

    def cleanup(self):
        if self.created_database:
            self.admin('postgres', f"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='{self.database}' AND pid<>pg_backend_pid();")
            subprocess.run(['docker', 'exec', CONTAINER, 'dropdb', '-U', 'supabase_admin', '--if-exists', self.database], capture_output=True, check=True)
        if self.created_roles:
            migrator = 'mfc_migrator_' + self.binding[:24]
            self.admin('postgres', f'DROP ROLE IF EXISTS {migrator}; DROP ROLE IF EXISTS {self.app}; DROP ROLE IF EXISTS {self.api}; DROP ROLE IF EXISTS {self.storage}; DROP ROLE IF EXISTS {self.writer};')

    def install(self):
        self.admin(self.database, self.cutover.role_fence_sql(self.plan, self.binding, self.migrator_password))

    def seal_and_release(self):
        self.admin(self.database, self.cutover.role_fence_seal_sql(self.plan, self.binding))
        self.admin(self.database, self.cutover.role_fence_release_sql(self.plan, self.binding))

    def test_probe_distinguishes_absent_fenced_and_tampered_state(self):
        probe = self.cutover.role_fence_probe_sql(self.plan, self.binding)
        self.assertEqual(self.admin(self.database, probe), 'absent')
        self.install()
        self.assertEqual(self.admin(self.database, probe), 'fenced')
        schema = 'mfc_guard_' + self.binding[:24]
        self.admin(self.database, f"UPDATE {schema}.meta SET binding='{'0' * 64}'")
        with self.assertRaises(RuntimeError): self.admin(self.database, probe)
        self.admin(self.database, f"UPDATE {schema}.meta SET binding='{self.binding}'")
        self.seal_and_release()
        self.assertEqual(self.admin(self.database, probe), 'absent')

    def test_unreviewed_login_with_delegated_writer_role_blocks_the_fence(self):
        rogue = 'mfc_test_rogue_' + uuid.uuid4().hex[:12]
        self.admin('postgres', f'CREATE ROLE {rogue} LOGIN; GRANT {self.writer} TO {rogue};')
        self.addCleanup(lambda: self.admin('postgres', f'DROP ROLE IF EXISTS {rogue};'))
        with self.assertRaises(RuntimeError): self.install()
        self.assertEqual(self.login(self.app, self.app_password).returncode, 0)
        self.assertEqual(self.login(self.api, self.api_password).returncode, 0)

    def test_unrelated_role_setting_is_preserved(self):
        self.admin('postgres', f"ALTER ROLE {self.app} SET application_name='mfc-test'")
        self.addCleanup(lambda: self.admin('postgres', f'ALTER ROLE {self.app} RESET ALL'))
        self.install()
        migrator = 'mfc_migrator_' + self.binding[:24]
        session = self.login(migrator, self.migrator_password, 'SELECT session_user,current_user')
        self.assertEqual(session.stdout.strip(), migrator + '|' + self.app)
        self.seal_and_release()
        self.assertEqual(self.admin('postgres', f"SELECT count(*) FROM pg_db_role_setting s JOIN pg_roles r ON r.oid=s.setrole WHERE r.rolname='{self.app}' AND s.setconfig @> ARRAY['application_name=mfc-test']"), '1')

    def test_conflicting_effective_role_setting_blocks_install_without_changing_logins(self):
        migrator = 'mfc_migrator_' + self.binding[:24]
        self.admin('postgres', f'ALTER ROLE {self.app} IN DATABASE {self.database} SET role={self.writer}')
        self.addCleanup(lambda: self.admin('postgres', f'ALTER ROLE {self.app} IN DATABASE {self.database} RESET ALL'))
        with self.assertRaises(RuntimeError): self.install()
        self.assertEqual(self.login(self.app, self.app_password).returncode, 0)
        self.assertEqual(self.admin('postgres', f"SELECT count(*) FROM pg_roles WHERE rolname='{migrator}'"), '0')

    def test_preexisting_migrator_name_blocks_install_without_changing_logins(self):
        migrator = 'mfc_migrator_' + self.binding[:24]
        self.admin('postgres', f'CREATE ROLE {migrator} NOLOGIN')
        with self.assertRaises(RuntimeError): self.install()
        self.assertEqual(self.login(self.app, self.app_password).returncode, 0)

    def test_mutated_fence_and_pending_session_block_release(self):
        old = subprocess.Popen(['docker', 'exec', '-e', 'PGPASSWORD=' + self.app_password, CONTAINER, 'psql',
                                '-h', '127.0.0.1', '-U', self.app, '-d', self.database, '-X', '-c', 'SELECT pg_sleep(60)'],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        def stop_old():
            if old.poll() is None: old.kill()
            old.wait(timeout=10)
        self.addCleanup(stop_old)
        for _ in range(40):
            if self.admin(self.database, f"SELECT count(*) FROM pg_stat_activity WHERE usename='{self.app}' AND state='active';") == '1': break
            time.sleep(.25)
        else: self.fail('Old test session did not connect')
        self.install()
        with self.assertRaises(RuntimeError):
            self.admin(self.database, self.cutover.role_fence_release_sql(self.plan, self.binding))
        self.assertNotEqual(self.login(self.app, self.app_password).returncode, 0)
        self.admin(self.database, self.cutover.role_fence_drain_sql(self.plan, self.binding)); old.wait(timeout=10)
        migrator = 'mfc_migrator_' + self.binding[:24]
        self.admin('postgres', f'ALTER ROLE {migrator} SUPERUSER')
        with self.assertRaises(RuntimeError):
            self.admin(self.database, self.cutover.role_fence_status_sql(self.plan, self.binding))
        self.admin('postgres', f'ALTER ROLE {migrator} NOSUPERUSER')
        schema = 'mfc_guard_' + self.binding[:24]
        self.admin(self.database, f'UPDATE {schema}.meta SET binding=\'{"0" * 64}\'')
        with self.assertRaises(RuntimeError):
            self.admin(self.database, self.cutover.role_fence_release_sql(self.plan, self.binding))
        self.admin(self.database, f"UPDATE {schema}.meta SET binding='{self.binding}'")
        self.seal_and_release()
        self.assertEqual(self.login(self.app, self.app_password).returncode, 0)

    def test_probe_rejects_a_replaced_migrator_with_extra_role(self):
        self.install()
        migrator = 'mfc_migrator_' + self.binding[:24]
        self.admin('postgres', f'GRANT {self.writer} TO {migrator}')
        with self.assertRaises(RuntimeError):
            self.admin(self.database, self.cutover.role_fence_probe_sql(self.plan, self.binding))
        self.admin('postgres', f'REVOKE {self.writer} FROM {migrator}')
        self.assertEqual(self.admin(self.database, self.cutover.role_fence_status_sql(self.plan, self.binding)), 'fenced')
        self.seal_and_release()

    def test_release_refuses_live_migrator_session(self):
        self.install()
        migrator = 'mfc_migrator_' + self.binding[:24]
        session = subprocess.Popen(['docker', 'exec', '-e', 'PGPASSWORD=' + self.migrator_password, CONTAINER, 'psql',
                                    '-h', '127.0.0.1', '-U', migrator, '-d', self.database, '-X', '-c', 'SELECT pg_sleep(60)'],
                                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        def stop_session():
            if session.poll() is None: session.kill()
            session.wait(timeout=10)
        self.addCleanup(stop_session)
        for _ in range(40):
            if self.admin(self.database, f"SELECT count(*) FROM pg_stat_activity WHERE usename='{migrator}' AND state='active';") == '1': break
            time.sleep(.25)
        else: self.fail('Migrator test session did not connect')
        self.admin(self.database, self.cutover.role_fence_seal_sql(self.plan, self.binding))
        self.assertNotEqual(self.login(migrator, self.migrator_password).returncode, 0)
        self.assertEqual(self.admin(self.database, self.cutover.role_fence_probe_sql(self.plan, self.binding)), 'sealed')
        with self.assertRaises(RuntimeError):
            self.admin(self.database, self.cutover.role_fence_release_sql(self.plan, self.binding))
        self.assertNotEqual(self.login(self.app, self.app_password).returncode, 0)
        self.admin(self.database, self.cutover.role_fence_drain_migrator_sql(self.plan, self.binding))
        session.wait(timeout=10)
        self.admin(self.database, self.cutover.role_fence_release_sql(self.plan, self.binding))
        self.assertEqual(self.login(self.app, self.app_password).returncode, 0)

    def test_fence_rejects_old_logins_and_preserves_migrator_owner_role(self):
        self.assertEqual(self.login(self.app, self.app_password).returncode, 0)
        old = subprocess.Popen(['docker', 'exec', '-e', 'PGPASSWORD=' + self.app_password, CONTAINER, 'psql',
                                '-h', '127.0.0.1', '-U', self.app, '-d', self.database, '-X', '-c', 'SELECT pg_sleep(60)'],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        def stop_old():
            if old.poll() is None: old.kill()
            old.wait(timeout=10)
        self.addCleanup(stop_old)
        for _ in range(40):
            if self.admin(self.database, f"SELECT count(*) FROM pg_stat_activity WHERE usename='{self.app}' AND state='active';") == '1':
                break
            time.sleep(.25)
        else:
            self.fail('Old test session did not connect')
        self.install()
        self.admin(self.database, self.cutover.role_fence_drain_sql(self.plan, self.binding))
        old.wait(timeout=10)
        self.assertNotEqual(self.login(self.app, self.app_password).returncode, 0)
        self.assertNotEqual(self.login(self.api, self.api_password).returncode, 0)
        self.assertNotEqual(self.login(self.storage, self.storage_password).returncode, 0)
        migrator = 'mfc_migrator_' + self.binding[:24]
        session = self.login(migrator, self.migrator_password, 'SELECT session_user,current_user')
        self.assertEqual(session.returncode, 0)
        self.assertEqual(session.stdout.strip(), migrator + '|' + self.app)
        self.assertEqual(self.admin(self.database, self.cutover.role_fence_status_sql(self.plan, self.binding)), 'fenced')
        self.seal_and_release()
        self.assertEqual(self.login(self.app, self.app_password).returncode, 0)
        self.assertEqual(self.login(self.api, self.api_password).returncode, 0)
        self.assertEqual(self.login(self.storage, self.storage_password).returncode, 0)
        self.assertNotEqual(self.login(migrator, self.migrator_password).returncode, 0)


if __name__ == '__main__':
    unittest.main()
