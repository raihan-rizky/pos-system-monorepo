import { randomUUID } from "crypto";
import { db, Prisma } from "@pos/db";
import { z } from "zod";

import { productSnapshot } from "@/features/batch-operations/helpers/snapshots";
import {
  buildStockGroupCreateData,
  createProductStockGroupEnsurer,
  ensureProductStockGroups,
  stockGroupEnsureCacheKey,
  shouldMarkConversionForReview,
  type EnsureStockGroupInput,
} from "@/features/product-stock-groups/product-stock-groups-service";
import { resolveProductDisplayStock } from "@/features/product-stock-groups/stock-display";
import { buildProductPriceLogEntries } from "@/lib/product-price-logs/price-log-entries";
import { getLogger } from "@/lib/logger";

import {
  MAX_PRODUCT_IMPORT_ROWS,
  importRowCommitSchema,
  parseSupplierCodes,
} from "../helpers/import-core";
import { resolveProductImportAutoDecisions } from "../helpers/auto-decisions";
import {
  getCommitActionForResolvedRow,
  type ProductImportCommitAction,
} from "../helpers/commit-actions";
import { resolveImportCreateStockPlan } from "../helpers/commit-stock";
import { getEffectiveImportDecision } from "../helpers/import-decisions";
import { findDuplicateFinalSkuGroups } from "../helpers/import-readiness";
import { expandProductNameAbbreviations } from "../helpers/name-normalization";
import {
  findSameUnitPriceConflictGroups,
  validateSameUnitPriceConflictDecisions,
} from "../helpers/same-unit-price-conflicts";
import type { NormalizedImportRow } from "../types";

const logger = getLogger("features:product-import:commit");

export const PRODUCT_IMPORT_CHUNK_SIZE = 500;

export const productImportCommitSchema = z.object({
  rows: z.array(importRowCommitSchema).max(MAX_PRODUCT_IMPORT_ROWS),
  decisions: z
    .record(z.string(), z.enum(["create", "update", "skip", "create-variant"]))
    .default({}),
  createMissingCategories: z.boolean().default(false),
});

export const productImportStartSchema = productImportCommitSchema.extend({
  chunkSize: z.number().int().min(1).max(250).optional(),
});

export const productImportChunkSchema = z.object({
  batchOperationId: z.string().min(1),
  cursor: z.number().int().min(0),
  chunkSize: z.number().int().min(1).max(250).default(PRODUCT_IMPORT_CHUNK_SIZE),
});

export const productImportFinishSchema = z.object({
  batchOperationId: z.string().min(1),
});

type Tx = Prisma.TransactionClient;
type CommitInput = z.infer<typeof productImportCommitSchema>;
type StartInput = z.infer<typeof productImportStartSchema>;
type ChunkInput = z.infer<typeof productImportChunkSchema>;
type FinishInput = z.infer<typeof productImportFinishSchema>;
type PlannedExecutionRow = NormalizedImportRow & {
  plannedCommitAction?: ProductImportCommitAction;
};
type EnsuredImportStockGroups = Awaited<ReturnType<typeof ensureProductStockGroups>>;
type ImportSupplierReference = {
  id: string;
  code: string | null;
  name: string;
};

export interface ProductImportActor {
  id: string;
  name?: string | null;
  storeId?: string | null;
}

export interface CommitCounts {
  createdProductCount: number;
  variantProductCount: number;
  updatedProductCount: number;
  skippedRowCount: number;
  conversionReviewCount: number;
  createdCategoryCount: number;
  inventoryLogCount: number;
  priceLogCount: number;
}

const EMPTY_COUNTS: CommitCounts = {
  createdProductCount: 0,
  variantProductCount: 0,
  updatedProductCount: 0,
  skippedRowCount: 0,
  conversionReviewCount: 0,
  createdCategoryCount: 0,
  inventoryLogCount: 0,
  priceLogCount: 0,
};

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function supplierCodesFromRows(rows: Array<Pick<NormalizedImportRow, "supplierCodes">>) {
  return uniqueStrings(rows.flatMap((row) => row.supplierCodes ?? []));
}

async function loadSupplierByCode(
  tx: Tx,
  rows: Array<Pick<NormalizedImportRow, "supplierCodes">>,
) {
  const codes = supplierCodesFromRows(rows);
  if (codes.length === 0) return new Map<string, ImportSupplierReference>();

  const suppliers = await tx.supplier.findMany({
    where: { code: { in: codes } },
    select: { id: true, code: true, name: true },
  });
  return new Map(
    suppliers
      .filter((supplier) => supplier.code)
      .map((supplier) => [supplier.code as string, supplier]),
  );
}

function queueProductSupplierSync(input: {
  row: NormalizedImportRow;
  productId: string;
  supplierByCode: Map<string, ImportSupplierReference>;
  deleteProductIds: Set<string>;
  createRows: Array<{ productId: string; supplierId: string }>;
}) {
  if (!input.row.supplierCodesProvided) return;
  input.deleteProductIds.add(input.productId);
  for (const code of input.row.supplierCodes ?? []) {
    const supplier = input.supplierByCode.get(code);
    if (!supplier) continue;
    input.createRows.push({
      productId: input.productId,
      supplierId: supplier.id,
    });
  }
}

function storeIdFor(user: ProductImportActor) {
  return user.storeId || "store-main";
}

function addCounts(left: CommitCounts, right: CommitCounts): CommitCounts {
  return {
    createdProductCount: left.createdProductCount + right.createdProductCount,
    variantProductCount: left.variantProductCount + right.variantProductCount,
    updatedProductCount: left.updatedProductCount + right.updatedProductCount,
    skippedRowCount: left.skippedRowCount + right.skippedRowCount,
    conversionReviewCount: left.conversionReviewCount + right.conversionReviewCount,
    createdCategoryCount: left.createdCategoryCount + right.createdCategoryCount,
    inventoryLogCount: left.inventoryLogCount + right.inventoryLogCount,
    priceLogCount: left.priceLogCount + right.priceLogCount,
  };
}

function readCounts(summary: Prisma.JsonValue | null | undefined): CommitCounts {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) {
    return { ...EMPTY_COUNTS };
  }
  const source = summary as Record<string, unknown>;
  return {
    createdProductCount: Number(source.createdProductCount ?? 0),
    variantProductCount: Number(source.variantProductCount ?? 0),
    updatedProductCount: Number(source.updatedProductCount ?? 0),
    skippedRowCount: Number(source.skippedRowCount ?? 0),
    conversionReviewCount: Number(source.conversionReviewCount ?? 0),
    createdCategoryCount: Number(source.createdCategoryCount ?? 0),
    inventoryLogCount: Number(source.inventoryLogCount ?? 0),
    priceLogCount: Number(source.priceLogCount ?? 0),
  };
}

function buildSessionSummary(input: {
  rowCount: number;
  chunkSize: number;
  createMissingCategories: boolean;
  missingCategories: string[];
  counts: CommitCounts;
  committedRowCount: number;
  lastCursor: number;
}) {
  return {
    rowCount: input.rowCount,
    chunkSize: input.chunkSize,
    createMissingCategories: input.createMissingCategories,
    missingCategories: input.missingCategories,
    committedRowCount: input.committedRowCount,
    lastCursor: input.lastCursor,
    ...input.counts,
  };
}

