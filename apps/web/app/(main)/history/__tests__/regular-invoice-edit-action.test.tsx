import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ role: "OWNER", canUpdate: true, transactions: [] as any[] }));

vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/hooks/useProducts", () => ({ useCategories: () => ({ data: [] }) }));
vi.mock("@/components/providers/RoleProvider", () => ({
  useRole: () => ({
    role: state.role,
    canPerform: (resource: string, action: string) => resource === "transaction" && action === "update" && state.canUpdate,
  }),
}));
vi.mock("@/hooks/useTransactions", () => ({
  useTransactionHistory: () => ({ data: { data: state.transactions, pagination: { total: 1, totalPages: 1 } }, isLoading: false }),
  useTransaction: () => ({ data: null }),
  useUpdateTransaction: vi.fn(),
  useUpdateTransactionInvoiceDate: vi.fn(),
  useDeleteTransaction: vi.fn(),
  useRejectTransaction: vi.fn(),
}));
vi.mock("@/features/surat-jalan/components/SuratJalanBundleButton", () => ({
  SuratJalanBundleButton: () => null,
  isTransactionEligibleForSuratJalan: () => true,
}));
vi.mock("@/features/surat-jalan/components/SuratJalanCreateModal", () => ({ SuratJalanCreateModal: () => null }));

import HistoryClientPage from "../HistoryClientPage";
import { TransactionActionMenu } from "../TransactionActionMenu";

const renderPage = () => renderToStaticMarkup(createElement(HistoryClientPage));
const adjacentActions = (html: string) => html.match(/>Lihat Struk<\/button>\s*<button\b[^>]*>Ubah<\/button>/g) ?? [];

describe("Aksi ubah invoice reguler di Riwayat", () => {
  beforeEach(() => {
    state.role = "OWNER";
    state.canUpdate = true;
    state.transactions = [{
      id: "transaction-example", invoiceNumber: "INV-CONTOH", draftNumber: null,
      subtotal: 81000, discount: 0, tax: 0, total: 81000, paymentMethod: "CASH",
      amountPaid: 81000, change: 0, cashierId: "cashier-example", customerName: "Pelanggan Contoh",
      salesName: null, salespersonId: null, note: null, status: "COMPLETED",
      createdAt: "2026-10-29T03:00:00.000Z", items: [],
    }];
  });

  it.each(["COMPLETED", "DP", "DRAFT", "PENDING_APPROVAL", "VOIDED"])(
    "menempatkan Ubah setelah Lihat Struk di desktop dan ponsel untuk status %s",
    (status) => {
      state.transactions[0].status = status;
      expect(adjacentActions(renderPage())).toHaveLength(2);
    },
  );

  it("tidak menampilkan Ubah ketika pengguna tidak memiliki izin update", () => {
    state.canUpdate = false;
    expect(adjacentActions(renderPage())).toHaveLength(0);
  });

  it("tidak menampilkan Ubah untuk role Sales walaupun memiliki izin update", () => {
    state.role = "SALES";
    expect(adjacentActions(renderPage())).toHaveLength(0);
  });

  it.each([
    { printingReceipt: { id: "receipt-example", number: "NT-CONTOH", subcategory: "SPANDUK" } },
    { printingSubcategory: "SPANDUK" },
    { suratJalanSummary: { count: 1, confirmedCount: 1, pendingCount: 0, deliveredQuantity: 1, totalQuantity: 1 } },
  ])("tidak menampilkan Ubah untuk nota percetakan atau transaksi gabungan", (fields) => {
    Object.assign(state.transactions[0], fields);
    expect(adjacentActions(renderPage())).toHaveLength(0);
  });

  it("menyisakan upload bukti di menu tanpa menduplikasi Ubah", () => {
    const html = renderToStaticMarkup(createElement(TransactionActionMenu, {
      tx: state.transactions[0], isSalesRole: false, canUpdateTransactions: true,
      canDeleteTransactions: false, canApproveTransactions: false, canRejectTransactions: false,
      canApproveDrafts: false, canVoid: false, canChangeInvoiceDate: false, isPending: false,
      isBundled: false, onEditInvoiceDate: () => {}, onDelete: () => {},
      onApprove: () => {}, onReject: () => {}, onApproveDraft: () => {}, onVoid: () => {}, initialOpen: true,
    }));
    expect(html).toContain("Upload Bukti Transaksi");
    expect(html).not.toMatch(/>\s*Ubah\s*<\/button>/);
  });
});
