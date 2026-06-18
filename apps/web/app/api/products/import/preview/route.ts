import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";
import { REQUIRED_IMPORT_COLUMNS } from "@/features/product-import/types";
import type { ColumnMapping } from "@/features/product-import/types";
import {
  buildMissingColumnResponse,
  normalizeImportRows,
  parseImportFile,
} from "@/features/product-import/helpers/import-core";
import { resolveProductImportAutoDecisions } from "@/features/product-import/helpers/auto-decisions";

import { getLogger } from "@/lib/logger";

const log = getLogger("api:products:import:preview");
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const startedAt = Date.now();
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

    const { headers, records } = parseImportFile(await file.arrayBuffer(), columnMapping);
    const { missingColumns, unknownColumns, suggestions } = buildMissingColumnResponse(headers);

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
          stockGroupId: true,
          category: { select: { name: true } },
          stockGroup: { select: { baseUnit: true } },
        },
      }),
      db.category.findMany({ select: { name: true } }),
    ]);

    const normalized = normalizeImportRows(
      records,
      new Map(products.map((product) => [product.sku, { id: product.id, name: product.name }])),
      new Set(categories.map((category) => category.name.toLowerCase())),
    );
    const rows = resolveProductImportAutoDecisions({
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
        stockGroupId: product.stockGroupId,
        stockGroupBaseUnit: product.stockGroup?.baseUnit ?? null,
      })),
      existingSkus: new Set(products.map((product) => product.sku)),
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
