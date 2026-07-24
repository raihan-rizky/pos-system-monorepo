import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const webRoot = process.cwd();

type WriterSpec = {
  name: string;
  relativePath: string;
  startMarker: string;
  endMarker?: string;
  requiredMarkers: ReadonlyArray<string>;
};

const writerInventory: ReadonlyArray<WriterSpec> = [
  {
    name: "daily stock matching POST",
    relativePath:
      "app/api/inventory-management/daily-stock-matching/[batchId]/approve/route.ts",
    startMarker: "export async function POST(",
    requiredMarkers: [
      "lockStockMutationRows(",
      "const productsAfterLock = await tx.product.findMany(",
    ],
  },
  {
    name: "stock-group bulk approval POST",
    relativePath:
      "app/api/inventory-management/stock-group-bulk/[batchId]/approve/route.ts",
    startMarker: "export async function POST(",
    requiredMarkers: [
      "lockStockMutationRows(",
      "const groups = await tx.productStockGroup.findMany(",
    ],
  },
  {
    name: "single product PUT",
    relativePath: "app/api/products/[id]/route.ts",
    startMarker: "export async function PUT(",
    endMarker: "export async function DELETE(",
    requiredMarkers: [
      "lockStockMutationRows(",
      "const currentProduct = await tx.product.findFirst(",
    ],
  },
  {
    name: "single product DELETE",
    relativePath: "app/api/products/[id]/route.ts",
    startMarker: "export async function DELETE(",
    requiredMarkers: [
      "lockStockMutationRows(",
      "const currentProduct = await tx.product.findFirst(",
    ],
  },
  {
    name: "product creation POST",
    relativePath: "app/api/products/route.ts",
    startMarker: "export async function POST(",
    endMarker: "export async function DELETE(",
    requiredMarkers: [
      "lockStockMutationRows(",
      "group = await tx.productStockGroup.findUnique(",
    ],
  },
  {
    name: "bulk product DELETE",
    relativePath: "app/api/products/route.ts",
    startMarker: "export async function DELETE(",
    requiredMarkers: [
      "lockStockMutationRows(",
      "const currentProducts = await tx.product.findMany(",
    ],
  },
  {
    name: "stock-group conversion PATCH",
    relativePath:
      "app/api/product-stock-groups/[id]/conversion/route.ts",
    startMarker: "export async function PATCH(",
    requiredMarkers: [
      "lockStockMutationRows(",
      "const group = await tx.productStockGroup.findFirst(",
    ],
  },
  {
    name: "stock-group product assignment POST",
    relativePath:
      "app/api/product-stock-groups/[id]/products/route.ts",
    startMarker: "export async function POST(",
    requiredMarkers: [
      "lockStockMutationRows(",
      "const group = await tx.productStockGroup.findFirst(",
      "const products = await tx.product.findMany(",
    ],
  },
  {
    name: "stock-group PATCH",
    relativePath: "app/api/product-stock-groups/[id]/route.ts",
    startMarker: "export async function PATCH(",
    requiredMarkers: [
      "lockStockMutationRows(",
      "const group = await tx.productStockGroup.findFirst(",
    ],
  },
  {
    name: "stock-group variant POST",
    relativePath:
      "app/api/product-stock-groups/[id]/variants/route.ts",
    startMarker: "export async function POST(",
    requiredMarkers: [
      "lockStockMutationRows(",
      "const group = await tx.productStockGroup.findFirst(",
    ],
  },
  {
    name: "stock-group creation POST",
    relativePath: "app/api/product-stock-groups/route.ts",
    startMarker: "export async function POST(",
    requiredMarkers: [
      "lockStockMutationRows(",
      "const products = await tx.product.findMany(",
    ],
  },
  {
    name: "bulk stock import commitStockImport",
    relativePath:
      "features/bulk-stock-import/repositories/BulkStockImportRepository.ts",
    startMarker: "  async commitStockImport(input) {",
    requiredMarkers: [
      "lockStockMutationRows(",
      "products = await tx.product.findMany(",
    ],
  },
  {
    name: "inbound finalizer lockStockGroup",
    relativePath:
      "features/inventory-management/repositories/InventoryInboundReceiptRepository.ts",
    startMarker: "  async lockStockGroup(",
    endMarker: "  async incrementStockGroupBase(",
    requiredMarkers: [
      "lockProductStockGroupRow(",
      "const groupHint = await tx.productStockGroup.findFirst(",
      "lockStockMutationRows(",
      "const group = await tx.productStockGroup.findFirst(",
    ],
  },
  {
    name: "product import commitProductImportChunk",
    relativePath:
      "features/product-import/services/product-import-commit-service.ts",
    startMarker: "export async function commitProductImportChunk(",
    endMarker: "export async function finishProductImportCommit(",
    requiredMarkers: [
      "lockStockMutationRows(",
      "plan = await loadChunkExecutionPlan(",
    ],
  },
  {
    name: "shared stock lockAndReloadProductStockState",
    relativePath: "features/product-stock-groups/stock-mutations.ts",
    startMarker: "async function lockAndReloadProductStockState(",
    endMarker: "async function applyLockedProductStockDelta(",
    requiredMarkers: [
      "lockStockMutationRows(",
      "const current = await loadProductStockState(",
    ],
  },
  {
    name: "batch undo POST",
    relativePath: "app/api/batch-operations/[id]/undo/route.ts",
    startMarker: "export async function POST(",
    requiredMarkers: [
      "lockStockMutationRows(",
      "const productsAfterLock = await tx.product.findMany(",
    ],
  },
];

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