function asCommitRows(rows: CommitInput["rows"]): NormalizedImportRow[] {
  return rows.map((row) => {
    const hargaDinasProvided =
      row.hargaDinasProvided ??
      Object.prototype.hasOwnProperty.call(row, "hargaDinas");

    return {
      ...row,
      hargaDinasProvided,
      supplierCodes:
        row.supplierCodes ??
        parseSupplierCodes((row as { supplierCode?: string | null }).supplierCode),
      supplierCodesProvided:
        row.supplierCodesProvided ??
        Boolean((row as { supplierCode?: string | null }).supplierCode?.trim()),
      duplicateInFile: false,
      missingCategory: false,
      stockProvided: row.stockProvided ?? true,
      warnings: [],
      errors: [],
    };
  });
}

async function prepareImportPlan(tx: Tx, input: CommitInput, storeId: string, options: {
  createCategories: boolean;
}) {
  const categories = await tx.category.findMany();
  const categoryByName = new Map(
    categories.map((category) => [category.name.toLowerCase(), category]),
  );
  const missingCategories = Array.from(
    new Set(
      input.rows
        .map((row) => row.category)
        .filter((name) => !categoryByName.has(name.toLowerCase())),
    ),
  );

  if (missingCategories.length > 0 && !input.createMissingCategories) {
    throw new Error(`MISSING_CATEGORIES:${missingCategories.join(", ")}`);
  }

  if (options.createCategories) {
    for (const categoryName of missingCategories) {
      const category = await tx.category.create({
        data: {
          name: categoryName,
          icon: "Package",
          color: "#64748b",
          order: categories.length + categoryByName.size + 1,
        },
      });
      categoryByName.set(category.name.toLowerCase(), category);
    }
  }

  const rowSkus = uniqueStrings(input.rows.map((row) => row.sku));
  const previewMatchedProductIds = uniqueStrings(
    input.rows.flatMap((row) => [row.existingProductId, row.matchedProductId]),
  );
  const rowCategoryIds = uniqueStrings(
    input.rows.map((row) => categoryByName.get(row.category.toLowerCase())?.id),
  );
  const rowNames = uniqueStrings(
    input.rows.flatMap((row) => [row.name, expandProductNameAbbreviations(row.name)]),
  );

  const productCandidateFilters: Prisma.ProductWhereInput[] = [];
  if (rowSkus.length > 0) productCandidateFilters.push({ sku: { in: rowSkus } });
  if (previewMatchedProductIds.length > 0) {
    productCandidateFilters.push({ id: { in: previewMatchedProductIds } });
  }
  if (rowCategoryIds.length > 0 && rowNames.length > 0) {
    productCandidateFilters.push({
      categoryId: { in: rowCategoryIds },
      name: { in: rowNames },
    });
  }

  const existingProducts = await tx.product.findMany({
    where: {
      storeId,
      OR: productCandidateFilters,
    },
    select: {
      id: true,
      name: true,
      sku: true,
      barcode: true,
      description: true,
      price: true,
      costPrice: true,
      hargaDinas: true,
      hargaAgen: true,
      stock: true,
      stockGroupId: true,
      unitMultiplierToBase: true,
      conversionNeedsReview: true,
      minStock: true,
      unit: true,
      size: true,
      material: true,
      categoryId: true,
      storeId: true,
      isActive: true,
      imageUrl: true,
      createdAt: true,
      updatedAt: true,
      category: { select: { name: true } },
      stockGroup: { select: { id: true, baseUnit: true, baseStock: true } },
    },
  });
  const existingBySku = new Map(existingProducts.map((product) => [product.sku, product]));
  const existingById = new Map(existingProducts.map((product) => [product.id, product]));

  const commitRows = asCommitRows(input.rows);
  const sameUnitPriceConflictGroups = findSameUnitPriceConflictGroups(commitRows);
  const sameUnitPriceValidation = validateSameUnitPriceConflictDecisions(
    commitRows,
    input.decisions,
  );
  if (!sameUnitPriceValidation.ok) {
    throw new Error(
      `SAME_UNIT_PRICE_CONFLICTS:${JSON.stringify(sameUnitPriceValidation.conflictGroups)}`,
    );
  }

  const resolvedCommitDecisions = { ...input.decisions };
  for (const group of sameUnitPriceConflictGroups) {
    for (const rowNumber of group.rowNumbers) {
      const row = commitRows.find((candidate) => candidate.rowNumber === rowNumber);
      if (!row || input.decisions[String(rowNumber)] !== "update") continue;
      resolvedCommitDecisions[String(rowNumber)] =
        existingBySku.has(row.sku) || row.existingProductId ? "update" : "create";
    }
  }

  const resolvedRows = resolveProductImportAutoDecisions({
    rows: commitRows,
    existingProducts: existingProducts.map((product) => ({
      id: product.id,
      name: product.name,
      sku: product.sku,
      category: product.category.name,
      unit: product.unit,
      price: Number(product.price),
      costPrice: product.costPrice == null ? null : Number(product.costPrice),
      hargaDinas: product.hargaDinas == null ? null : Number(product.hargaDinas),
      hargaAgen: product.hargaAgen == null ? null : Number(product.hargaAgen),
      unitMultiplierToBase: product.unitMultiplierToBase,
      stockGroupId: product.stockGroupId,
      stockGroupBaseUnit: product.stockGroup?.baseUnit ?? null,
    })),
    existingSkus: new Set(existingProducts.map((product) => product.sku)),
    decisions: resolvedCommitDecisions,
  });

  const duplicateSkus = findDuplicateFinalSkuGroups(
    resolvedRows,
    resolvedCommitDecisions,
  ).map((group) => group.sku);
  if (duplicateSkus.length > 0) {
    throw new Error(`DUPLICATE_SKUS:${duplicateSkus.join(",")}`);
  }

  const supplierByCode = await loadSupplierByCode(tx, resolvedRows);

  return {
    categoryByName,
    missingCategories,
    existingBySku,
    existingById,
    supplierByCode,
    resolvedRows,
    resolvedCommitDecisions,
  };
}

function plannedRowData(row: NormalizedImportRow): Prisma.InputJsonValue {
  return row as unknown as Prisma.InputJsonValue;
}

function readPlannedRowData(value: Prisma.JsonValue): NormalizedImportRow {
  return value as unknown as NormalizedImportRow;
}

