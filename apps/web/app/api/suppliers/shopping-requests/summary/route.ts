import { NextResponse } from "next/server";

import { getShoppingRequestKpiSummary } from "@/features/suppliers/shopping-requests/repositories/shopping-requests-repository";
import { apiError } from "@/lib/api/responses";
import { getLogger } from "@/lib/logger";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";

const log = getLogger("api:suppliers:shopping-requests:summary");

export async function GET() {
  try {
    const user = await requirePermission("supplier", "read");
    if (!user.storeId) {
      return apiError("Toko pengguna tidak tersedia", 403, {
        code: "Forbidden",
      });
    }
    const summary = await getShoppingRequestKpiSummary(user.storeId);

    return NextResponse.json({ data: summary });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;

    log.error("shopping_requests.summary.failed", { error });
    return apiError("Gagal memuat ringkasan permohonan belanja", 500, {
      code: "InternalError",
    });
  }
}
