import importlib.util
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]


class DispatchTests(unittest.TestCase):
    def client(self):
        path = ROOT / 'scripts/deploy/dispatch.py'
        self.assertTrue(path.exists(), 'Actions dispatcher must exist')
        spec = importlib.util.spec_from_file_location('dispatch', path)
        client = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(client)
        return client

    def test_only_main_and_dev_push_runs_select_the_correct_target(self):
        client = self.client()
        run = dict(id=42, head_branch='main', event='push', conclusion='success',
                   head_repository={'full_name': 'raihan-rizky/pos-system-monorepo'},
                   path='.github/workflows/ci.yml')
        self.assertEqual(client.select_request('workflow_run', {'workflow_run': run})['target'], 'prod')
        self.assertEqual(client.select_request('workflow_run', {'workflow_run': {**run, 'head_branch': 'dev'}})['target'], 'dev')
        for changes in [{'event': 'pull_request'}, {'head_branch': 'codex/test'},
                        {'conclusion': 'failure'}, {'head_repository': {'full_name': 'attacker/fork'}},
                        {'path': '.github/workflows/untrusted.yml'}]:
            with self.subTest(changes=changes):
                self.assertIsNone(client.select_request('workflow_run', {'workflow_run': {**run, **changes}}))

    def test_manual_rollback_needs_no_arbitrary_sha(self):
        client = self.client()
        request = client.select_request('workflow_dispatch', {'inputs': {'action': 'rollback', 'target': 'dev', 'run_id': ''}})
        self.assertEqual(request, dict(action='rollback', target='dev', manual=True))
        with self.assertRaises(ValueError):
            client.select_request('workflow_dispatch', {'inputs': {'action': 'deploy', 'target': 'prod', 'run_id': 'main; echo bad'}})

    def test_workflows_separate_privileged_deploy_from_ci(self):
        ci = ROOT / '.github/workflows/ci.yml'
        deploy = ROOT / '.github/workflows/deploy.yml'
        self.assertTrue(ci.exists() and deploy.exists(), 'Two CI/CD workflows must exist')
        ci_text, deploy_text = ci.read_text(), deploy.read_text()
        self.assertIn('name: POS CI', ci_text)
        self.assertIn('retention-days: 3', ci_text)
        for forbidden in ['secrets.DATABASE_URL', 'secrets.DIRECT_URL', 'DEPLOY_KEY', 'SERVICE_ROLE_KEY']:
            self.assertNotIn(forbidden, ci_text)
        self.assertIn('workflow_run:', deploy_text)
        self.assertIn('AUTO_DEPLOY_ENABLED', deploy_text)
        self.assertIn('cancel-in-progress: false', deploy_text)
        self.assertIn('ref: main', deploy_text)
        self.assertFalse((ROOT / '.github/workflows/production.yml').exists())
        self.assertFalse((ROOT / '.github/workflows/vps-artifact.yml').exists())


if __name__ == '__main__':
    unittest.main()
