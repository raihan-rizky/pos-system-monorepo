import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ canEdit: true, transactions: [] as any[] }));

vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/hooks/useProducts", () => ({ useCategories: () => ({ data: [] }) }));
vi.mock("@/components/providers/RoleProvider", () => ({
  useRole: () => ({ role: "OWNER", canPerform: (resource: string, action: string) =>
    resource === "printing_receipt.processed" && action === "update" && state.canEdit }),
}));
vi.mock("@/hooks/useTransactions", () => ({
  useTransactionHistory: () => ({ data: { data: state.transactions, pagination: { total: 1, totalPages: 1 } }, isLoading: false }),
  useTransaction: () => ({ data: null }),
  useUpdateTransaction: vi.fn(), useUpdateTransactionInvoiceDate: vi.fn(),
  useDeleteTransaction: vi.fn(), useRejectTransaction: vi.fn(),
}));
vi.mock("@/features/surat-jalan/components/SuratJalanBundleButton", () => ({
  SuratJalanBundleButton: () => null, isTransactionEligibleForSuratJalan: () => true,
}));
vi.mock("@/features/surat-jalan/components/SuratJalanCreateModal", () => ({ SuratJalanCreateModal: () => null }));

import HistoryClientPage from "../HistoryClientPage";

const actions = () => renderToStaticMarkup(createElement(HistoryClientPage))
  .match(/>Lihat Struk<\/button>\s*<button\b[^>]*>Edit nota diproses<\/button>/g) ?? [];

describe("Edit nota percetakan dari Riwayat", () => {
  beforeEach(() => {
    state.canEdit = true;
    state.transactions = [{
      id: "tx-contoh", invoiceNumber: "INV-CONTOH", draftNumber: null,
      subtotal: 81000, discount: 0, tax: 0, total: 81000, paymentMethod: "CASH",
      amountPaid: 81000, change: 0, cashierId: "cashier", customerName: "Pelanggan Contoh",
      salesName: null, salespersonId: null, note: null, status: "COMPLETED",
      createdAt: "2026-10-29T03:00:00.000Z", items: [],
      printingReceipt: { id: "nota-contoh", number: "NT-CONTOH", subcategory: "SPANDUK" },
    }];
  });

  it.each(["COMPLETED", "DP", "PENDING_APPROVAL"])("menampilkan aksi di desktop dan ponsel untuk %s", status => {
    state.transactions[0].status = status;
    expect(actions()).toHaveLength(2);
  });

  it.each(["DRAFT", "VOIDED", "REFUNDED"])("menyembunyikan aksi untuk status %s", status => {
    state.transactions[0].status = status;
    expect(actions()).toHaveLength(0);
  });

  it("memerlukan izin edit nota diproses", () => {
    state.canEdit = false;
    expect(actions()).toHaveLength(0);
  });

  it("tidak menampilkan aksi pada invoice reguler atau percetakan tanpa dokumen nota", () => {
    delete state.transactions[0].printingReceipt;
    expect(actions()).toHaveLength(0);
    state.transactions[0].transactionCategory = "PERCETAKAN";
    expect(actions()).toHaveLength(0);
  });

  it("tidak menampilkan aksi untuk transaksi gabungan", () => {
    state.transactions[0].suratJalanSummary = { count: 1, confirmedCount: 1, pendingCount: 0, deliveredQuantity: 1, totalQuantity: 1 };
    expect(actions()).toHaveLength(0);
  });
});
