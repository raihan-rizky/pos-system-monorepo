import datetime as dt
import importlib.util
import io
import pathlib
import json
import sys
import tarfile
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
NOW = 2_000_000_000
SHA = 'a' * 40


def policy(test):
    path = ROOT / 'scripts/deploy/release_policy.py'
    test.assertTrue(path.exists(), 'Release policy must exist')
    spec = importlib.util.spec_from_file_location('release_policy', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def run_fixture():
    run = dict(id=42, event='push', conclusion='success', head_branch='main',
               head_sha=SHA, head_repository={'full_name': 'raihan-rizky/pos-system-monorepo'},
               path='.github/workflows/ci.yml')
    created = dt.datetime.fromtimestamp(NOW - 100, dt.timezone.utc).isoformat()
    artifact = dict(id=75, name='pos-runtime-prod-42', expired=False,
                    created_at=created, size_in_bytes=1000)
    return run, artifact


class PolicyTests(unittest.TestCase):
    def test_only_completed_trusted_branch_builds_are_eligible(self):
        p = policy(self)
        run, artifact = run_fixture()
        p.validate_run(run, 'prod', artifact, NOW)
        for field, value in [('event', 'pull_request'), ('event', 'workflow_run'),
                             ('conclusion', 'failure'), ('head_branch', 'dev'),
                             ('path', '.github/workflows/evil.yml'),
                             ('head_repository', {'full_name': 'attacker/fork'})]:
            with self.subTest(field=field, value=value), self.assertRaises(p.ReleaseError):
                p.validate_run({**run, field: value}, 'prod', artifact, NOW)

    def test_artifact_target_run_expiry_and_size_are_checked(self):
        p = policy(self)
        run, artifact = run_fixture()
        for change in [{'name': 'pos-runtime-dev-42'}, {'name': 'pos-runtime-prod-41'},
                       {'expired': True}, {'size_in_bytes': 2 ** 31},
                       {'created_at': dt.datetime.fromtimestamp(NOW - 72 * 3600, dt.timezone.utc).isoformat()}]:
            with self.subTest(change=change), self.assertRaises(p.ReleaseError):
                p.validate_run(run, 'prod', {**artifact, **change}, NOW)

    def test_metadata_matches_runtime_configuration_and_schema(self):
        p = policy(self)
        expected = dict(publicAuthUrl='https://example.test/supabase', publicAnonKeySha256='b' * 64,
                        publicR2BaseUrl='https://assets.example.test', schemaSha256='c' * 64)
        meta = dict(target='prod', checkedOutSha=SHA, buildId='build-1', runId='42',
                    sourceBranch='main', sourceRepository='raihan-rizky/pos-system-monorepo', **expected)
        p.validate_metadata(meta, 'prod', expected, run_fixture()[0])
        for key in expected:
            with self.subTest(key=key), self.assertRaises(p.ReleaseError):
                p.validate_metadata({**meta, key: 'wrong'}, 'prod', expected, run_fixture()[0])

    def test_cleanup_protects_active_latest_rollback_and_inflight(self):
        p = policy(self)
        records = [dict(id='active', target='prod', healthy=True, inactive_at=NOW - 900000),
                   dict(id='rollback', target='prod', healthy=True, inactive_at=NOW - 100),
                   dict(id='older', target='prod', healthy=True, inactive_at=NOW - 200, remote_verified=True),
                   dict(id='inflight', target='prod', failed_at=NOW - 900000, in_flight=True),
                   dict(id='unknown', target='prod'),
                   dict(id='dev-rollback', target='dev', healthy=True, inactive_at=NOW - 20)]
        self.assertEqual(p.cleanup_plan(records, {'active'}, NOW), ['older'])

    def test_exact_72_hour_and_24_hour_boundaries(self):
        p = policy(self)
        records = [dict(id='expired', target='prod', healthy=True, inactive_at=NOW - 72 * 3600),
                   dict(id='failed', target='prod', failed_at=NOW - 24 * 3600),
                   dict(id='young-failed', target='prod', failed_at=NOW - 24 * 3600 + 1),
                   dict(id='unarchived', target='dev', healthy=True, inactive_at=NOW - 5),
                   dict(id='second-unarchived', target='dev', healthy=True, inactive_at=NOW - 10)]
        self.assertEqual(p.cleanup_plan(records, set(), NOW), ['expired', 'failed'])

    def test_safe_archive_extracts_runtime(self):
        p = policy(self)
        with tempfile.TemporaryDirectory() as tmp:
            archive = pathlib.Path(tmp) / 'test.tar.gz'
            with tarfile.open(archive, 'w:gz') as tar:
                info = tarfile.TarInfo('runtime/apps/web/.next/BUILD_ID')
                info.size = 2
                tar.addfile(info, io.BytesIO(b'ok'))
            p.extract_runtime(archive, pathlib.Path(tmp) / 'out')
            self.assertEqual((pathlib.Path(tmp) / 'out/runtime/apps/web/.next/BUILD_ID').read_text(), 'ok')

    def test_archive_rejects_escape_absolute_links_and_special_files(self):
        p = policy(self)
        for name, kind, link in [('runtime/../../escape', tarfile.REGTYPE, ''),
                                 ('/etc/escape', tarfile.REGTYPE, ''),
                                 ('runtime/link', tarfile.SYMTYPE, '../../escape'),
                                 ('runtime/fifo', tarfile.FIFOTYPE, '')]:
            with self.subTest(name=name, kind=kind), tempfile.TemporaryDirectory() as tmp:
                archive = pathlib.Path(tmp) / 'test.tar.gz'
                with tarfile.open(archive, 'w:gz') as tar:
                    info = tarfile.TarInfo(name)
                    info.type, info.linkname = kind, link
                    tar.addfile(info)
                with self.assertRaises(p.ReleaseError):
                    p.extract_runtime(archive, pathlib.Path(tmp) / 'out')


class EngineTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = pathlib.Path(self.tmp.name)
        path = ROOT / 'scripts/deploy/release_engine.py'
        self.assertTrue(path.exists(), 'Release engine must exist')
        sys.path.insert(0, str(path.parent))
        self.addCleanup(lambda: sys.path.remove(str(path.parent)))
        spec = importlib.util.spec_from_file_location('release_engine', path)
        self.engine = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.engine)
        self.old = dict(id='old', target='prod', runtime=str(self.root / 'releases/old/runtime'),
                        healthy=True, metadata={'checkedOutSha': 'b' * 40, 'buildId': 'old'})
        self.new = dict(id='new', target='prod', runtime=str(self.root / 'releases/new/runtime'),
                        metadata={'checkedOutSha': SHA, 'buildId': 'new'}, run_id=42, artifact_id=75)
        for record in (self.old, self.new):
            pathlib.Path(record['runtime']).mkdir(parents=True)
        self.state = dict(version=1, environments={'prod': 'old'}, releases={'old': self.old}, blocked={})
        self.statefile = self.root / 'state.json'
        self.statefile.write_text(json.dumps(self.state))
        class Services:
            def __init__(self, old):
                self.current = old
                self.events = []
                self.safe = True
                self.ok = True
                self.compat = True
                self.crash = False
            def live_paths(self): return {self.current['runtime']}
            def compatible(self, record): return self.compat
            def canary(self, record): self.events.append('canary')
            def drain(self, target, timeout):
                self.events.append('drain')
                return self.safe
            def switch(self, target, record):
                self.events.append('switch:' + record['id'])
                self.current = record
                if self.crash: raise KeyboardInterrupt('simulated power loss')
            def ready(self, target, record): return self.ok if record['id'] == 'new' else True
            def worker_stopped(self, target): return self.safe
            def start_worker(self, target): self.events.append('start-worker')
        self.services = Services(self.old)
        class Github:
            def __init__(self, new): self.new, self.tip = new, SHA
            def prepare(self, request, active): return dict(self.new)
            def head(self, target): return self.tip
        self.github = Github(self.new)
        self.manager = self.engine.ReleaseManager(dict(root=str(self.root), state_file=str(self.statefile)),
                                                   self.services, self.github, clock=lambda: NOW)
        self.request = dict(target='prod', run_id=42, artifact_id=75)

    def state_now(self): return json.loads(self.statefile.read_text())

    def test_success_switches_together_and_records_one_rollback(self):
        self.manager.deploy(self.request)
        state = self.state_now()
        self.assertEqual(state['environments']['prod'], 'new')
        self.assertEqual(state['releases']['old']['inactive_at'], NOW)
        self.assertTrue(state['releases']['new']['healthy'])
        self.assertEqual(self.services.events, ['canary', 'drain', 'switch:new'])

    def test_duplicate_and_stale_builds_cannot_switch(self):
        self.manager.deploy(self.request)
        before = list(self.services.events)
        self.manager.deploy(self.request)
        self.assertEqual(self.services.events, before)
        self.github.tip = 'c' * 40
        with self.assertRaises(self.engine.ReleaseError): self.manager.deploy(self.request)

    def test_failed_readiness_restores_previous_release(self):
        self.services.ok = False
        with self.assertRaises(self.engine.ReleaseError): self.manager.deploy(self.request)
        state = self.state_now()
        self.assertEqual(state['environments']['prod'], 'old')
        self.assertEqual(self.services.current['id'], 'old')
        self.assertEqual(state['blocked']['prod'], SHA)
        self.assertNotIn('pending', state)

    def test_worker_timeout_does_not_switch_and_recovery_restarts_worker(self):
        self.services.safe = False
        with self.assertRaises(self.engine.ReleaseError): self.manager.deploy(self.request)
        self.assertNotIn('switch:new', self.services.events)
        self.assertEqual(self.state_now()['pending']['phase'], 'waiting_worker')
        self.manager.recover()
        self.assertIn('pending', self.state_now())
        self.services.safe = True
        self.manager.recover()
        self.assertNotIn('pending', self.state_now())
        self.assertIn('start-worker', self.services.events)

    def test_interrupted_switch_has_persistent_recovery(self):
        self.services.crash = True
        with self.assertRaises(KeyboardInterrupt): self.manager.deploy(self.request)
        self.assertIn('pending', self.state_now())
        self.services.crash = False
        self.manager.recover()
        self.assertEqual(self.services.current['id'], 'old')
        self.assertNotIn('pending', self.state_now())

    def test_schema_or_configuration_drift_blocks_without_switch(self):
        self.services.compat = False
        with self.assertRaises(self.engine.ReleaseError): self.manager.deploy(self.request)
        self.assertEqual(self.services.events, [])

    def test_rollback_blocks_redeploy_of_bad_sha(self):
        self.manager.deploy(self.request)
        self.manager.rollback({'target': 'prod'})
        self.assertEqual(self.state_now()['environments']['prod'], 'old')
        with self.assertRaises(self.engine.ReleaseError): self.manager.deploy(self.request)

    def test_cleanup_never_removes_live_or_pending_paths(self):
        self.state['releases']['old']['inactive_at'] = NOW - 900000
        self.state['releases']['orphan'] = dict(self.new, id='orphan', inactive_at=NOW - 900000)
        self.state['pending'] = dict(target='prod', old='old', candidate='orphan', phase='waiting_worker')
        self.statefile.write_text(json.dumps(self.state))
        self.assertEqual(self.manager.cleanup(apply=True), [])
        self.assertTrue(pathlib.Path(self.old['runtime']).exists())

    def test_push_arriving_during_drain_never_promotes_stale_candidate(self):
        original = self.services.drain
        def drain(target, timeout):
            self.github.tip = 'c' * 40
            return original(target, timeout)
        self.services.drain = drain
        with self.assertRaises(self.engine.ReleaseError): self.manager.deploy(self.request)
        self.assertNotIn('switch:new', self.services.events)
        self.assertEqual(self.state_now()['environments']['prod'], 'old')

    def test_cleanup_rechecks_remote_archive_before_deleting_recent_history(self):
        for index in (1, 2):
            release_id = 'history-' + str(index)
            runtime = self.root / 'releases' / release_id / 'runtime'
            runtime.mkdir(parents=True)
            self.state['releases'][release_id] = dict(self.old, id=release_id, runtime=str(runtime),
                inactive_at=NOW - index * 10, remote_verified=True)
        self.statefile.write_text(json.dumps(self.state))
        self.github.available = lambda record: False
        self.assertEqual(self.manager.cleanup(apply=True), [])
        self.assertTrue((self.root / 'releases/history-2/runtime').is_dir())

    def test_cleanup_preserves_other_live_files_in_a_release_parent(self):
        parent = self.root / 'releases/expired'
        (parent / 'runtime').mkdir(parents=True)
        self.state['releases']['expired'] = dict(self.old, id='expired', runtime=str(parent / 'runtime'),
                                                 inactive_at=NOW - 900000)
        self.statefile.write_text(json.dumps(self.state))
        self.services.live_paths = lambda: {str(parent / 'other/open-file')}
        self.assertEqual(self.manager.cleanup(apply=True), [])

    def test_status_exposes_active_and_rollback_expiry(self):
        self.assertTrue(hasattr(self.manager, 'status'), 'Release status must exist')
        self.manager.deploy(self.request)
        status = self.manager.status()
        self.assertEqual(status['active']['prod']['id'], 'new')
        self.assertEqual(status['rollback']['prod']['id'], 'old')
        self.assertEqual(status['rollback']['prod']['expires_at'], NOW + 72 * 3600)


