import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";
import { REQUIRED_IMPORT_COLUMNS } from "@/features/product-import/types";
import type { ColumnMapping } from "@/features/product-import/types";
import {
  buildMissingColumnResponse,
  normalizeImportRows,
} from "@/features/product-import/helpers/import-core";
import { parseImportFile } from "@/features/product-import/helpers/import-file.server";
import { resolveProductImportAutoDecisions } from "@/features/product-import/helpers/auto-decisions";
import { applySameUnitPriceConflicts } from "@/features/product-import/helpers/same-unit-price-conflicts";
import {
  analyzeProductImportPriceColumns,
  PRODUCT_IMPORT_PRICE_COLUMNS_SUSPECTED_SWAPPED,
  PRODUCT_IMPORT_PRICE_COLUMNS_SUSPECTED_SWAPPED_MESSAGE,
} from "@/features/product-import/helpers/price-column-sanity";
import {
  IMPORT_FILE_TOO_LARGE_MESSAGE,
  isImportFileTooLarge,
} from "@/lib/import-file-size";
import { enforceRateLimit } from "@/lib/rate-limit";

import { getLogger } from "@/lib/logger";

const log = getLogger("api:products:import:preview");
export const dynamic = "force-dynamic";

function countResolvedActions(rows: Array<{ autoAction?: string; generatedSku?: string }>) {
  return rows.reduce(
    (counts, row) => {
      const key = row.autoAction ?? "unknown";
      counts.byAction[key] = (counts.byAction[key] ?? 0) + 1;
      if (row.generatedSku) counts.generatedSkuCount += 1;
      return counts;
    },
    { byAction: {} as Record<string, number>, generatedSkuCount: 0 },
  );
}

