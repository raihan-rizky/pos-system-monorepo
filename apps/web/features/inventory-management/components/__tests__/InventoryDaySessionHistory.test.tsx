import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CheckOutHistoryList, InventoryDaySessionHistory } from "../InventoryDaySessionHistory";
import type { InventoryDaySessionRecord } from "../../api/inventory-management-api";

describe("InventoryDaySessionHistory", () => {
  afterEach(() => vi.restoreAllMocks());

  it("loads daily history without asking for check-in", () => {
    const html = renderToStaticMarkup(<InventoryDaySessionHistory />);
    expect(html).toContain("Memuat riwayat");
    expect(html).not.toMatch(/check\s*in/i);
  });

  it("shows checkout history directly without check-in tabs", () => {
    const states = [[], null, false, null];
    let call = 0;
    vi.spyOn(React, "useState").mockImplementation(() => [states[call++], vi.fn()] as never);
    const html = renderToStaticMarkup(<InventoryDaySessionHistory />);
    expect(html).toContain("Belum ada riwayat check out inventaris.");
    expect(html).not.toMatch(/check\s*in/i);
  });

  it("omits Morning Check sections from a checkout without a morning snapshot", () => {
    const record: InventoryDaySessionRecord = {
      id: "checkout-only", storeId: "store-main", periodKey: "2026-10-14", status: "CHECKED_OUT",
      morningCheckSnapshot: null, checkInByName: null, checkedInAt: null,
      checkOutByName: "Rina", checkedOutAt: "2026-10-14T10:00:00.000Z",
      checkOutSnapshot: { morningCheckSnapshot: null, note: "Hari selesai" },
    };
    const html = renderToStaticMarkup(<CheckOutHistoryList records={[record]} expandedId="checkout-only" onToggle={() => undefined} />);
    expect(html).toContain("Hari selesai");
    expect(html).not.toContain("Morning Check");
    expect(html).not.toContain("Workspace &amp; Safety");
  });

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
            materialCounts: [{ productId: "paper", actualQuantity: 2 }],
            productionMaterials: [{ product: { id: "paper", name: "Kertas A4", unit: "rim" } }],
            safetyChecks: [{ id: "workspace", label: "Area kerja", checked: true }],
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
    expect(html).toContain("Material Count Morning Check");
    expect(html).toContain("Kertas A4");
    expect(html).toContain("Workspace &amp; Safety");
  });
});
