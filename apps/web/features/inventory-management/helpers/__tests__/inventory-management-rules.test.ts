import { describe, expect, it } from "vitest";
import {
  buildInventoryUrgentCount,
  classifyStockTask,
  isJakartaSaturday,
  jakartaDateKey,
  jakartaWeekKey,
} from "../inventory-management-rules";

describe("inventory management rules", () => {
  it("classifies negative, out-of-stock, and low-stock products separately", () => {
    expect(classifyStockTask({ stock: -1, minStock: 5 })).toBe("NEGATIVE_STOCK");
    expect(classifyStockTask({ stock: 0, minStock: 5 })).toBe("OUT_OF_STOCK");
    expect(classifyStockTask({ stock: 3, minStock: 5 })).toBe("LOW_STOCK");
    expect(classifyStockTask({ stock: 8, minStock: 5 })).toBe("HEALTHY");
  });

  it("derives daily and weekly task keys from Asia/Jakarta business time", () => {
    const utcLateNight = new Date("2026-06-24T18:30:00.000Z");

    expect(jakartaDateKey(utcLateNight)).toBe("2026-06-25");
    expect(jakartaWeekKey(utcLateNight)).toBe("2026-W26");
  });

  it("detects Saturday using Asia/Jakarta business time for weekly check-out rules", () => {
    expect(isJakartaSaturday(new Date("2026-06-26T18:00:00.000Z"))).toBe(true);
    expect(isJakartaSaturday(new Date("2026-06-27T18:00:00.000Z"))).toBe(false);
  });

  it("uses owner approval work for owner urgent badges", () => {
    expect(
      buildInventoryUrgentCount("OWNER", {
        pendingStockRequests: 2,
        unverifiedOutLogs: 5,
        submittedInboundReceipts: 3,
        pendingSuratJalan: 2,
        weeklyProofMissing: true,
        dailyMatchingIncomplete: true,
        damagedReportsPending: 4,
        needsRevisionReceipts: 7,
        rejectedOwnRequests: 9,
      }),
    ).toBe(11);
  });

  it("uses operational work for inventory urgent badges", () => {
    expect(
      buildInventoryUrgentCount("INVENTORY", {
        pendingStockRequests: 2,
        unverifiedOutLogs: 5,
        submittedInboundReceipts: 3,
        weeklyProofMissing: true,
        dailyMatchingIncomplete: true,
        damagedReportsPending: 4,
        needsRevisionReceipts: 7,
        rejectedOwnRequests: 9,
        unmarkedSuratJalan: 6,
      }),
    ).toBe(29);
  });
});