async function loadChunkExecutionPlan(tx: Tx, rows: PlannedExecutionRow[], storeId: string) {
  const categories = await tx.category.findMany();
  const categoryByName = new Map(
    categories.map((category) => [category.name.toLowerCase(), category]),
  );
  const productIds = uniqueStrings(
    rows.flatMap((row) => [row.existingProductId, row.matchedProductId]),
  );
  const skus = uniqueStrings(rows.map((row) => row.sku));
  const filters: Prisma.ProductWhereInput[] = [];
  if (productIds.length > 0) filters.push({ id: { in: productIds } });
  if (skus.length > 0) filters.push({ sku: { in: skus } });

  const existingProducts = filters.length === 0
    ? []
    : await tx.product.findMany({
      where: { storeId, OR: filters },
      select: {
        id: true,
        name: true,
        sku: true,
        barcode: true,
        description: true,
        price: true,
        costPrice: true,
        hargaDinas: true,
        hargaAgen: true,
        stock: true,
        stockGroupId: true,
        unitMultiplierToBase: true,
        conversionNeedsReview: true,
        minStock: true,
        unit: true,
        size: true,
        material: true,
        categoryId: true,
        storeId: true,
        isActive: true,
        imageUrl: true,
        createdAt: true,
        updatedAt: true,
        category: { select: { name: true } },
        stockGroup: { select: { id: true, baseUnit: true, baseStock: true } },
      },
    });

  const supplierByCode = await loadSupplierByCode(tx, rows);

  return {
    categoryByName,
    missingCategories: [] as string[],
    existingBySku: new Map(existingProducts.map((product) => [product.sku, product])),
    existingById: new Map(existingProducts.map((product) => [product.id, product])),
    supplierByCode,
    resolvedRows: rows,
    resolvedCommitDecisions: {} as Record<string, "create" | "update" | "skip" | "create-variant">,
  };
}

function findExistingProductForPlannedRow(
  row: PlannedExecutionRow,
  plan: Awaited<ReturnType<typeof loadChunkExecutionPlan>>,
) {
  return (
    (row.matchedProductId ? plan.existingById.get(row.matchedProductId) : undefined) ??
    (row.existingProductId ? plan.existingById.get(row.existingProductId) : undefined) ??
    plan.existingBySku.get(row.sku)
  );
}

function isFastPriceOrSkipChunk(input: {
  rows: PlannedExecutionRow[];
  committedRowNumbers: Set<number>;
  plan: Awaited<ReturnType<typeof loadChunkExecutionPlan>>;
}) {
  const rowsToProcess = input.rows.filter(
    (row) => !input.committedRowNumbers.has(row.rowNumber),
  );

  if (rowsToProcess.length === 0) return true;

  return rowsToProcess.every((row) => {
    if (row.plannedCommitAction === "skip") return true;
    return (
      row.plannedCommitAction === "update-price" &&
      Boolean(findExistingProductForPlannedRow(row, input.plan))
    );
  });
}

interface BulkProductUpdate {
  id: string;
  name: string;
  barcode: string | null;
  description: string | null;
  price: number;
  costPrice: number | null;
  hargaDinas: number | null;
  hargaAgen: number | null;
  minStock: number;
  unit: string;
  size: string | null;
  material: string | null;
  imageUrl: string | null;
  categoryId: string;
  stockGroupId: string;
}

interface BulkProductInsert {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  description: string | null;
  price: number;
  costPrice: number | null;
  hargaDinas: number | null;
  hargaAgen: number | null;
  stock: number;
  minStock: number;
  unit: string;
  size: string | null;
  material: string | null;
  imageUrl: string | null;
  categoryId: string;
  storeId: string;
  stockGroupId: string;
  unitMultiplierToBase: number;
  conversionNeedsReview: boolean;
}

interface BulkPriceUpdate {
  id: string;
  price: number;
  costPrice: number | null;
  hargaDinas: number | null;
  hargaDinasProvided: boolean;
  hargaAgen: number | null;
  unitMultiplierToBase: number | null;
}

interface BulkStockGroupUpdate {
  id: string;
  baseStock: number;
}

async function applyBulkProductInserts(tx: Tx, inserts: BulkProductInsert[]) {
  if (inserts.length === 0) return;

  const ids = inserts.map((r) => r.id);
  const names = inserts.map((r) => r.name);
  const skus = inserts.map((r) => r.sku);
  const barcodes = inserts.map((r) => r.barcode);
  const descriptions = inserts.map((r) => r.description);
  const prices = inserts.map((r) => r.price);
  const costPrices = inserts.map((r) => r.costPrice);
  const hargaDinasArr = inserts.map((r) => r.hargaDinas);
  const hargaAgenArr = inserts.map((r) => r.hargaAgen);
  const stocks = inserts.map((r) => r.stock);
  const minStocks = inserts.map((r) => r.minStock);
  const units = inserts.map((r) => r.unit);
  const sizes = inserts.map((r) => r.size);
  const materials = inserts.map((r) => r.material);
  const imageUrls = inserts.map((r) => r.imageUrl);
  const categoryIds = inserts.map((r) => r.categoryId);
  const storeIds = inserts.map((r) => r.storeId);
  const stockGroupIds = inserts.map((r) => r.stockGroupId);
  const multipliers = inserts.map((r) => r.unitMultiplierToBase);
  const conversionFlags = inserts.map((r) => r.conversionNeedsReview);

  await tx.$queryRaw`
    INSERT INTO pos_products (
      id, name, sku, barcode, description,
      price, "costPrice", "hargaDinas", "hargaAgen",
      stock, "minStock", unit, size, material,
      "imageUrl", "categoryId", "storeId",
      "stockGroupId", "unitMultiplierToBase", "conversionNeedsReview",
      "isActive", "createdAt", "updatedAt"
    )
    SELECT
      v.id, v.name, v.sku, v.barcode, v.description,
      v.price, v."costPrice", v."hargaDinas", v."hargaAgen",
      v.stock, v."minStock", v.unit, v.size, v.material,
      v."imageUrl", v."categoryId", v."storeId",
      v."stockGroupId", v."unitMultiplierToBase", v."conversionNeedsReview",
      true, NOW(), NOW()
    FROM unnest(
      ${ids}::text[], ${names}::text[], ${skus}::text[],
      ${barcodes}::text[], ${descriptions}::text[],
      ${prices}::float8[], ${costPrices}::float8[], ${hargaDinasArr}::float8[], ${hargaAgenArr}::float8[],
      ${stocks}::float8[], ${minStocks}::int4[], ${units}::text[],
      ${sizes}::text[], ${materials}::text[],
      ${imageUrls}::text[], ${categoryIds}::text[], ${storeIds}::text[],
      ${stockGroupIds}::text[], ${multipliers}::float8[], ${conversionFlags}::boolean[]
    ) AS v(
      id, name, sku, barcode, description,
      price, "costPrice", "hargaDinas", "hargaAgen",
      stock, "minStock", unit, size, material,
      "imageUrl", "categoryId", "storeId",
      "stockGroupId", "unitMultiplierToBase", "conversionNeedsReview"
    )
  `;
}

