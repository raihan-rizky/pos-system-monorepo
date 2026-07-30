import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "../../packages/db/prisma/migrations/20260730_repair_transaction_item_snapshot_columns/migration.sql",
);

describe("transaction item snapshot schema repair", () => {
  it("repairs every snapshot column idempotently", () => {
    expect(existsSync(migrationPath)).toBe(true);

    const migration = existsSync(migrationPath)
      ? readFileSync(migrationPath, "utf8")
      : "";

    expect(migration).toContain('ALTER TABLE "pos_transaction_items"');
    expect(migration).toContain(
      'ADD COLUMN IF NOT EXISTS "material" TEXT',
    );
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "size" TEXT');
    expect(migration).toContain(
      'ADD COLUMN IF NOT EXISTS "unitCost" DECIMAL(12,2)',
    );
  });
});
