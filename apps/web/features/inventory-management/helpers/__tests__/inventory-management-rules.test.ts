import { describe, expect, it } from "vitest";
import * as inventoryRules from "../inventory-management-rules";
import {
  DAILY_MATCHING_WINDOW_LABEL,
  buildInventoryUrgentCount,
  classifyStockTask,
  getDailyMatchingWindowStatus,
  isJakartaSaturday,
  isDailyMatchingWindowOpen,
  jakartaDateKey,
  jakartaWeekKey,
} from "../inventory-management-rules";

describe("inventory management rules", () => {
  it("keeps an approved correction active until the OUT log is verified again", () => {
    const resolveState = (
      inventoryRules as typeof inventoryRules & {
        resolveOutLogVerificationState?: (input: {
          verificationStatus: "MISMATCH";
          correctionStatus: "APPROVED";
        }) => string;
      }
    ).resolveOutLogVerificationState;

    expect(
      resolveState?.({
        verificationStatus: "MISMATCH",
        correctionStatus: "APPROVED",
      }),
    ).toBe("READY_FOR_REVIEW");
  });

  it("builds a reversal and replacement when an OUT log product is corrected", () => {
    const calculateMovements = (
      inventoryRules as typeof inventoryRules & {
        calculateOutLogCorrectionMovements?: (input: {
          originalProductId: string;
          originalQuantity: number;
          correctedProductId: string;
          correctedQuantity: number;
        }) => Array<{ productId: string; delta: number; kind: string }>;
      }
    ).calculateOutLogCorrectionMovements;

    expect(
      calculateMovements?.({
        originalProductId: "product-wrong",
        originalQuantity: 10,
        correctedProductId: "product-right",
        correctedQuantity: 4,
      }),
    ).toEqual([
      { productId: "product-wrong", delta: 10, kind: "REVERSAL" },
      { productId: "product-right", delta: -4, kind: "REPLACEMENT" },
    ]);
  });

  it("uses one net adjustment when only the OUT quantity changes", () => {
    expect(
      inventoryRules.calculateOutLogCorrectionMovements({
        originalProductId: "product-1",
        originalQuantity: 10,
        correctedProductId: "product-1",
        correctedQuantity: 12,
      }),
    ).toEqual([{ productId: "product-1", delta: -2, kind: "NET" }]);
  });

  it("maps the correction lifecycle into verification queue states", () => {
    expect(
      inventoryRules.resolveOutLogVerificationState({
        verificationStatus: "MISMATCH",
        correctionStatus: "PENDING",
      }),
    ).toBe("CORRECTION_PENDING");
    expect(
      inventoryRules.resolveOutLogVerificationState({
        verificationStatus: "MISMATCH",
        correctionStatus: "REJECTED",
      }),
    ).toBe("CORRECTION_REJECTED");
    expect(
      inventoryRules.resolveOutLogVerificationState({
        verificationStatus: "VERIFIED",
        correctionStatus: "APPROVED",
      }),
    ).toBe("VERIFIED");
  });

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

  it("opens daily stock matching only from 15:00 through 20:00 WIB", () => {
    expect(DAILY_MATCHING_WINDOW_LABEL).toBe("15:00-20:00 WIB");
    expect(isDailyMatchingWindowOpen(new Date("2026-06-25T07:59:59.000Z"))).toBe(false);
    expect(isDailyMatchingWindowOpen(new Date("2026-06-25T08:00:00.000Z"))).toBe(true);
    expect(isDailyMatchingWindowOpen(new Date("2026-06-25T13:00:00.000Z"))).toBe(true);
    expect(isDailyMatchingWindowOpen(new Date("2026-06-25T13:00:01.000Z"))).toBe(false);
  });

  it("describes the daily matching window state for Indonesian UI copy", () => {
    expect(getDailyMatchingWindowStatus(new Date("2026-06-25T07:59:59.000Z"))).toMatchObject({
      isOpen: false,
      badgeLabel: "Buka 15:00 WIB",
    });
    expect(getDailyMatchingWindowStatus(new Date("2026-06-25T08:00:00.000Z"))).toMatchObject({
      isOpen: true,
      badgeLabel: "Sedang dibuka",
    });
    expect(getDailyMatchingWindowStatus(new Date("2026-06-25T13:00:01.000Z"))).toMatchObject({
      isOpen: false,
      badgeLabel: "Tutup 20:00 WIB",
    });
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
