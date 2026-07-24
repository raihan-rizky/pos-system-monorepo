import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const schema = readFileSync(
  join(process.cwd(), "../../packages/db/prisma/schema.prisma"),
  "utf8",
);
const migrationPath = join(
  process.cwd(),
  "../../packages/db/prisma/migrations/20260724_add_goods_purchases/migration.sql",
);

describe("goods purchase persistence", () => {
  it("defines header, item review lifecycle, and expense relation", () => {
    expect(schema).toContain("model GoodsPurchase {");
    expect(schema).toContain("model GoodsPurchaseItem {");
    expect(schema).toContain("enum GoodsPurchaseStatus");
    expect(schema).toContain("enum GoodsPurchaseItemReviewStatus");
    expect(schema).toContain("activeShoppingRequestKey String?");
    expect(schema).toMatch(/goodsPurchaseId\s+String\?/);
    expect(schema).toContain("@@unique([storeId, number])");
    expect(schema).toContain("@@unique([goodsPurchaseId, productId])");
  });

  it("creates database-enforced unique claims", () => {
    const migration = readFileSync(migrationPath, "utf8");
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "pos_goods_purchases_activeShoppingRequestKey_key"',
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "pos_goods_purchases_storeId_number_key"',
    );
    expect(migration).not.toContain(
      'CREATE UNIQUE INDEX "pos_goods_purchases_number_key"',
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "pos_goods_purchase_items_goodsPurchaseId_productId_key"',
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "pos_expenses_goodsPurchaseId_key"',
    );
  });
});
