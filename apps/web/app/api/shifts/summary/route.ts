import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";

const log = getLogger("api:shifts:summary");
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requirePermission("shift", "read");
    const storeId = user.storeId || "store-main";

    const [totalShifts, openShifts, discrepancyAgg, closedShifts] = await Promise.all([
      db.cashierShift.count({ where: { storeId } }),
      db.cashierShift.count({ where: { storeId, status: "OPEN" } }),
      db.cashierShift.aggregate({
        where: { storeId, discrepancy: { not: null } },
        _sum: { discrepancy: true },
      }),
      db.cashierShift.findMany({
        where: { storeId, status: "CLOSED", closedAt: { not: null } },
        select: { openedAt: true, closedAt: true },
      }),
    ]);

    const totalDiscrepancy = Number(discrepancyAgg._sum.discrepancy || 0);

    let avgDurationMinutes: number | null = null;
    if (closedShifts.length > 0) {
      const totalMinutes = closedShifts.reduce((acc, s) => {
        const diff = new Date(s.closedAt!).getTime() - new Date(s.openedAt).getTime();
        return acc + Math.floor(diff / 60000);
      }, 0);
      avgDurationMinutes = Math.round(totalMinutes / closedShifts.length);
    }

    return NextResponse.json({
      data: {
        totalShifts,
        openShifts,
        totalDiscrepancy,
        avgDurationMinutes,
      },
    });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    log.error("Failed to fetch shift summary:", error);
    return NextResponse.json(
      { message: "Failed to fetch shift summary" },
      { status: 500 },
    );
  }
}
