import { NextResponse } from "next/server";
import { z } from "zod";

import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";
import {
  bulkStockImportJobCreateSchema,
  createBulkStockImportJob,
  startBulkStockImportJobProcessing,
} from "@/features/bulk-stock-import/services/bulk-stock-import-job-service";

const logger = getLogger("api:inventory:bulk-import:commit:jobs");

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await requirePermission("inventory", "update");
    const input = bulkStockImportJobCreateSchema.parse(await request.json());
    const job = await createBulkStockImportJob(input, user);
    startBulkStockImportJobProcessing(job.id);
    return NextResponse.json(job, { status: 201 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: "Validation error", errors: error.flatten().fieldErrors },
        { status: 422 },
      );
    }
    logger.error("inventory.bulk_import.commit.job.create.failed", { error });
    return NextResponse.json(
      { message: "Gagal membuat antrean impor stok massal" },
      { status: 500 },
    );
  }
}
