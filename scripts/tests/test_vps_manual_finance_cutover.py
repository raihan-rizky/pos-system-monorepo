import copy
import hashlib
import importlib.util
import json
import os
import pathlib
import tempfile
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[2]
MODULE = ROOT / 'scripts/deploy/manual_finance_dev_cutover.py'
MIGRATIONS = (
    '20261121010000_manual_finance_categories',
    '20261121020000_manual_payable_create_idempotency',
    '20261121030000_payable_ledger_version',
    '20261121040000_managed_proof_registry_disabled',
)


def load_cutover():
    if not MODULE.is_file():
        raise AssertionError('Development cutover journal and plan validation must exist')
    spec = importlib.util.spec_from_file_location('manual_finance_dev_cutover', MODULE)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def valid_plan():
    return {
        'version': 1,
        'target': 'dev',
        'dev_database': {'cluster': '123456', 'database': 'postgres'},
        'prod_database': {'cluster': '654321', 'database': 'postgres'},
        'database_roles': {'owner': 'postgres', 'admin': 'supabase_admin',
                           'writers': ['authenticator', 'postgres', 'supabase_storage_admin']},
        'active_release': {'id': 'dev-aaaaaaaaaaaaaaaa-42', 'commit': 'a' * 40,
                           'schema_sha256': 'b' * 64, 'database_fingerprint': 'c' * 64},
        'candidate': {'tree': 'd' * 40, 'schema_sha256': 'e' * 64, 'database_fingerprint': 'f' * 64,
                      'prisma_bundle_sha256': '8' * 64},
        'migrations': [{'name': name, 'sha256': str(index) * 64} for index, name in enumerate(MIGRATIONS, 1)],
    }


class PlanTests(unittest.TestCase):
    def setUp(self):
        self.cutover = load_cutover()

    def test_accepts_only_the_complete_reviewed_dev_transition(self):
        self.assertEqual(self.cutover.validate_plan(valid_plan()), valid_plan())

    def test_rejects_production_shared_cluster_and_unexpected_migrations(self):
        cases = []
        plan = valid_plan(); plan['target'] = 'prod'; cases.append(plan)
        plan = valid_plan(); plan['dev_database']['cluster'] = plan['prod_database']['cluster']; cases.append(plan)
        plan = valid_plan(); plan['dev_database']['cluster'] = '0' + plan['prod_database']['cluster']; cases.append(plan)
        plan = valid_plan(); plan['migrations'][1]['name'] = plan['migrations'][0]['name']; cases.append(plan)
        plan = valid_plan(); plan['migrations'].append({'name': 'unreviewed', 'sha256': '1' * 64}); cases.append(plan)
        plan = valid_plan(); plan['candidate']['database_fingerprint'] = plan['active_release']['database_fingerprint']; cases.append(plan)
        for plan in cases:
            with self.subTest(plan=plan), self.assertRaises(self.cutover.CutoverError):
                self.cutover.validate_plan(plan)

    def test_rejects_mismatched_release_and_unvalidated_fields(self):
        cases = []
        plan = valid_plan(); plan['active_release']['id'] = 'dev-bbbbbbbbbbbbbbbb-42'; cases.append(plan)
        plan = valid_plan(); plan['candidate']['tree'] = 'x' * 40; cases.append(plan)
        plan = valid_plan(); plan['version'] = True; cases.append(plan)
        plan = valid_plan(); plan['migrations'][0]['sha256'] = '0' * 63; cases.append(plan)
        plan = valid_plan(); plan['password'] = 'must-not-be-stored'; cases.append(plan)
        plan = valid_plan(); plan['database_roles']['writers'].remove('postgres'); cases.append(plan)
        plan = valid_plan(); plan['database_roles']['writers'].append('bad;DROP ROLE postgres'); cases.append(plan)
        plan = valid_plan(); plan['database_roles']['writers'].append('supabase_admin'); cases.append(plan)
        for plan in cases:
            with self.subTest(plan=plan), self.assertRaises(self.cutover.CutoverError):
                self.cutover.validate_plan(plan)