async function addSupplierCodeWarnings(
  rows: Array<{ rowNumber: number; supplierCodes?: string[]; warnings: string[] }>,
  warnings: string[],
) {
  const supplierCodes = Array.from(
    new Set(rows.flatMap((row) => row.supplierCodes ?? [])),
  );
  if (supplierCodes.length === 0) return;

  const suppliers = await db.supplier.findMany({
    where: { code: { in: supplierCodes } },
    select: { id: true, code: true, name: true },
  });
  const foundCodes = new Set(
    suppliers.map((supplier) => supplier.code).filter((code): code is string => Boolean(code)),
  );

  for (const row of rows) {
    for (const code of row.supplierCodes ?? []) {
      if (foundCodes.has(code)) continue;
      const warning = `Kode supplier ${code} tidak ditemukan dan akan diabaikan.`;
      if (!row.warnings.includes(warning)) {
        row.warnings.push(warning);
        warnings.push(`Row ${row.rowNumber}: ${warning}`);
      }
    }
  }
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const rateLimited = enforceRateLimit(request, {
    namespace: "api:products:import:preview",
    limit: 20,
    windowMs: 60_000,
  });
  if (rateLimited) return rateLimited;

  try {
    const user = await requirePermission("product", "create");
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      log.warn("product.import.preview.file_missing", {
        userId: user.id,
        storeId: user.storeId || "store-main",
      });
      return NextResponse.json({ message: "File is required" }, { status: 422 });
    }

    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith(".csv") && !fileName.endsWith(".xlsx")) {
      log.warn("product.import.preview.unsupported_file_type", {
        userId: user.id,
        storeId: user.storeId || "store-main",
        fileName: file.name,
        fileSizeBytes: file.size,
      });
      return NextResponse.json({ message: "Only .csv and .xlsx files are supported" }, { status: 415 });
    }

    if (isImportFileTooLarge(file)) {
      log.warn("product.import.preview.file_too_large", {
        userId: user.id,
        storeId: user.storeId || "store-main",
        fileName: file.name,
        fileSizeBytes: file.size,
      });
      return NextResponse.json(
        { message: IMPORT_FILE_TOO_LARGE_MESSAGE },
        { status: 413 },
      );
    }

    // Optional column mapping from the client
    const mappingRaw = formData.get("columnMapping");
    const columnMapping: ColumnMapping | undefined = mappingRaw
      ? JSON.parse(String(mappingRaw))
      : undefined;

    const storeId = user.storeId || "store-main";

    log.info("product.import.preview.started", {
      userId: user.id,
      storeId,
      fileName: file.name,
      fileSizeBytes: file.size,
      hasColumnMapping: Boolean(columnMapping),
      mappedColumnCount: columnMapping ? Object.values(columnMapping).filter(Boolean).length : 0,
    });

    const { headers, records } = await parseImportFile(await file.arrayBuffer(), columnMapping);
    const { missingColumns, unknownColumns, suggestions } = buildMissingColumnResponse(headers);

    log.info("product.import.preview.file_parsed", {
      userId: user.id,
      storeId,
      fileName: file.name,
      headerCount: headers.length,
      recordCount: records.length,
      missingColumnCount: missingColumns.length,
      unknownColumnCount: unknownColumns.length,
      durationMs: Date.now() - startedAt,
    });

    if (missingColumns.length > 0) {
      log.warn("product.import.preview.missing_required_columns", {
        userId: user.id,
        storeId,
        fileName: file.name,
        headerCount: headers.length,
        recordCount: records.length,
        missingColumns,
        unknownColumns,
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json(
        {
          code: "MISSING_REQUIRED_COLUMNS",
          message: "Import file is missing required columns.",
          missingColumns,
          requiredColumns: REQUIRED_IMPORT_COLUMNS,
          unknownColumns,
          suggestions,
        },
        { status: 422 },
      );
    }

    const skus = records.map((row) => String(row.sku ?? "").trim()).filter(Boolean);
    const [products, categories] = await Promise.all([
      db.product.findMany({
        where: { storeId },
        select: {
          id: true,
          sku: true,
          name: true,
          unit: true,
          price: true,
          costPrice: true,
          hargaDinas: true,
          hargaAgen: true,
          unitMultiplierToBase: true,
          stockGroupId: true,
          category: { select: { name: true } },
          stockGroup: { select: { baseUnit: true } },
        },
      }),
      db.category.findMany({ select: { name: true } }),
    ]);

    log.info("product.import.preview.reference_data_loaded", {
      userId: user.id,
      storeId,
      fileName: file.name,
      productCandidateCount: products.length,
      categoryCount: categories.length,
      uniqueSkuCount: skus.length,
      durationMs: Date.now() - startedAt,
    });

    const normalized = normalizeImportRows(
      records,
      new Map(products.map((product) => [product.sku, { id: product.id, name: product.name }])),
      new Set(categories.map((category) => category.name.toLowerCase())),
    );
    const priceColumnAnalysis = analyzeProductImportPriceColumns(normalized.rows);
    if (priceColumnAnalysis.suspectedSwapped) {
      log.warn("product.import.preview.price_columns_suspected_swapped", {
        userId: user.id,
        storeId,
        fileName: file.name,
        ...priceColumnAnalysis,
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json(
        {
          code: PRODUCT_IMPORT_PRICE_COLUMNS_SUSPECTED_SWAPPED,
          message: PRODUCT_IMPORT_PRICE_COLUMNS_SUSPECTED_SWAPPED_MESSAGE,
          comparableRowCount: priceColumnAnalysis.comparableRowCount,
          priceBelowCostRowCount: priceColumnAnalysis.priceBelowCostRowCount,
        },
        { status: 422 },
      );
    }
    await addSupplierCodeWarnings(normalized.rows, normalized.warnings);
    const rows = applySameUnitPriceConflicts(resolveProductImportAutoDecisions({
      rows: normalized.rows,
      existingProducts: products.map((product) => ({
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
      existingSkus: new Set(products.map((product) => product.sku)),
    }));
    const resolvedActionCounts = countResolvedActions(rows);

    log.info("product.import.preview.rows_resolved", {
      userId: user.id,
      storeId,
      fileName: file.name,
      rowCount: rows.length,
      warningCount: normalized.warnings.length,
      errorCount: normalized.errors.length,
      existingMatchCount: normalized.existingSkuMatches.length,
      missingCategoryCount: normalized.missingCategories.length,
      ...resolvedActionCounts,
      durationMs: Date.now() - startedAt,
    });

    log.info("product.import.preview.completed", {
      userId: user.id,
      storeId,
      fileName: file.name,
      headerCount: headers.length,
      recordCount: records.length,
      uniqueSkuCount: skus.length,
      rowCount: normalized.rows.length,
      warningCount: normalized.warnings.length,
      errorCount: normalized.errors.length,
      existingMatchCount: normalized.existingSkuMatches.length,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json({
      ...normalized,
      rows,
      missingColumns,
      unknownColumns,
      requiredColumns: REQUIRED_IMPORT_COLUMNS,
      suggestions,
    });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    log.error("product.import.preview.failed", {
      error,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json({ message: "Failed to preview product import" }, { status: 500 });
  }
}