async function applyBulkProductUpdates(tx: Tx, updates: BulkProductUpdate[], storeId: string) {
  if (updates.length === 0) return;

  const ids = updates.map((r) => r.id);
  const names = updates.map((r) => r.name);
  const barcodes = updates.map((r) => r.barcode);
  const descriptions = updates.map((r) => r.description);
  const prices = updates.map((r) => r.price);
  const costPrices = updates.map((r) => r.costPrice);
  const hargaDinasArr = updates.map((r) => r.hargaDinas);
  const hargaAgenArr = updates.map((r) => r.hargaAgen);
  const minStocks = updates.map((r) => r.minStock);
  const unitArr = updates.map((r) => r.unit);
  const sizes = updates.map((r) => r.size);
  const materials = updates.map((r) => r.material);
  const imageUrls = updates.map((r) => r.imageUrl);
  const categoryIds = updates.map((r) => r.categoryId);
  const stockGroupIds = updates.map((r) => r.stockGroupId);

  await tx.$queryRaw`
    UPDATE pos_products AS p SET
      name = v.name,
      barcode = v.barcode,
      description = v.description,
      price = v.price,
      "costPrice" = v."costPrice",
      "hargaDinas" = v."hargaDinas",
      "hargaAgen" = v."hargaAgen",
      "minStock" = v."minStock",
      unit = v.unit,
      size = v.size,
      material = v.material,
      "imageUrl" = v."imageUrl",
      "categoryId" = v."categoryId",
      "stockGroupId" = v."stockGroupId",
      "updatedAt" = NOW()
    FROM unnest(
      ${ids}::text[], ${names}::text[],
      ${barcodes}::text[], ${descriptions}::text[],
      ${prices}::float8[], ${costPrices}::float8[], ${hargaDinasArr}::float8[], ${hargaAgenArr}::float8[],
      ${minStocks}::int4[], ${unitArr}::text[],
      ${sizes}::text[], ${materials}::text[],
      ${imageUrls}::text[], ${categoryIds}::text[], ${stockGroupIds}::text[]
    ) AS v(
      id, name,
      barcode, description,
      price, "costPrice", "hargaDinas", "hargaAgen",
      "minStock", unit,
      size, material,
      "imageUrl", "categoryId", "stockGroupId"
    )
    WHERE p.id = v.id
      AND p."storeId" = ${storeId}
  `;
}

async function applyBulkPriceUpdates(tx: Tx, updates: BulkPriceUpdate[]) {
  if (updates.length === 0) return;

  const ids = updates.map((r) => r.id);
  const prices = updates.map((r) => r.price);
  const costPrices = updates.map((r) => r.costPrice);
  const hargaDinasArr = updates.map((r) => r.hargaDinas);
  const hargaDinasProvidedArr = updates.map((r) => r.hargaDinasProvided);
  const hargaAgenArr = updates.map((r) => r.hargaAgen);
  const multipliers = updates.map((r) => r.unitMultiplierToBase);

  await tx.$queryRaw`
    UPDATE pos_products AS p SET
      price = v.price,
      "costPrice" = v."costPrice",
      "hargaDinas" = CASE WHEN v."hargaDinasProvided" THEN v."hargaDinas" ELSE p."hargaDinas" END,
      "hargaAgen" = COALESCE(v."hargaAgen", p."hargaAgen"),
      "unitMultiplierToBase" = COALESCE(v."unitMultiplierToBase", p."unitMultiplierToBase"),
      "updatedAt" = NOW()
    FROM unnest(
      ${ids}::text[], ${prices}::float8[],
      ${costPrices}::float8[], ${hargaDinasArr}::float8[], ${hargaAgenArr}::float8[],
      ${multipliers}::float8[], ${hargaDinasProvidedArr}::boolean[]
    ) AS v(id, price, "costPrice", "hargaDinas", "hargaAgen", "unitMultiplierToBase", "hargaDinasProvided")
    WHERE p.id = v.id
  `;
}

async function applyBulkStockGroupUpdates(
  tx: Tx,
  updates: BulkStockGroupUpdate[],
  storeId: string,
) {
  if (updates.length === 0) return;

  const uniqueUpdates = Array.from(
    new Map(updates.map((update) => [update.id, update])).values(),
  );
  const ids = uniqueUpdates.map((r) => r.id);
  const baseStocks = uniqueUpdates.map((r) => r.baseStock);

  await tx.$queryRaw`
    UPDATE pos_product_stock_groups AS g SET
      "baseStock" = v."baseStock",
      "updatedAt" = NOW()
    FROM unnest(
      ${ids}::text[], ${baseStocks}::float8[]
    ) AS v(id, "baseStock")
    WHERE g.id = v.id
      AND g."storeId" = ${storeId}
  `;
}

async function applyProductSupplierSync(input: {
  tx: Tx;
  productIds: Set<string>;
  rows: Array<{ productId: string; supplierId: string }>;
}) {
  if (input.productIds.size > 0) {
    await input.tx.productSupplier.deleteMany({
      where: { productId: { in: Array.from(input.productIds) } },
    });
  }
  if (input.rows.length > 0) {
    await input.tx.productSupplier.createMany({
      data: input.rows,
      skipDuplicates: true,
    });
  }
}

async function processFastPriceAndSkipRows(input: {
  tx: Tx;
  batchOperationId: string;
  rows: PlannedExecutionRow[];
  skippedSourceRowNumbers: Set<number>;
  plan: Awaited<ReturnType<typeof loadChunkExecutionPlan>>;
  user: ProductImportActor;
  storeId: string;
}) {
  const startedAt = Date.now();
  const counts: CommitCounts = { ...EMPTY_COUNTS };
  const priceLogEntries: Prisma.ProductPriceLogCreateManyInput[] = [];
  const batchItems: Prisma.BatchOperationItemCreateManyInput[] = [];
  const productSupplierDeleteIds = new Set<string>();
  const productSupplierCreateRows: Array<{ productId: string; supplierId: string }> = [];
  const priceUpdates: BulkPriceUpdate[] = [];
  let updatedRowCount = 0;
  let skippedRowCount = 0;

  for (const row of input.rows) {
    if (input.skippedSourceRowNumbers.has(row.rowNumber)) continue;

    const existing = findExistingProductForPlannedRow(row, input.plan);
    if (row.plannedCommitAction === "skip") {
      counts.skippedRowCount += 1;
      skippedRowCount += 1;
      continue;
    }

    if (row.plannedCommitAction !== "update-price" || !existing) {
      throw new Error(`FAST_PATH_ROW_NOT_SUPPORTED:${row.rowNumber}`);
    }

    const beforeDisplayStock = resolveProductDisplayStock(existing);
    const beforeSnapshot = productSnapshot({ ...existing, stock: beforeDisplayStock });
    const afterProduct = {
      ...existing,
      price: row.price,
      costPrice: row.costPrice,
      ...(row.hargaDinasProvided ? { hargaDinas: row.hargaDinas ?? null } : {}),
      ...(row.hargaAgen != null ? { hargaAgen: row.hargaAgen } : {}),
      stock: beforeDisplayStock,
    };

    priceUpdates.push({
      id: existing.id,
      price: row.price,
      costPrice: row.costPrice ?? null,
      hargaDinas: row.hargaDinas ?? null,
      hargaDinasProvided: row.hargaDinasProvided ?? false,
      hargaAgen: row.hargaAgen ?? null,
      unitMultiplierToBase: row.unitMultiplierToBase ?? null,
    });
    queueProductSupplierSync({
      row,
      productId: existing.id,
      supplierByCode: input.plan.supplierByCode,
      deleteProductIds: productSupplierDeleteIds,
      createRows: productSupplierCreateRows,
    });

    counts.updatedProductCount += 1;
    updatedRowCount += 1;
    priceLogEntries.push(
      ...buildProductPriceLogEntries({
        productId: existing.id,
        storeId: input.storeId,
        before: { price: existing.price, costPrice: existing.costPrice },
        after: { price: row.price, costPrice: row.costPrice },
        actor: input.user,
        source: "IMPORT",
        note: `Batch import price update: ${existing.name}`,
      }),
    );
    batchItems.push({
      batchOperationId: input.batchOperationId,
      productId: existing.id,
      sku: row.sku,
      sourceRowNumber: row.rowNumber,
      action: "UPDATE",
      beforeSnapshot: beforeSnapshot as unknown as Prisma.InputJsonValue,
      afterSnapshot: productSnapshot(afterProduct as unknown as Parameters<typeof productSnapshot>[0]) as unknown as Prisma.InputJsonValue,
    });
  }

  await applyBulkPriceUpdates(input.tx, priceUpdates);
  await applyProductSupplierSync({
    tx: input.tx,
    productIds: productSupplierDeleteIds,
    rows: productSupplierCreateRows,
  });

  if (priceLogEntries.length > 0) {
    await input.tx.productPriceLog.createMany({ data: priceLogEntries });
    counts.priceLogCount += priceLogEntries.length;
  }

  if (batchItems.length > 0) {
    await input.tx.batchOperationItem.createMany({
      data: batchItems,
      skipDuplicates: true,
    });
  }

  logger.info("product.import.commit.chunk.fast_path_completed", {
    batchOperationId: input.batchOperationId,
    rowCount: input.rows.length,
    updatedRowCount,
    skippedRowCount,
    priceLogCount: priceLogEntries.length,
    durationMs: Date.now() - startedAt,
  });

  return counts;
}

