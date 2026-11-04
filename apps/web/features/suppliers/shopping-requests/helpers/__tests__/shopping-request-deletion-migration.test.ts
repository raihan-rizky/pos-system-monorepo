import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

it("menyimpan audit penghapusan unik dan status pembelian dibatalkan", () => {
  const schema = readFileSync(join(process.cwd(), "../../packages/db/prisma/schema.prisma"), "utf8");
  expect(/model ShoppingRequestDeletion\s*\{/.test(schema)).toBe(true);
  expect(/shoppingRequestId\s+String\s+@unique/.test(schema)).toBe(true);
  expect(/enum GoodsPurchaseStatus\s*\{[^}]*CANCELLED/s.test(schema)).toBe(true);
  const migration = readFileSync(join(process.cwd(), "../../packages/db/prisma/migrations/20261103180000_shopping_request_deletion/migration.sql"), "utf8");
  expect(migration).toContain('CREATE UNIQUE INDEX "pos_shopping_request_deletions_shoppingRequestId_key"');
  expect(migration).toContain('ALTER TYPE "GoodsPurchaseStatus" ADD VALUE');
});
