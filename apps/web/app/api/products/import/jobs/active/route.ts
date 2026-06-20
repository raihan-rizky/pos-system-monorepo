import { NextResponse } from "next/server";

import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";
import { getActiveProductImportJob } from "@/features/product-import/services/product-import-job-service";

const logger = getLogger("api:products:import:jobs:active");

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requirePermission("product", "read");
    const job = await getActiveProductImportJob(user);
    return NextResponse.json({ job });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    logger.error("product.import.job.active.failed", { error });
    return NextResponse.json({ message: "Failed to load active product import job" }, { status: 500 });
  }
}