function stockGroupInputForRow(input: {
  storeId: string;
  row: PlannedExecutionRow;
  categoryId: string;
  baseStock: number;
}) {
  return {
    storeId: input.storeId,
    name: input.row.name,
    categoryId: input.categoryId,
    material: input.row.material,
    size: input.row.size,
    displayName: input.row.name,
    baseUnit: input.row.unit,
    baseStock: input.baseStock,
  } satisfies EnsureStockGroupInput;
}

async function preEnsureImportStockGroups(input: {
  tx: Tx;
  rows: PlannedExecutionRow[];
  skippedSourceRowNumbers: Set<number>;
  plan: Awaited<ReturnType<typeof prepareImportPlan>> | Awaited<ReturnType<typeof loadChunkExecutionPlan>>;
  storeId: string;
}) {
  const groupInputs: EnsureStockGroupInput[] = [];

  for (const row of input.rows) {
    if (input.skippedSourceRowNumbers.has(row.rowNumber)) continue;

    const existing =
      (row.matchedProductId ? input.plan.existingById.get(row.matchedProductId) : undefined) ??
      (row.existingProductId ? input.plan.existingById.get(row.existingProductId) : undefined) ??
      input.plan.existingBySku.get(row.sku);
    const rawDecision = row.plannedCommitAction
      ? undefined
      : getEffectiveImportDecision(row, input.plan.resolvedCommitDecisions);
    const decision = rawDecision ?? "create";
    const commitAction = row.plannedCommitAction ?? getCommitActionForResolvedRow(row, decision);

    if (decision === "skip" || commitAction === "skip" || commitAction === "update-price") {
      continue;
    }

    const category = input.plan.categoryByName.get(row.category.toLowerCase());
    if (!category) continue;

    if (commitAction === "update" && existing) {
      const multiplier = existing.unitMultiplierToBase || 1;
      groupInputs.push(
        stockGroupInputForRow({
          storeId: input.storeId,
          row,
          categoryId: category.id,
          baseStock: row.stock * multiplier,
        }),
      );
      continue;
    }

    if (commitAction === "create" || commitAction === "create-variant") {
      const { multiplier } = buildStockGroupCreateData({
        stock: row.stock,
        unitMultiplierToBase: row.unitMultiplierToBase ?? 1,
      });
      const matched =
        row.matchedProductId && row.autoAction !== "conflict"
          ? input.plan.existingById.get(row.matchedProductId)
          : undefined;
      const variantGroup =
        commitAction === "create-variant" && matched?.stockGroup ? matched.stockGroup : null;
      if (variantGroup) continue;

      const stockPlan = resolveImportCreateStockPlan({
        commitAction,
        rowStock: row.stock,
        stockProvided: row.stockProvided,
        multiplier,
        matchedGroupBaseStock: null,
      });
      groupInputs.push(
        stockGroupInputForRow({
          storeId: input.storeId,
          row,
          categoryId: category.id,
          baseStock: stockPlan.groupBaseStock,
        }),
      );
    }
  }

  return ensureProductStockGroups(input.tx, groupInputs);
}

async function resolveImportStockGroup(input: {
  ensuredGroups: EnsuredImportStockGroups;
  fallbackEnsure: ReturnType<typeof createProductStockGroupEnsurer>;
  groupInput: EnsureStockGroupInput;
}) {
  return (
    input.ensuredGroups.get(stockGroupEnsureCacheKey(input.groupInput)) ??
    input.fallbackEnsure(input.groupInput)
  );
}

