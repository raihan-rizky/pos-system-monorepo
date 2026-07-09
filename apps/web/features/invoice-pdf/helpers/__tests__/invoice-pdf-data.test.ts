import { describe, test, expect } from "vitest";
import {
  buildInvoicePdfData,
  getStatusDisplay,
  computeTotals,
  formatReceiptSize,
  formatIndonesianDate,
} from "../invoice-pdf-data";
import type { Transaction } from "@/hooks/useTransactions";

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
    amountPaid: 100000,
    change: 0,
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

const DEFAULT_STORE = {
  name: "TOKO TELADAN",
  address: "Jl. Temu Putih No.30 Cilegon",
  phone: "0254 393022",
};

/* ══════════════════════════════════════════════════════════════════
   getStatusDisplay
   ══════════════════════════════════════════════════════════════════ */

describe("getStatusDisplay", () => {
  test("returns LUNAS for COMPLETED status", () => {
    const result = getStatusDisplay("COMPLETED");
    expect(result.label).toBe("LUNAS");
    expect(result.color).toBe("#047857");
  });

  test("returns BELUM LUNAS for DRAFT status", () => {
    const result = getStatusDisplay("DRAFT");
    expect(result.label).toBe("BELUM LUNAS");
    expect(result.color).toBe("#b45309");
  });

  test("returns MENUNGGU PERSETUJUAN for PENDING_APPROVAL", () => {
    const result = getStatusDisplay("PENDING_APPROVAL");
    expect(result.label).toBe("MENUNGGU PERSETUJUAN");
    expect(result.color).toBe("#1d4ed8");
  });

  test("returns UANG MUKA (DP) for DP status", () => {
    const result = getStatusDisplay("DP");
    expect(result.label).toBe("UANG MUKA (DP)");
    expect(result.color).toBe("#b45309");
  });

  test("returns DIBATALKAN for VOIDED status", () => {
    const result = getStatusDisplay("VOIDED");
    expect(result.label).toBe("DIBATALKAN");
    expect(result.color).toBe("#64748b");
  });

  test("returns DIREFUND for REFUNDED status", () => {
    const result = getStatusDisplay("REFUNDED");
    expect(result.label).toBe("DIREFUND");
    expect(result.color).toBe("#dc2626");
  });

  test("defaults to LUNAS for unknown status", () => {
    const result = getStatusDisplay("SOMETHING_ELSE");
    expect(result.label).toBe("LUNAS");
    expect(result.color).toBe("#047857");
  });
});

/* ══════════════════════════════════════════════════════════════════
   computeTotals
   ══════════════════════════════════════════════════════════════════ */

describe("computeTotals", () => {
  test("computes COMPLETED transaction totals correctly", () => {
    const txn = makeTransaction({
      total: 150000,
      amountPaid: 200000,
      change: 50000,
      status: "COMPLETED",
    });
    const totals = computeTotals(txn);
    expect(totals.grandTotal).toBe(150000);
    expect(totals.amountPaid).toBe(200000);
    expect(totals.change).toBe(50000);
    expect(totals.remaining).toBe(0);
    expect(totals.paymentLabel).toBe("TUNAI");
    expect(totals.balanceLabel).toBe("KEMBALI");
  });

  test("computes DP transaction with remaining balance", () => {
    const txn = makeTransaction({
      total: 500000,
      amountPaid: 200000,
      change: 0,
      status: "DP",
    });
    const totals = computeTotals(txn);
    expect(totals.grandTotal).toBe(500000);
    expect(totals.amountPaid).toBe(200000);
    expect(totals.remaining).toBe(300000);
    expect(totals.paymentLabel).toBe("UANG MUKA");
    expect(totals.balanceLabel).toBe("SISA");
  });

  test("computes VOIDED transaction totals", () => {
    const txn = makeTransaction({ status: "VOIDED" });
    const totals = computeTotals(txn);
    expect(totals.isCancelled).toBe(true);
    expect(totals.cancelLabel).toBe("DIBATALKAN");
  });

  test("computes REFUNDED transaction totals", () => {
    const txn = makeTransaction({ status: "REFUNDED" });
    const totals = computeTotals(txn);
    expect(totals.isCancelled).toBe(true);
    expect(totals.cancelLabel).toBe("DIREFUND");
  });
});

/* ══════════════════════════════════════════════════════════════════
   formatReceiptSize
   ══════════════════════════════════════════════════════════════════ */

describe("formatReceiptSize", () => {
  test("extracts size before \" = \" separator", () => {
    expect(formatReceiptSize("A3 = 297x420mm")).toBe("A3");
  });

  test("returns full string when no separator present", () => {
    expect(formatReceiptSize("A4")).toBe("A4");
  });

  test("returns empty string for null input", () => {
    expect(formatReceiptSize(null)).toBe("");
  });

  test("returns empty string for undefined input", () => {
    expect(formatReceiptSize(undefined)).toBe("");
  });
});

/* ══════════════════════════════════════════════════════════════════
   formatIndonesianDate
   ══════════════════════════════════════════════════════════════════ */

describe("formatIndonesianDate", () => {
  test("formats ISO date string to Indonesian locale", () => {
    const result = formatIndonesianDate("2026-06-01T10:00:00.000Z");
    // Should contain day, month name in Indonesian, and year
    expect(result).toMatch(/1/);
    expect(result).toMatch(/Juni/);
    expect(result).toMatch(/2026/);
  });

  test("returns dash for invalid date", () => {
    expect(formatIndonesianDate("not-a-date")).toBe("-");
  });

  test("returns dash for empty string", () => {
    expect(formatIndonesianDate("")).toBe("-");
  });
});

