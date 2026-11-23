import { describe, expect, it } from "vitest";
import { jsPDF } from "jspdf";
import { buildPrintingReceiptPages, getPrintingReceiptPageFields, type PrintingReceiptPayment } from "../layout";
import { buildPrintingReceiptPresentation } from "../presentation";
import type { PrintingReceipt } from "../types";

const receipt = (subcategory: PrintingReceipt["subcategory"]): PrintingReceipt => ({
  id: "nota", storeId: "store", number: "SP-20261117-001", revision: 1, subcategory,
  transactionId: null, createdAt: "2026-11-17", updatedAt: "2026-11-17",
  document: { customerName: "Contoh", customerPhone: "08123456789", customerId: null, date: "2026-11-17", note: "",
    completionDate: "", completionTime: "", receiver: "", setter: "", signatory: "", lines: [] },
});

function paymentField(subcategory: PrintingReceipt["subcategory"], transaction?: unknown) {
  const record = receipt(subcategory);
  const page = buildPrintingReceiptPages(record)[0];
  return getPrintingReceiptPageFields(record, page, transaction as PrintingReceiptPayment | null | undefined)
    .find(field => field.key === "paymentMethod");
}

describe("printing receipt payment method display", () => {
  it.each(["SPANDUK", "PERCETAKAN"] as const)("shows distinct split-payment names in the marked %s area without amounts", subcategory => {
    const transaction = {
      total: 60_000, amountPaid: 60_000, paymentMethod: "CASH",
      payments: ["CASH", "DEBIT", "CREDIT", "QRIS", "TRANSFER", "CASH"].map(method => ({ method, amount: 10_000 })),
    };
    const field = paymentField(subcategory, transaction);

    expect(field).toBeDefined();
    expect(field?.value).toBe("Metode pembayaran: Tunai, Debit, Kartu kredit, QRIS, Transfer");
    expect(field?.value).not.toContain("30.000");
    expect(field?.align).toBe("center");
    expect(field?.coloredSegments).toEqual([
      { text: "Metode pembayaran: ", color: "#373396" },
      { text: "Tunai", color: "#15803d" },
      { text: ", ", color: "#242239" },
      { text: "Debit", color: "#a16207" },
      { text: ", ", color: "#242239" },
      { text: "Kartu kredit", color: "#7c3aed" },
      { text: ", ", color: "#242239" },
      { text: "QRIS", color: "#111827" },
      { text: ", ", color: "#242239" },
      { text: "Transfer", color: "#2563eb" },
    ]);
    expect(field).toMatchObject(subcategory === "SPANDUK"
      ? { x: 91, y: 26.4, width: 45.5, height: 3.1 }
      : { x: 99.55, y: 38.8, width: 47, height: 5.5 });
  });

  it.each(["SPANDUK", "PERCETAKAN"] as const)("aligns the payment-method line with its marked text area on %s", subcategory => {
    const record = receipt(subcategory);
    const page = buildPrintingReceiptPages(record)[0];
    const fields = getPrintingReceiptPageFields(record, page, {
      total: 60_000,
      amountPaid: 60_000,
      paymentMethod: "TRANSFER",
      payments: [{ method: "TRANSFER" }],
    });
    const phone = fields.find(field => field.key === "customerPhone");
    const payment = fields.find(field => field.key === "paymentMethod");

    expect(phone).toBeDefined();
    expect(payment).toBeDefined();
    if (!phone || !payment) throw new Error("Kolom telepon dan pembayaran harus tersedia.");
    if (subcategory === "SPANDUK") {
      expect(payment.x + payment.width / 2).toBeCloseTo(113.75);
    } else {
      expect(payment.x + payment.width / 2).toBeCloseTo(phone.x + phone.width / 2);
    }
    expect(payment.y).toBeGreaterThanOrEqual(phone.y + phone.height);
  });

  it.each(["SPANDUK", "PERCETAKAN"] as const)("fits five-method payment details on one line of the %s receipt", subcategory => {
    const record = receipt(subcategory);
    const value = "Metode pembayaran: Tunai, Debit, Kartu kredit, QRIS, Transfer";
    const presentation = buildPrintingReceiptPresentation(record, {
      total: 60_000, amountPaid: 60_000, paymentMethod: "CASH",
      payments: ["CASH", "DEBIT", "CREDIT", "QRIS", "TRANSFER"].map(method => ({ method })),
    });
    const field = presentation.pages.flatMap(page => page.fields).find(item => item.key === "paymentMethod");
    const measure = new jsPDF();
    expect(field?.displayValue).toBe(value);
    expect(field?.textLines).toEqual([value]);
    if (!field) throw new Error("Kolom metode pembayaran harus tersedia.");
    measure.setFont("helvetica", "normal");
    measure.setFontSize(field.fittedFontSize);
    expect(measure.getTextWidth(value)).toBeLessThanOrEqual(field.width - 1.4 + 0.001);
    expect(presentation.appendixPages.flatMap(page => page.lines).some(line => line.text.includes("Metode pembayaran"))).toBe(false);
  });

  it("preserves the payment-row order when listing method names", () => {
    const field = paymentField("PRINT", {
      total: 60_000, amountPaid: 60_000,
      payments: [{ method: "QRIS", amount: 30_000 }, { method: "CASH", amount: 30_000 }],
    });

    expect(field?.value).toBe("Metode pembayaran: QRIS, Tunai");
  });

  it.each([
    ["TRANSFER", "Transfer"],
    ["TEMPO", "Tempo"],
  ])("uses the legacy summary method %s when payment rows are missing", (paymentMethod, label) => {
    const field = paymentField("PRINT", { total: 60_000, amountPaid: 0, paymentMethod, payments: [] });

    expect(field?.value).toBe(`Metode pembayaran: ${label}`);
  });

  it("omits the method field for a draft without a transaction", () => {
    expect(paymentField("PERCETAKAN")).toBeUndefined();
  });
});