class JournalTests(unittest.TestCase):
    def setUp(self):
        self.cutover = load_cutover()
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = pathlib.Path(self.tmp.name) / 'transition.json'
        self.journal = self.cutover.Journal(self.path, 'a' * 64)

    def test_persists_bound_phases_and_refuses_skipped_or_stale_steps(self):
        self.assertIsNone(self.journal.load())
        self.journal.advance(None, 'gate_intent', {})
        self.journal.advance('gate_intent', 'gate_closed', {'ingress_verified': True})
        saved = self.cutover.Journal(self.path, 'a' * 64).load()
        self.assertEqual(saved['phase'], 'gate_closed')
        self.assertEqual([item['phase'] for item in saved['events']], ['gate_intent', 'gate_closed'])
        with self.assertRaises(self.cutover.CutoverError):
            self.journal.advance('gate_intent', 'fence_intent', {})
        with self.assertRaises(self.cutover.CutoverError):
            self.journal.advance('gate_closed', 'fenced', {'db_fenced': True, 'old_writers_stopped': True})
        self.assertEqual(self.journal.load(), saved)

    def test_rejects_unverified_evidence_and_secrets(self):
        self.journal.advance(None, 'gate_intent', {})
        for evidence in ({'ingress_verified': False}, {'ingress_verified': True, 'password': 'secret'}, {}):
            with self.subTest(evidence=evidence), self.assertRaises(self.cutover.CutoverError):
                self.journal.advance('gate_intent', 'gate_closed', evidence)
        self.assertEqual(self.journal.load()['phase'], 'gate_intent')

    def test_same_transition_can_be_retried_after_a_lost_response(self):
        self.journal.advance(None, 'gate_intent', {})
        self.journal.advance(None, 'gate_intent', {})
        self.journal.advance('gate_intent', 'gate_closed', {'ingress_verified': True})
        self.journal.advance('gate_intent', 'gate_closed', {'ingress_verified': True})
        self.assertEqual(len(self.journal.load()['events']), 2)
        with self.assertRaises(self.cutover.CutoverError):
            self.journal.advance('gate_intent', 'gate_closed', {'ingress_verified': False})

    def test_rejects_tampered_binding_and_history(self):
        self.journal.advance(None, 'gate_intent', {})
        with self.assertRaises(self.cutover.CutoverError):
            self.cutover.Journal(self.path, 'b' * 64).load()
        data = json.loads(self.path.read_text())
        data['phase'] = 'complete'
        self.path.write_text(json.dumps(data))
        with self.assertRaises(self.cutover.CutoverError):
            self.journal.load()

    @unittest.skipIf(os.name != 'posix', 'POSIX permission and symlink protections')
    def test_rejects_insecure_or_symlinked_journal(self):
        self.journal.advance(None, 'gate_intent', {})
        os.chmod(self.path, 0o644)
        with self.assertRaises(self.cutover.CutoverError):
            self.journal.load()
        self.path.unlink()
        target = self.path.parent / 'other.json'
        target.write_text('{}')
        self.path.symlink_to(target)
        with self.assertRaises(self.cutover.CutoverError):
            self.journal.load()


class BundleTests(unittest.TestCase):
    def setUp(self):
        self.cutover = load_cutover()
        for name in ('bundle_digest', 'verify_bundle'):
            self.assertTrue(hasattr(self.cutover, name), f'{name} must verify the canonical Git bundle')
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = pathlib.Path(self.tmp.name) / 'prisma'
        self.root.mkdir()
        (self.root / 'schema.prisma').write_bytes(b'canonical schema\n')
        migrations = self.root / 'migrations'; migrations.mkdir()
        (migrations / 'migration_lock.toml').write_bytes(b'provider = "postgresql"\n')
        for name in ('20260101_old', *MIGRATIONS):
            directory = migrations / name; directory.mkdir()
            (directory / 'migration.sql').write_bytes((name + '\n').encode())
        self.plan = valid_plan()
        self.plan['candidate']['schema_sha256'] = hashlib.sha256((self.root / 'schema.prisma').read_bytes()).hexdigest()
        for item in self.plan['migrations']:
            item['sha256'] = hashlib.sha256((migrations / item['name'] / 'migration.sql').read_bytes()).hexdigest()
        self.plan['candidate']['prisma_bundle_sha256'] = self.cutover.bundle_digest(self.root)

    def test_accepts_exact_canonical_bundle(self):
        self.assertTrue(self.cutover.verify_bundle(self.plan, self.root))

    def test_rejects_changes_to_old_or_new_migrations_and_schema(self):
        for name in ('20260101_old', MIGRATIONS[0]):
            path = self.root / 'migrations' / name / 'migration.sql'
            original = path.read_bytes(); path.write_bytes(original + b'changed\n')
            with self.subTest(name=name), self.assertRaises(self.cutover.CutoverError):
                self.cutover.verify_bundle(self.plan, self.root)
            path.write_bytes(original)
        (self.root / 'schema.prisma').write_bytes(b'different schema\n')
        with self.assertRaises(self.cutover.CutoverError): self.cutover.verify_bundle(self.plan, self.root)

    def test_rejects_an_unreviewed_extra_migration(self):
        extra = self.root / 'migrations' / '20261118000000_extra'; extra.mkdir()
        (extra / 'migration.sql').write_bytes(b'SELECT 1;\n')
        with self.assertRaises(self.cutover.CutoverError): self.cutover.verify_bundle(self.plan, self.root)

    @unittest.skipIf(os.name != 'posix', 'POSIX symlink protections')
    def test_rejects_symlinked_migration(self):
        path = self.root / 'migrations' / MIGRATIONS[0] / 'migration.sql'
        path.unlink(); path.symlink_to(self.root / 'schema.prisma')
        with self.assertRaises(self.cutover.CutoverError): self.cutover.verify_bundle(self.plan, self.root)


