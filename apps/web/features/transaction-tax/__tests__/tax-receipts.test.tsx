import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ReceiptModal } from "@/components/ReceiptModal";
import { DraftReceiptModal } from "@/components/DraftReceiptModal";
import { buildInvoicePdfData } from "@/features/invoice-pdf/helpers/invoice-pdf-data";
import { buildDraftPdfData } from "@/features/invoice-pdf/helpers/draft-pdf-data";
import { DraftPdfDocument } from "@/features/invoice-pdf/components/DraftPdfDocument";
import { InvoicePdfDocument } from "@/features/invoice-pdf/components/InvoicePdfDocument";
import type { Transaction } from "@/hooks/useTransactions";

vi.mock("@/hooks/useSettings", () => ({ useStoreSettings: () => ({ data: null }) }));
vi.mock("@react-pdf/renderer", () => ({ StyleSheet: { create: (styles: unknown) => styles }, Document: "document", Page: "page", View: "view", Text: "text", Image: "image" }));
vi.mock("@tanstack/react-query", async importOriginal => ({ ...await importOriginal<object>(), useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock("@/components/providers/RoleProvider", () => ({ useRole: () => ({ canPerform: () => true }) }));
vi.mock("@/features/surat-jalan/components/SuratJalanBundleButton", () => ({ SuratJalanBundleButton: () => null }));
vi.mock("@pos/ui", () => ({ Modal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>, Button: ({ children }: { children: React.ReactNode }) => <button>{children}</button> }));

const store = { name: "Toko", address: "Cilegon", phone: "123" };
const transaction = { id: "tx-1", subtotal: 706000, discount: 0, tax: 77660, total: 783660, taxRate: 12, taxMethod: "DPP_NILAI_LAIN", status: "DRAFT", amountPaid: 0, change: 0, paymentMethod: "CASH", items: [], createdAt: "2026-10-18T03:00:00Z" } as unknown as Transaction;

describe("tax receipt output", () => {
  it("places the regular PDF tax percentage in the header before the item table", () => {
    const data = buildInvoicePdfData({ ...transaction, status: "COMPLETED", taxRate: 12 } as Transaction, store);
    const text = (node: React.ReactNode): string => React.Children.toArray(node).map(child => React.isValidElement<{ children?: React.ReactNode }>(child) ? text(child.props.children) : String(child)).join(" ");
    const content = text(InvoicePdfDocument({ data, paperSize: { w: 215.9, h: 139.7 } }));
    expect(content.indexOf("Pajak")).toBeLessThan(content.indexOf("Nama Barang"));
    expect(content.match(/Pajak/g)).toHaveLength(1);
  });
  it("prints regular tax as a percentage", () => {
    const regular = { ...transaction, status: "COMPLETED", taxMethod: "STANDARD", tax: 84720, total: 790720, amountPaid: 790720 } as Transaction;
    const html = renderToStaticMarkup(<ReceiptModal open onClose={vi.fn()} transaction={regular} />);
    expect(html).toContain("Pajak");
    expect(html).toContain("12%");
    expect(html).not.toContain("84.720");
    const printed = html.slice(html.indexOf('id="print-receipt"'));
    expect(printed.indexOf("Pajak")).toBeLessThan(printed.indexOf("Nama Barang"));
    expect(printed.match(/Pajak/g)).toHaveLength(1);
    expect(buildInvoicePdfData(regular, store)).toMatchObject({ taxRateFormatted: "12%" });
  });
  it("prints DPP and PPN as rupiah and uses the final total in words", () => {
    const html = renderToStaticMarkup(<DraftReceiptModal open onClose={vi.fn()} transaction={transaction} />);
    expect(html).toContain("DPP Nilai Lain");
    expect(html).toContain("647.167");
    expect(html).toContain("PPN");
    expect(html).toContain("77.660");
    expect(html).toContain("783.660");
    expect(buildDraftPdfData(transaction, store)).toMatchObject({ netAmountFormatted: "706.000", dppFormatted: "647.167", taxFormatted: "77.660", grandTotal: 783660 });
  });

  it("preserves the statutory 12% rate on a finalized DPP quotation instead of inferring its effective 11%", () => {
    const finalized = { ...transaction, status: "COMPLETED", amountPaid: 783660 } as Transaction;
    const html = renderToStaticMarkup(<ReceiptModal open onClose={vi.fn()} transaction={finalized} />);
    expect(html).toContain("12%");
    expect(html).not.toContain("11%");
    expect(buildInvoicePdfData(finalized, store)).toMatchObject({ taxRateFormatted: "12%", totals: { grandTotal: 783660 } });
  });

  it.each([
    { rate: 0, tax: 0, total: 90000, formatted: "0%" },
    { rate: 12.5, tax: 11250, total: 101250, formatted: "12,5%" },
    { rate: 100, tax: 90000, total: 180000, formatted: "100%" },
  ])("keeps the discounted regular receipt and PDF consistent for $formatted", ({ rate, tax, total, formatted }) => {
    const discounted = { ...transaction, subtotal: 100000, discount: 10000, taxRate: rate, taxMethod: "STANDARD", tax, total, amountPaid: total, status: "COMPLETED" } as Transaction;
    const html = renderToStaticMarkup(<ReceiptModal open onClose={vi.fn()} transaction={discounted} />);
    expect(html).toContain(formatted);
    expect(buildInvoicePdfData(discounted, store)).toMatchObject({ taxRateFormatted: formatted, totals: { grandTotal: total, amountPaid: total, remaining: 0 } });
  });

  it("uses the amount after discount for quotation DPP, PPN and terbilang", () => {
    const discounted = { ...transaction, discount: 106000, tax: 66000, total: 666000 } as Transaction;
    const html = renderToStaticMarkup(<DraftReceiptModal open onClose={vi.fn()} transaction={discounted} />);
    expect(html).toContain("550.000");
    expect(html).toContain("66.000");
    expect(html).toContain("666.000");
    expect(buildDraftPdfData(discounted, store)).toMatchObject({ netAmountFormatted: "600.000", dppFormatted: "550.000", taxFormatted: "66.000", grandTotal: 666000, terbilangText: "Enam Ratus Enam Puluh Enam Ribu Rupiah" });
  });

  it("keeps quotation currency rows when the saved PPN rate is zero", () => {
    const zero = { ...transaction, taxRate: 0, tax: 0, total: 706000 } as Transaction;
    const html = renderToStaticMarkup(<DraftReceiptModal open onClose={vi.fn()} transaction={zero} />);
    expect(html).toContain("DPP Nilai Lain");
    expect(html).toContain("647.167");
    expect(buildDraftPdfData(zero, store)).toMatchObject({ taxFormatted: "0", grandTotal: 706000 });
  });
});


describe("item discount receipt output", () => {
  const discounted = {
    ...transaction, subtotal: 25000, discount: 2000, tax: 0, total: 23000,
    items: [{ id: "line-1", productName: "Kertas", quantity: 3, unitPrice: 10000, discount: 5000, subtotal: 25000 }],
  } as unknown as Transaction;
  const plain = {
    ...discounted, subtotal: 30000, total: 28000,
    items: [{ ...discounted.items[0], discount: undefined, subtotal: 30000 }],
  } as Transaction;
  const documentText = (node: React.ReactNode): string => React.Children.toArray(node).map(child => React.isValidElement<{ children?: React.ReactNode }>(child) ? documentText(child.props.children) : String(child)).join(" ");

  it.each([ReceiptModal, DraftReceiptModal])("shows the line discount with the net subtotal in HTML receipts", Component => {
    const html = renderToStaticMarkup(<Component open onClose={vi.fn()} transaction={discounted} />);
    expect(html).toContain("Diskon item Rp5.000");
    expect(html).toContain("25.000");
    expect(html).toContain("10.000");
    const noDiscount = renderToStaticMarkup(<Component open onClose={vi.fn()} transaction={plain} />);
    expect(noDiscount).not.toContain("Diskon item");
  });

  it("shows item discounts on invoice PDFs without subtracting them again", () => {
    const data = buildInvoicePdfData(discounted, store);
    const content = documentText(InvoicePdfDocument({ data, paperSize: { w: 215.9, h: 139.7 } }));
    expect(content).toContain("Diskon item Rp5.000");
    expect(data.items[0]).toMatchObject({ unitPriceFormatted: "10.000", subtotalFormatted: "25.000" });
    expect(data.totals.grandTotal).toBe(23000);
    expect(documentText(InvoicePdfDocument({ data: buildInvoicePdfData(plain, store), paperSize: { w: 215.9, h: 139.7 } }))).not.toContain("Diskon item");
  });

  it("shows item discounts on quotation PDFs while keeping invoice discounts separate", () => {
    const data = buildDraftPdfData(discounted, store);
    const content = documentText(DraftPdfDocument({ data }));
    expect(content).toContain("Diskon item Rp5.000");
    expect(data.items[0]).toMatchObject({ unitPriceFormatted: "10.000", subtotalFormatted: "25.000" });
    expect(data.netAmountFormatted).toBe("23.000");
    expect(documentText(DraftPdfDocument({ data: buildDraftPdfData(plain, store) }))).not.toContain("Diskon item");
  });
});
