import hashlib
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/deploy"))
from manual_finance_dev_cutover import CutoverError, MIGRATIONS


class MigrationHistoryTests(unittest.TestCase):
    def setUp(self):
        from manual_finance_dev_host import pending_migrations

        self.pending_migrations = pending_migrations
        self.directory = self.enterContext(tempfile.TemporaryDirectory())
        self.migrations = Path(self.directory)
        for name in ("20261120120000_baseline", *MIGRATIONS):
            path = self.migrations / name
            path.mkdir()
            (path / "migration.sql").write_bytes(b"SELECT 1;\n")
        self.digest = hashlib.sha256(b"SELECT 1;\n").hexdigest()
        self.old_windows_digest = hashlib.sha256(b"SELECT 1;\r\n").hexdigest()
        self.baseline = [("20261120120000_baseline", self.old_windows_digest, True)]

    def test_allows_reviewed_migrations_with_historical_windows_checksum(self):
        self.assertEqual(self.pending_migrations(self.migrations, self.baseline), MIGRATIONS)

    def test_rejects_an_unfinished_migration(self):
        with self.assertRaises(CutoverError):
            self.pending_migrations(self.migrations, [*self.baseline, (MIGRATIONS[0], self.digest, False)])

    def test_rejects_unknown_or_changed_applied_migrations(self):
        for name, digest in [("unexpected", self.digest), (self.baseline[0][0], "0" * 64)]:
            with self.subTest(name=name), self.assertRaises(CutoverError):
                self.pending_migrations(self.migrations, [(name, digest, True)])

    def test_rejects_applied_feature_with_checksum_different_from_git(self):
        with self.assertRaises(CutoverError):
            self.pending_migrations(
                self.migrations, [*self.baseline, (MIGRATIONS[0], self.old_windows_digest, True)]
            )

    def test_resume_only_allows_a_verified_prefix(self):
        self.assertEqual(self.pending_migrations(
            self.migrations, [*self.baseline, (MIGRATIONS[0], self.digest, True)]
        ), MIGRATIONS[1:])
        with self.assertRaises(CutoverError):
            self.pending_migrations(self.migrations, [*self.baseline, (MIGRATIONS[1], self.digest, True)])


class PostgresTargetTests(unittest.TestCase):
    def setUp(self):
        from manual_finance_dev_host import DevPostgres

        self.runner = Mock()
        self.db = DevPostgres(self.runner)
        self.plan = {"dev_database": {"cluster": "123", "database": "postgres"},
                     "prod_database": {"cluster": "456", "database": "postgres"}}

    def test_dev_admin_cannot_send_statements_to_production(self):
        self.runner.side_effect = ["123|postgres", "456|postgres", "result"]
        self.assertEqual(self.db.admin(self.plan, "SELECT 1"), "result")
        calls = self.runner.call_args_list
        self.assertEqual([call.args[0][3] for call in calls], ["posdev-db", "posprod-db", "posdev-db"])
        self.assertEqual(calls[-1].kwargs["input"], "SELECT 1")
        self.assertNotIn("SELECT 1", calls[1].kwargs["input"])

    def test_admin_refuses_dev_endpoint_that_resolves_to_production(self):
        self.runner.side_effect = ["456|postgres", "456|postgres"]
        with self.assertRaises(CutoverError):
            self.db.admin(self.plan, "SELECT 1")
        self.assertEqual(self.runner.call_count, 2)

    def test_reads_only_unrolled_back_prisma_history(self):
        self.runner.side_effect = ["123|postgres", "456|postgres", '[["old","digest",true]]']
        self.assertEqual(self.db.migration_history(self.plan), [["old", "digest", True]])
        self.assertIn("rolled_back_at IS NULL", self.runner.call_args.kwargs["input"])

    def test_accepts_cron_only_if_all_active_jobs_need_a_fenced_login(self):
        self.plan["database_roles"] = {"writers": ["authenticator", "postgres"]}
        self.runner.side_effect = ["123|postgres", "456|postgres", "t"]
        self.assertTrue(self.db.cron_writers_are_fenced(self.plan))
        sql = self.runner.call_args.kwargs["input"]
        self.assertIn("cron.use_background_workers", sql)
        self.assertIn("'postgres'", sql)
        self.assertIn("NOT EXISTS", sql)


class BackupTests(unittest.TestCase):
    def setUp(self):
        from manual_finance_dev_host import write_verified_backup

        self.write_backup = write_verified_backup
        self.archive = Path(self.enterContext(tempfile.TemporaryDirectory())) / "dev.dump"

    def test_backup_is_published_only_after_a_restore(self):
        def write(stream):
            stream.write(b"PGDMP fixture")

        def restore(staged):
            self.assertFalse(self.archive.exists())
            return staged.read_bytes() == b"PGDMP fixture"

        result = self.write_backup(self.archive, write, restore)
        self.assertEqual(result, {"backup_sha256": hashlib.sha256(b"PGDMP fixture").hexdigest(), "restore_verified": True})
        self.assertEqual(self.archive.read_bytes(), b"PGDMP fixture")

    def test_failed_restore_never_publishes_a_backup(self):
        with self.assertRaises(CutoverError):
            self.write_backup(self.archive, lambda stream: stream.write(b"PGDMP fixture"), lambda _: False)
        self.assertFalse(self.archive.exists())
        self.assertEqual(list(self.archive.parent.iterdir()), [])

    def test_does_not_overwrite_a_backup_used_by_recovery(self):
        self.archive.write_bytes(b"PGDMP previous")
        restore = Mock()
        with self.assertRaises(CutoverError):
            self.write_backup(self.archive, lambda stream: stream.write(b"wrong"), restore)
        restore.assert_not_called()
        self.assertEqual(self.archive.read_bytes(), b"PGDMP previous")


class BaselineTests(unittest.TestCase):
    def test_independently_reviewed_live_database_can_be_ahead_of_active_runtime(self):
        from manual_finance_dev_host import baseline_compatible
        from test_vps_manual_finance_cutover import valid_plan

        plan = valid_plan()
        plan["database_baseline"] = {"commit": "9" * 40, "fingerprint": "8" * 64}
        services, github = Mock(), Mock()
        github.head.return_value = plan["database_baseline"]["commit"]
        services.compatible.return_value = True
        original = {"id": "live", "database_fingerprint": plan["active_release"]["database_fingerprint"]}
        self.assertTrue(baseline_compatible(plan, services, github, original))
        services.compatible.assert_called_once_with({"id": "live", "database_fingerprint": "8" * 64})
        self.assertEqual(original["database_fingerprint"], plan["active_release"]["database_fingerprint"])
        github.head.return_value = plan["active_release"]["commit"]
        self.assertFalse(baseline_compatible(plan, services, github, original))

    def test_live_baseline_is_bound_to_the_cutover_journal(self):
        from manual_finance_dev_cutover import plan_binding
        from test_vps_manual_finance_cutover import valid_plan

        plan = valid_plan()
        old_binding = plan_binding(plan)
        plan["database_baseline"] = {"commit": "9" * 40, "fingerprint": "8" * 64}
        new_binding = plan_binding(plan)
        self.assertNotEqual(old_binding, new_binding)
        plan["database_baseline"]["fingerprint"] = plan["candidate"]["database_fingerprint"]
        with self.assertRaises(CutoverError):
            plan_binding(plan)


if __name__ == "__main__":
    unittest.main()
