import { describe, test, expect, vi } from "vitest";
import React from "react";
import { generateInvoicePdf } from "../generate-invoice-pdf";
import type { Transaction } from "@/hooks/useTransactions";
import type { StoreSettings } from "../invoice-pdf-data";

const pdfMock = vi.hoisted(() =>
  vi.fn(() => ({
    toBlob: vi.fn(async () => new Blob([new Uint8Array([37, 80, 68, 70])])),
  })),
);

vi.mock("@react-pdf/renderer", () => ({
  pdf: pdfMock,
  StyleSheet: {
    create: (styles: unknown) => styles,
  },
  Document: "Document",
  Image: "Image",
  Page: "Page",
  Text: "Text",
  View: "View",
}));

/* ── Fixtures ───────────────────────────────────────────────────── */

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "txn-001",
    invoiceNumber: "INV-20260601-ABCD",
    draftNumber: null,
    subtotal: 100000,
    discount: 0,
    tax: 0,
    total: 100000,
    paymentMethod: "CASH",
    amountPaid: 150000,
    change: 50000,
    customerName: "PT Maju Jaya",
    salesName: "Budi",
    salespersonId: "sp-1",
    salesperson: { name: "Budi" },
    note: null,
    status: "COMPLETED",
    createdAt: "2026-06-01T10:00:00.000Z",
    items: [
      {
        id: "item-1",
        productId: "prod-1",
        printingServiceId: null,
        rawMaterialProductId: null,
        productName: "Kertas HVS A4 70gsm",
        size: null,
        material: null,
        quantity: 10,
        unitPrice: 5000,
        subtotal: 50000,
        product: { unit: "rim" },
        printingService: null,
      },
      {
        id: "item-2",
        productId: "prod-2",
        printingServiceId: null,
        rawMaterialProductId: null,
        productName: "Tinta Canon 810",
        size: null,
        material: null,
        quantity: 2,
        unitPrice: 25000,
        subtotal: 50000,
        product: { unit: "pcs" },
        printingService: null,
      },
    ],
    ...overrides,
  };
}

const DEFAULT_STORE: StoreSettings = {
  name: "TOKO TELADAN",
  address: "Jl. Temu Putih No.30 Cilegon",
  phone: "0254 393022",
};

const HALF_A4_LANDSCAPE = { w: 215, h: 165 };
const A4_PORTRAIT = { w: 210, h: 297 };

/* ══════════════════════════════════════════════════════════════════
   generateInvoicePdf
   ══════════════════════════════════════════════════════════════════ */

describe("generateInvoicePdf", () => {
  test("returns a non-empty Uint8Array for a valid COMPLETED transaction", async () => {
    const result = await generateInvoicePdf(
      makeTransaction(),
      DEFAULT_STORE,
      HALF_A4_LANDSCAPE
    );
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.byteLength).toBeGreaterThan(0);
  }, 15000);

  test("generates PDF for a DP transaction", async () => {
    const txn = makeTransaction({
      status: "DP",
      total: 500000,
      amountPaid: 200000,
      change: 0,
    });
    const result = await generateInvoicePdf(txn, DEFAULT_STORE, A4_PORTRAIT);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.byteLength).toBeGreaterThan(0);
  }, 15000);

  test("generates PDF for a VOIDED transaction", async () => {
    const txn = makeTransaction({ status: "VOIDED" });
    const result = await generateInvoicePdf(txn, DEFAULT_STORE, HALF_A4_LANDSCAPE);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.byteLength).toBeGreaterThan(0);
  }, 15000);

  test("generates PDF with no items (empty table)", async () => {
    const txn = makeTransaction({ items: [] });
    const result = await generateInvoicePdf(txn, DEFAULT_STORE, HALF_A4_LANDSCAPE);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.byteLength).toBeGreaterThan(0);
  }, 15000);

  test("generates PDF for different paper sizes", async () => {
    const txn = makeTransaction();
    const halfA4 = await generateInvoicePdf(txn, DEFAULT_STORE, HALF_A4_LANDSCAPE);
    const a4 = await generateInvoicePdf(txn, DEFAULT_STORE, A4_PORTRAIT);
    // Both should produce valid outputs but potentially different sizes
    expect(halfA4.byteLength).toBeGreaterThan(0);
    expect(a4.byteLength).toBeGreaterThan(0);
  }, 15000);

  test("generates PDF for transaction with many items (>5, no filler rows)", async () => {
    const items = Array.from({ length: 10 }, (_, i) => ({
      id: `item-${i}`,
      productId: `p${i}`,
      printingServiceId: null,
      rawMaterialProductId: null,
      productName: `Product ${i + 1}`,
      size: null,
      material: null,
      quantity: i + 1,
      unitPrice: 10000 * (i + 1),
      subtotal: 10000 * (i + 1) * (i + 1),
      product: { unit: "pcs" },
      printingService: null,
    }));
    const txn = makeTransaction({ items });
    const result = await generateInvoicePdf(txn, DEFAULT_STORE, HALF_A4_LANDSCAPE);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.byteLength).toBeGreaterThan(0);
  }, 15000);
});