class HostContractTests(unittest.TestCase):
    def host(self):
        path = ROOT / 'scripts/deploy/pos_release.py'
        self.assertTrue(path.exists(), 'Host adapter must exist')
        sys.path.insert(0, str(path.parent))
        self.addCleanup(lambda: sys.path.remove(str(path.parent)))
        spec = importlib.util.spec_from_file_location('pos_release', path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def test_ssh_request_is_bound_to_key_environment(self):
        host = self.host()
        valid = dict(action='deploy', target='dev', run_id=42, artifact_id=75, manual=False)
        self.assertEqual(host.validate_request(valid, 'dev'), valid)
        for changes in [{'target': 'prod'}, {'action': 'shell'}, {'run_id': '../root'},
                        {'artifact_id': True}, {'command': 'rm -rf /'}, {'manual': 'false'}]:
            with self.subTest(changes=changes), self.assertRaises(host.ReleaseError):
                host.validate_request({**valid, **changes}, 'dev')

    def test_status_cannot_read_another_environment_operation(self):
        host = self.host()
        host.validate_request(dict(action='status', target='dev', operation_id='dev-' + 'a' * 16), 'dev')
        with self.assertRaises(host.ReleaseError):
            host.validate_request(dict(action='status', target='dev', operation_id='prod-' + 'a' * 16), 'dev')

    def test_installer_requires_restricted_keys_and_safe_worker_stop(self):
        path = ROOT / 'scripts/deploy/install.sh'
        self.assertTrue(path.exists(), 'Installer must exist')
        body = path.read_text()
        self.assertIn('restrict,command=', body)
        self.assertIn('SendSIGKILL=no', body)
        self.assertIn('TimeoutStopSec=infinity', body)
        self.assertNotIn('StrictHostKeyChecking=no', body)


if __name__ == '__main__':
    unittest.main()
