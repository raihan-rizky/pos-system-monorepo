import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CheckOutHistoryList } from "../InventoryDaySessionHistory";
import type { InventoryDaySessionRecord } from "../../api/inventory-management-api";

describe("InventoryDaySessionHistory", () => {
  it("renders checkout movement, workflow, and exception snapshot details", () => {
    const records: InventoryDaySessionRecord[] = [
      {
        id: "session-1",
        storeId: "store-main",
        periodKey: "2026-06-30",
        status: "CHECKED_OUT",
        morningCheckSnapshot: null,
        checkInByName: "Staff Inventaris",
        checkedInAt: "2026-06-30T01:00:00.000Z",
        checkOutByName: "Staff Inventaris",
        checkedOutAt: "2026-06-30T10:00:00.000Z",
        checkOutSnapshot: {
          checkedOutAt: "2026-06-30T10:00:00.000Z",
          note: "Toko ditutup normal.",
          exceptionNotes: {
            "daily-matching": "Matching fisik dilanjutkan besok pagi.",
          },
          completion: {
            tasks: [
              {
                id: "daily-matching",
                label: "Matching stok harian tersubmit",
                completed: false,
                required: true,
              },
            ],
            blockers: ["Matching stok harian tersubmit"],
          },
          stockRisk: { negative: [], outOfStock: [], lowStock: [] },
          movementSummary: {
            stockInQuantity: 12,
            stockOutQuantity: 4,
            internalUseQuantity: 3,
            damagedQuantity: 1,
            adjustmentQuantity: 2,
            approvedLogCount: 5,
            pendingRequestCount: 1,
          },
          workflowSummary: {
            submittedInboundReceipts: 2,
            needsRevisionReceipts: 1,
            pendingSuratJalan: 3,
            unmarkedSuratJalan: 4,
            dailyChecklistRemaining: 1,
            unverifiedOutLogs: 2,
            damagedReportsPending: 1,
          },
          morningCheckSnapshot: {
            materialCounts: [],
            productionMaterials: [],
            safetyChecks: [],
          },
        },
      },
    ];

    const html = renderToStaticMarkup(
      <CheckOutHistoryList
        records={records}
        expandedId="session-1"
        onToggle={() => undefined}
      />,
    );

    expect(html).toContain("Pergerakan Stok");
    expect(html).toContain("Stok masuk");
    expect(html).toContain("12");
    expect(html).toContain("Status Workflow");
    expect(html).toContain("Penerimaan tunggu owner");
    expect(html).toContain("2");
    expect(html).toContain("Alasan Pengecualian");
    expect(html).toContain("Matching stok harian tersubmit");
    expect(html).toContain("Matching fisik dilanjutkan besok pagi.");
  });
});
