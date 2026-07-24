import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const webRoot = process.cwd();

const writerInventory = new Map<string, ReadonlyArray<string>>([
  [
    "app/api/inventory-management/daily-stock-matching/[batchId]/approve/route.ts",
    ["lockStockMutationRows("],
  ],
  [
    "app/api/inventory-management/stock-group-bulk/[batchId]/approve/route.ts",
    ["lockStockMutationRows("],
  ],
  [
    "app/api/products/[id]/route.ts",
    ["lockStockMutationRows("],
  ],
  [
    "app/api/products/route.ts",
    ["lockStockMutationRows("],
  ],
  [
    "app/api/product-stock-groups/[id]/conversion/route.ts",
    ["lockStockMutationRows("],
  ],
  [
    "app/api/product-stock-groups/[id]/products/route.ts",
    ["lockStockMutationRows("],
  ],
  [
    "app/api/product-stock-groups/[id]/route.ts",
    ["lockStockMutationRows("],
  ],
  [
    "app/api/product-stock-groups/[id]/variants/route.ts",
    ["lockStockMutationRows("],
  ],
  [
    "app/api/product-stock-groups/route.ts",
    ["lockStockMutationRows("],
  ],
  [
    "features/bulk-stock-import/repositories/BulkStockImportRepository.ts",
    ["lockStockMutationRows("],
  ],
  [
    "features/inventory-management/repositories/InventoryInboundReceiptRepository.ts",
    ["lockProductStockGroupRow(", "lockProductRow("],
  ],
  [
    "features/product-import/services/product-import-commit-service.ts",
    ["lockStockMutationRows("],
  ],
  [
    "features/product-stock-groups/stock-mutations.ts",
    ["lockStockMutationRows("],
  ],
]);

function productionTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__") return [];
      return productionTypeScriptFiles(absolute);
    }
    return entry.isFile() && entry.name.endsWith(".ts") ? [absolute] : [];
  });
}

function isExistingStockWriter(source: string) {
  const writesGroupBase =
    /productStockGroup\.(?:update|updateMany)\s*\(\s*\{[\s\S]{0,1600}?data\s*:\s*\{[\s\S]{0,700}?baseStock/.test(
      source,
    ) ||
    /UPDATE\s+pos_product_stock_groups[\s\S]{0,1200}?"baseStock"/i.test(
      source,
    );
  const writesMembershipOrMultiplier =
    /product\.(?:update|updateMany|create)\s*\(\s*\{[\s\S]{0,1800}?data\s*:\s*\{[\s\S]{0,1000}?(?:stockGroupId|unitMultiplierToBase)/.test(
      source,
    ) ||
    /UPDATE\s+pos_products[\s\S]{0,1800}?"stockGroupId"/i.test(source);
  return writesGroupBase || writesMembershipOrMultiplier;
}

describe("shared-stock writer source audit", () => {
  it("keeps every discovered base-stock or membership writer classified", () => {
    const discovered = [
      ...productionTypeScriptFiles(path.join(webRoot, "app")),
      ...productionTypeScriptFiles(path.join(webRoot, "features")),
    ]
      .filter((absolutePath) =>
        isExistingStockWriter(readFileSync(absolutePath, "utf8")),
      )
      .map((absolutePath) =>
        path.relative(webRoot, absolutePath).replaceAll("\\", "/"),
      )
      .sort();

    expect(discovered).toEqual([...writerInventory.keys()].sort());
  });

  it.each([...writerInventory])(
    "%s uses its classified common lock protocol",
    (relativePath, requiredMarkers) => {
      const source = readFileSync(path.join(webRoot, relativePath), "utf8");
      for (const marker of requiredMarkers) {
        expect(
          source.includes(marker),
          `Missing ${marker} in ${relativePath}`,
        ).toBe(true);
      }
    },
  );
});
