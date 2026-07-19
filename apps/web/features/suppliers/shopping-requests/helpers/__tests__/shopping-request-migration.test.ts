import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("shopping request stock approval migration", () => {
  it("renames DRAFT to REQUESTED and stores stock mode plus application guard", () => {
    const sql = readFileSync(
      join(
        process.cwd(),
        "../../packages/db/prisma/migrations/20260718_shopping_request_stock_approval/migration.sql",
      ),
      "utf8",
    );

    expect(sql).toContain("RENAME VALUE 'DRAFT' TO 'REQUESTED'");
    expect(sql).toContain('ADD COLUMN "stockAppliedAt"');
    expect(sql).toContain('ADD COLUMN "stockMode"');
  });

  it("defines an explicit per-item decision lifecycle in the Prisma schema", () => {
    const schema = readFileSync(
      join(process.cwd(), "../../packages/db/prisma/schema.prisma"),
      "utf8",
    );

    expect(schema).toContain("enum ShoppingRequestItemDecisionStatus");
    expect(schema).toContain("decisionStatus");
    expect(schema).toContain("decidedById");
    expect(schema).toContain("decidedByName");
    expect(schema).toContain("decidedAt");
    expect(schema).toContain("@@index([shoppingRequestId, decisionStatus])");
  });

  it("migrates shopping request expenses with tenant ownership and audit constraints", () => {
    const migrationsRoot = join(
      process.cwd(),
      "../../packages/db/prisma/migrations",
    );
    const sql = readdirSync(migrationsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) =>
        readFileSync(join(migrationsRoot, entry.name, "migration.sql"), "utf8"),
      )
      .join("\n");

    expect(sql).toContain('ADD COLUMN "storeId" TEXT');
    expect(sql).toContain('ADD COLUMN "shoppingRequestId" TEXT');
    expect(sql).toContain('ADD COLUMN "costPriceSnapshot" DECIMAL(12,2)');
    expect(sql).toContain("Expense store ownership cannot be determined");
    expect(sql).toContain("ON DELETE RESTRICT");
  });
});
