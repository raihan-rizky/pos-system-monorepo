import { calculateTransactionTax, getTransactionTaxMethod, getTransactionTaxRate } from "@/features/transaction-tax/helpers/tax-calculation";
import { getPrintingReceiptCheckoutLines, MAX_PRINTING_RECEIPT_AMOUNT, PrintingReceiptValidationError } from "./domain";
import type { PrintingReceiptDocument } from "./types";

export interface ProcessedPrintingReceiptInput { revision: number; number: string; document: PrintingReceiptDocument }
export interface ProcessedPrintingReceiptTotals { subtotal: number; total: number; paid: number; debt: number; status: string }
export interface ProcessedPrintingReceiptReview {
  reviewToken: string;
  before: ProcessedPrintingReceiptTotals;
  after: ProcessedPrintingReceiptTotals;
  materials: { productId: string; name: string; unit: string; before: number; after: number }[];
}
interface FinancialTransaction {
  status: string; subtotal: unknown; discount: unknown; tax: unknown; taxRate: unknown; taxMethod: string | null;
  total: unknown; amountPaid: unknown; change: unknown;
  items: { rawMaterialProductId: string | null; rawMaterialQuantity: number | null; rawMaterialUnit: string | null }[];
}
const cents = (value: number) => Math.round(value * 100) / 100;

export function planProcessedPrintingReceiptEdit(transaction: FinancialTransaction, document: PrintingReceiptDocument) {
  if (!["COMPLETED", "DP", "PENDING_APPROVAL"].includes(transaction.status)) {
    throw new PrintingReceiptValidationError("Nota transaksi batal, refund, atau draf tidak dapat dikoreksi melalui alur ini.");
  }
  const lines = getPrintingReceiptCheckoutLines(document);
  const subtotal = cents(lines.reduce((sum, line) => sum + line.quantity * line.price, 0));
  const taxRate = getTransactionTaxRate(transaction);
  const taxMethod = getTransactionTaxMethod(transaction);
  const { total, tax } = calculateTransactionTax({ subtotal, discount: Number(transaction.discount), taxRate, taxMethod });
  if (!Number.isFinite(total) || total > MAX_PRINTING_RECEIPT_AMOUNT) throw new PrintingReceiptValidationError("Jumlah nota melebihi batas nilai transaksi.");
  const paid = cents(Number(transaction.amountPaid) - Number(transaction.change));
  if (!Number.isFinite(paid) || paid < 0) throw new PrintingReceiptValidationError("Riwayat pembayaran perlu diperiksa sebelum koreksi nota.");
  if (total < paid) throw new PrintingReceiptValidationError("Total baru lebih kecil dari pembayaran tercatat. Proses pengembalian dana melalui alur refund terlebih dahulu.");
  const pending = transaction.status === "PENDING_APPROVAL";
  const before: ProcessedPrintingReceiptTotals = { subtotal: Number(transaction.subtotal), total: Number(transaction.total), paid, debt: pending ? 0 : cents(Math.max(0, Number(transaction.total) - paid)), status: transaction.status };
  const after: ProcessedPrintingReceiptTotals = { subtotal, total, paid, debt: pending ? 0 : cents(total - paid), status: pending ? "PENDING_APPROVAL" : total > paid ? "DP" : "COMPLETED" };
  const usage = new Map<string, { productId: string; unit: string; before: number; after: number }>();
  for (const item of transaction.items) {
    if (!item.rawMaterialProductId) continue;
    const entry = usage.get(item.rawMaterialProductId) ?? { productId: item.rawMaterialProductId, unit: item.rawMaterialUnit ?? "", before: 0, after: 0 };
    entry.before += item.rawMaterialQuantity ?? 0; usage.set(entry.productId, entry);
  }
  for (const line of lines) {
    if (!line.stockLink) continue;
    const entry = usage.get(line.stockLink.productId) ?? { productId: line.stockLink.productId, unit: line.stockLink.unit, before: 0, after: 0 };
    entry.after += line.stockLink.quantity; usage.set(entry.productId, entry);
  }
  return { before, after, tax, taxRate, taxMethod, lines, materials: [...usage.values()].sort((a, b) => a.productId.localeCompare(b.productId)) };
}
