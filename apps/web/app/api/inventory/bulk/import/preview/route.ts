import { NextResponse } from "next/server";
import { z } from "zod";

import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";
import {
  BULK_STOCK_IMPORT_COLUMNS,
  buildMissingBulkStockColumns,
  parseBulkStockImportFile,
  type BulkStockColumnMapping,
} from "@/features/bulk-stock-import/helpers/import-core";
import { bulkStockImportRepository } from "@/features/bulk-stock-import/repositories/BulkStockImportRepository";
import { previewBulkStockImport } from "@/features/bulk-stock-import/services/bulk-stock-import-service";

const logger = getLogger("api:inventory:bulk-import:preview");

export const dynamic = "force-dynamic";

const columnMappingSchema = z.record(
  z.string(),
  z.union([z.enum(BULK_STOCK_IMPORT_COLUMNS), z.literal("")]),
);

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const user = await requirePermission("inventory", "update");
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ message: "File is required" }, { status: 422 });
    }

    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith(".csv") && !fileName.endsWith(".xlsx")) {
      return NextResponse.json(
        { message: "Only .csv and .xlsx files are supported" },
        { status: 415 },
      );
    }

    const mappingRaw = formData.get("columnMapping");
    const columnMapping = mappingRaw
      ? (columnMappingSchema.parse(JSON.parse(String(mappingRaw))) as BulkStockColumnMapping)
      : undefined;

    const parsed = parseBulkStockImportFile(await file.arrayBuffer(), columnMapping);
    const missingColumns = buildMissingBulkStockColumns(parsed.headers);
    if (missingColumns.length > 0) {
      return NextResponse.json(
        {
          code: "MISSING_REQUIRED_COLUMNS",
          message: "Import file is missing required columns.",
          missingColumns,
          requiredColumns: BULK_STOCK_IMPORT_COLUMNS,
        },
        { status: 422 },
      );
    }
    if (parsed.records.length > 3000) {
      return NextResponse.json(
        { message: "Import files are limited to 3000 rows." },
        { status: 422 },
      );
    }

    const storeId = user.storeId || "store-main";
    const preview = await previewBulkStockImport(bulkStockImportRepository, {
      storeId,
      records: parsed.records,
    });

    logger.info("inventory.bulk_import.preview.completed", {
      userId: user.id,
      storeId,
      rowCount: parsed.records.length,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json({
      ...preview,
      missingColumns,
      requiredColumns: BULK_STOCK_IMPORT_COLUMNS,
    });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: "Validation error", errors: error.flatten().fieldErrors },
        { status: 422 },
      );
    }

    logger.error("inventory.bulk_import.preview.failed", {
      error,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json(
      { message: "Failed to preview bulk stock import" },
      { status: 500 },
    );
  }
}
