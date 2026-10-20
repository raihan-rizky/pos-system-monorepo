import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ReceiptModal } from "@/components/ReceiptModal";
import { InvoicePdfDocument } from "../../components/InvoicePdfDocument";
import { buildInvoicePdfData } from "../invoice-pdf-data";
import type { Transaction } from "@/hooks/useTransactions";

vi.mock("@/hooks/useSettings", () => ({ useStoreSettings: () => ({ data: null }) }));
vi.mock("@/components/providers/RoleProvider", () => ({ useRole: () => ({ canPerform: () => true }) }));
vi.mock("@/features/surat-jalan/components/SuratJalanBundleButton", () => ({ SuratJalanBundleButton: () => null }));
vi.mock("@pos/ui", () => ({
  Modal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Button: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
}));
vi.mock("@react-pdf/renderer", () => ({
  StyleSheet: { create: (styles: unknown) => styles },
  Document: "document", Page: "page", View: "view", Text: "text", Image: "image",
}));

const store = { name: "Toko Test", address: "Cilegon", phone: "123" };
const transaction = {
  id: "tx-payment", invoiceNumber: "INV-20261020-0001", draftNumber: null,
  subtotal: 100000, discount: 0, tax: 0, total: 100000,
  amountPaid: 100000, change: 0, paymentMethod: "CASH", status: "COMPLETED",
  customerName: null, salesName: null, salespersonId: null, note: null,
  items: [], createdAt: "2026-10-20T03:00:00Z",
} as Transaction;

function textContent(node: React.ReactNode): string {
  return React.Children.toArray(node).map(child =>
    React.isValidElement<{ children?: React.ReactNode }>(child)
      ? textContent(child.props.children)
      : String(child),
  ).join("");
}

describe.each(["preview", "PDF"])("regular receipt payment header in %s", output => {
  it.each([
    { name: "cash", fields: {}, expected: "TUNAI (LUNAS)" },
    { name: "split payment", fields: { payments: [{ method: "CASH", amount: 40000 }, { method: "TRANSFER", amount: 60000 }] }, expected: "TUNAI, TRANSFER (LUNAS)" },
    { name: "down payment", fields: { status: "DP", amountPaid: 25000 }, expected: "TUNAI (UANG MUKA (DP))" },
    { name: "pending unpaid", fields: { status: "PENDING_APPROVAL", amountPaid: 0 }, expected: "- (MENUNGGU PERSETUJUAN)" },
    { name: "voided", fields: { status: "VOIDED" }, expected: "TUNAI (DIBATALKAN)" },
    { name: "refunded", fields: { status: "REFUNDED" }, expected: "TUNAI (DIREFUND)" },
  ])("combines method and status for $name", ({ fields, expected }) => {
    const receipt = { ...transaction, ...fields } as Transaction;
    if (output === "preview") {
      const html = renderToStaticMarkup(<ReceiptModal open onClose={vi.fn()} transaction={receipt} />);
      const row = html.match(/<div class="flex"><span class="w-24">Pembayaran<\/span>(.*?)<\/div>/)?.[1] ?? "";
      expect(row.replace(/<[^>]*>/g, "")).toBe(`:${expected}`);
      expect(html).not.toMatch(/<span[^>]*>Status<\/span>/);
    } else {
      const pdf = InvoicePdfDocument({ data: buildInvoicePdfData(receipt, store), paperSize: { w: 215.9, h: 139.7 } });
      const content = textContent(pdf);
      expect(content).toContain(`Pembayaran:${expected}`);
      expect(content).not.toContain("Status:");
    }
  });
});
