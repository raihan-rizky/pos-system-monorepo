import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const migrationsDir = join(process.cwd(), "../../packages/db/prisma/migrations");

function readMigrationSql(entry: string) {
  return readFileSync(join(migrationsDir, entry, "migration.sql"), "utf8");
}

function readMatchingMigrationSql(predicate: (entry: string) => boolean) {
  return readdirSync(migrationsDir)
    .filter(predicate)
    .map((entry) => readMigrationSql(entry))
    .join("\n");
}

describe("RBAC permission migration contract", () => {
  it("keeps RBAC enum and table prerequisites before the RBAC migration", () => {
    const entries = readdirSync(migrationsDir)
      .filter((entry) => entry !== "migration_lock.toml")
      .sort();
    const rbacMigrationIndex = entries.indexOf("20260506_rbac_migration");
    const prerequisiteSql = entries.slice(0, rbacMigrationIndex).map(readMigrationSql).join("\n");

    expect(rbacMigrationIndex).toBeGreaterThan(0);
    expect(prerequisiteSql).toContain('CREATE TYPE "Role"');
    expect(prerequisiteSql).toContain('CREATE TYPE "TransactionStatus"');
    expect(prerequisiteSql).toContain('CREATE TABLE IF NOT EXISTS "pos_users"');
    expect(prerequisiteSql).toContain('CREATE TABLE IF NOT EXISTS "pos_transactions"');
  });

  it("allows authenticated middleware reads from pos_role_permissions", () => {
    const sql = readMatchingMigrationSql((entry) => entry.includes("rbac"));

    expect(sql).toContain('ALTER TABLE "pos_role_permissions" ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain("FOR SELECT");
    expect(sql).toContain("TO authenticated");
    expect(sql).toContain('GRANT SELECT ON TABLE "pos_role_permissions" TO authenticated');
  });

  it("repairs a drifted pos_role_permissions SELECT policy idempotently", () => {
    const repairMigration = readdirSync(migrationsDir).find(
      (entry) => entry === "20260710_restore_rbac_permissions_read_policy",
    );

    expect(repairMigration).toBeDefined();
    if (!repairMigration) return;

    const sql = readMigrationSql(repairMigration);

    expect(sql).toContain('ALTER TABLE "pos_role_permissions" ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain(
      'DROP POLICY IF EXISTS "Allow authenticated users to read role permissions"',
    );
    expect(sql).toContain('CREATE POLICY "Allow authenticated users to read role permissions"');
    expect(sql).toContain("FOR SELECT");
    expect(sql).toContain("TO authenticated");
    expect(sql).toContain("USING (true)");
    expect(sql).toContain('GRANT SELECT ON TABLE "pos_role_permissions" TO authenticated');
  });

  it("allows authenticated middleware reads from pos_users", () => {
    const sql = readMatchingMigrationSql(
      (entry) => entry.includes("rbac") || entry.includes("rls"),
    );

    expect(sql).toContain('ALTER TABLE "pos_users" ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('Allow authenticated users to read pos_users');
    expect(sql).toContain('GRANT SELECT ON TABLE "pos_users" TO authenticated');
  });
});
