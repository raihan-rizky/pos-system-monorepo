import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

describe("inventory log approval migration contract", () => {
  it("repairs missing approval status columns idempotently", () => {
    const migrationsDir = join(process.cwd(), "../../packages/db/prisma/migrations");
    const sql = readdirSync(migrationsDir)
      .filter((entry) => entry.includes("inventory_log_approval_status"))
      .map((entry) => readFileSync(join(migrationsDir, entry, "migration.sql"), "utf8"))
      .join("\n");

    expect(sql).toContain('CREATE TYPE "InventoryLogStatus"');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "status"');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "approvedBy"');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "approverName"');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "decidedAt"');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "rejectionReason"');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS "pos_inventory_logs_status_createdAt_idx"');
  });
});
