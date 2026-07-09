import { NextResponse } from "next/server";

import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";
import {
  productImportJobIdSchema,
  progressProductImportJobForPolling,
} from "@/features/product-import/services/product-import-job-service";

const logger = getLogger("api:products:import:jobs:detail");

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission("product", "read");
    const params = productImportJobIdSchema.parse(await context.params);
    const job = await progressProductImportJobForPolling(params.id, user);
    return NextResponse.json(job);
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    if (error instanceof Error && error.message === "IMPORT_JOB_NOT_FOUND") {
      return NextResponse.json({ message: "Import job not found" }, { status: 404 });
    }
    logger.error("product.import.job.detail.failed", { error });
    return NextResponse.json({ message: "Failed to load product import job" }, { status: 500 });
  }
}
