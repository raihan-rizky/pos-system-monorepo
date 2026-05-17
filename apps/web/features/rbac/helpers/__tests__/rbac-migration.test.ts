import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

describe("RBAC permission migration contract", () => {
  it("allows authenticated middleware reads from pos_role_permissions", () => {
    const migrationsDir = join(process.cwd(), "../../packages/db/prisma/migrations");
    const sql = readdirSync(migrationsDir)
      .filter((entry) => entry.includes("rbac"))
      .map((entry) => readFileSync(join(migrationsDir, entry, "migration.sql"), "utf8"))
      .join("\n");

    expect(sql).toContain('ALTER TABLE "pos_role_permissions" ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain("FOR SELECT");
    expect(sql).toContain("TO authenticated");
    expect(sql).toContain('GRANT SELECT ON TABLE "pos_role_permissions" TO authenticated');
  });
});
