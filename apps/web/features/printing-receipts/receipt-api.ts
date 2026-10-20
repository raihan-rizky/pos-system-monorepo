import type { PrintingReceipt } from "./types";

export async function readPrintingReceiptResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null) as { data?: T; message?: string; error?: string } | null;
  if (!response.ok) {
    if (response.status === 409) throw new Error(payload?.message || "Nota sudah berubah atau nomornya telah digunakan. Periksa nomor, atau muat ulang versi tersimpan sebelum melanjutkan.");
    throw new Error(payload?.message || payload?.error || "Nota belum dapat dimuat. Periksa koneksi lalu coba lagi.");
  }
  return (payload && "data" in payload ? payload.data : payload) as T;
}
export async function getPrintingReceiptPreviewRecord(receipt: PrintingReceipt): Promise<PrintingReceipt> {
  if (!receipt.transactionId) return receipt;
  return readPrintingReceiptResponse<PrintingReceipt>(await fetch(`/api/printing-receipts/${encodeURIComponent(receipt.id)}`, { cache: "no-store" }));
}
