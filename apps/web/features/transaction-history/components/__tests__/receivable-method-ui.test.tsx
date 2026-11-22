import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ history: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/features/transaction-history/hooks/useReceiptHistory", () => ({ useReceiptHistory: mocks.history }));
import { ReceiptHistoryClient } from "../ReceiptHistoryClient";

const context = { date: "2026-11-11", mode: "receipt" as const, method: "TRANSFER" };

describe("rincian penerimaan per metode", () => {
  it("menampilkan nota dan pembayaran piutang manual dengan ringkasan komposisi", () => {
    mocks.history.mockReturnValue({ data: {
      items: [
        { transactionId: "n1", invoiceNumber: "INV-001", date: "2026-11-11", amount: 60_000, methods: ["TRANSFER"], isReceivableNota: true },
        { transactionId: "n2", invoiceNumber: "INV-002", date: "2026-11-11", amount: 5_000, methods: ["TRANSFER"] },
      ],
      manualDetailsAvailable: true, manualReceivableDetailsAvailable: true, manualEntries: [],
      manualReceivableEntries: [{ id: "p1", receivableId: "r1", customerName: "Pelanggan Contoh", date: "2026-11-11", amount: 25_000, methods: ["TRANSFER"] }],
    }, isLoading: false, error: null });
    const html = renderToStaticMarkup(createElement(ReceiptHistoryClient, { context }));
    expect(html).toContain("INV-001");
    expect(html).toContain("Piutang Nota");
    expect(html).toContain("Pelanggan Contoh");
    expect(html).toContain("Piutang Manual");
    expect(html).toMatch(/Rp\s*25\.000/);
    expect(html).toContain("Jenis transaksi");
    for (const option of ["Semua jenis", "Nota", "Piutang Nota", "Pemasukan Manual", "Piutang Manual"]) expect(html).toContain(option);
    for (const color of ["bg-violet-50", "bg-amber-50", "bg-blue-50"]) expect(html).toContain(color);
    expect(html).toContain("Ringkasan penerimaan");
    expect(html).toMatch(/66[.,]7%/);
    expect(html).toContain("baris nota merupakan pelunasan Piutang Nota");
    expect(html).toContain("90.000");
    expect(html).toContain('aria-label="Lihat nota INV-001"');
  });

  it("menjelaskan bila rincian piutang manual tidak diizinkan", () => {
    mocks.history.mockReturnValue({ data: { items: [], manualDetailsAvailable: true, manualReceivableDetailsAvailable: false }, isLoading: false, error: null });
    const html = renderToStaticMarkup(createElement(ReceiptHistoryClient, { context }));
    expect(html).toContain("Akses rincian Piutang Manual belum diizinkan");
  });
});
