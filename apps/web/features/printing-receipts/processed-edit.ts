import { calculateTransactionTax, getTransactionTaxMethod, getTransactionTaxRate } from "@/features/transaction-tax/helpers/tax-calculation";
import { getPrintingReceiptCheckoutLines, MAX_PRINTING_RECEIPT_AMOUNT, PrintingReceiptValidationError } from "./domain";
import type { PrintingReceiptDocument } from "./types";

export type ProcessedPaymentMethod = "CASH" | "DEBIT" | "CREDIT" | "QRIS" | "TRANSFER";
export interface ProcessedInitialPaymentAllocation {
  sourcePaymentId: string | null;
  method: ProcessedPaymentMethod;
  amount: number;
}
export interface ProcessedAdditionalPayment {
  method: ProcessedPaymentMethod;
  amount: number;
}
export interface ProcessedPrintingReceiptTransactionInput {
  initialPayments: ProcessedInitialPaymentAllocation[];
  additionalPayments: ProcessedAdditionalPayment[];
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
  initialPayments: (ProcessedInitialPaymentAllocation & { beforeMethod: string })[];
  additionalPayments: ProcessedAdditionalPayment[];
  initialPaymentsBefore: number;
  initialPaymentsAfter: number;
  additionalPaymentsTotal: number;
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
  payments?: { id: string; amount: unknown; method: string; createdAt?: Date | string }[];
  debtPaymentLogs?: { amount: unknown }[];
  invoiceDate?: Date | string;
  salespersonId?: string | null;
  salesName?: string | null;
  items: { rawMaterialProductId: string | null; rawMaterialQuantity: number | null; rawMaterialUnit: string | null }[];
}
const cents = (value: number) => Math.round(value * 100) / 100;
const toCents = (value: number) => Math.round(value * 100);
const fromCents = (value: number) => cents(value / 100);
const processedPaymentMethods = new Set<ProcessedPaymentMethod>(["CASH", "DEBIT", "CREDIT", "QRIS", "TRANSFER"]);

function parsePaymentMethod(value: unknown): ProcessedPaymentMethod {
  if (typeof value !== "string" || !processedPaymentMethods.has(value as ProcessedPaymentMethod)) {
    throw new PrintingReceiptValidationError("Metode pembayaran tidak valid.");
  }
  return value as ProcessedPaymentMethod;
}

function parsePaymentAmount(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > MAX_PRINTING_RECEIPT_AMOUNT || Math.abs(value * 100 - Math.round(value * 100)) > 1e-7) {
    throw new PrintingReceiptValidationError(label + " harus berupa nominal lebih dari nol dalam batas nilai transaksi.");
  }
  return fromCents(toCents(value));
}

export function parseProcessedPrintingReceiptTransactionInput(value: unknown): ProcessedPrintingReceiptTransactionInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PrintingReceiptValidationError("Data transaksi tidak valid.");
  const input = value as Record<string, unknown>;
  if (!Array.isArray(input.initialPayments) || !Array.isArray(input.additionalPayments)) throw new PrintingReceiptValidationError("Rincian pembayaran tidak valid.");

  const initialPayments: ProcessedInitialPaymentAllocation[] = input.initialPayments.map(value => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new PrintingReceiptValidationError("Rincian pembayaran awal tidak valid.");
    const payment = value as Record<string, unknown>;
    const sourcePaymentId = payment.sourcePaymentId;
    if (sourcePaymentId !== null && (typeof sourcePaymentId !== "string" || !sourcePaymentId.trim())) throw new PrintingReceiptValidationError("Sumber pembayaran awal tidak valid.");
    return {
      sourcePaymentId: sourcePaymentId as string | null,
      method: parsePaymentMethod(payment.method),
      amount: parsePaymentAmount(payment.amount, "Nominal pembayaran awal"),
    };
  });
  const additionalPayments: ProcessedAdditionalPayment[] = input.additionalPayments.map(value => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new PrintingReceiptValidationError("Rincian pembayaran tambahan tidak valid.");
    const payment = value as Record<string, unknown>;
    return {
      method: parsePaymentMethod(payment.method),
      amount: parsePaymentAmount(payment.amount, "Nominal pembayaran tambahan"),
    };
  });
  const salespersonId = input.salespersonId;
  if (salespersonId !== null && (typeof salespersonId !== "string" || !salespersonId.trim())) throw new PrintingReceiptValidationError("Sales transaksi tidak valid.");
  return { initialPayments, additionalPayments, salespersonId: salespersonId as string | null };
}

