import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock("@/hooks/useTransactions", () => ({ useTransaction: mocks.transaction }));
vi.mock("@/components/ReceiptModal", () => ({ ReceiptModal: ({ transaction }: { transaction: { invoiceNumber: string } }) => <div role="dialog">Nota: {transaction.invoiceNumber}</div> }));
vi.mock("@pos/ui", () => ({ Modal: ({ children, title }: { children: ReactNode; title: string }) => <div role="dialog"><h2>{title}</h2>{children}</div> }));

describe("popup nota dari rincian penerimaan", () => {
  it("memuat detail transaksi yang dipilih dan membuka nota aplikasi", async () => {
    mocks.transaction.mockReturnValue({ data: { id: "n1", invoiceNumber: "INV-001" }, isLoading: false, error: null, refetch: vi.fn() });
    const component = await vi.importActual<{ ReceiptHistoryReceiptDialog: React.ComponentType<{ transactionId: string; onClose: () => void }> }>("../ReceiptHistoryReceiptDialog").catch(() => null);
    expect(component).not.toBeNull(); if (!component) return;
    const html = renderToStaticMarkup(createElement(component.ReceiptHistoryReceiptDialog, { transactionId: "n1", onClose: vi.fn() }));
    expect(mocks.transaction).toHaveBeenCalledWith("n1");
    expect(html).toContain("Nota: INV-001");
  });

  it("menunjukkan proses memuat dan memberi pilihan coba lagi saat gagal", async () => {
    const component = await vi.importActual<{ ReceiptHistoryReceiptDialog: React.ComponentType<{ transactionId: string; onClose: () => void }> }>("../ReceiptHistoryReceiptDialog").catch(() => null);
    expect(component).not.toBeNull(); if (!component) return;
    mocks.transaction.mockReturnValue({ data: undefined, isLoading: true, error: null, refetch: vi.fn() });
    expect(renderToStaticMarkup(createElement(component.ReceiptHistoryReceiptDialog, { transactionId: "n1", onClose: vi.fn() }))).toContain("Memuat nota");
    mocks.transaction.mockReturnValue({ data: undefined, isLoading: false, error: new Error("gagal"), refetch: vi.fn() });
    const html = renderToStaticMarkup(createElement(component.ReceiptHistoryReceiptDialog, { transactionId: "n1", onClose: vi.fn() }));
    expect(html).toContain('role="alert"');
    expect(html).toContain("Coba lagi");
  });
});
