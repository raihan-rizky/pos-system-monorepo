import { InventoryWorkspace } from "@/features/inventory-management/components/InventoryWorkspace";
import {
  jakartaDateKey,
  jakartaWeekKey,
} from "@/features/inventory-management/helpers/inventory-management-rules";
import { getInventorySummary } from "@/features/inventory-management/services/inventory-management-service";
import { InventoryManagementRepository } from "@/features/inventory-management/repositories/InventoryManagementRepository";
import type {
  InventoryManagementUser,
  InventorySummary,
} from "@/features/inventory-management/types/inventory-management";
import { requirePermission } from "@/lib/rbac/guard";

function buildE2EInventorySummary(now = new Date()): InventorySummary {
  return {
    urgentCount: 0,
    counts: {
      pendingStockRequests: 0,
      unverifiedOutLogs: 0,
      submittedInboundReceipts: 0,
      weeklyProofMissing: false,
      dailyMatchingIncomplete: false,
      damagedReportsPending: 0,
      needsRevisionReceipts: 0,
      rejectedOwnRequests: 0,
      pendingSuratJalan: 0,
      unmarkedSuratJalan: 0,
      negativeStockProducts: 0,
      outOfStockProducts: 0,
      lowStockProducts: 0,
      dailyChecklistRemaining: 0,
    },
    period: {
      dateKey: jakartaDateKey(now),
      weekKey: jakartaWeekKey(now),
    },
    chartData: {
      inboundOutbound: [],
      health: {
        accuracy: 100,
        availability: 100,
        fulfillment: 100,
      },
    },
  };
}

export default async function InventoryPage() {
  const user = await requirePermission("inventory", "read");
  if (!user.storeId) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-10 md:px-6">
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-950 shadow-sm">
          <h1 className="text-lg font-bold">Akun inventory belum terhubung ke toko</h1>
          <p className="mt-2 text-sm text-amber-800">
            Hubungkan akun ini ke toko terlebih dahulu sebelum membuka workspace inventory.
          </p>
        </section>
      </main>
    );
  }

  const summary =
    process.env.NODE_ENV !== "production" && process.env.E2E_AUTH_BYPASS === "1"
      ? buildE2EInventorySummary()
      : await getInventorySummary({
          user: user as InventoryManagementUser,
          repository: new InventoryManagementRepository(),
        });

  return <InventoryWorkspace initialSummary={summary} />;
}