/* ══════════════════════════════════════════════════════════════════
   buildInvoicePdfData
   ══════════════════════════════════════════════════════════════════ */

describe("buildInvoicePdfData", () => {
  test("transforms a COMPLETED transaction into PDF data", () => {
    const txn = makeTransaction();
    const data = buildInvoicePdfData(txn, DEFAULT_STORE);

    expect(data.storeName).toBe("TOKO TELADAN");
    expect(data.storeAddress).toBe("Jl. Temu Putih No.30 Cilegon");
    expect(data.storePhone).toBe("0254 393022");
    expect(data.invoiceNumber).toBe("INV/20260601/ABCD");
    expect(data.customerName).toBe("PT Maju Jaya");
    expect(data.salesName).toBe("Budi");
    expect(data.paymentMethod).toBe("Tunai");
    expect(data.items).toHaveLength(2);
    expect(data.items[0].no).toBe(1);
    expect(data.items[0].productName).toBe("Kertas HVS A4 70gsm");
    expect(data.items[0].quantity).toBe(10);
    expect(data.items[0].unitPriceFormatted).toBe("5.000");
    expect(data.items[0].subtotalFormatted).toBe("50.000");
  });

  test("uses invoiceDate instead of createdAt for printed invoice date", () => {
    const txn = makeTransaction({
      createdAt: "2026-06-01T10:00:00.000Z",
      invoiceDate: "2026-07-02T03:00:00.000Z",
    });

    const data = buildInvoicePdfData(txn, DEFAULT_STORE);

    expect(data.date).toMatch(/2/);
    expect(data.date).toMatch(/Juli/);
    expect(data.date).toMatch(/2026/);
  });

  test("uses draftNumber when invoiceNumber is null", () => {
    const txn = makeTransaction({
      invoiceNumber: null,
      draftNumber: "DRF-20260601-0001",
    });
    const data = buildInvoicePdfData(txn, DEFAULT_STORE);
    // draftNumber is formatted through formatDraftNumberForDisplay then dashes replaced with slashes
    expect(data.invoiceNumber).toBeTruthy();
    expect(data.invoiceNumber).not.toContain("-");
  });

  test("defaults customer name to Pelanggan Umum when null", () => {
    const txn = makeTransaction({ customerName: null });
    const data = buildInvoicePdfData(txn, DEFAULT_STORE);
    expect(data.customerName).toBe("Pelanggan Umum");
  });

  test("translates CASH payment method to Tunai", () => {
    const txn = makeTransaction({ paymentMethod: "CASH" });
    const data = buildInvoicePdfData(txn, DEFAULT_STORE);
    expect(data.paymentMethod).toBe("Tunai");
  });

  test("keeps non-CASH payment method as-is", () => {
    const txn = makeTransaction({ paymentMethod: "TRANSFER" });
    const data = buildInvoicePdfData(txn, DEFAULT_STORE);
    expect(data.paymentMethod).toBe("TRANSFER");
  });

  test("detects printing service items and sets hasSize flag", () => {
    const txn = makeTransaction({
      items: [
        {
          id: "svc-1",
          productId: null,
          printingServiceId: "ps-1",
          rawMaterialProductId: null,
          productName: "Banner Flexi",
          size: "3x1m = 3m²",
          material: null,
          quantity: 1,
          unitPrice: 75000,
          subtotal: 75000,
          product: null,
          printingService: { unit: "m²" },
        },
      ],
    });
    const data = buildInvoicePdfData(txn, DEFAULT_STORE);
    expect(data.hasSize).toBe(true);
    expect(data.items[0].size).toBe("3x1m");
  });

  test("sets hasSize to false when no printing service items", () => {
    const txn = makeTransaction();
    const data = buildInvoicePdfData(txn, DEFAULT_STORE);
    expect(data.hasSize).toBe(false);
  });

  test("includes empty filler rows to reach minimum 5 rows", () => {
    const txn = makeTransaction({
      items: [
        {
          id: "item-1",
          productId: "p1",
          printingServiceId: null,
          rawMaterialProductId: null,
          productName: "Single Item",
          size: null,
          material: null,
          quantity: 1,
          unitPrice: 10000,
          subtotal: 10000,
          product: { unit: "pcs" },
          printingService: null,
        },
      ],
    });
    const data = buildInvoicePdfData(txn, DEFAULT_STORE);
    expect(data.emptyRowCount).toBe(4); // 5 - 1 = 4 filler rows
  });

  test("no filler rows when items >= 5", () => {
    const items = Array.from({ length: 7 }, (_, i) => ({
      id: `item-${i}`,
      productId: `p${i}`,
      printingServiceId: null,
      rawMaterialProductId: null,
      productName: `Product ${i}`,
      size: null,
      material: null,
      quantity: 1,
      unitPrice: 10000,
      subtotal: 10000,
      product: { unit: "pcs" },
      printingService: null,
    }));
    const txn = makeTransaction({ items });
    const data = buildInvoicePdfData(txn, DEFAULT_STORE);
    expect(data.emptyRowCount).toBe(0);
  });

  test("includes note when present", () => {
    const txn = makeTransaction({ note: "Urgent delivery" });
    const data = buildInvoicePdfData(txn, DEFAULT_STORE);
    expect(data.note).toBe("Urgent delivery");
  });

  test("note is null when transaction has no note", () => {
    const txn = makeTransaction({ note: null });
    const data = buildInvoicePdfData(txn, DEFAULT_STORE);
    expect(data.note).toBeNull();
  });
});
