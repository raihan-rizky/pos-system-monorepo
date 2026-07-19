import { NextResponse } from "next/server";

import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";
import {
  bulkStockImportJobIdSchema,
  getBulkStockImportJobStatus,
} from "@/features/bulk-stock-import/services/bulk-stock-import-job-service";

const logger = getLogger("api:inventory:bulk-import:commit:jobs:detail");

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission("inventory", "update");
    const params = bulkStockImportJobIdSchema.parse(await context.params);
    const job = await getBulkStockImportJobStatus(params.id, user);
    return NextResponse.json(job);
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    if (
      error instanceof Error &&
      error.message === "BULK_STOCK_IMPORT_JOB_NOT_FOUND"
    ) {
      return NextResponse.json(
        { message: "Antrean impor stok massal tidak ditemukan" },
        { status: 404 },
      );
    }
    logger.error("inventory.bulk_import.commit.job.detail.failed", { error });
    return NextResponse.json(
      { message: "Gagal memuat antrean impor stok massal" },
      { status: 500 },
    );
  }
}