class RoleFenceSqlTests(unittest.TestCase):
    def setUp(self):
        self.cutover = load_cutover()
        for name in ('role_fence_sql', 'role_fence_probe_sql', 'role_fence_status_sql', 'role_fence_release_sql'):
            self.assertTrue(hasattr(self.cutover, name), f'{name} must guard dev database logins')
        self.plan = valid_plan()
        self.binding = self.cutover.plan_binding(self.plan)

    def test_rejects_unbound_plan_unsafe_role_names_and_invalid_password(self):
        password = '3' * 48
        bad_arguments = [
            ('0' * 64, password),
            (self.binding, 'invalid password'),
        ]
        for arguments in bad_arguments:
            with self.subTest(arguments=arguments), self.assertRaises(self.cutover.CutoverError):
                self.cutover.role_fence_sql(self.plan, *arguments)

    def test_rejects_target_cluster_mismatch_in_all_operations(self):
        plan = valid_plan(); plan['prod_database']['cluster'] = plan['dev_database']['cluster']
        with self.assertRaises(self.cutover.CutoverError):
            self.cutover.role_fence_sql(plan, self.binding, '3' * 48)
        with self.assertRaises(self.cutover.CutoverError):
            self.cutover.role_fence_status_sql(plan, self.binding)
        with self.assertRaises(self.cutover.CutoverError):
            self.cutover.role_fence_probe_sql(plan, self.binding)
        with self.assertRaises(self.cutover.CutoverError):
            self.cutover.role_fence_release_sql(plan, self.binding)

    def test_conflicting_effective_role_setting_is_rejected(self):
        self.assertTrue(self.cutover.safe_role_settings(['search_path=public', 'statement_timeout=8s']))
        self.assertFalse(self.cutover.safe_role_settings(['search_path=public', 'role=other_owner']))
        self.assertFalse(self.cutover.safe_role_settings(['ROLE=other_owner']))


