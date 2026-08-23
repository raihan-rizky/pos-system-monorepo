import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const schemaPath = join(process.cwd(), "../../packages/db/prisma/schema.prisma");
const migrationPath = join(
  process.cwd(),
  "../../packages/db/prisma/migrations/20260823_transaction_stock_deduction_source/migration.sql",
);

describe("transaction stock deduction source migration", () => {
  it("keeps existing transactions on Surat Jalan and defaults new transactions to transaction stock", () => {
    const schema = readFileSync(schemaPath, "utf8");
    const migration = existsSync(migrationPath)
      ? readFileSync(migrationPath, "utf8")
      : "";

    expect(schema).toContain("enum TransactionStockDeductionSource");
    expect(schema).toMatch(
      /stockDeductionSource\s+TransactionStockDeductionSource\s+@default\(TRANSACTION\)/,
    );
    expect(migration).toContain(
      'CREATE TYPE "TransactionStockDeductionSource"',
    );
    expect(migration).toContain(
      'UPDATE "pos_transactions" SET "stockDeductionSource" = \'SURAT_JALAN\'',
    );
    expect(migration).toContain("SET DEFAULT 'TRANSACTION'");
    expect(migration).toContain("SET NOT NULL");
  });
});