function isSharedStockWriter(source: string) {
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
  const deletesProductMembership =
    /(?:db|tx)\.product\.(?:delete|deleteMany)\s*\(/.test(source);
  const changesProductActiveMembership =
    /(?:db|tx)\.product\.(?:update|updateMany)\s*\(\s*\{[\s\S]{0,1800}?data\s*:\s*\{[\s\S]{0,1000}?isActive\s*:/.test(
      source,
    );

  return (
    writesGroupBase ||
    writesMembershipOrMultiplier ||
    deletesProductMembership ||
    changesProductActiveMembership
  );
}

function getWriterBody(source: string, spec: WriterSpec): string {
  const start = source.indexOf(spec.startMarker);
  expect(start, `Missing slice start for ${spec.name}`).toBeGreaterThanOrEqual(0);

  if (!spec.endMarker) return source.slice(start);
  const end = source.indexOf(spec.endMarker, start + spec.startMarker.length);
  expect(end, `Missing slice end for ${spec.name}`).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("shared-stock writer source audit", () => {
  it("keeps every discovered stock or active-membership writer classified", () => {
    const discovered = [
      ...productionTypeScriptFiles(path.join(webRoot, "app")),
      ...productionTypeScriptFiles(path.join(webRoot, "features")),
    ]
      .filter((absolutePath) =>
        isSharedStockWriter(readFileSync(absolutePath, "utf8")),
      )
      .map((absolutePath) =>
        path.relative(webRoot, absolutePath).replaceAll("\\", "/"),
      )
      .sort();
    const classifiedPaths = Array.from(
      new Set(writerInventory.map((writer) => writer.relativePath)),
    ).sort();

    expect(writerInventory).toHaveLength(16);
    expect(new Set(writerInventory.map((writer) => writer.name)).size).toBe(16);
    expect(discovered).toEqual(classifiedPaths);
  });

  it.each(writerInventory)(
    "$name uses lock then post-lock reload in its own slice",
    (spec) => {
      const source = readFileSync(
        path.join(webRoot, spec.relativePath),
        "utf8",
      );
      const body = getWriterBody(source, spec);
      let cursor = 0;

      for (const marker of spec.requiredMarkers) {
        const markerIndex = body.indexOf(marker, cursor);
        expect(
          markerIndex,
          `Missing ordered marker ${marker} in ${spec.name}`,
        ).toBeGreaterThanOrEqual(0);
        cursor = markerIndex + marker.length;
      }
    },
  );
});