class FenceCredentialTests(unittest.TestCase):
    def setUp(self):
        self.cutover = load_cutover()
        for name in ('FenceCredential', 'DatabaseFence'):
            self.assertTrue(hasattr(self.cutover, name), f'{name} must preserve recoverable fencing')
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.plan = valid_plan()
        self.binding = self.cutover.plan_binding(self.plan)
        self.path = pathlib.Path(self.tmp.name) / 'credential.json'
        self.secret = self.cutover.FenceCredential(self.path, self.binding)

    def test_credential_is_stable_and_bound_to_the_reviewed_plan(self):
        first = self.secret.get_or_create()
        self.assertRegex(first, '^[a-f0-9]{48}$')
        self.assertEqual(self.secret.get_or_create(), first)
        self.assertEqual(self.secret.read(), first)
        with self.assertRaises(self.cutover.CutoverError):
            self.cutover.FenceCredential(self.path, '0' * 64).read()

    @unittest.skipIf(os.name != 'posix', 'POSIX credential protections')
    def test_insecure_or_linked_credential_is_rejected(self):
        self.secret.get_or_create(); os.chmod(self.path, 0o644)
        with self.assertRaises(self.cutover.CutoverError): self.secret.read()
        self.path.unlink()
        target = self.path.parent / 'other.json'; target.write_text('{}')
        self.path.symlink_to(target)
        with self.assertRaises(self.cutover.CutoverError): self.secret.get_or_create()

    def test_install_resumes_after_a_committed_but_lost_response(self):
        state = {'phase': 'absent', 'calls': [], 'lose_install': True}
        def admin(sql):
            state['calls'].append(sql)
            if "current_setting('pos_manual_finance.fence_status')" in sql: return state['phase']
            if 'CREATE SCHEMA' in sql:
                state['phase'] = 'fenced'
                if state.pop('lose_install', False): raise RuntimeError('connection lost')
            if "SELECT 'fenced'" in sql: return 'fenced'
            return ''
        fence = self.cutover.DatabaseFence(self.plan, self.binding, self.secret, admin)
        with self.assertRaises(RuntimeError): fence.install()
        original = self.secret.read()
        fence.install()
        self.assertEqual(self.secret.read(), original)
        self.assertEqual(state['phase'], 'fenced')
        self.assertEqual(sum('CREATE SCHEMA' in sql for sql in state['calls']), 1)

    def test_install_drains_old_writer_sessions_before_confirming_fence(self):
        state = {'phase': 'absent', 'calls': []}
        def admin(sql):
            state['calls'].append(sql)
            if "current_setting('pos_manual_finance.fence_status')" in sql:
                return state['phase']
            if 'CREATE SCHEMA' in sql:
                state['phase'] = 'fenced'
            if "SELECT 'fenced'" in sql:
                return 'fenced'
            return ''
        fence = self.cutover.DatabaseFence(self.plan, self.binding, self.secret, admin)
        fence.install()
        drain = next((index for index, sql in enumerate(state['calls']) if 'DO $drain$' in sql), None)
        self.assertIsNotNone(drain, 'existing writer sessions must be terminated after logins are fenced')
        self.assertEqual(state['calls'][-1], self.cutover.role_fence_status_sql(self.plan, self.binding))
        self.assertLess(drain, len(state['calls']) - 1, 'the fence must not be declared ready until old sessions are drained')

    def test_existing_fence_without_credential_fails_closed(self):
        fence = self.cutover.DatabaseFence(self.plan, self.binding, self.secret, lambda sql: 'fenced')
        with self.assertRaises(self.cutover.CutoverError): fence.install()
        self.assertFalse(self.path.exists())


class FakeAdapters:
    def __init__(self):
        self.events = []
        self.gate = False
        self.stopped = False
        self.fenced = False
        self.backup_good = True
        self.files_good = True
        self.fail = None
        self.fingerprint = 'f' * 64

    def call(self, name):
        self.events.append(name)
        if self.fail == name:
            raise RuntimeError(name)

    def verify_target(self, plan): self.call('verify_target'); return True
    def close_gate(self, plan): self.call('close_gate'); self.gate = True
    def verify_gate(self, plan): self.call('verify_gate'); return self.gate
    def stop_old_writers(self, plan): self.call('stop_old_writers'); self.stopped = True
    def verify_old_writers_stopped(self, plan): self.call('verify_old_writers_stopped'); return self.stopped
    def install_database_fence(self, plan): self.call('install_database_fence'); self.fenced = True
    def verify_database_fence(self, plan): self.call('verify_database_fence'); return self.fenced
    def create_verified_backup(self, plan):
        self.call('create_verified_backup')
        return {'backup_sha256': '9' * 64, 'restore_verified': self.backup_good}
    def verify_backup(self, plan, evidence): self.call('verify_backup'); return self.backup_good
    def verify_migration_files(self, plan): self.call('verify_migration_files'); return self.files_good
    def apply_migrations(self, plan): self.call('apply_migrations')
    def verify_migrated(self, plan): self.call('verify_migrated'); return self.fingerprint
    def verify_ci_artifact(self, plan, evidence): self.call('verify_ci_artifact'); return True
    def switch_candidate(self, plan, evidence): self.call('switch_candidate')
    def verify_candidate_active(self, plan, evidence): self.call('verify_candidate_active'); return True
    def release_database_fence(self, plan, evidence): self.call('release_database_fence'); self.fenced = False
    def verify_database_released(self, plan): self.call('verify_database_released'); return not self.fenced
    def open_gate(self, plan, evidence): self.call('open_gate'); self.gate = False
    def verify_gate_open(self, plan): self.call('verify_gate_open'); return not self.gate
    def verify_thaw_state(self, plan, evidence): self.call('verify_thaw_state'); return True


