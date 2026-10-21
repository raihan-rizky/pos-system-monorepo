import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Transaction } from "@/hooks/useTransactions";

const history = vi.hoisted(() => ({ transactions: [] as Transaction[] }));

vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/hooks/useProducts", () => ({
  useCategories: () => ({ data: [] }),
}));
vi.mock("@/components/providers/RoleProvider", () => ({
  useRole: () => ({ role: "CASHIER", canPerform: () => false }),
}));
vi.mock("@/hooks/useTransactions", () => ({
  useTransactionHistory: () => ({
    data: {
      data: history.transactions,
      pagination: { total: 1, totalPages: 1 },
    },
    isLoading: false,
  }),
  useTransaction: () => ({ data: null }),
  useUpdateTransaction: vi.fn(),
  useUpdateTransactionInvoiceDate: vi.fn(),
  useDeleteTransaction: vi.fn(),
  useRejectTransaction: vi.fn(),
}));

import HistoryClientPage from "../HistoryClientPage";

describe("Riwayat payment status in desktop and mobile views", () => {
  beforeEach(() => {
    history.transactions = [{
      id: "tempo-transaction",
      invoiceNumber: "INV-TEMPO-TEST",
      draftNumber: null,
      subtotal: 100_000,
      discount: 0,
      tax: 0,
      total: 100_000,
      paymentMethod: "TEMPO",
      amountPaid: 50_000,
      change: 0,
      cashierId: "cashier-1",
      customerName: "Pelanggan Tempo",
      salesName: null,
      salespersonId: null,
      note: null,
      status: "COMPLETED",
      createdAt: "2026-10-14T03:00:00.000Z",
      items: [],
    }];
  });

  it("starts with parent categories and an inactive subcategory selection", () => {
    const html = renderToStaticMarkup(createElement(HistoryClientPage));
    expect(html).toMatch(/<select[^>]*aria-label="Kategori transaksi"/);
    expect(html).toContain('<option value="ATK">ATK</option>');
    expect(html).toContain('<option value="PERCETAKAN">PERCETAKAN</option>');
    expect(html).toMatch(/<select[^>]*aria-label="Subkategori transaksi"[^>]*disabled=""/);
    expect(html).toContain("Pilih kategori dahulu");
  });

  it("identifies printing notes in both history layouts", () => {
    Object.assign(history.transactions[0], {
      transactionCategory: "PERCETAKAN", printingSubcategory: "SPANDUK",
      printingReceipt: { id: "receipt-1", subcategory: "SPANDUK", number: "SP-001" },
    });
    const html = renderToStaticMarkup(createElement(HistoryClientPage));
    expect(html.match(/>Percetakan<\/span>/g)).toHaveLength(2);
    expect(html.match(/>Spanduk<\/span>/g)).toHaveLength(2);
    expect(html.match(/Nota SP-001/g)).toHaveLength(2);
  });

  it("places category and subcategory in their own desktop column after the invoice", () => {
    Object.assign(history.transactions[0], {
      transactionCategory: "PERCETAKAN", printingSubcategory: "SPANDUK",
      printingReceipt: { id: "receipt-1", subcategory: "SPANDUK", number: "SP-001" },
    });
    const html = renderToStaticMarkup(createElement(HistoryClientPage));
    const headers = [...html.matchAll(/<th\b[^>]*>(.*?)<\/th>/g)].map((match) => match[1]);
    const body = html.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/)?.[1] ?? "";
    const cells = [...body.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map((match) => match[1]);

    expect(headers.slice(0, 4)).toEqual(["Tanggal", "No. Invoice", "Kategori", "Pelanggan"]);
    expect(cells).toHaveLength(headers.length);
    expect(cells[1]).toContain("INV-TEMPO-TEST");
    expect(cells[1]).toContain("Nota SP-001");
    expect(cells[1]).not.toMatch(/Percetakan|Spanduk/);
    expect(cells[2]).toContain("Percetakan");
    expect(cells[2]).toContain("Spanduk");
    expect(cells[2]).not.toContain("Nota SP-001");
    expect(cells[3]).toContain("Pelanggan Tempo");
  });

  it("omits the repeated printing note number when it matches the invoice in both layouts", () => {
    Object.assign(history.transactions[0], {
      invoiceNumber: "NT-SP-20261021-000002",
      transactionCategory: "PERCETAKAN", printingSubcategory: "SPANDUK",
      printingReceipt: { id: "receipt-1", subcategory: "SPANDUK", number: "NT-SP-20261021-000002" },
    });
    const html = renderToStaticMarkup(createElement(HistoryClientPage));

    expect(html.match(/NT-SP-20261021-000002/g)).toHaveLength(2);
    expect(html).not.toContain("Nota NT-SP-20261021-000002");
  });

  it("uses the printing receipt subcategory when the transaction subcategory is missing", () => {
    Object.assign(history.transactions[0], {
      printingReceipt: { id: "receipt-1", subcategory: "STEMPEL", number: "ST-001" },
    });
    const html = renderToStaticMarkup(createElement(HistoryClientPage));

    expect(html.match(/>Percetakan<\/span>/g)).toHaveLength(2);
    expect(html.match(/>Stempel<\/span>/g)).toHaveLength(2);
  });

  it("keeps ATK transactions in the category column without inventing a subcategory", () => {
    const html = renderToStaticMarkup(createElement(HistoryClientPage));
    const body = html.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/)?.[1] ?? "";
    const cells = [...body.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map((match) => match[1]);

    expect(cells[1]).not.toContain("ATK");
    expect(cells[2]).toContain(">ATK</span>");
    expect(cells[2]).not.toMatch(/Percetakan|Spanduk|Nota/);
  });

  it.each([0, 50_000])("shows Tempo as unpaid when only Rp %i has been paid", (amountPaid) => {
    history.transactions[0].amountPaid = amountPaid;
    const html = renderToStaticMarkup(createElement(HistoryClientPage));

    expect(html).not.toMatch(/>\s*Lunas\s*<\/span>/);
    expect(html.match(/aria-label="TEMPO\/TAGIHAN, Belum lunas"/g) ?? []).toHaveLength(2);
  });

  it("shows Tempo as settled after the remaining balance has been paid", () => {
    history.transactions[0].amountPaid = 100_000;
    const html = renderToStaticMarkup(createElement(HistoryClientPage));

    expect(html.match(/aria-label="TEMPO\/TAGIHAN, Lunas"/g) ?? []).toHaveLength(2);
    expect(html).not.toContain("Belum lunas");
  });

  it.each(["PENDING_APPROVAL", "DRAFT", "VOIDED", "REFUNDED"])(
    "preserves the lifecycle badge for %s Tempo transactions",
    (status) => {
      history.transactions[0].status = status;
      const html = renderToStaticMarkup(createElement(HistoryClientPage));

      expect(html).not.toContain('aria-label="TEMPO/TAGIHAN');
      expect(html).not.toMatch(/>\s*Lunas\s*<\/span>/);
    },
  );

  it("keeps pending approval visible when the cashier has not approved the sale", () => {
    history.transactions[0].cashierId = null;
    history.transactions[0].requestedById = "sales-1";
    const html = renderToStaticMarkup(createElement(HistoryClientPage));

    expect(html).not.toContain('aria-label="TEMPO/TAGIHAN');
    expect(html).not.toMatch(/>\s*Lunas\s*<\/span>/);
  });

  it("preserves Lunas for fully paid cash sales", () => {
    history.transactions[0].paymentMethod = "CASH";
    history.transactions[0].amountPaid = 100_000;
    const html = renderToStaticMarkup(createElement(HistoryClientPage));

    expect(html.match(/>\s*Lunas\s*<\/span>/g)).toHaveLength(2);
  });

  it("preserves DP for partial cash payments", () => {
    history.transactions[0].paymentMethod = "CASH";
    history.transactions[0].status = "DP";
    const html = renderToStaticMarkup(createElement(HistoryClientPage));

    expect(html).not.toContain('aria-label="TEMPO/TAGIHAN');
    expect(html).not.toMatch(/>\s*Lunas\s*<\/span>/);
  });

  it.each(["CASH", "TRANSFER", "QRIS"])(
    "shows the received DP and outstanding balance for %s in both layouts",
    (paymentMethod) => {
      Object.assign(history.transactions[0], {
        status: "DP", paymentMethod, total: 1_000_000, amountPaid: 300_000,
      });
      const html = renderToStaticMarkup(createElement(HistoryClientPage));
      const summaries = [...html.matchAll(/<dl\b[^>]*aria-label="Rincian pembayaran DP"[^>]*>([\s\S]*?)<\/dl>/g)];

      expect(summaries).toHaveLength(2);
      for (const [, summary] of summaries) {
        expect(summary).toMatch(/DP masuk<\/dt>\s*<dd[^>]*>Rp\s*300\.000<\/dd>/);
        expect(summary).toMatch(/Sisa<\/dt>\s*<dd[^>]*>Rp\s*700\.000<\/dd>/);
      }
    },
  );

  it("uses the total received across payment methods for DP", () => {
    Object.assign(history.transactions[0], {
      status: "DP", paymentMethod: "CASH", total: 1_000_000, amountPaid: 450_000,
      payments: [{ method: "CASH", amount: 150_000 }, { method: "TRANSFER", amount: 300_000 }],
    });
    const html = renderToStaticMarkup(createElement(HistoryClientPage));

    expect(html.match(/<dd[^>]*>Rp\s*450\.000<\/dd>/g)).toHaveLength(2);
    expect(html.match(/<dd[^>]*>Rp\s*550\.000<\/dd>/g)).toHaveLength(2);
  });

  it.each(["COMPLETED", "VOIDED", "REFUNDED", "DRAFT", "PENDING_APPROVAL"])(
    "does not label %s transactions as received DP",
    (status) => {
      Object.assign(history.transactions[0], { status, paymentMethod: "CASH" });
      const html = renderToStaticMarkup(createElement(HistoryClientPage));
      expect(html).not.toContain('aria-label="Rincian pembayaran DP"');
    },
  );

  it("does not mislabel Tempo installments as DP", () => {
    history.transactions[0].status = "DP";
    const html = renderToStaticMarkup(createElement(HistoryClientPage));
    expect(html).not.toContain('aria-label="Rincian pembayaran DP"');
  });
});
