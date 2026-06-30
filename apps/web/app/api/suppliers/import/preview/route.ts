import { NextResponse } from "next/server";

import { requirePermission, handleAuthError } from "@/lib/rbac/guard";
import { apiError } from "@/lib/api/responses";
import { getLogger } from "@/lib/logger";
import {
  IMPORT_FILE_TOO_LARGE_MESSAGE,
  isImportFileTooLarge,
} from "@/lib/import-file-size";
import { enforceRateLimit } from "@/lib/rate-limit";
import type { ColumnMapping } from "@/features/supplier-import/types";
import {
  SupplierImportMissingColumnsError,
  previewSupplierImport,
} from "@/features/supplier-import/services/supplier-import-service";

const log = getLogger("api:suppliers:import:preview");
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const startedAt = Date.now();
  const rateLimited = enforceRateLimit(request, {
    namespace: "api:suppliers:import:preview",
    limit: 20,
    windowMs: 60_000,
  });
  if (rateLimited) return rateLimited;

  try {
    const user = await requirePermission("supplier", "create");
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return apiError("File is required", 422, {
        code: "ValidationError",
        errors: { file: ["File is required"] },
      });
    }

    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith(".csv") && !fileName.endsWith(".xlsx")) {
      return apiError("Only .csv and .xlsx files are supported", 415, {
        code: "UnsupportedMediaType",
      });
    }

    if (isImportFileTooLarge(file)) {
      return apiError(IMPORT_FILE_TOO_LARGE_MESSAGE, 413, {
        code: "PayloadTooLarge",
        errors: { file: [IMPORT_FILE_TOO_LARGE_MESSAGE] },
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

    log.info("supplier.import.preview.started", {
      userId: user.id,
      fileName: file.name,
      fileSizeBytes: file.size,
      hasColumnMapping: Boolean(columnMapping),
    });

    const result = await previewSupplierImport({
      buffer: await file.arrayBuffer(),
      columnMapping,
    });

    log.info("supplier.import.preview.completed", {
      userId: user.id,
      fileName: file.name,
      rowCount: result.rows.length,
      warningCount: result.warnings.length,
      errorCount: result.errors.length,
      removedEmptyRowCount: result.removedEmptyRowCount,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json(result);
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    if (error instanceof SupplierImportMissingColumnsError) {
      return apiError(error.message, 422, {
        code: "ValidationError",
        errors: { columns: error.missingColumns },
        extra: {
          missingColumns: error.missingColumns,
          unknownColumns: error.unknownColumns,
          suggestions: error.suggestions,
          removedEmptyRowCount: error.removedEmptyRowCount,
          requiredColumns: ["name"],
        },
      });
    }

    log.error("supplier.import.preview.failed", {
      error,
      durationMs: Date.now() - startedAt,
    });
    return apiError("Failed to preview supplier import", 500, {
      code: "InternalError",
    });
  }
}