async function processResolvedRows(input: {
  tx: Tx;
  batchOperationId: string;
  rows: PlannedExecutionRow[];
  skippedSourceRowNumbers: Set<number>;
  plan: Awaited<ReturnType<typeof prepareImportPlan>> | Awaited<ReturnType<typeof loadChunkExecutionPlan>>;
  decisions: Record<string, "create" | "update" | "skip" | "create-variant">;
  user: ProductImportActor;
  storeId: string;
}) {
  const counts: CommitCounts = { ...EMPTY_COUNTS };
  const ensureImportStockGroup = createProductStockGroupEnsurer(input.tx);
  const ensuredImportStockGroups = await preEnsureImportStockGroups({
    tx: input.tx,
    rows: input.rows,
    skippedSourceRowNumbers: input.skippedSourceRowNumbers,
    plan: input.plan,
    storeId: input.storeId,
  });

  // --- Accumulators ---
  const bulkProductInserts: BulkProductInsert[] = [];
  const bulkProductUpdates: BulkProductUpdate[] = [];
  const bulkPriceUpdates: BulkPriceUpdate[] = [];
  const bulkStockGroupUpdates: BulkStockGroupUpdate[] = [];
  const inventoryLogsToCreate: Prisma.InventoryLogCreateManyInput[] = [];
  const priceLogEntries: Prisma.ProductPriceLogCreateManyInput[] = [];
  const batchItems: Prisma.BatchOperationItemCreateManyInput[] = [];
  const productSupplierDeleteIds = new Set<string>();
  const productSupplierCreateRows: Array<{ productId: string; supplierId: string }> = [];

  for (const row of input.rows) {
    if (input.skippedSourceRowNumbers.has(row.rowNumber)) continue;

    const existing =
      (row.matchedProductId ? input.plan.existingById.get(row.matchedProductId) : undefined) ??
      (row.existingProductId ? input.plan.existingById.get(row.existingProductId) : undefined) ??
      input.plan.existingBySku.get(row.sku);
    const rawDecision = row.plannedCommitAction
      ? undefined
      : getEffectiveImportDecision(row, input.plan.resolvedCommitDecisions);
    const decision = rawDecision ?? "create";
    const commitAction = row.plannedCommitAction ?? getCommitActionForResolvedRow(row, decision);

    logger.debug("product.import.commit.chunk.row_processing", {
      userId: input.user.id,
      storeId: input.storeId,
      batchOperationId: input.batchOperationId,
      rowNumber: row.rowNumber,
      sku: row.sku,
      generatedSku: row.generatedSku,
      autoAction: row.autoAction,
      decision,
      commitAction,
      matchedProductId: row.matchedProductId,
    });

    if (!row.plannedCommitAction && row.autoAction === "conflict" && !rawDecision) {
      throw new Error(`ROW_DECISION_REQUIRED:${row.rowNumber}`);
    }
    if (!row.plannedCommitAction && existing && !row.autoAction && !["update", "skip", "create-variant"].includes(decision)) {
      throw new Error(`ROW_DECISION_REQUIRED:${row.rowNumber}`);
    }

    if (decision === "skip" || commitAction === "skip") {
      counts.skippedRowCount += 1;
      continue;
    }

    const category = input.plan.categoryByName.get(row.category.toLowerCase());
    if (!category) throw new Error(`CATEGORY_NOT_FOUND:${row.category}`);

    if (commitAction === "update-price" && existing) {
      const beforeDisplayStock = resolveProductDisplayStock(existing);
      const beforeSnapshot = productSnapshot({ ...existing, stock: beforeDisplayStock });

      bulkPriceUpdates.push({
      id: existing.id,
      price: row.price,
      costPrice: row.costPrice ?? null,
      hargaDinas: row.hargaDinas ?? null,
      hargaDinasProvided: row.hargaDinasProvided ?? false,
      hargaAgen: row.hargaAgen ?? null,
      unitMultiplierToBase: row.unitMultiplierToBase ?? null,
    });
      queueProductSupplierSync({
        row,
        productId: existing.id,
        supplierByCode: input.plan.supplierByCode,
        deleteProductIds: productSupplierDeleteIds,
        createRows: productSupplierCreateRows,
      });

      counts.updatedProductCount += 1;
      priceLogEntries.push(
        ...buildProductPriceLogEntries({
          productId: existing.id,
          storeId: input.storeId,
          before: { price: existing.price, costPrice: existing.costPrice },
          after: { price: row.price, costPrice: row.costPrice },
          actor: input.user,
          source: "IMPORT",
          note: `Batch import price update: ${existing.name}`,
        }),
      );
      const afterProduct = {
        ...existing,
        price: row.price,
        costPrice: row.costPrice,
        ...(row.hargaDinasProvided ? { hargaDinas: row.hargaDinas ?? null } : {}),
        ...(row.hargaAgen != null ? { hargaAgen: row.hargaAgen } : {}),
        stock: beforeDisplayStock,
      };
      batchItems.push({
        batchOperationId: input.batchOperationId,
        productId: existing.id,
        sku: row.sku,
        sourceRowNumber: row.rowNumber,
        action: "UPDATE",
        beforeSnapshot: beforeSnapshot as unknown as Prisma.InputJsonValue,
        afterSnapshot: productSnapshot(afterProduct as unknown as Parameters<typeof productSnapshot>[0]) as unknown as Prisma.InputJsonValue,
      });
      continue;
    }

    if (commitAction === "update" && existing) {
      const beforeDisplayStock = resolveProductDisplayStock(existing);
      const beforeSnapshot = productSnapshot({ ...existing, stock: beforeDisplayStock });
      const multiplier = existing.unitMultiplierToBase || 1;
      const groupInput = stockGroupInputForRow({
        storeId: input.storeId,
        row,
        categoryId: category.id,
        baseStock: row.stock * multiplier,
      });
      const { group } = await resolveImportStockGroup({
        ensuredGroups: ensuredImportStockGroups,
        fallbackEnsure: ensureImportStockGroup,
        groupInput,
      });

      bulkStockGroupUpdates.push({
        id: group.id,
        baseStock: row.stock * multiplier,
      });

      bulkProductUpdates.push({
        id: existing.id,
        name: row.name,
        barcode: row.barcode ?? null,
        description: row.description ?? null,
        price: row.price,
        costPrice: row.costPrice ?? null,
        hargaDinas: row.hargaDinas ?? null,
        hargaAgen: row.hargaAgen ?? null,
        minStock: row.minStock ?? 5,
        unit: row.unit,
        size: row.size ?? null,
        material: row.material ?? null,
        imageUrl: row.imageUrl ?? null,
        categoryId: category.id,
        stockGroupId: group.id,
      });
      queueProductSupplierSync({
        row,
        productId: existing.id,
        supplierByCode: input.plan.supplierByCode,
        deleteProductIds: productSupplierDeleteIds,
        createRows: productSupplierCreateRows,
      });

      counts.updatedProductCount += 1;
      priceLogEntries.push(
        ...buildProductPriceLogEntries({
          productId: existing.id,
          storeId: input.storeId,
          before: { price: existing.price, costPrice: existing.costPrice },
          after: { price: row.price, costPrice: row.costPrice },
          actor: input.user,
          source: "IMPORT",
          note: `Batch import update: ${row.name}`,
        }),
      );
      const delta = row.stock - beforeDisplayStock;
      const logId = delta === 0 ? null : randomUUID();
      if (logId) {
        inventoryLogsToCreate.push({
          id: logId,
          productId: existing.id,
          type: "ADJUSTMENT",
          reason: "MANUAL_ADJUSTMENT",
          quantity: Math.abs(delta),
          unitCost: row.costPrice ?? null,
          note: `Batch import update: ${row.name}`,
          createdBy: input.user.id,
        });
        counts.inventoryLogCount += 1;
      }
      batchItems.push({
        batchOperationId: input.batchOperationId,
        productId: existing.id,
        sku: row.sku,
        sourceRowNumber: row.rowNumber,
        action: "UPDATE",
        beforeSnapshot: beforeSnapshot as unknown as Prisma.InputJsonValue,
        afterSnapshot: productSnapshot({ ...existing, name: row.name, sku: row.sku, price: row.price as any, costPrice: row.costPrice as any, hargaDinas: (row.hargaDinas ?? null) as any, hargaAgen: (row.hargaAgen ?? existing.hargaAgen) as any, minStock: row.minStock ?? 5, unit: row.unit, size: row.size ?? null, material: row.material ?? null, imageUrl: row.imageUrl ?? null, categoryId: category.id, stockGroupId: group.id, stock: row.stock } as unknown as Parameters<typeof productSnapshot>[0]) as unknown as Prisma.InputJsonValue,
        inventoryLogId: logId,
      });
      continue;
    }

    if (commitAction === "create" || commitAction === "create-variant") {
      const { multiplier } = buildStockGroupCreateData({
        stock: row.stock,
        unitMultiplierToBase: row.unitMultiplierToBase ?? 1,
      });
      const matched =
        row.matchedProductId && row.autoAction !== "conflict"
          ? input.plan.existingById.get(row.matchedProductId)
          : undefined;
      const variantGroup =
        commitAction === "create-variant" && matched?.stockGroup ? matched.stockGroup : null;
      const stockPlan = resolveImportCreateStockPlan({
        commitAction,
        rowStock: row.stock,
        stockProvided: row.stockProvided,
        multiplier,
        matchedGroupBaseStock: variantGroup?.baseStock,
      });
      const groupInput = stockGroupInputForRow({
        storeId: input.storeId,
        row,
        categoryId: category.id,
        baseStock: stockPlan.groupBaseStock,
      });
      const ensured = variantGroup
        ? { group: variantGroup, created: false }
        : await resolveImportStockGroup({
          ensuredGroups: ensuredImportStockGroups,
          fallbackEnsure: ensureImportStockGroup,
          groupInput,
        });
      const { group, created: groupCreated } = ensured;
      const productId = randomUUID();
      const conversionNeedsReview = row.conversionNeedsReview ?? shouldMarkConversionForReview({
        groupCreated,
        unitMultiplierProvided: Boolean(row.unitMultiplierToBase),
        unit: row.unit,
        baseUnit: group.baseUnit,
      });

      bulkProductInserts.push({
        id: productId,
        name: expandProductNameAbbreviations(row.name),
        sku: row.sku,
        barcode: row.barcode ?? null,
        description: row.description ?? null,
        price: row.price,
        costPrice: row.costPrice ?? null,
        hargaDinas: row.hargaDinas ?? null,
        hargaAgen: row.hargaAgen ?? null,
        stock: stockPlan.productStock,
        minStock: row.minStock ?? 5,
        unit: row.unit,
        size: row.size ?? null,
        material: row.material ?? null,
        imageUrl: row.imageUrl ?? null,
        categoryId: category.id,
        storeId: input.storeId,
        stockGroupId: group.id,
        unitMultiplierToBase: multiplier,
        conversionNeedsReview,
      });
      queueProductSupplierSync({
        row,
        productId,
        supplierByCode: input.plan.supplierByCode,
        deleteProductIds: productSupplierDeleteIds,
        createRows: productSupplierCreateRows,
      });

      counts.createdProductCount += 1;
      if (commitAction === "create-variant") counts.variantProductCount += 1;
      if (conversionNeedsReview) counts.conversionReviewCount += 1;
      priceLogEntries.push(
        ...buildProductPriceLogEntries({
          productId,
          storeId: input.storeId,
          before: null,
          after: { price: row.price, costPrice: row.costPrice },
          actor: input.user,
          source: "IMPORT",
          note: `Batch import initial price: ${row.name}`,
        }),
      );
      const logId = stockPlan.inventoryLogQuantity == null ? null : randomUUID();
      if (logId && stockPlan.inventoryLogQuantity != null) {
        inventoryLogsToCreate.push({
          id: logId,
          productId,
          type: row.stock < 0 ? "ADJUSTMENT" : "IN",
          reason: row.stock < 0 ? "MANUAL_ADJUSTMENT" : "RESTOCK",
          quantity: stockPlan.inventoryLogQuantity,
          unitCost: row.costPrice ?? null,
          note: `Batch import initial stock: ${row.name}`,
          createdBy: input.user.id,
        });
        counts.inventoryLogCount += 1;
      }
      batchItems.push({
        batchOperationId: input.batchOperationId,
        productId,
        sku: row.sku,
        sourceRowNumber: row.rowNumber,
        action: "CREATE",
        beforeSnapshot: undefined,
        afterSnapshot: productSnapshot({
          id: productId,
          name: expandProductNameAbbreviations(row.name),
          sku: row.sku,
          barcode: row.barcode ?? null,
          description: row.description ?? null,
          price: row.price as any,
          costPrice: row.costPrice as any ?? null,
          hargaDinas: row.hargaDinas as any ?? null,
          hargaAgen: row.hargaAgen as any ?? null,
          stock: stockPlan.productStock,
          minStock: row.minStock ?? 5,
          unit: row.unit,
          size: row.size ?? null,
          material: row.material ?? null,
          imageUrl: row.imageUrl ?? null,
          categoryId: category.id,
          storeId: input.storeId,
          isActive: true,
          stockGroupId: group.id,
          unitMultiplierToBase: multiplier,
          conversionNeedsReview,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as unknown as Parameters<typeof productSnapshot>[0]) as unknown as Prisma.InputJsonValue,
        inventoryLogId: logId,
      });
    }
  }

  // --- Bulk execution phase ---
  await applyBulkStockGroupUpdates(input.tx, bulkStockGroupUpdates, input.storeId);
  await applyBulkProductInserts(input.tx, bulkProductInserts);
  await applyBulkProductUpdates(input.tx, bulkProductUpdates, input.storeId);
  await applyBulkPriceUpdates(input.tx, bulkPriceUpdates);
  await applyProductSupplierSync({
    tx: input.tx,
    productIds: productSupplierDeleteIds,
    rows: productSupplierCreateRows,
  });

  if (inventoryLogsToCreate.length > 0) {
    await input.tx.inventoryLog.createMany({ data: inventoryLogsToCreate });
  }
  if (priceLogEntries.length > 0) {
    await input.tx.productPriceLog.createMany({ data: priceLogEntries });
  }
  if (batchItems.length > 0) {
    await input.tx.batchOperationItem.createMany({
      data: batchItems,
      skipDuplicates: true,
    });
  }

  return counts;
}

export async function startProductImportCommit(input: StartInput, user: ProductImportActor) {
  const storeId = storeIdFor(user);
  const chunkSize = input.chunkSize ?? PRODUCT_IMPORT_CHUNK_SIZE;

  return db.$transaction(async (tx) => {
    const plan = await prepareImportPlan(tx, input, storeId, { createCategories: true });
    const batch = await tx.batchOperation.create({
      data: {
        type: "PRODUCT_IMPORT",
        status: "PENDING",
        storeId,
        createdBy: user.id,
        summary: buildSessionSummary({
          rowCount: input.rows.length,
          chunkSize,
          createMissingCategories: input.createMissingCategories,
          missingCategories: plan.missingCategories,
          counts: EMPTY_COUNTS,
          committedRowCount: 0,
          lastCursor: 0,
        }),
      },
    });
    await tx.productImportPlannedRow.createMany({
      data: plan.resolvedRows.map((row, index) => {
        const decision = getEffectiveImportDecision(row, plan.resolvedCommitDecisions);
        const commitAction = getCommitActionForResolvedRow(row, decision);
        return {
          batchOperationId: batch.id,
          sourceRowNumber: row.rowNumber,
          cursorIndex: index,
          status: "PENDING",
          sku: row.sku,
          productId: row.matchedProductId ?? row.existingProductId ?? null,
          commitAction,
          rowData: plannedRowData(row),
        };
      }),
    });

    return {
      batchOperationId: batch.id,
      totalRows: input.rows.length,
      nextCursor: 0,
      chunkSize,
      undoAvailable: true,
    };
  }, { timeout: 30000 });
}

export async function commitProductImportChunk(input: ChunkInput, user: ProductImportActor) {
  const storeId = storeIdFor(user);
  const cursor = input.cursor;
  const endCursor = cursor + input.chunkSize;

  return db.$transaction(
    async (tx) => {
      const batch = await tx.batchOperation.findFirst({
        where: { id: input.batchOperationId, storeId, type: "PRODUCT_IMPORT" },
      });
      if (!batch) throw new Error("BATCH_NOT_FOUND");
      if (batch.status === "UNDONE") throw new Error("ALREADY_UNDONE");
      if (batch.status === "COMMITTED") {
        throw new Error("BATCH_ALREADY_COMMITTED");
      }

      const plannedRows = await tx.productImportPlannedRow.findMany({
        where: {
          batchOperationId: batch.id,
          cursorIndex: { gte: cursor, lt: endCursor },
        },
        orderBy: { cursorIndex: "asc" },
      });
      const rowSlice = plannedRows.map((planned) => ({
        ...readPlannedRowData(planned.rowData),
        plannedCommitAction: planned.commitAction as ProductImportCommitAction,
      }));
      const rowNumbers = rowSlice.map((row) => row.rowNumber);
      const committedItems = await tx.batchOperationItem.findMany({
        where: {
          batchOperationId: batch.id,
          sourceRowNumber: { in: rowNumbers },
        },
        select: { sourceRowNumber: true },
      });
      const committedRowNumbers = new Set(
        committedItems
          .map((item) => item.sourceRowNumber)
          .filter((value): value is number => value != null),
      );
      const plan = await loadChunkExecutionPlan(tx, rowSlice, storeId);
      const useFastPath = isFastPriceOrSkipChunk({
        rows: rowSlice,
        committedRowNumbers,
        plan,
      });
      const chunkCounts = useFastPath
        ? await processFastPriceAndSkipRows({
          tx,
          batchOperationId: batch.id,
          rows: rowSlice,
          skippedSourceRowNumbers: committedRowNumbers,
          plan,
          user,
          storeId,
        })
        : await processResolvedRows({
          tx,
          batchOperationId: batch.id,
          rows: rowSlice,
          skippedSourceRowNumbers: committedRowNumbers,
          plan,
          decisions: {},
          user,
          storeId,
        });
      const processedRowNumbers = rowNumbers.filter((rowNumber) => !committedRowNumbers.has(rowNumber));
      if (processedRowNumbers.length > 0) {
        await tx.productImportPlannedRow.updateMany({
          where: {
            batchOperationId: batch.id,
            sourceRowNumber: { in: processedRowNumbers },
          },
          data: { status: "COMMITTED" },
        });
      }
      const previousCounts = readCounts(batch.summary);
      const cumulativeCounts = addCounts(previousCounts, chunkCounts);
      const committedRowCount = await tx.batchOperationItem.count({
        where: { batchOperationId: batch.id, sourceRowNumber: { not: null } },
      });
      const totalRows = await tx.productImportPlannedRow.count({
        where: { batchOperationId: batch.id },
      });
      const nextCursor = Math.min(endCursor, totalRows);

      await tx.batchOperation.update({
        where: { id: batch.id },
        data: {
          summary: buildSessionSummary({
            rowCount: totalRows,
            chunkSize: input.chunkSize,
            createMissingCategories: Boolean((batch.summary as Record<string, unknown> | null)?.createMissingCategories),
            missingCategories: Array.isArray((batch.summary as Record<string, unknown> | null)?.missingCategories)
              ? ((batch.summary as Record<string, unknown>).missingCategories as string[])
              : [],
            counts: cumulativeCounts,
            committedRowCount,
            lastCursor: nextCursor,
          }),
        },
      });

      return {
        batchOperationId: batch.id,
        processedRows: rowSlice.length,
        committedRowCount,
        nextCursor,
        done: nextCursor >= totalRows,
        chunk: chunkCounts,
        cumulative: cumulativeCounts,
        undoAvailable: true,
      };
    },
    { maxWait: 15000, timeout: 120000 },
  );
}

export async function finishProductImportCommit(input: FinishInput, user: ProductImportActor) {
  const storeId = storeIdFor(user);
  return db.$transaction(async (tx) => {
    const batch = await tx.batchOperation.findFirst({
      where: { id: input.batchOperationId, storeId, type: "PRODUCT_IMPORT" },
    });
    if (!batch) throw new Error("BATCH_NOT_FOUND");
    if (batch.status === "UNDONE") throw new Error("ALREADY_UNDONE");

    const totalRows = await tx.productImportPlannedRow.count({
      where: { batchOperationId: batch.id },
    });
    const pendingRowCount = await tx.productImportPlannedRow.count({
      where: { batchOperationId: batch.id, status: { not: "COMMITTED" } },
    });
    const committedRowCount = totalRows - pendingRowCount;
    if (pendingRowCount > 0) {
      throw new Error(`IMPORT_INCOMPLETE:${committedRowCount}:${totalRows}`);
    }

    const counts = readCounts(batch.summary);
    await tx.batchOperation.update({
      where: { id: batch.id },
      data: {
        status: "COMMITTED",
        summary: buildSessionSummary({
          rowCount: totalRows,
          chunkSize: Number((batch.summary as Record<string, unknown> | null)?.chunkSize ?? PRODUCT_IMPORT_CHUNK_SIZE),
          createMissingCategories: Boolean((batch.summary as Record<string, unknown> | null)?.createMissingCategories),
          missingCategories: Array.isArray((batch.summary as Record<string, unknown> | null)?.missingCategories)
            ? ((batch.summary as Record<string, unknown>).missingCategories as string[])
            : [],
          counts,
          committedRowCount,
          lastCursor: totalRows,
        }),
      },
    });

    return {
      ...counts,
      batchOperationId: batch.id,
      undoAvailable: true,
    };
  });
}

export async function commitProductImportInChunks(input: CommitInput, user: ProductImportActor) {
  if (input.rows.length > PRODUCT_IMPORT_CHUNK_SIZE) {
    throw new Error(`CHUNKED_IMPORT_REQUIRED:${input.rows.length}:${PRODUCT_IMPORT_CHUNK_SIZE}`);
  }
  const start = await startProductImportCommit(input, user);
  await commitProductImportChunk({
    batchOperationId: start.batchOperationId,
    cursor: start.nextCursor,
    chunkSize: start.chunkSize,
  }, user);
  return finishProductImportCommit({
    batchOperationId: start.batchOperationId,
  }, user);
}
