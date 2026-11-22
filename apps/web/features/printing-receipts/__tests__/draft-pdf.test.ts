import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPrintingReceiptPdf, printPrintingReceiptPdf } from "../export-pdf";
import { PRINTING_SUBCATEGORIES, type PrintingReceipt } from "../types";

function receipt(subcategory: PrintingReceipt["subcategory"], transactionId: string | null): PrintingReceipt {
  return {
    id: "nota", storeId: "store", number: "NOTA-1", revision: 1, subcategory, transactionId,
    createdAt: "2026-11-12", updatedAt: "2026-11-12",
    document: { customerName: "Pelanggan", customerPhone: "", customerId: null, date: "2026-11-12", note: "", completionDate: "", completionTime: "", receiver: "", setter: "", signatory: "Sales", lines: [] },
  };
}

function artwork(subcategory: PrintingReceipt["subcategory"]) {
  const file = subcategory === "SPANDUK" ? "nota-spanduk.png" : "nota-percetakan.png";
  return `data:image/png;base64,${readFileSync(resolve("public/images/printing-receipts", file)).toString("base64")}`;
}

describe("PDF nota draft", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each(PRINTING_SUBCATEGORIES)("menolak membuat PDF %s yang belum menjadi transaksi", async subcategory => {
    await expect(createPrintingReceiptPdf(receipt(subcategory, null), null, artwork(subcategory)).then(() => "PDF dibuat")).rejects.toThrow(/draft/i);
  });

  it("menolak transaksi yang masih berstatus DRAFT", async () => {
    await expect(createPrintingReceiptPdf(receipt("SPANDUK", "sale"), { total: 0, amountPaid: 0, status: "DRAFT" }, artwork("SPANDUK")).then(() => "PDF dibuat")).rejects.toThrow(/draft/i);
  });

  it("tidak membuka popup cetak untuk nota draft", async () => {
    const open = vi.fn();
    vi.stubGlobal("window", { open });
    await expect(printPrintingReceiptPdf(receipt("SPANDUK", null))).rejects.toThrow(/draft/i);
    expect(open).not.toHaveBeenCalled();
  });

  it.each(["COMPLETED", "DP", "PENDING_APPROVAL", "VOIDED", "REFUNDED"])("tetap membuat PDF transaksi berstatus %s", async status => {
    const pdf = await createPrintingReceiptPdf(receipt("PRINT", "sale"), { total: 0, amountPaid: 0, status }, artwork("PRINT"));
    expect(pdf.output()).toContain("NOTA-1");
    expect(pdf.output()).toContain("Sales");
  });
});
