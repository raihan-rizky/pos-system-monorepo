import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";
import { REQUIRED_IMPORT_COLUMNS } from "@/features/customer-import/types";
import type { ColumnMapping } from "@/features/customer-import/types";
import {
  buildMissingColumnResponse,
  normalizeImportRows,
  parseImportFile,
} from "@/features/customer-import/helpers/import-core";
import { apiError } from "@/lib/api/responses";
import { getLogger } from "@/lib/logger";

const log = getLogger("api:customers:import:preview");
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const user = await requirePermission("customer", "create");
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      log.warn("customer.import.preview.file_missing", {
        userId: user.id,
        storeId: user.storeId || "store-main",
      });
      return apiError("File is required", 422, {
        code: "ValidationError",
        errors: { file: ["File is required"] },
      });
    }

    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith(".csv") && !fileName.endsWith(".xlsx")) {
      log.warn("customer.import.preview.unsupported_file_type", {
        userId: user.id,
        storeId: user.storeId || "store-main",
        fileName: file.name,
        fileSizeBytes: file.size,
      });
      return apiError("Only .csv and .xlsx files are supported", 415, {
        code: "UnsupportedMediaType",
      });
    }

    const mappingRaw = formData.get("columnMapping");
    let columnMapping: ColumnMapping | undefined;
    try {
      columnMapping = mappingRaw ? JSON.parse(String(mappingRaw)) : undefined;
    } catch {
      return apiError("Invalid column mapping", 422, {
        code: "ValidationError",
        errors: { columnMapping: ["Column mapping must be valid JSON"] },
      });
    }
    const storeId = user.storeId || "store-main";

    log.info("customer.import.preview.started", {
      userId: user.id,
      storeId,
      fileName: file.name,
      fileSizeBytes: file.size,
      hasColumnMapping: Boolean(columnMapping),
      mappedColumnCount: columnMapping ? Object.values(columnMapping).filter(Boolean).length : 0,
    });

    const { headers, records } = parseImportFile(
      await file.arrayBuffer(),
      columnMapping,
    );
    const { missingColumns, unknownColumns, suggestions } =
      buildMissingColumnResponse(headers);

    if (missingColumns.length > 0) {
      log.warn("customer.import.preview.missing_required_columns", {
        userId: user.id,
        storeId,
        fileName: file.name,
        headerCount: headers.length,
        recordCount: records.length,
        missingColumns,
        unknownColumns,
        durationMs: Date.now() - startedAt,
      });
      return apiError("Import file is missing required columns.", 422, {
        code: "ValidationError",
        errors: { columns: missingColumns },
        extra: {
          missingColumns,
          requiredColumns: REQUIRED_IMPORT_COLUMNS,
          unknownColumns,
          suggestions,
        },
      });
    }

    const phones = Array.from(
      new Set(
        records
          .map((record) => String(record.phone ?? "").trim())
          .filter(Boolean),
      ),
    );
    const existingCustomers = await db.customer.findMany({
      where: { storeId, phone: { in: phones } },
      select: { id: true, name: true, phone: true },
    });

    const result = normalizeImportRows(
      records,
      new Map(
        existingCustomers
          .filter((customer) => Boolean(customer.phone))
          .map((customer) => [
            customer.phone as string,
            { id: customer.id, name: customer.name },
          ]),
      ),
    );

    log.info("customer.import.preview.completed", {
      userId: user.id,
      storeId,
      fileName: file.name,
      headerCount: headers.length,
      recordCount: records.length,
      uniquePhoneCount: phones.length,
      rowCount: result.rows.length,
      warningCount: result.warnings.length,
      errorCount: result.errors.length,
      existingMatchCount: result.existingPhoneMatches.length,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json({
      ...result,
      missingColumns,
      unknownColumns,
      requiredColumns: REQUIRED_IMPORT_COLUMNS,
      suggestions,
    });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    log.error("customer.import.preview.failed", {
      error,
      durationMs: Date.now() - startedAt,
    });
    return apiError("Failed to preview customer import", 500, { code: "InternalError" });
  }
}
