import { describe, expect, it } from "vitest";
import { getInventorySummary } from "../inventory-management-service";
import type { InventorySummaryRepository } from "../../types/inventory-management";

function makeRepository(
  overrides: Partial<InventorySummaryRepository> = {},
): InventorySummaryRepository {
  return {
    countPendingStockRequests: async () => 2,
    countUnverifiedOutLogs: async () => 5,
    countSubmittedInboundReceipts: async () => 3,
    isWeeklyProofMissing: async () => true,
    isDailyMatchingIncomplete: async () => true,
    countPendingDamagedReports: async () => 4,
    countNeedsRevisionReceipts: async () => 7,
    countRejectedRequestsForUser: async () => 9,
    countNegativeStockProducts: async () => 1,
    countOutOfStockProducts: async () => 6,
    countLowStockProducts: async () => 12,
    countDailyChecklistRemaining: async () => 3,
    getChartData: async () => ({
      inboundOutbound: [],
      health: { accuracy: 100, availability: 100, fulfillment: 100 },
    }),
    ...overrides,
  };
}

describe("inventory management service", () => {
  it("returns owner urgent count from approval queues", async () => {
    const summary = await getInventorySummary({
      user: { id: "owner-1", role: "OWNER", storeId: "store-main" },
      repository: makeRepository(),
      now: new Date("2026-06-25T03:00:00.000Z"),
    });

    expect(summary.urgentCount).toBe(9);
    expect(summary.period.dateKey).toBe("2026-06-25");
  });

  it("returns inventory urgent count from operational task queues", async () => {
    const summary = await getInventorySummary({
      user: { id: "inventory-1", role: "INVENTORY", storeId: "store-main" },
      repository: makeRepository(),
      now: new Date("2026-06-25T03:00:00.000Z"),
    });

    expect(summary.urgentCount).toBe(23);
    expect(summary.counts.unverifiedOutLogs).toBe(5);
  });

  it("returns stock risk and daily checklist counts for the command center", async () => {
    const summary = await getInventorySummary({
      user: { id: "inventory-1", role: "INVENTORY", storeId: "store-main" },
      repository: makeRepository({
        countNegativeStockProducts: async () => 2,
        countOutOfStockProducts: async () => 8,
        countLowStockProducts: async () => 14,
        countDailyChecklistRemaining: async () => 5,
      }),
      now: new Date("2026-06-25T03:00:00.000Z"),
    });

    expect(summary.counts.negativeStockProducts).toBe(2);
    expect(summary.counts.outOfStockProducts).toBe(8);
    expect(summary.counts.lowStockProducts).toBe(14);
    expect(summary.counts.dailyChecklistRemaining).toBe(5);
  });
});
