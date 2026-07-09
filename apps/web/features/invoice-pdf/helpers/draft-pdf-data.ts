/**
 * Pure data-transformation layer for draft/quotation PDF ("Nota Penawaran").
 *
 * Takes a Transaction + store settings + editable fields and produces
 * a plain serializable object for the draft PDF template.
 */

import type { Transaction } from "@/hooks/useTransactions";
import { formatDraftNumberForDisplay } from "@/features/transactions-draft/helpers/draft-number";
import { terbilang } from "@/lib/terbilang";
import { decodeDivisionFromNote } from "@/features/nota-penawaran/helpers/division-note";

/* ── Types ──────────────────────────────────────────────────────── */

export interface DraftPdfStoreSettings {
  name: string;
  address: string;
  phone: string;
}

export interface DraftPdfItem {
  no: number;
  productName: string;
  quantity: number;
  unit: string;
  unitPriceFormatted: string;
  subtotalFormatted: string;
}

export interface DraftPdfData {
  storeName: string;
  storeAddress: string;
  storePhone: string;
  docNumber: string;
  kepadaYth: string;
  divisiPurchasing: string;
  date: string;
  items: DraftPdfItem[];
  grandTotal: number;
  grandTotalFormatted: string;
  terbilangText: string;
  note: string | null;
  signerName: string;
  signerPhone: string;
  companyName: string;
  cityName: string;
}

/* ── Date formatter ─────────────────────────────────────────────── */

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

/* ── Main builder ───────────────────────────────────────────────── */

export function buildDraftPdfData(
  transaction: Transaction,
  storeSettings: DraftPdfStoreSettings,
  overrides?: {
    kepadaYth?: string;
    divisiPurchasing?: string;
  }
): DraftPdfData {
  const items = transaction.items || [];

  const { division: decodedDivision, cleanNote } = decodeDivisionFromNote(
    transaction.note
  );

  const docNumber =
    formatDraftNumberForDisplay(transaction.draftNumber) ||
    transaction.invoiceNumber ||
    "";

  const grandTotal = Number(transaction.total);

  const pdfItems: DraftPdfItem[] = items.map((item, index) => ({
    no: index + 1,
    productName: item.productName,
    quantity: item.quantity,
    unit: item.product?.unit || item.printingService?.unit || "-",
    unitPriceFormatted: Number(item.unitPrice).toLocaleString("id-ID"),
    subtotalFormatted: Number(item.subtotal).toLocaleString("id-ID"),
  }));

  return {
    storeName: storeSettings.name,
    storeAddress: storeSettings.address,
    storePhone: storeSettings.phone,
    docNumber,
    kepadaYth:
      overrides?.kepadaYth ?? transaction.customerName ?? "Pelanggan Umum",
    divisiPurchasing: overrides?.divisiPurchasing ?? decodedDivision,
    date: formatIndonesianDate(
      transaction.invoiceDate || transaction.createdAt || new Date().toISOString()
    ),
    items: pdfItems,
    grandTotal,
    grandTotalFormatted: grandTotal.toLocaleString("id-ID"),
    terbilangText: terbilang(grandTotal),
    note: cleanNote || null,
    signerName: "Indra Gunawan",
    signerPhone: "08111228134",
    companyName: "CV Teladan",
    cityName: "Cilegon",
  };
}