class FenceAndMigrationTests(unittest.TestCase):
    def setUp(self):
        self.cutover = load_cutover()
        for name in ('plan_binding', 'fence', 'migrate'):
            self.assertTrue(hasattr(self.cutover, name), f'{name} must enforce the development cutover order')
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.plan = valid_plan()
        self.journal = self.cutover.Journal(pathlib.Path(self.tmp.name) / 'journal.json', self.cutover.plan_binding(self.plan))
        self.adapters = FakeAdapters()

    def test_fences_before_backup_and_migration(self):
        self.cutover.fence(self.plan, self.adapters, self.journal)
        self.cutover.migrate(self.plan, self.adapters, self.journal)
        self.assertEqual(self.journal.load()['phase'], 'migrated')
        events = self.adapters.events
        self.assertLess(events.index('close_gate'), events.index('stop_old_writers'))
        self.assertLess(events.index('stop_old_writers'), events.index('install_database_fence'))
        self.assertLess(events.index('install_database_fence'), events.index('create_verified_backup'))
        self.assertLess(events.index('create_verified_backup'), events.index('apply_migrations'))

    def test_migration_rejects_absent_fence_or_changed_binding(self):
        with self.assertRaises(self.cutover.CutoverError):
            self.cutover.migrate(self.plan, self.adapters, self.journal)
        self.assertNotIn('apply_migrations', self.adapters.events)
        self.adapters.events.clear()
        plan = copy.deepcopy(self.plan); plan['candidate']['tree'] = '3' * 40
        with self.assertRaises(self.cutover.CutoverError):
            self.cutover.fence(plan, self.adapters, self.journal)
        self.assertEqual(self.adapters.events, [])

    def test_failed_fence_never_starts_backup_or_migration(self):
        for failed in ('close_gate', 'stop_old_writers', 'install_database_fence'):
            with self.subTest(failed=failed), tempfile.TemporaryDirectory() as tmp:
                journal = self.cutover.Journal(pathlib.Path(tmp) / 'journal.json', self.cutover.plan_binding(self.plan))
                adapters = FakeAdapters(); adapters.fail = failed
                with self.assertRaises(RuntimeError): self.cutover.fence(self.plan, adapters, journal)
                self.assertNotIn('create_verified_backup', adapters.events)
                self.assertNotIn('apply_migrations', adapters.events)
                self.assertIn(journal.load()['phase'], ('gate_intent', 'fence_intent'))

    def test_unverified_backup_or_migration_files_fail_closed(self):
        self.cutover.fence(self.plan, self.adapters, self.journal)
        self.adapters.backup_good = False
        with self.assertRaises(self.cutover.CutoverError): self.cutover.migrate(self.plan, self.adapters, self.journal)
        self.assertEqual(self.journal.load()['phase'], 'fenced')
        self.adapters.backup_good = True; self.adapters.files_good = False
        with self.assertRaises(self.cutover.CutoverError): self.cutover.migrate(self.plan, self.adapters, self.journal)
        self.assertEqual(self.journal.load()['phase'], 'backup_verified')
        self.assertNotIn('apply_migrations', self.adapters.events)

    def test_interrupted_migration_resumes_only_while_fenced(self):
        self.cutover.fence(self.plan, self.adapters, self.journal)
        self.adapters.fail = 'apply_migrations'
        with self.assertRaises(RuntimeError): self.cutover.migrate(self.plan, self.adapters, self.journal)
        self.assertEqual(self.journal.load()['phase'], 'migrating')
        self.adapters.fail = None; self.adapters.fenced = False
        with self.assertRaises(self.cutover.CutoverError): self.cutover.migrate(self.plan, self.adapters, self.journal)
        self.adapters.fenced = True
        self.cutover.migrate(self.plan, self.adapters, self.journal)
        self.assertEqual(self.journal.load()['phase'], 'migrated')

    def test_wrong_migrated_fingerprint_does_not_release_fence(self):
        self.cutover.fence(self.plan, self.adapters, self.journal)
        self.adapters.fingerprint = '0' * 64
        with self.assertRaises(self.cutover.CutoverError): self.cutover.migrate(self.plan, self.adapters, self.journal)
        self.assertEqual(self.journal.load()['phase'], 'migrating')
        self.assertTrue(self.adapters.gate and self.adapters.fenced)


