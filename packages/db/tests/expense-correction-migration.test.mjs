import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migration = readFileSync(
  new URL("../prisma/migrations/20261120100000_expense_correction_journal/migration.sql", import.meta.url),
  "utf8",
);
const tables = [
  "pos_expense_corrections",
  "pos_expense_payment_settlements",
  "pos_expense_supplier_credit_applications",
];

test("the journal migration protects every financial audit table before commit", () => {
  const commit = migration.indexOf("COMMIT;");
  assert.ok(commit > 0);
  for (const table of tables) {
    const protection = migration.indexOf(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;`);
    assert.ok(protection > 0 && protection < commit, `${table} requires row-level security before commit`);
  }
  const tableList = tables.map(table => `"${table}"`).join(", ");
  assert.ok(migration.includes(`REVOKE ALL ON TABLE ${tableList} FROM PUBLIC;`));
  assert.ok(migration.includes(`REVOKE ALL ON TABLE ${tableList} FROM %I`));
  assert.match(migration, /rolname IN \('anon', 'authenticated', 'service_role'\)/);
});
