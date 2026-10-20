import type { PrintingReceipt, PrintingReceiptLine, PrintingSubcategory } from "./types";

export interface ReceiptBox { x: number; y: number; width: number; height: number }
export interface ReceiptField extends ReceiptBox { fontSize?: number; align?: "left" | "right" | "center"; color?: string }
export interface PrintingReceiptPayment { total: number; amountPaid: number; status?: string }
export interface PrintingReceiptLayout {
  width: number; height: number; rowsPerPage: number; artwork: string;
  tableTop: number; rowHeight: number;
  columns: Record<"quantity" | "name" | "material" | "price" | "total" | "index", ReceiptField>;
  fields: Record<"number" | "date" | "customerName" | "customerPhone" | "note" | "completionDate" | "completionTime" | "receiver" | "setter" | "signatory" | "total" | "paid" | "remaining", ReceiptField>;
  numberMask?: ReceiptBox;
}

const box = (x: number, y: number, width: number, height: number, fontSize = 9, align: ReceiptField["align"] = "left"): ReceiptField => ({ x, y, width, height, fontSize, align });
const SPANDUK_LAYOUT: PrintingReceiptLayout = {
  width: 215, height: 110, rowsPerPage: 6, artwork: "/images/printing-receipts/nota-spanduk.png",
  tableTop: 35.1, rowHeight: 5.55,
  columns: { index: box(21.6, 0, 6.3, 5.55, 9, "center"), name: box(28.5, 0, 108.2, 5.55), material: box(137.1, 0, 7.1, 5.55, 6), quantity: box(144.9, 0, 10.7, 5.55, 8, "center"), price: box(156.5, 0, 22.3, 5.55, 8, "right"), total: box(180, 0, 26.2, 5.55, 8, "right") },
  fields: {
    number: box(43, 24.5, 48, 4.3, 9), date: box(168.5, 8.8, 37.4, 4.2),
    customerName: box(164.2, 15.6, 41.8, 4.1), customerPhone: box(165.1, 22.4, 40.9, 4),
    note: box(23.7, 77.2, 65.1, 21.7, 8), completionTime: box(102.7, 91.8, 16.3, 2.8, 7),
    completionDate: box(102.7, 96.7, 16.3, 2.6, 6), receiver: box(120.2, 90, 31.4, 7, 8, "center"),
    setter: box(152.8, 90, 15.1, 7, 7, "center"), signatory: box(169.2, 90, 36.3, 7, 8, "center"),
    total: box(179.8, 68.5, 26.6, 5.1, 9, "right"), paid: box(179.8, 74.1, 26.6, 5.1, 9, "right"), remaining: box(179.8, 79.7, 26.6, 5.1, 9, "right"),
  },
};
const A5_LAYOUT: PrintingReceiptLayout = {
  width: 148, height: 210, rowsPerPage: 13, artwork: "/images/printing-receipts/nota-percetakan.png",
  tableTop: 61.3, rowHeight: 7.89,
  numberMask: { x: 22, y: 40, width: 17, height: 5 },
  columns: { index: box(0, 0, 0, 7.89), quantity: box(6.2, 0, 19.3, 7.89, 11, "center"), name: box(27, 0, 59, 7.89, 10), material: box(27, 0, 59, 7.89, 8), price: box(87.6, 0, 24.5, 7.89, 10, "right"), total: box(113.7, 0, 28.7, 7.89, 10, "right") },
  fields: {
    number: box(22.6, 41, 62, 4, 10), date: box(114.1, 11.9, 28.7, 4.6, 10),
    customerName: box(98.7, 21.5, 44.2, 11, 11), customerPhone: box(103.2, 33.9, 39.7, 4.5, 10),
    signatory: box(96.5, 189.3, 37.5, 6, 11, "center"),
    note: box(0, 0, 0, 0), completionDate: box(0, 0, 0, 0), completionTime: box(0, 0, 0, 0), receiver: box(0, 0, 0, 0), setter: box(0, 0, 0, 0),
    total: box(113.7, 164.1, 28.7, 8.1, 11, "right"), paid: box(0, 0, 0, 0), remaining: box(0, 0, 0, 0),
  },
};

export function getPrintingReceiptLayout(subcategory: PrintingSubcategory): PrintingReceiptLayout {
  return subcategory === "SPANDUK" ? SPANDUK_LAYOUT : A5_LAYOUT;
}

export function getPrintingReceiptTotals(receipt: PrintingReceipt, transaction?: PrintingReceiptPayment | null) {
  const subtotal = receipt.document.lines.reduce((sum, line) => sum + (line.quantity ?? 0) * (line.price ?? 0), 0);
  const payment = transaction ?? receipt.transaction;
  const total = payment ? Number(payment.total) : subtotal;
  const paid = payment ? Math.min(total, Math.max(0, Number(payment.amountPaid))) : 0;
  return { subtotal, total, paid, remaining: Math.max(0, total - paid) };
}

export function buildPrintingReceiptPages(receipt: PrintingReceipt) {
  const layout = getPrintingReceiptLayout(receipt.subcategory);
  const pageCount = Math.max(1, Math.ceil(receipt.document.lines.length / layout.rowsPerPage));
  return Array.from({ length: pageCount }, (_, pageIndex) => ({
    pageIndex, pageCount, number: receipt.number, showTotals: pageIndex === pageCount - 1,
    lines: receipt.document.lines.slice(pageIndex * layout.rowsPerPage, (pageIndex + 1) * layout.rowsPerPage).map((line, rowIndex) => ({
      line, number: pageIndex * layout.rowsPerPage + rowIndex + 1, rowIndex,
      y: layout.tableTop + rowIndex * layout.rowHeight,
    })),
  }));
}