class ActivationTests(unittest.TestCase):
    def setUp(self):
        self.cutover = load_cutover()
        for name in ('activate', 'recover'):
            self.assertTrue(hasattr(self.cutover, name), f'{name} must recover forward')
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.plan = valid_plan()
        self.journal = self.cutover.Journal(pathlib.Path(self.tmp.name) / 'journal.json', self.cutover.plan_binding(self.plan))
        self.adapters = FakeAdapters()
        self.cutover.fence(self.plan, self.adapters, self.journal)
        self.cutover.migrate(self.plan, self.adapters, self.journal)
        self.evidence = {'commit': '1' * 40, 'run_id': 99, 'artifact_id': 100, 'schema_sha256': 'e' * 64}

    def test_activates_then_releases_fence_and_gate(self):
        self.cutover.activate(self.plan, self.adapters, self.journal, self.evidence)
        self.assertEqual(self.journal.load()['phase'], 'complete')
        self.assertLess(self.adapters.events.index('switch_candidate'), self.adapters.events.index('release_database_fence'))
        self.assertLess(self.adapters.events.index('release_database_fence'), self.adapters.events.index('open_gate'))
        self.assertFalse(self.adapters.gate or self.adapters.fenced)

    def test_wrong_schema_or_untrusted_artifact_does_not_switch(self):
        bad = {**self.evidence, 'schema_sha256': '0' * 64}
        with self.assertRaises(self.cutover.CutoverError): self.cutover.activate(self.plan, self.adapters, self.journal, bad)
        self.adapters.verify_ci_artifact = lambda plan, evidence: False
        with self.assertRaises(self.cutover.CutoverError): self.cutover.activate(self.plan, self.adapters, self.journal, self.evidence)
        self.assertEqual(self.journal.load()['phase'], 'migrated')
        self.assertNotIn('switch_candidate', self.adapters.events)
        self.assertTrue(self.adapters.gate and self.adapters.fenced)

    def test_interrupted_switch_recovers_forward_while_fenced(self):
        self.adapters.fail = 'switch_candidate'
        with self.assertRaises(RuntimeError): self.cutover.activate(self.plan, self.adapters, self.journal, self.evidence)
        self.assertEqual(self.journal.load()['phase'], 'switching')
        self.assertTrue(self.adapters.gate and self.adapters.fenced)
        self.adapters.fail = None
        self.cutover.recover(self.plan, self.adapters, self.journal)
        self.assertEqual(self.journal.load()['phase'], 'complete')

    def test_interrupted_thaw_recovers_without_releasing_gate_early(self):
        self.adapters.fail = 'open_gate'
        with self.assertRaises(RuntimeError): self.cutover.activate(self.plan, self.adapters, self.journal, self.evidence)
        self.assertEqual(self.journal.load()['phase'], 'thawing')
        self.assertTrue(self.adapters.gate)
        self.adapters.fail = None
        self.cutover.recover(self.plan, self.adapters, self.journal)
        self.assertEqual(self.journal.load()['phase'], 'complete')

    def test_interrupted_gate_open_recovers_only_if_release_is_verified(self):
        def open_then_fail(plan, evidence):
            self.adapters.gate = False
            raise RuntimeError('response lost')
        self.adapters.open_gate = open_then_fail
        with self.assertRaises(RuntimeError): self.cutover.activate(self.plan, self.adapters, self.journal, self.evidence)
        self.assertEqual(self.journal.load()['phase'], 'thawing')
        self.assertFalse(self.adapters.gate or self.adapters.fenced)
        self.cutover.recover(self.plan, self.adapters, self.journal)
        self.assertEqual(self.journal.load()['phase'], 'complete')

    def test_unverified_open_gate_keeps_recovery_incomplete(self):
        def open_then_fail(plan, evidence):
            self.adapters.gate = False
            raise RuntimeError('response lost')
        self.adapters.open_gate = open_then_fail
        with self.assertRaises(RuntimeError): self.cutover.activate(self.plan, self.adapters, self.journal, self.evidence)
        self.adapters.verify_thaw_state = lambda plan, evidence: False
        with self.assertRaises(self.cutover.CutoverError): self.cutover.recover(self.plan, self.adapters, self.journal)
        self.assertEqual(self.journal.load()['phase'], 'thawing')


if __name__ == '__main__':
    unittest.main()
