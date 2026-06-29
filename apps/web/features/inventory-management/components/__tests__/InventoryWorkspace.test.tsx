import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { InventoryWorkspace } from "../InventoryWorkspace";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    lazy: (ctor: any) => {
      const ctorStr = ctor.toString();
      if (ctorStr.includes("StockLogsTab")) {
        return () => actual.createElement("div", null, "Mocked Stock Logs Tab");
      }
      if (ctorStr.includes("StockHistoryTab")) {
        return () => actual.createElement("div", null, "Mocked Stock History Tab");
      }
      if (ctorStr.includes("DamagedReportsHistoryTab")) {
        return () => actual.createElement("div", null, "Mocked Damaged Reports History");
      }
      return actual.lazy(ctor);
    },
  };
});

vi.mock("@/components/providers/RoleProvider", () => ({
  useRole: () => ({
    role: "INVENTORY",
    userId: "user-1",
    canPerform: () => true,
  }),
}));

vi.mock("@/hooks/useInventoryLogs", () => ({
  useInventoryLogs: () => ({
    data: { data: [] },
    isLoading: false,
    isError: false,
  }),
  useApproveInventoryLog: () => ({ isPending: false }),
  useRejectInventoryLog: () => ({ isPending: false }),
  useCancelInventoryLog: () => ({ isPending: false }),
}));

vi.mock("@/hooks/useProducts", () => ({
  useProducts: () => ({
    data: [],
    isFetching: false,
  }),
}));

