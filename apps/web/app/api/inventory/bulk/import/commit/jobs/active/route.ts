import { NextResponse } from "next/server";

import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";
import { getActiveBulkStockImportJob } from "@/features/bulk-stock-import/services/bulk-stock-import-job-service";

const logger = getLogger("api:inventory:bulk-import:commit:jobs:active");
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requirePermission("inventory.bulk", "read");
    return NextResponse.json({ job: await getActiveBulkStockImportJob(user) });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    logger.error("inventory.bulk_import.commit.job.active.failed", { error });
    return NextResponse.json({ message: "Gagal memuat impor stok yang berjalan" }, { status: 500 });
  }
}