function paymentLogTotalCents(transaction: FinancialTransaction): number {
  return (transaction.debtPaymentLogs ?? []).reduce((sum, payment) => {
    const amount = Number(payment.amount);
    if (!Number.isFinite(amount) || amount < 0) throw new PrintingReceiptValidationError("Riwayat pembayaran perlu diperiksa sebelum koreksi nota.");
    return sum + toCents(amount);
  }, 0);
}

function planProcessedTransactionDetails(
  transaction: FinancialTransaction,
  input: ProcessedPrintingReceiptTransactionInput,
  availableDebtCents: number,
  paidBeforeCents: number,
) {
  const payments = transaction.payments ?? [];
  const allocationsBySource = new Map<string | null, ProcessedInitialPaymentAllocation[]>();
  for (const allocation of input.initialPayments) {
    const group = allocationsBySource.get(allocation.sourcePaymentId) ?? [];
    group.push(allocation);
    allocationsBySource.set(allocation.sourcePaymentId, group);
  }

  const initialTotalCents = input.initialPayments.reduce((sum, payment) => sum + toCents(payment.amount), 0);
  const expectedInitialPaidCents = paidBeforeCents - paymentLogTotalCents(transaction);
  if (expectedInitialPaidCents < 0) throw new PrintingReceiptValidationError("Riwayat pembayaran perlu diperiksa sebelum koreksi nota.");

  const initialPayments: (ProcessedInitialPaymentAllocation & { beforeMethod: string; createdAt: Date })[] = [];
  if (payments.length > 0) {
    if (allocationsBySource.has(null)) throw new PrintingReceiptValidationError("Rincian pembayaran awal tidak sesuai dengan riwayat nota.");
    const knownIds = new Set(payments.map(payment => payment.id));
    if ([...allocationsBySource.keys()].some(sourceId => sourceId === null || !knownIds.has(sourceId))) throw new PrintingReceiptValidationError("Riwayat pembayaran sudah berubah. Muat ulang nota.");
    let sourceTotalCents = 0;
    for (const source of payments) {
      const sourceAmount = Number(source.amount);
      if (!Number.isFinite(sourceAmount) || sourceAmount <= 0) throw new PrintingReceiptValidationError("Riwayat pembayaran perlu diperiksa sebelum koreksi nota.");
      const group = allocationsBySource.get(source.id);
      if (!group?.length) throw new PrintingReceiptValidationError("Pembagian pembayaran harus mempertahankan seluruh pembayaran awal.");
      const groupTotalCents = group.reduce((sum, payment) => sum + toCents(payment.amount), 0);
      if (groupTotalCents !== toCents(sourceAmount)) throw new PrintingReceiptValidationError("Jumlah pembagian pembayaran harus sama dengan pembayaran awal.");
      sourceTotalCents += toCents(sourceAmount);
      const createdAt = source.createdAt ? new Date(source.createdAt) : new Date(transaction.invoiceDate ?? 0);
      initialPayments.push(...group.map(payment => ({ ...payment, beforeMethod: source.method, createdAt })));
    }
    const hasSplit = [...allocationsBySource.values()].some(group => group.length > 1);
    if (sourceTotalCents !== expectedInitialPaidCents && hasSplit) {
      throw new PrintingReceiptValidationError("Riwayat pembayaran awal tidak cocok dengan jumlah terbayar. Periksa data sebelum memecah pembayaran.");
    }
  } else {
    if ([...allocationsBySource.keys()].some(sourceId => sourceId !== null)) throw new PrintingReceiptValidationError("Riwayat pembayaran sudah berubah. Muat ulang nota.");
    const keepsTempoWithoutPaymentRows = transaction.paymentMethod === "TEMPO" && input.initialPayments.length === 0;
    if (expectedInitialPaidCents > 0 && !input.initialPayments.length && !keepsTempoWithoutPaymentRows) throw new PrintingReceiptValidationError("Pembayaran awal lama perlu dimuat sebelum koreksi nota.");
    if (!keepsTempoWithoutPaymentRows && initialTotalCents !== expectedInitialPaidCents) throw new PrintingReceiptValidationError("Jumlah pembagian pembayaran harus sama dengan pembayaran awal.");
    if (input.initialPayments.length && transaction.paymentMethod === "TEMPO") throw new PrintingReceiptValidationError("Transaksi Tempo tidak memiliki pembayaran awal untuk dipecah.");
    const createdAt = new Date(transaction.invoiceDate ?? 0);
    const beforeMethod = transaction.paymentMethod ?? "CASH";
    initialPayments.push(...input.initialPayments.map(payment => ({ ...payment, beforeMethod, createdAt })));
  }

  const additionalPaymentsTotalCents = input.additionalPayments.reduce((sum, payment) => sum + toCents(payment.amount), 0);
  if (additionalPaymentsTotalCents > 0 && transaction.status === "PENDING_APPROVAL") {
    throw new PrintingReceiptValidationError("Transaksi yang masih menunggu persetujuan belum dapat menerima pembayaran tambahan.");
  }
  if (additionalPaymentsTotalCents > availableDebtCents) {
    throw new PrintingReceiptValidationError("Pembayaran tambahan tidak boleh melebihi sisa piutang setelah koreksi nota.");
  }

  const summaryPaymentMethod = transaction.paymentMethod === "TEMPO"
    ? "TEMPO"
    : initialPayments.length
      ? [...initialPayments].sort((a, b) => toCents(b.amount) - toCents(a.amount))[0].method
      : transaction.paymentMethod ?? "CASH";
  const existingInitialPaidCents = payments.length
    ? payments.reduce((sum, payment) => sum + toCents(Number(payment.amount)), 0)
    : expectedInitialPaidCents;
  return {
    initialPayments,
    additionalPayments: input.additionalPayments,
    initialPaymentsBefore: fromCents(existingInitialPaidCents),
    initialPaymentsAfter: fromCents(transaction.paymentMethod === "TEMPO" && !input.initialPayments.length ? expectedInitialPaidCents : initialTotalCents),
    additionalPaymentsTotal: fromCents(additionalPaymentsTotalCents),
    additionalPaymentsTotalCents,
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
  const paidBeforeCents = toCents(Number(transaction.amountPaid) - Number(transaction.change));
  if (!Number.isFinite(paidBeforeCents) || paidBeforeCents < 0) throw new PrintingReceiptValidationError("Riwayat pembayaran perlu diperiksa sebelum koreksi nota.");
  const paid = fromCents(paidBeforeCents);
  if (total < paid) throw new PrintingReceiptValidationError("Total baru lebih kecil dari pembayaran tercatat. Proses pengembalian dana melalui alur refund terlebih dahulu.");

  const pending = transaction.status === "PENDING_APPROVAL";
  const before: ProcessedPrintingReceiptTotals = { subtotal: Number(transaction.subtotal), total: Number(transaction.total), paid, debt: pending ? 0 : cents(Math.max(0, Number(transaction.total) - paid)), status: transaction.status };
  const details = transactionInput
    ? planProcessedTransactionDetails(transaction, transactionInput, pending ? 0 : toCents(total - paid), paidBeforeCents)
    : null;
  const paidAfterCents = paidBeforeCents + (details?.additionalPaymentsTotalCents ?? 0);
  const paidAfter = fromCents(paidAfterCents);
  const after: ProcessedPrintingReceiptTotals = {
    subtotal,
    total,
    paid: paidAfter,
    debt: pending ? 0 : cents(Math.max(0, total - paidAfter)),
    status: pending ? "PENDING_APPROVAL" : total > paidAfter ? "DP" : "COMPLETED",
  };
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
  const transactionReview = details
    ? {
        initialPayments: details.initialPayments.map(({ sourcePaymentId, method, amount, beforeMethod }) => ({ sourcePaymentId, method, amount, beforeMethod })),
        additionalPayments: details.additionalPayments,
        initialPaymentsBefore: details.initialPaymentsBefore,
        initialPaymentsAfter: details.initialPaymentsAfter,
        additionalPaymentsTotal: details.additionalPaymentsTotal,
        summaryPaymentMethod: details.summaryPaymentMethod,
      }
    : null;
  return { before, after, tax, taxRate, taxMethod, lines, materials: [...usage.values()].sort((a, b) => a.productId.localeCompare(b.productId)), transaction: transactionReview, transactionPaymentPlan: details };
}