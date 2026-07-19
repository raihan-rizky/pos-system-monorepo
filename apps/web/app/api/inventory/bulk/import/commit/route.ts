import { NextResponse } from "next/server";
import { z } from "zod";

import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";
import { bulkStockImportRepository } from "@/features/bulk-stock-import/repositories/BulkStockImportRepository";
import {
  BulkStockImportValidationError,
  commitBulkStockImport,
} from "@/features/bulk-stock-import/services/bulk-stock-import-service";
import { StockMutationError } from "@/features/product-stock-groups/stock-mutations";

const logger = getLogger("api:inventory:bulk-import:commit");

export const dynamic = "force-dynamic";

const STOCK_VALIDATION_MESSAGE = "Stock cannot be negative or insufficient";
const CONVERSION_REVIEW_MESSAGE = "Product stock conversion needs review";

const commitRowSchema = z.object({
  rowNumber: z.number().int().min(1),
  name: z.string().trim().min(1),
  category: z.string().trim().min(1),
  unit: z.string().trim().min(1),
  stock: z.coerce.number(),
  selectedProductId: z.string().trim().min(1).optional(),
});

const commitSchema = z.object({
  mode: z.enum(["ADD", "SET"]),
  rows: z.array(commitRowSchema).min(1).max(3000),
  supplierId: z.string().trim().min(1).optional(),
  note: z.string().optional(),
  allowNegativeStock: z.boolean().optional().default(false),
});

export async function POST(request: Request) {
  const startedAt = Date.now();
  let userId: string | undefined;
  let storeId = "store-main";
  let rowCount = 0;
  let mode: unknown;
  try {
    const user = await requirePermission("inventory", "update");
    userId = user.id;
    storeId = user.storeId || "store-main";
    const body = await request.json();
    rowCount = Array.isArray((body as { rows?: unknown }).rows)
      ? (body as { rows: unknown[] }).rows.length
      : 0;
    mode = (body as { mode?: unknown }).mode;

    logger.info("inventory.bulk_import.commit.started", {
      userId,
      storeId,
      mode,
      rowCount,
    });

    const input = commitSchema.parse(body);

    const result = await commitBulkStockImport(bulkStockImportRepository, {
      user,
      mode: input.mode,
      rows: input.rows,
      supplierId: input.supplierId,
      note: input.note,
      allowNegativeStock: input.allowNegativeStock,
    });

    logger.info("inventory.bulk_import.commit.completed", {
      userId: user.id,
      storeId,
      mode: input.mode,
      rowCount: input.rows.length,
      batchOperationId: result.batchOperationId,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    if (error instanceof z.ZodError) {
      logger.warn("inventory.bulk_import.commit.validation_failed", {
        userId,
        storeId,
        mode,
        rowCount,
        reason: "ZOD_VALIDATION",
        errors: error.flatten().fieldErrors,
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json(
        { message: "Validation error", errors: error.flatten().fieldErrors },
        { status: 422 },
      );
    }
    if (error instanceof BulkStockImportValidationError) {
      logger.warn("inventory.bulk_import.commit.validation_failed", {
        userId,
        storeId,
        mode,
        rowCount,
        reason: error.message,
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json({ message: error.message }, { status: 422 });
    }
    if (error instanceof StockMutationError) {
      if (error.message === "PRODUCT_NOT_FOUND") {
        logger.warn("inventory.bulk_import.commit.validation_failed", {
          userId,
          storeId,
          mode,
          rowCount,
          reason: error.message,
          details: error.details,
          durationMs: Date.now() - startedAt,
        });
        return NextResponse.json(
          { code: "NotFound", message: "Product was not found" },
          { status: 404 },
        );
      }
      if (
        error.message === "INSUFFICIENT_STOCK" ||
        error.message === "CONVERSION_NEEDS_REVIEW"
      ) {
        const message =
          error.message === "CONVERSION_NEEDS_REVIEW"
            ? CONVERSION_REVIEW_MESSAGE
            : STOCK_VALIDATION_MESSAGE;
        logger.warn("inventory.bulk_import.commit.validation_failed", {
          userId,
          storeId,
          mode,
          rowCount,
          reason: error.message,
          details: error.details,
          durationMs: Date.now() - startedAt,
        });
        return NextResponse.json(
          {
            code: "ValidationError",
            message,
            errors: {
              stock: [message],
            },
          },
          { status: 422 },
        );
      }
    }

    logger.error("inventory.bulk_import.commit.failed", {
      error,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json(
      { message: "Gagal menerapkan impor stok massal" },
      { status: 500 },
    );
  }
}