export function printingLineAmount(line: PrintingReceiptLine): string {
  return line.quantity === null || line.price === null ? "" : formatReceiptNumber(line.quantity * line.price);
}
export function formatReceiptNumber(value: number): string {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(value);
}

export function getPrintingReceiptWatermark(receipt: PrintingReceipt, transaction?: { status?: string } | null): string | null {
  if (!receipt.transactionId) return "DRAFT";
  const status = (transaction ?? receipt.transaction)?.status;
  return status === "PENDING_APPROVAL" ? "MENUNGGU PERSETUJUAN" : status === "VOIDED" ? "DIBATALKAN" : status === "REFUNDED" ? "DIREFUND" : null;
}

export type ReceiptDocumentTextKey = Exclude<keyof PrintingReceipt["document"], "lines" | "customerId">;
export interface ReceiptSheetField extends ReceiptField {
  key: string; value: string; label: string;
  documentField?: ReceiptDocumentTextKey;
  receiptField?: "number";
  lineId?: string;
  lineField?: "name" | "material" | "quantity" | "price";
  multiline?: boolean;
  inputType?: "text" | "number" | "date" | "time";
  whiteBackground?: boolean;
}

export function getPrintingReceiptPageFields(receipt: PrintingReceipt, page: ReturnType<typeof buildPrintingReceiptPages>[number], transaction?: PrintingReceiptPayment | null): ReceiptSheetField[] {
  const layout = getPrintingReceiptLayout(receipt.subcategory);
  const fields: ReceiptSheetField[] = [];
  const add = (field: ReceiptSheetField) => { if (field.width > 0 && field.height > 0) fields.push(field); };
  add({ ...layout.fields.number, key: "number", receiptField: "number", label: "Nomor nota", value: receipt.number });
  const documentFields: [ReceiptDocumentTextKey, string, ReceiptSheetField["inputType"]?, boolean?][] = [
    ["date", "Tanggal nota", "date"], ["customerName", "Nama pelanggan", "text", true], ["customerPhone", "Telepon pelanggan"],
    ["note", "Keterangan", "text", true], ["completionTime", "Jam selesai", "time"], ["completionDate", "Hari selesai", "date"],
    ["receiver", "Penerima"], ["setter", "Petugas seting"], ["signatory", "Hormat kami"],
  ];
  for (const [key, label, inputType, multiline] of documentFields) add({ ...layout.fields[key], key, value: receipt.document[key], label, documentField: key, inputType, multiline, whiteBackground: key === "date" || key === "customerName" || key === "customerPhone" });
  if (receipt.subcategory === "SPANDUK") add({ ...box(21, 24.5, 22, 4.3, 9), color: "#373396", key: "number-label", label: "", value: "No. Nota:" });
  for (const { line, number, y } of page.lines) {
    if (receipt.subcategory === "SPANDUK") add({ ...layout.columns.index, y, key: `${line.id}-index`, label: `Nomor baris ${number}`, value: String(number) });
    for (const [key, label] of [["name", "Nama item"], ["material", "Bahan"], ["quantity", "Banyaknya"], ["price", "Harga satuan"]] as const) {
      const a5 = receipt.subcategory !== "SPANDUK";
      const column = layout.columns[key];
      add({ ...column, y: y + (a5 && key === "material" ? 5.05 : 0), height: a5 && key === "name" ? 5 : a5 && key === "material" ? 2.7 : column.height,
        fontSize: a5 && key === "material" ? 7 : column.fontSize, key: `${line.id}-${key}`, label: `${label} baris ${number}`,
        lineId: line.id, lineField: key, value: line[key] === null ? "" : String(line[key]), multiline: key === "name" || key === "material", inputType: key === "price" || key === "quantity" ? "number" : "text" });
    }
    add({ ...layout.columns.total, y, key: `${line.id}-total`, label: `Jumlah baris ${number}`, value: printingLineAmount(line) });
  }
  if (page.showTotals) {
    const totals = getPrintingReceiptTotals(receipt, transaction);
    for (const [key, label] of [["total", "Jumlah nota"], ["paid", "DP terbayar"], ["remaining", "Sisa pembayaran"]] as const) {
      add({ ...layout.fields[key], key: `totals-${key}`, label, value: formatReceiptNumber(totals[key]) });
    }
  }
  if (page.pageCount > 1) add({ ...box(6, 2, layout.width - 12, 3, 6, "right"), key: "page", label: "", value: `Halaman ${page.pageIndex + 1}/${page.pageCount}${page.showTotals ? "" : " - berlanjut"}` });
  return fields;
}

export function getReceiptFieldDisplayValue(field: ReceiptSheetField) {
  if (field.inputType === "date" && /^\d{4}-\d{2}-\d{2}$/.test(field.value)) return field.value.split("-").reverse().join("/");
  if ((field.lineField === "price" || field.lineField === "quantity") && field.value !== "") return formatReceiptNumber(Number(field.value));
  return field.value;
}
