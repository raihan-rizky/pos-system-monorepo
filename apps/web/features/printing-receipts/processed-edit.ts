import { calculateTransactionTax, getTransactionTaxMethod, getTransactionTaxRate } from "@/features/transaction-tax/helpers/tax-calculation";
import { getPrintingReceiptCheckoutLines, MAX_PRINTING_RECEIPT_AMOUNT, PrintingReceiptValidationError } from "./domain";
import type { PrintingReceiptDocument } from "./types";

export type ProcessedPaymentMethod = "CASH" | "DEBIT" | "CREDIT" | "QRIS" | "TRANSFER";
export interface ProcessedPrintingReceiptTransactionInput {
  paymentMethods: { id: string; method: ProcessedPaymentMethod }[];
  legacyPaymentMethod: ProcessedPaymentMethod | null;
  salespersonId: string | null;
}
export interface ProcessedPrintingReceiptInput {
  revision: number;
  number: string;
  document: PrintingReceiptDocument;
  transaction: ProcessedPrintingReceiptTransactionInput;
}
export interface ProcessedPrintingReceiptTotals { subtotal: number; total: number; paid: number; debt: number; status: string }
export interface ProcessedPrintingReceiptTransactionReview {
  paymentMethods: { id: string; amount: number; beforeMethod: string; afterMethod: ProcessedPaymentMethod }[];
  legacyPaymentMethod: { before: string; after: ProcessedPaymentMethod } | null;
  summaryPaymentMethod: { before: string; after: string };
  salesperson: {
    before: { id: string | null; name: string | null };
    after: { id: string | null; name: string | null };
  };
}
export interface ProcessedPrintingReceiptReview {
  reviewToken: string;
  before: ProcessedPrintingReceiptTotals;
  after: ProcessedPrintingReceiptTotals;
  materials: { productId: string; name: string; unit: string; before: number; after: number }[];
  transaction: ProcessedPrintingReceiptTransactionReview;
}
interface FinancialTransaction {
  status: string; subtotal: unknown; discount: unknown; tax: unknown; taxRate: unknown; taxMethod: string | null;
  total: unknown; amountPaid: unknown; change: unknown;
  paymentMethod?: string | null;
  payments?: { id: string; amount: unknown; method: string }[];
  salespersonId?: string | null;
  salesName?: string | null;
  items: { rawMaterialProductId: string | null; rawMaterialQuantity: number | null; rawMaterialUnit: string | null }[];
}
const cents = (value: number) => Math.round(value * 100) / 100;
const processedPaymentMethods = new Set<ProcessedPaymentMethod>(["CASH", "DEBIT", "CREDIT", "QRIS", "TRANSFER"]);

export function parseProcessedPrintingReceiptTransactionInput(value: unknown): ProcessedPrintingReceiptTransactionInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PrintingReceiptValidationError("Data transaksi tidak valid.");
  const input = value as Record<string, unknown>;
  if (!Array.isArray(input.paymentMethods)) throw new PrintingReceiptValidationError("Metode pembayaran tidak valid.");
  const paymentMethods: ProcessedPrintingReceiptTransactionInput["paymentMethods"] = [];
  const ids = new Set<string>();
  for (const value of input.paymentMethods) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new PrintingReceiptValidationError("Metode pembayaran tidak valid.");
    const payment = value as Record<string, unknown>;
    if (typeof payment.id !== "string" || !payment.id.trim() || typeof payment.method !== "string" || !processedPaymentMethods.has(payment.method as ProcessedPaymentMethod) || ids.has(payment.id)) {
      throw new PrintingReceiptValidationError("Metode pembayaran tidak valid.");
    }
    ids.add(payment.id);
    paymentMethods.push({ id: payment.id, method: payment.method as ProcessedPaymentMethod });
  }
  const legacyPaymentMethod = input.legacyPaymentMethod;
  if (legacyPaymentMethod !== null && (typeof legacyPaymentMethod !== "string" || !processedPaymentMethods.has(legacyPaymentMethod as ProcessedPaymentMethod))) {
    throw new PrintingReceiptValidationError("Metode pembayaran tidak valid.");
  }
  const salespersonId = input.salespersonId;
  if (salespersonId !== null && (typeof salespersonId !== "string" || !salespersonId.trim())) throw new PrintingReceiptValidationError("Sales transaksi tidak valid.");
  return { paymentMethods, legacyPaymentMethod: legacyPaymentMethod as ProcessedPaymentMethod | null, salespersonId: salespersonId as string | null };
}

function planProcessedTransactionDetails(transaction: FinancialTransaction, input: ProcessedPrintingReceiptTransactionInput) {
  const payments = transaction.payments ?? [];
  if (payments.length > 0 && input.legacyPaymentMethod !== null) throw new PrintingReceiptValidationError("Metode pembayaran lama hanya dapat diubah saat transaksi tidak memiliki rincian pembayaran.");
  if (payments.length === 0 && transaction.paymentMethod === "TEMPO" && input.legacyPaymentMethod !== null) throw new PrintingReceiptValidationError("Metode transaksi Tempo tetap Tempo.");
  const paymentMethods = input.paymentMethods.map(({ id, method }) => {
    const payment = payments.find(row => row.id === id);
    if (!payment) throw new PrintingReceiptValidationError("Riwayat pembayaran sudah berubah. Muat ulang nota.");
    return { id, amount: Number(payment.amount), beforeMethod: payment.method, afterMethod: method };
  });
  const summaryPaymentMethod = payments.length > 0 && transaction.paymentMethod !== "TEMPO"
    ? paymentMethods.find(row => row.id === payments.reduce((primary, payment) => Number(payment.amount) > Number(primary.amount) ? payment : primary, payments[0]).id)?.afterMethod ?? transaction.paymentMethod ?? "CASH"
    : payments.length === 0 && input.legacyPaymentMethod
      ? input.legacyPaymentMethod
      : transaction.paymentMethod ?? "CASH";
  return {
    paymentMethods,
    legacyPaymentMethod: payments.length === 0 && transaction.paymentMethod !== "TEMPO" && input.legacyPaymentMethod !== null
      ? { before: transaction.paymentMethod ?? "CASH", after: input.legacyPaymentMethod }
      : null,
    summaryPaymentMethod: { before: transaction.paymentMethod ?? "CASH", after: summaryPaymentMethod },
  };
}

export function planProcessedPrintingReceiptEdit(transaction: FinancialTransaction, document: PrintingReceiptDocument, transactionInput?: ProcessedPrintingReceiptTransactionInput) {
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
  return { before, after, tax, taxRate, taxMethod, lines, materials: [...usage.values()].sort((a, b) => a.productId.localeCompare(b.productId)), transaction: transactionInput ? planProcessedTransactionDetails(transaction, transactionInput) : null };
}
