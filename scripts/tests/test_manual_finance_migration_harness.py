import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "packages/db/prisma/migrations/20261121010000_manual_finance_categories/migration.sql"
HARNESS = ROOT / "packages/db/prisma/tests/manual-finance-migration.sql"


class ManualFinanceMigrationHarnessTests(unittest.TestCase):
    def test_transfer_allocations_are_server_only(self):
        migration = MIGRATION.read_text(encoding="utf-8")
        self.assertIn('ALTER TABLE "pos_manual_transfer_allocations" ENABLE ROW LEVEL SECURITY', migration)
        for role in ("PUBLIC", "anon", "authenticated", "service_role"):
            self.assertIn(f'REVOKE ALL ON TABLE "pos_manual_transfer_allocations" FROM {role}', migration)

    def test_reuses_the_expense_correction_payable_key(self):
        prior = "20261120100000_expense_correction_journal"
        self.assertGreater(MIGRATION.parent.name, prior)
        self.assertNotIn('CREATE UNIQUE INDEX "pos_supplier_payables_id_store_key"', MIGRATION.read_text(encoding="utf-8"))
        self.assertIn(
            'CREATE UNIQUE INDEX "pos_supplier_payables_id_storeId_key"',
            (MIGRATION.parent.parent / prior / "migration.sql").read_text(encoding="utf-8"),
        )

    def test_fixture_defines_every_migration_foreign_key_target(self):
        migration = MIGRATION.read_text(encoding="utf-8")
        harness = HARNESS.read_text(encoding="utf-8")
        setup = harness.split("-- APPLY_MIGRATION_HERE", maxsplit=1)[0]
        table_bodies = {
            name: re.sub(r"\s+", " ", body)
            for name, body in re.findall(r'CREATE TABLE\s+"([^"]+)"\s*\((.*?)\);', setup, re.DOTALL)
        }

        for parent, raw_columns in re.findall(r'REFERENCES\s+"([^"]+)"\s*\(([^)]*)\)', migration):
            columns = tuple(column.strip().strip('"') for column in raw_columns.split(","))
            with self.subTest(parent=parent, columns=columns):
                self.assertIn(parent, table_bodies, f"fixture must create referenced table {parent}")
                body = table_bodies[parent]
                if len(columns) == 1:
                    self.assertRegex(
                        body,
                        rf'"{re.escape(columns[0])}"[^,]*\bPRIMARY KEY\b|PRIMARY KEY\s*\(\s*"{re.escape(columns[0])}"\s*\)',
                        f"fixture must define a primary key for {parent}({columns[0]})",
                    )
                else:
                    key_columns = r"\s*,\s*".join(f'"{re.escape(column)}"' for column in columns)
                    self.assertRegex(
                        body,
                        rf'(?:UNIQUE|PRIMARY KEY)\s*\(\s*{key_columns}\s*\)',
                        f"fixture must define a unique key for {parent}{columns}",
                    )


if __name__ == "__main__":
    unittest.main()
