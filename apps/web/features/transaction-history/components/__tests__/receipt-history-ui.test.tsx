import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ history: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/features/transaction-history/hooks/useReceiptHistory", () => ({ useReceiptHistory: mocks.history }));

describe("Riwayat penerimaan", () => {
  it("menampilkan tanggal pilihan, filter Harian dan pelunasan nota lama", async () => {
    mocks.history.mockReturnValue({ isLoading: false, error: null, data: { items: [{ transactionId: "old", invoiceNumber: "INV-OLD", date: "2026-11-10", amount: 60000, methods: ["TRANSFER"] }], manualDetailsAvailable: false } });
    const component = await vi.importActual<{ ReceiptHistoryClient: React.ComponentType<{ context: object }> }>("../ReceiptHistoryClient").catch(() => null);
    expect(component).not.toBeNull(); if (!component) return;
    const html = renderToStaticMarkup(createElement(component.ReceiptHistoryClient, { context: { mode: "receipt", date: "2026-11-10" } }));
    expect(html).toContain('value="2026-11-10"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("Harian");
    expect(html).toContain("INV-OLD");
    expect(html).toContain("60.000");
    expect(html).toContain("sebagian rincian pemasukan");
    expect(html).toContain('aria-label="Lihat nota INV-OLD"');
    expect(html).toContain("Ringkasan penerimaan");
    expect(html).toContain("0% baris nota merupakan pelunasan Piutang Nota");
  });
  it("tidak membuka nota dengan hak Owner dari pratinjau Sales", async () => {
    mocks.history.mockReturnValue({ isLoading: false, error: null, data: { items: [{ transactionId: "old", invoiceNumber: "INV-OLD", date: "2026-11-10", amount: 60000, methods: [] }], manualDetailsAvailable: false } });
    const component = await vi.importActual<{ ReceiptHistoryClient: React.ComponentType<{ context: object }> }>("../ReceiptHistoryClient");
    const html = renderToStaticMarkup(createElement(component.ReceiptHistoryClient, { context: { mode: "receipt", date: "2026-11-10", previewSales: true } }));
    expect(html).toContain("INV-OLD");
    expect(html).not.toContain('aria-label="Lihat nota INV-OLD"');
    expect(html).toContain("Keluar dari pratinjau Sales");
  });
  it("menawarkan popup untuk nota tanpa nomor", async () => {
    mocks.history.mockReturnValue({ isLoading: false, error: null, data: { items: [{ transactionId: "no-invoice", invoiceNumber: null, date: "2026-11-10", amount: 60000, methods: [] }], manualDetailsAvailable: false } });
    const component = await vi.importActual<{ ReceiptHistoryClient: React.ComponentType<{ context: object }> }>("../ReceiptHistoryClient");
    const html = renderToStaticMarkup(createElement(component.ReceiptHistoryClient, { context: { mode: "receipt", date: "2026-11-10" } }));
    expect(html).toContain('aria-label="Lihat nota tanpa nomor"');
  });
  it("menawarkan popup ketika nomor nota berupa teks kosong", async () => {
    mocks.history.mockReturnValue({ isLoading: false, error: null, data: { items: [{ transactionId: "empty-invoice", invoiceNumber: "", date: "2026-11-10", amount: 60000, methods: [] }], manualDetailsAvailable: false } });
    const component = await vi.importActual<{ ReceiptHistoryClient: React.ComponentType<{ context: object }> }>("../ReceiptHistoryClient");
    const html = renderToStaticMarkup(createElement(component.ReceiptHistoryClient, { context: { mode: "receipt", date: "2026-11-10" } }));
    expect(html).toContain('aria-label="Lihat nota tanpa nomor"');
  });
});
