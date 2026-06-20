/**
 * Pure data-transformation layer for invoice PDF generation.
 * Takes a Transaction + store settings and produces a plain
 * serializable object with all fields needed by the PDF template.
 *
 * Zero side-effects. Fully unit-testable.
 */

import type { Transaction } from "@/hooks/useTransactions";
import { formatDraftNumberForDisplay } from "@/features/transactions-draft/helpers/draft-number";

/* ── Types ──────────────────────────────────────────────────────── */

export interface StoreSettings {
  name: string;
  address: string;
  phone: string;
}

export interface InvoicePdfItem {
  no: number;
  productName: string;
  size: string;
  quantity: number;
  unit: string;
  unitPriceFormatted: string;
  subtotalFormatted: string;
}

export interface InvoicePdfTotals {
  grandTotal: number;
  grandTotalFormatted: string;
  amountPaid: number;
  amountPaidFormatted: string;
  change: number;
  changeFormatted: string;
  remaining: number;
  remainingFormatted: string;
  paymentLabel: string;
  balanceLabel: string;
  isCancelled: boolean;
  cancelLabel: string | null;
  paymentsList: { label: string; amountFormatted: string }[];
}

export interface InvoicePdfData {
  storeName: string;
  storeAddress: string;
  storePhone: string;
  invoiceNumber: string;
  customerName: string;
  salesName: string;
  paymentMethod: string;
  date: string;
  status: { label: string; color: string };
  items: InvoicePdfItem[];
  hasSize: boolean;
  emptyRowCount: number;
  totals: InvoicePdfTotals;
  note: string | null;
  isCancelled: boolean;
  isDP: boolean;
}

/* ── Status display ─────────────────────────────────────────────── */

const STATUS_DISPLAY_MAP: Record<string, { label: string; color: string }> = {
  DRAFT: { label: "BELUM LUNAS", color: "#b45309" },
  PENDING_APPROVAL: { label: "MENUNGGU PERSETUJUAN", color: "#1d4ed8" },
  DP: { label: "UANG MUKA (DP)", color: "#b45309" },
  VOIDED: { label: "DIBATALKAN", color: "#64748b" },
  REFUNDED: { label: "DIREFUND", color: "#dc2626" },
};

const DEFAULT_STATUS_DISPLAY = { label: "LUNAS", color: "#047857" };

export function getStatusDisplay(
  status: string
): { label: string; color: string } {
  return STATUS_DISPLAY_MAP[status] ?? DEFAULT_STATUS_DISPLAY;
}

/* ── Totals computation ─────────────────────────────────────────── */

export function computeTotals(transaction: Transaction): InvoicePdfTotals {
  const grandTotal = Number(transaction.total);
  const amountPaid = Number(transaction.amountPaid);
  const change = Number(transaction.change);
  const isDP = transaction.status === "DP";
  const isVoided = transaction.status === "VOIDED";
  const isRefunded = transaction.status === "REFUNDED";
  const isCancelled = isVoided || isRefunded;
  const remaining = isDP ? grandTotal - amountPaid : 0;

  const paymentsList = (transaction.payments && transaction.payments.length > 0)
    ? transaction.payments.map((p) => ({
        label: p.method === "CASH" ? "TUNAI" : p.method,
        amountFormatted: Number(p.amount).toLocaleString("id-ID"),
      }))
    : [{
        label: isDP ? "UANG MUKA" : (transaction.paymentMethod === "CASH" ? "TUNAI" : transaction.paymentMethod),
        amountFormatted: amountPaid.toLocaleString("id-ID"),
      }];

  return {
    grandTotal,
    grandTotalFormatted: grandTotal.toLocaleString("id-ID"),
    amountPaid,
    amountPaidFormatted: amountPaid.toLocaleString("id-ID"),
    change,
    changeFormatted: change.toLocaleString("id-ID"),
    remaining,
    remainingFormatted: remaining.toLocaleString("id-ID"),
    paymentLabel: isDP ? "UANG MUKA" : "TUNAI",
    balanceLabel: isDP ? "SISA" : "KEMBALI",
    isCancelled,
    cancelLabel: isVoided
      ? "DIBATALKAN"
      : isRefunded
        ? "DIREFUND"
        : null,
    paymentsList,
  };
}

/* ── Receipt size formatting ────────────────────────────────────── */

export function formatReceiptSize(
  size?: string | null
): string {
  return size?.split(" = ")[0] ?? "";
}

/* ── Indonesian date formatting ─────────────────────────────────── */

export function formatIndonesianDate(dateStr: string): string {
  if (!dateStr) return "-";
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

/* ── Number formatting ──────────────────────────────────────────── */

function formatNumber(n: number): string {
  return Number(n).toLocaleString("id-ID");
}

/* ── Main builder ───────────────────────────────────────────────── */

export function buildInvoicePdfData(
  transaction: Transaction,
  storeSettings: StoreSettings
): InvoicePdfData {
  const items = transaction.items || [];
  const serviceItems = items.filter((item) => item.printingServiceId);
  const hasSize = serviceItems.length > 0;

  const rawInvoice =
    transaction.invoiceNumber ??
    formatDraftNumberForDisplay(transaction.draftNumber) ??
    "";
  const invoiceNumber = rawInvoice.replace(/-/g, "/");

  const MIN_ROWS = 5;
  const emptyRowCount = Math.max(0, MIN_ROWS - items.length);

  const totals = computeTotals(transaction);
  const status = getStatusDisplay(transaction.status);

  const pdfItems: InvoicePdfItem[] = items.map((item, index) => {
    const unit = item.product?.unit || item.printingService?.unit || item.rawMaterialUnit || "pcs";
    return {
      no: index + 1,
      productName: item.productName,
      size: formatReceiptSize(item.size) || "-",
      quantity: item.quantity,
      unit,
      unitPriceFormatted: formatNumber(item.unitPrice),
      subtotalFormatted: formatNumber(item.subtotal),
    };
  });

  return {
    storeName: storeSettings.name,
    storeAddress: storeSettings.address,
    storePhone: storeSettings.phone,
    invoiceNumber,
    customerName: transaction.customerName || "Pelanggan Umum",
    salesName:
      transaction.salesName ??
      transaction.salesperson?.name ??
      "-",
    paymentMethod:
      transaction.payments && transaction.payments.length > 0
        ? transaction.payments
            .map((p) => p.method === "CASH" ? "Tunai" : p.method)
            .join(", ")
        : transaction.paymentMethod === "CASH"
          ? "Tunai"
          : transaction.paymentMethod,
    date: formatIndonesianDate(
      transaction.createdAt || new Date().toISOString()
    ),
    status,
    items: pdfItems,
    hasSize,
    emptyRowCount,
    totals,
    note: transaction.note,
    isCancelled: totals.isCancelled,
    isDP: transaction.status === "DP",
  };
}