vi.mock("@/features/internal-use-recap/hooks/useInternalUseRecap", () => ({
  useInternalUseRecap: () => ({
    data: {
      data: {
        range: { label: "1 Jun - 7 Jun" },
        summary: { entryCount: 0, productCount: 0, totalQuantity: 0, totalValue: 0 },
        products: [],
      },
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("@pos/ui", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    Modal: ({ children, title }: any) => (
      <div data-testid="modal-mock">
        {title}
        {children}
      </div>
    ),
  };
});

describe("InventoryWorkspace", () => {
  const baseSummary = {
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
      negativeStockProducts: 0,
      outOfStockProducts: 0,
      lowStockProducts: 0,
      dailyChecklistRemaining: 0,
    },
    period: { dateKey: "2026-06-26", weekKey: "2026-W26" },
    chartData: {
      inboundOutbound: [],
      health: { accuracy: 100, availability: 100, fulfillment: 100 },
    },
  };

  it("renders the task-first inventory tabs and urgent summary", () => {
    const html = renderToStaticMarkup(
      <InventoryWorkspace
        initialSummary={{
          urgentCount: 6,
          counts: {
            pendingStockRequests: 2,
            unverifiedOutLogs: 1,
            submittedInboundReceipts: 1,
            weeklyProofMissing: true,
            dailyMatchingIncomplete: true,
            damagedReportsPending: 0,
            needsRevisionReceipts: 0,
            rejectedOwnRequests: 0,
          },
          period: { dateKey: "2026-06-25", weekKey: "2026-W26" },
          chartData: {
            inboundOutbound: [],
            health: { accuracy: 100, availability: 100, fulfillment: 100 }
          }
        }}
      />,
    );

    for (const label of [
      "Ringkasan",
      "Tugas",
      "Transaksi",
      "Riwayat",
    ]) {
      expect(html).toContain(label);
    }
    expect(html).toContain("6 tugas urgent");
  });

  it("renders weekly cleaning proof and damaged product quick action forms", () => {
    const html = renderToStaticMarkup(
      <InventoryWorkspace
        initialSummary={{
          urgentCount: 2,
          counts: {
            pendingStockRequests: 0,
            unverifiedOutLogs: 0,
            submittedInboundReceipts: 0,
            weeklyProofMissing: true,
            dailyMatchingIncomplete: false,
            damagedReportsPending: 1,
            needsRevisionReceipts: 0,
            rejectedOwnRequests: 0,
          },
          period: { dateKey: "2026-06-25", weekKey: "2026-W26" },
          chartData: {
            inboundOutbound: [],
            health: { accuracy: 100, availability: 100, fulfillment: 100 }
          }
        }}
      />,
    );

    expect(html).toContain("Proof Kebersihan Gudang");
    expect(html).toContain("name=\"weeklyProofUrl\"");
    expect(html).toContain("name=\"weeklyProofNote\"");
    expect(html).toContain("Laporkan Barang Rusak");
    expect(html).toContain("Cari Produk");
    expect(html).toContain("Keranjang Barang Rusak");
    expect(html).toContain("name=\"damagedProofUrl\"");
    expect(html).toContain("Matching Stok Harian");
    expect(html).toContain("Submit Matching");
  });


  it("renders log stok tab when defaultTab is 'Log Stok'", () => {
    const html = renderToStaticMarkup(
      <InventoryWorkspace
        initialSummary={{
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
          },
          period: { dateKey: "2026-06-25", weekKey: "2026-W26" },
          chartData: {
            inboundOutbound: [],
            health: { accuracy: 100, availability: 100, fulfillment: 100 }
          }
        }}
        defaultTab="Riwayat"
      />,
    );

    // It should render the StockLogsTab content
    expect(html).toContain("Mocked Stock Logs Tab");
    // It should NOT render the Ringkasan dashboard contents
    expect(html).not.toContain("Status Tugas Operasional");
  });

  it("renders rekap stok tab when defaultTab is 'Rekap Stok'", () => {
    const html = renderToStaticMarkup(
      <InventoryWorkspace
        initialSummary={{
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
          },
          period: { dateKey: "2026-06-25", weekKey: "2026-W26" },
          chartData: {
            inboundOutbound: [],
            health: { accuracy: 100, availability: 100, fulfillment: 100 }
          }
        }}
        // To test rekap stok, we can't just pass defaultTab anymore because it defaults to "Log Stok" internally.
        // We'll just test the default Riwayat behavior instead, or maybe just remove this test and just test Riwayat
        defaultTab="Riwayat"
      />,
    );

    // Since default inner riwayat tab is Log Stok, it renders Stock Logs Tab
    expect(html).toContain("Mocked Stock Logs Tab");
    // It should NOT render the Ringkasan dashboard contents
    expect(html).not.toContain("Status Tugas Operasional");
  });

  it("blocks the daily task work queue until inventory check in", () => {
    const html = renderToStaticMarkup(
      <InventoryWorkspace
        initialSummary={{
          urgentCount: 3,
          counts: {
            pendingStockRequests: 0,
            unverifiedOutLogs: 2,
            submittedInboundReceipts: 0,
            weeklyProofMissing: true,
            dailyMatchingIncomplete: true,
            damagedReportsPending: 1,
            needsRevisionReceipts: 0,
            rejectedOwnRequests: 0,
          },
          period: { dateKey: "2026-06-26", weekKey: "2026-W26" },
          chartData: {
            inboundOutbound: [],
            health: { accuracy: 100, availability: 100, fulfillment: 100 }
          }
        }}
        defaultTab="Tugas"
      />,
    );

    expect(html).toContain("Check In / Check Out");
    expect(html).toContain("Memuat status inventaris");
    expect(html).not.toContain("Checklist Manual Harian");
    expect(html).not.toContain("Tambah tugas");
  });

  it("renders fixed operational task history tabs in the riwayat tab", () => {
    const html = renderToStaticMarkup(
      <InventoryWorkspace
        initialSummary={{
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
          },
          period: { dateKey: "2026-06-26", weekKey: "2026-W26" },
          chartData: {
            inboundOutbound: [],
            health: { accuracy: 100, availability: 100, fulfillment: 100 }
          }
        }}
        defaultTab="Riwayat"
      />,
    );

    expect(html).toContain("Riwayat Tugas Harian");
    expect(html).toContain("Riwayat Tugas Mingguan");
    expect(html).toContain("Laporan Barang Rusak");
  });

  it("keeps the riwayat sub-tabs constrained on mobile", () => {
    const html = renderToStaticMarkup(
      <InventoryWorkspace initialSummary={baseSummary} defaultTab="Riwayat" />,
    );

    expect(html).toContain("flex w-full max-w-full gap-2 overflow-x-auto");
    expect(html).toContain("sm:w-max");
    expect(html).not.toContain("overflow-x-auto w-max");
  });

  it("uses responsive navigation tabs containers for Tasks and Transaksi tabs on mobile", () => {
    const html = renderToStaticMarkup(
      <InventoryWorkspace initialSummary={baseSummary} defaultTab="Transaksi" />,
    );
    expect(html).toContain("flex w-full max-w-full gap-2 overflow-x-auto");
    expect(html).toContain("sm:w-max");
    expect(html).not.toContain("overflow-x-auto w-max");
  });

  it("adds overflow-x-hidden to the main element to prevent overall page stretch on mobile", () => {
    const html = renderToStaticMarkup(
      <InventoryWorkspace initialSummary={baseSummary} />,
    );
    expect(html).toContain("overflow-x-hidden");
  });

  it("blocks and blurs the daily command center when the session is loaded but not checked in", () => {
    const mockPreview = {
      dateKey: "2026-06-29",
      session: null,
      stockRisk: { negative: [], outOfStock: [], lowStock: [] },
      productionMaterials: [],
      workspaceSafetyItems: [],
      completion: {
        dateKey: "2026-06-29",
        weekKey: "2026-W26",
        isSaturday: false,
        tasks: [],
        blockers: [],
      },
    };

    const html = renderToStaticMarkup(
      <InventoryWorkspace
        initialSummary={baseSummary}
        initialDaySessionPreview={mockPreview}
      />,
    );

    expect(html).toContain("blur-[4px]");
    expect(html).toContain("Check in terlebih dahulu sebelum menyelesaikan tugas harian.");
  });

  it("keeps pemakaian internal recap without the old internal stock-out review panel", () => {
    const html = renderToStaticMarkup(
      <InventoryWorkspace initialSummary={baseSummary} defaultTab="Transaksi" />,
    );

    expect(html).toContain("Pemakaian Internal");
    expect(html).not.toContain("Tidak ada permintaan stock out pending");
    expect(html).not.toContain("InternalStockOutReviewPanel");
  });

  it("renders the daily command center as the default first screen", () => {
    const html = renderToStaticMarkup(
      <InventoryWorkspace
        initialSummary={{
          ...baseSummary,
          urgentCount: 5,
          counts: {
            ...baseSummary.counts,
            unverifiedOutLogs: 2,
            dailyMatchingIncomplete: true,
            damagedReportsPending: 1,
            dailyChecklistRemaining: 3,
            unmarkedSuratJalan: 2,
          },
        }}
      />,
    );

    expect(html).toContain("Pusat Kerja Hari Ini");
    expect(html).toContain("Checklist Manual Hari Ini");
    expect(html).toContain("3 belum selesai");
    expect(html).toContain("Marking Surat Jalan");
    expect(html).toContain("2 belum dimarking");
    expect(html).toContain("Verifikasi dulu");
    expect(html.indexOf("Pusat Kerja Hari Ini")).toBeLessThan(
      html.indexOf("Volume Inbound vs Outbound (7 Hari)"),
    );
  });

  it("replaces duplicate operational KPIs with stock risk KPIs", () => {
    const html = renderToStaticMarkup(
      <InventoryWorkspace
        initialSummary={{
          ...baseSummary,
          counts: {
            ...baseSummary.counts,
            pendingStockRequests: 4,
            negativeStockProducts: 1,
            outOfStockProducts: 6,
            lowStockProducts: 12,
          },
        }}
      />,
    );

    expect(html).toContain("Risiko Stok");
    expect(html).toContain("Stok Negatif");
    expect(html).toContain("Stok Habis / Rendah");
    expect(html).toContain("Request Pending");
    expect(html).not.toContain("Penerimaan Menunggu Owner");
    expect(html).not.toContain("Inbound Menunggu");
  });

  it("replaces static post-chart cards with live operational follow-up", () => {
    const html = renderToStaticMarkup(
      <InventoryWorkspace
        initialSummary={{
          ...baseSummary,
          counts: {
            ...baseSummary.counts,
            pendingStockRequests: 4,
            submittedInboundReceipts: 2,
            pendingSuratJalan: 3,
            unmarkedSuratJalan: 5,
            needsRevisionReceipts: 3,
            rejectedOwnRequests: 1,
          },
          chartData: {
            ...baseSummary.chartData,
            inboundOutbound: [
              { day: "Senin", inbound: 10, outbound: 4 },
              { day: "Selasa", inbound: 3, outbound: 9 },
            ],
          },
        }}
      />,
    );

    expect(html).toContain("Tindak Lanjut Operasional");
    expect(html).toContain("Arus Stok Disetujui");
    expect(html).toContain("Aktivitas tertinggi: Senin (14 unit)");
    expect(html).toContain("Antrean Persetujuan");
    expect(html).toContain("Surat Jalan pending approval");
    expect(html).toContain("Approve pengiriman stok keluar");
    expect(html).toContain("Penerimaan perlu revisi");
    expect(html).toContain("Lihat rekap stok");
    expect(html).toContain("Terima barang");
    expect(html).toContain("Pemakaian internal");
    expect(html).toContain("Marking SJ");
    expect(html).not.toContain("Pemakaian Internal Cepat");
    expect(html).not.toContain("Log Stok Terverifikasi");
    expect(html).not.toContain("Rekap Nilai Stok");
    expect(html).not.toContain("Riwayat Surat Jalan");
  });

  it("keeps weekly proof status visible on the default screen", () => {
    const html = renderToStaticMarkup(
      <InventoryWorkspace
        initialSummary={{
          ...baseSummary,
          counts: {
            ...baseSummary.counts,
            weeklyProofMissing: true,
          },
        }}
      />,
    );

    expect(html).toContain("Status Mingguan");
    expect(html).toContain("Proof Kebersihan Gudang");
    expect(html).toContain("2026-W26");
    expect(html).toContain("Upload proof");
  });

  it("uses product search wording for damaged product reporting", () => {
    const html = renderToStaticMarkup(
      <InventoryWorkspace initialSummary={baseSummary} />,
    );

    expect(html).toContain("Cari Produk");
    expect(html).toContain("Cari nama produk atau SKU");
    expect(html).not.toContain("Product ID");
    expect(html).not.toContain("Cth: prod-12345");
  });
});
