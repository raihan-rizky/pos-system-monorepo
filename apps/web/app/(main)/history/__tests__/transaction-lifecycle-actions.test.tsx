import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  role: "OWNER", canUpdate: true, canDelete: true, transactions: [] as any[],
}));

vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/hooks/useProducts", () => ({ useCategories: () => ({ data: [] }) }));
vi.mock("@/components/providers/RoleProvider", () => ({
  useRole: () => ({
    role: state.role,
    canPerform: (resource: string, action: string) => resource === "transaction" && (
      (action === "update" && state.canUpdate) || (action === "delete" && state.canDelete)
    ),
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
vi.mock("../TransactionActionMenu", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../TransactionActionMenu")>();
  return {
    ...actual,
    TransactionActionMenu: (props: Parameters<typeof actual.TransactionActionMenu>[0]) =>
      createElement(actual.TransactionActionMenu, { ...props, initialOpen: true }),
  };
});

import HistoryClientPage from "../HistoryClientPage";

const renderActions = () => {
  const html = renderToStaticMarkup(createElement(HistoryClientPage));
  const labels = [...html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)]
    .map(([, content]) => content.replace(/<[^>]+>/g, "").trim());
  return {
    deleteCount: labels.filter((label) => label === "Hapus").length,
    voidCount: labels.filter((label) => label === "Void").length,
  };
};

const transactionKinds = [
  { kind: "ATK", fields: {} },
  { kind: "nota percetakan", fields: { printingReceipt: { id: "receipt-example", number: "NT-CONTOH", subcategory: "SPANDUK" } } },
  { kind: "subkategori percetakan", fields: { printingSubcategory: "SPANDUK" } },
  { kind: "surat jalan", fields: { suratJalanSummary: { count: 2, confirmedCount: 1, pendingCount: 1, deliveredQuantity: 1, totalQuantity: 2 } } },
];

describe("Hapus dan Void di Riwayat desktop serta ponsel", () => {
  beforeEach(() => {
    state.role = "OWNER";
    state.canUpdate = true;
    state.canDelete = true;
    state.transactions = [{
      id: "transaction-example", invoiceNumber: "INV-CONTOH", draftNumber: null,
      subtotal: 81000, discount: 0, tax: 0, total: 81000, paymentMethod: "CASH",
      amountPaid: 81000, change: 0, cashierId: "cashier-example", customerName: "Pelanggan Contoh",
      salesName: null, salespersonId: null, note: null, status: "COMPLETED",
      createdAt: "2026-11-05T03:00:00.000Z", items: [],
    }];
  });

  it.each(transactionKinds)("menawarkan kedua aksi untuk $kind di kedua susunan", ({ fields }) => {
    Object.assign(state.transactions[0], fields);
    expect(renderActions()).toEqual({ deleteCount: 2, voidCount: 2 });
  });

  it.each(["DRAFT", "PENDING_APPROVAL", "COMPLETED", "DP"])("menawarkan Void untuk status %s", (status) => {
    state.transactions[0].status = status;
    expect(renderActions()).toEqual({ deleteCount: 2, voidCount: 2 });
  });

  it.each(["VOIDED", "REFUNDED"])("hanya menawarkan Hapus untuk status terminal %s", (status) => {
    state.transactions[0].status = status;
    expect(renderActions()).toEqual({ deleteCount: 2, voidCount: 0 });
  });

  it("menjaga izin Hapus dan Void secara terpisah", () => {
    state.canDelete = false;
    expect(renderActions()).toEqual({ deleteCount: 0, voidCount: 2 });
    state.canDelete = true;
    state.canUpdate = false;
    expect(renderActions()).toEqual({ deleteCount: 2, voidCount: 0 });
  });

  it.each(transactionKinds)("menyembunyikan kedua aksi tanpa grant untuk $kind", ({ fields }) => {
    Object.assign(state.transactions[0], fields);
    state.canUpdate = false;
    state.canDelete = false;
    expect(renderActions()).toEqual({ deleteCount: 0, voidCount: 0 });
  });

  describe.each(["OWNER", "ADMIN", "CASHIER", "SALES"])("grant RBAC per peran %s", (role) => {
    it.each([
      { update: false, delete: false, expected: { deleteCount: 0, voidCount: 0 } },
      { update: true, delete: false, expected: { deleteCount: 0, voidCount: 2 } },
      { update: false, delete: true, expected: { deleteCount: 2, voidCount: 0 } },
      { update: true, delete: true, expected: { deleteCount: 2, voidCount: 2 } },
    ])("mengikuti grant pada desktop dan ponsel: %j", ({ update, delete: remove, expected }) => {
      state.role = role;
      state.canUpdate = update;
      state.canDelete = remove;
      expect(renderActions()).toEqual(expected);
    });
  });
});
