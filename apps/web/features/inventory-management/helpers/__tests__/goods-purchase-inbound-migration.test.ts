import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const schema = readFileSync(
  join(process.cwd(), "../../packages/db/prisma/schema.prisma"),
  "utf8",
);
const migrationPath = join(
  process.cwd(),
  "../../packages/db/prisma/migrations/20260724_goods_purchase_inbound_receipts/migration.sql",
);

describe("goods purchase inbound receipt persistence", () => {
  it("adds nullable, legacy-safe receipt relations and review lifecycle fields", () => {
    expect(schema).toContain("enum GoodsPurchaseFulfillmentStatus");
    expect(schema).toContain("enum InventoryInboundReceiptMatchStatus");
    expect(schema).toContain("enum InventoryInboundReceiptLineReviewStatus");
    expect(schema).toMatch(/goodsPurchaseId\s+String\?/);
    expect(schema).toMatch(/stockBundleId\s+String\?\s+@unique/);
    expect(schema).toMatch(/goodsPurchaseItemId\s+String\?/);
    expect(schema).toContain("@@index([goodsPurchaseId, status, createdAt])");
    expect(schema).toContain("@@unique([receiptId, goodsPurchaseItemId])");
    expect(schema).toContain("@@index([goodsPurchaseItemId, reviewStatus])");
    expect(schema).toContain("INBOUND_RECEIPT");
  });

  it("creates additive columns, indexes, constraints, and relations without backfill", () => {
    expect(existsSync(migrationPath)).toBe(true);
    const migration = existsSync(migrationPath)
      ? readFileSync(migrationPath, "utf8")
      : "";

    expect(migration).toContain('CREATE TYPE "GoodsPurchaseFulfillmentStatus"');
    expect(migration).toContain('CREATE TYPE "InventoryInboundReceiptMatchStatus"');
    expect(migration).toContain(
      'CREATE TYPE "InventoryInboundReceiptLineReviewStatus"',
    );
    expect(migration).toContain(
      'ALTER TYPE "BatchOperationType" ADD VALUE IF NOT EXISTS \'INBOUND_RECEIPT\'',
    );
    expect(migration).toContain('ADD COLUMN "goodsPurchaseId" TEXT');
    expect(migration).toContain('ADD COLUMN "stockBundleId" TEXT');
    expect(migration).toContain('ADD COLUMN "goodsPurchaseItemId" TEXT');
    expect(migration).toContain(
      '"pos_inventory_inbound_receipts_stockBundleId_key"',
    );
    expect(migration).toContain(
      '"pos_inventory_inbound_receipt_lines_receiptId_goodsPurchaseItemId_key"',
    );
    expect(migration).toContain(
      '"pos_inventory_inbound_receipts_goodsPurchaseId_fkey"',
    );
    expect(migration).toContain(
      '"pos_inventory_inbound_receipts_stockBundleId_fkey"',
    );
    expect(migration).toContain(
      '"pos_inventory_inbound_receipt_lines_goodsPurchaseItemId_fkey"',
    );
    expect(migration).not.toMatch(/^\s*UPDATE\s+/im);
  });
});
