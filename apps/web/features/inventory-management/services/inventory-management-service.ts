import {
  buildInventoryUrgentCount,
  jakartaDateKey,
  jakartaWeekKey,
} from "../helpers/inventory-management-rules";
import type {
  InventoryManagementUser,
  InventorySummary,
  InventorySummaryRepository,
} from "../types/inventory-management";

export interface GetInventorySummaryInput {
  user: InventoryManagementUser;
  repository: InventorySummaryRepository;
  now?: Date;
}

export async function getInventorySummary(
  input: GetInventorySummaryInput,
): Promise<InventorySummary> {
  const storeId = input.user.storeId;
  if (!storeId) {
    throw new Error("Inventory summary requires a store-scoped user");
  }

  const now = input.now ?? new Date();
  const dateKey = jakartaDateKey(now);
  const weekKey = jakartaWeekKey(now);

  const [
    pendingStockRequests,
    unverifiedOutLogs,
    submittedInboundReceipts,
    weeklyProofMissing,
    dailyMatchingIncomplete,
    damagedReportsPending,
    needsRevisionReceipts,
    rejectedOwnRequests,
    pendingSuratJalan,
    unmarkedSuratJalan,
    negativeStockProducts,
    outOfStockProducts,
    lowStockProducts,
    dailyChecklistRemaining,
    chartData,
  ] = await Promise.all([
    input.repository.countPendingStockRequests(storeId),
    input.repository.countUnverifiedOutLogs(storeId, dateKey),
    input.repository.countSubmittedInboundReceipts(storeId),
    input.repository.isWeeklyProofMissing(storeId, weekKey),
    input.repository.isDailyMatchingIncomplete(storeId, dateKey),
    input.repository.countPendingDamagedReports(storeId),
    input.repository.countNeedsRevisionReceipts(storeId),
    input.repository.countRejectedRequestsForUser(storeId, input.user.id),
    input.repository.countPendingSuratJalan(storeId),
    input.repository.countUnmarkedSuratJalan(storeId),
    input.repository.countNegativeStockProducts(storeId),
    input.repository.countOutOfStockProducts(storeId),
    input.repository.countLowStockProducts(storeId),
    input.repository.countDailyChecklistRemaining(storeId, dateKey),
    input.repository.getChartData(storeId, dateKey),
  ]);

  const counts = {
    pendingStockRequests,
    unverifiedOutLogs,
    submittedInboundReceipts,
    weeklyProofMissing,
    dailyMatchingIncomplete,
    damagedReportsPending,
    needsRevisionReceipts,
    rejectedOwnRequests,
    pendingSuratJalan,
    unmarkedSuratJalan,
    negativeStockProducts,
    outOfStockProducts,
    lowStockProducts,
    dailyChecklistRemaining,
  };

  return {
    urgentCount: buildInventoryUrgentCount(input.user.role, counts),
    counts,
    period: { dateKey, weekKey },
    chartData,
  };
}
