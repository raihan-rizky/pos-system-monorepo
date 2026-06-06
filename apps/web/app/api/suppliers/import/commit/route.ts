import { NextResponse } from "next/server";
import { z } from "zod";

import { requirePermission, handleAuthError } from "@/lib/rbac/guard";
import { apiError, apiValidationError } from "@/lib/api/responses";
import { getLogger } from "@/lib/logger";
import {
  MAX_SUPPLIER_IMPORT_ROWS,
  importRowCommitSchema,
} from "@/features/supplier-import/helpers/import-core";
import {
  SupplierImportConflictError,
  SupplierImportValidationError,
  commitSupplierImport,
} from "@/features/supplier-import/services/supplier-import-service";

const log = getLogger("api:suppliers:import:commit");

const commitSchema = z.object({
  rows: z.array(importRowCommitSchema).max(MAX_SUPPLIER_IMPORT_ROWS),
  decisions: z
    .record(z.string(), z.enum(["create", "update", "skip"]))
    .default({}),
  selectedExistingSupplierIds: z.record(z.string(), z.string()).default({}),
});

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const user = await requirePermission("supplier", "create");
    const parsed = commitSchema.parse(await request.json());

    log.info("supplier.import.commit.started", {
      userId: user.id,
      rowCount: parsed.rows.length,
      decisionCount: Object.keys(parsed.decisions).length,
      selectedExistingSupplierCount: Object.keys(
        parsed.selectedExistingSupplierIds,
      ).length,
    });

    const result = await commitSupplierImport(parsed);

    log.info("supplier.import.commit.completed", {
      userId: user.id,
      rowCount: parsed.rows.length,
      ...result,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    if (error instanceof z.ZodError) {
      return apiValidationError(error);
    }

    if (error instanceof SupplierImportValidationError) {
      return apiError(error.message, 422, {
        code: "ValidationError",
        errors: error.errors,
      });
    }

    if (error instanceof SupplierImportConflictError) {
      return apiError(error.message, 409, {
        code: "Conflict",
        extra: error.extra,
      });
    }

    log.error("supplier.import.commit.failed", {
      error,
      durationMs: Date.now() - startedAt,
    });
    return apiError("Failed to commit supplier import", 500, {
      code: "InternalError",
    });
  }
}
