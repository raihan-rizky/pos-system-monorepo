import type { PrintingReceiptPayment } from "./layout";
import type { PrintingReceipt } from "./types";

export function isPrintingReceiptDraft(receipt: PrintingReceipt, transaction?: PrintingReceiptPayment | null): boolean {
  return !receipt.transactionId || (receipt.transaction?.status ?? transaction?.status) === "DRAFT";
}

export function assertPrintingReceiptCanExport(receipt: PrintingReceipt, transaction?: PrintingReceiptPayment | null): void {
  if (isPrintingReceiptDraft(receipt, transaction)) throw new Error("Nota masih draft. Proses pembayaran terlebih dahulu sebelum mencetak atau mengunduh PDF.");
}
