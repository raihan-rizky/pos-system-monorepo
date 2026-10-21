import { jsPDF } from "jspdf";
import type { PrintingReceipt, PrintingReceiptLine, PrintingSubcategory } from "./types";
import { getReceiptColumnBoundaries, getReceiptColumnWidths, hasValidReceiptColumnWidths } from "./column-layout";
export { getReceiptColumnWidths, resizeReceiptColumnBoundary } from "./column-layout";

export const RECEIPT_TEXT_LINE_HEIGHT = 1.12;
export const RECEIPT_TEXT_PADDING_X = 0.75;
export const RECEIPT_TEXT_PADDING_Y = 0.25;
const POINTS_PER_MM = 2.83465;
const MATERIAL_GAP = 0.15;
const EPSILON = 0.00001;

export interface ReceiptBox { x: number; y: number; width: number; height: number }
export interface ReceiptField extends ReceiptBox { fontSize?: number; align?: "left" | "right" | "center"; color?: string; bold?: boolean }
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
  columns: { index: box(21.6, 0, 6.3, 5.55, 9, "center"), name: box(28.5, 0, 108.2, 5.55), material: box(137.1, 0, 7.1, 5.55, 8, "center"), quantity: box(144.9, 0, 10.7, 5.55, 8, "center"), price: box(156.5, 0, 22.3, 5.55, 8, "right"), total: box(180, 0, 26.2, 5.55, 8, "right") },
  fields: {
    number: box(43, 24.5, 48, 4.3, 9), date: box(168.5, 8.8, 37.4, 4.2),
    customerName: box(164.2, 15.6, 41.8, 4.1), customerPhone: box(165.1, 22.4, 40.9, 4),
    note: box(23.7, 77.2, 65.1, 21.7, 8), completionTime: box(102.7, 91.8, 16.3, 2.8, 7),
    completionDate: box(102.7, 96.7, 16.3, 2.6, 6), receiver: box(125, 95.8, 26.5, 3.2, 8, "center"),
    setter: box(152.8, 90, 15.1, 7, 7, "center"), signatory: box(175, 95.8, 25, 3.2, 8, "center"),
    total: box(179.8, 68.5, 26.6, 5.1, 9, "right"), paid: box(179.8, 74.1, 26.6, 5.1, 9, "right"), remaining: box(179.8, 79.7, 26.6, 5.1, 9, "right"),
  },
};
export const RECEIPT_MATERIAL_PADDING_Y = Math.max(RECEIPT_TEXT_PADDING_Y,
  (SPANDUK_LAYOUT.columns.quantity.height - (SPANDUK_LAYOUT.columns.material.fontSize ?? 8) / 2.83465 * RECEIPT_TEXT_LINE_HEIGHT) / 2);

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

export function getPrintingReceiptLayout(subcategory: PrintingSubcategory, columnWidths?: readonly number[]): PrintingReceiptLayout {
  const base = subcategory === "SPANDUK" ? SPANDUK_LAYOUT : A5_LAYOUT;
  // Existing receipts keep their exact artwork-aligned field positions until adjusted.
  if (!hasValidReceiptColumnWidths(subcategory, columnWidths)) return { ...base, columns: { ...base.columns } };
  const widths = getReceiptColumnWidths(subcategory, columnWidths);
  const xs = getReceiptColumnBoundaries(subcategory, widths);
  const keys = subcategory === "SPANDUK" ? ["index", "name", "material", "quantity", "price", "total"] as const : ["quantity", "name", "price", "total"] as const;
  // The small cell inset keeps text clear of the printed rules at every width.
  const columns = { ...base.columns };
  keys.forEach((key, index) => { columns[key] = { ...base.columns[key], x: xs[index] + .35, width: widths[index] - .7 }; });
  if (subcategory !== "SPANDUK") columns.material = { ...columns.name, fontSize: base.columns.material.fontSize };
  return { ...base, columns };
}

export interface ReceiptHeaderRule { x1: number; y1: number; x2: number; y2: number }
export interface ReceiptHeader extends ReceiptBox {
  columnXs: number[]; redraw: boolean; fill: string; color: string; lineWidth: number;
  rules: ReceiptHeaderRule[];
  labels: (ReceiptField & { value: string; textLines: string[] })[];
}

function buildReceiptHeader(subcategory: PrintingSubcategory, widths?: readonly number[]): ReceiptHeader {
  const spanduk = subcategory === "SPANDUK";
  const xs = getReceiptColumnBoundaries(subcategory, widths);
  const y = spanduk ? 29.5 : 47.3;
  const bottom = spanduk ? 35.1 : 61.3;
  const middle = (y + bottom) / 2;
  const rules: ReceiptHeaderRule[] = xs.map((x, index) => ({ x1: x, x2: x, y1: !spanduk && index === 3 ? middle : y, y2: bottom }));
  for (const lineY of [y, bottom]) rules.push({ x1: xs[0], x2: xs[xs.length - 1], y1: lineY, y2: lineY });
  if (!spanduk) rules.push({ x1: xs[2], x2: xs[4], y1: middle, y2: middle });
  const labels: ReceiptHeader["labels"] = [];
  const add = (index: number, value: string, top = y, height = bottom - y, span = 1, fontSize = spanduk ? 8 : 11) => {
    // Keep the narrow Bahan/Banyak headings readable without truncating at their minima.
    const textLines = spanduk && xs[index + span] - xs[index] < 9 && value === "Bahan" ? ["Ba", "han"]
      : spanduk && xs[index + span] - xs[index] < 11 && value === "Banyak" ? ["Ba", "nyak"] : [value];
    labels.push({ ...box(xs[index] + .35, top, xs[index + span] - xs[index] - .7, height, textLines.length > 1 ? 6 : fontSize, "center"), value, textLines, bold: spanduk });
  };
  if (spanduk) ["No.", "Nama File", "Bahan", "Banyak", "@Rp.", "Jumlah"].forEach((value, index) => add(index, value));
  else {
    add(0, "Byknya", y, bottom - y, 1, 9);
    add(1, "Nama Barang"); add(2, "Harga", y, middle - y, 2);
    add(2, "Satuan", middle, bottom - middle); add(3, "Jumlah", middle, bottom - middle);
  }
  return { x: xs[0], y, width: xs[xs.length - 1] - xs[0], height: bottom - y, columnXs: xs,
    redraw: hasValidReceiptColumnWidths(subcategory, widths), fill: spanduk ? "#373396" : "#ffffff", color: spanduk ? "#ffffff" : "#373396", lineWidth: spanduk ? .12 : .35, rules, labels };
}

export function getPrintingReceiptTotals(receipt: PrintingReceipt, transaction?: PrintingReceiptPayment | null) {
  const subtotal = receipt.document.lines.reduce((sum, line) => sum + (line.quantity ?? 0) * (line.price ?? 0), 0);
  const payment = transaction ?? receipt.transaction;
  const total = payment ? Number(payment.total) : subtotal;
  const paid = payment ? Math.min(total, Math.max(0, Number(payment.amountPaid))) : 0;
  return { subtotal, total, paid, remaining: Math.max(0, total - paid) };
}

export interface MeasuredReceiptRow {
  line: PrintingReceiptLine; number: number; rowIndex: number; y: number; height: number;
  nameLines: string[]; materialLines: string[]; continuation: boolean; materialContinuation: boolean;
}

const textHeight = (lines: string[], fontSize: number) => lines.length ? lines.length * fontSize / POINTS_PER_MM * RECEIPT_TEXT_LINE_HEIGHT + 2 * RECEIPT_TEXT_PADDING_Y : 0;

/** Preserve whitespace and explicit line breaks; jsPDF's default splitter discards spaces. */
function wrapReceiptText(pdf: jsPDF, value: string, field: ReceiptField, fontSize = field.fontSize ?? 9): string[] {
  if (!value) return [];
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(fontSize);
  const width = field.width - 2 * RECEIPT_TEXT_PADDING_X;
  return value.split(/\r\n|\r|\n/).flatMap(paragraph => {
    const lines: string[] = [];
    let remaining = Array.from(paragraph);
    while (remaining.length) {
      let low = 1;
      let high = remaining.length;
      let fit = 1;
      while (low <= high) {
        const middle = Math.floor((low + high) / 2);
        if (pdf.getTextWidth(remaining.slice(0, middle).join("")) <= width + EPSILON) { fit = middle; low = middle + 1; }
        else high = middle - 1;
      }
      if (fit < remaining.length) {
        let lastSpace = fit - 1;
        while (lastSpace >= 0 && !/\s/.test(remaining[lastSpace])) lastSpace--;
        if (lastSpace >= 0) fit = lastSpace + 1;
      }
      lines.push(remaining.slice(0, fit).join(""));
      remaining = remaining.slice(fit);
    }
    return lines.length ? lines : [""];
  });
}

function isBlankReceiptLine(line: PrintingReceiptLine) {
  return !line.name.trim() && !line.material.trim() && line.quantity === null && line.price === null && line.stockLink === null;
}

export function buildPrintingReceiptPages(receipt: PrintingReceipt, measurementPdf?: jsPDF) {
  const layout = getPrintingReceiptLayout(receipt.subcategory, receipt.document.columnWidths);
  const a5 = receipt.subcategory !== "SPANDUK";
  const pdf = measurementPdf ?? new jsPDF({ unit: "mm", format: [layout.width, layout.height], orientation: a5 ? "portrait" : "landscape" });
  const capacity = layout.rowHeight * layout.rowsPerPage;
  const materialFont = a5 ? 7 : layout.columns.material.fontSize ?? 9;
  const nameFont = layout.columns.name.fontSize ?? 9;
  const rowHeight = (name: string[], material: string[]) => Math.ceil(Math.max(layout.rowHeight, a5
    ? textHeight(name, nameFont) + textHeight(material, materialFont) + (name.length && material.length ? MATERIAL_GAP : 0)
    : Math.max(textHeight(name, nameFont), material.length ? textHeight(material, materialFont) + RECEIPT_MATERIAL_PADDING_Y - RECEIPT_TEXT_PADDING_Y : 0)) * 1e8) / 1e8;
  const pageRows: MeasuredReceiptRow[][] = [[]];
  let used = 0;
  const newPage = () => { pageRows.push([]); used = 0; };
  const addRow = (line: PrintingReceiptLine, number: number, nameLines: string[], materialLines: string[], continuation: boolean, materialContinuation = false) => {
    const rows = pageRows[pageRows.length - 1];
    const height = rowHeight(nameLines, materialLines);
    rows.push({ line, number, rowIndex: rows.length, y: layout.tableTop + used, height, nameLines, materialLines, continuation, materialContinuation });
    used += height;
  };
  let lastMeaningful = receipt.document.lines.length - 1;
  while (lastMeaningful >= 0 && isBlankReceiptLine(receipt.document.lines[lastMeaningful])) lastMeaningful--;
  for (const [index, line] of receipt.document.lines.entries()) {
    const name = wrapReceiptText(pdf, line.name, layout.columns.name);
    const material = wrapReceiptText(pdf, line.material, layout.columns.material, materialFont);
    // Keep both A5 inputs available while editing, even before either value is entered.
    if (a5 && !name.length) name.push("");
    if (a5 && !material.length) material.push("");
    const height = rowHeight(name, material);
    // Saved trailing blanks are editable spare cells, not a reason to create another sheet.
    if (index > lastMeaningful && height > capacity - used + EPSILON) break;
    if (height <= capacity + EPSILON) {
      if (height > capacity - used + EPSILON) newPage();
      addRow(line, index + 1, name, material, false);
      continue;
    }
    if (used > EPSILON) newPage();
    let nameOffset = 0;
    let materialOffset = 0;
    let continuation = false;
    while (nameOffset < name.length || materialOffset < material.length) {
      const nameFragment: string[] = [];
      const materialFragment: string[] = [];
      const materialContinuation = materialOffset > 0 || (!material.length && continuation);
      while (nameOffset < name.length) {
        const candidate = [...nameFragment, name[nameOffset]];
        // A final name fragment needs enough room for its empty material input.
        const reservedMaterial = a5 && !line.material && nameOffset === name.length - 1 ? material : materialFragment;
        if (rowHeight(candidate, reservedMaterial) > capacity + EPSILON) break;
        nameFragment.push(name[nameOffset++]);
      }
      // A5 stacks material after the complete name; SPANDUK uses an independent column.
      if (!a5 || nameOffset === name.length) {
        while (materialOffset < material.length && rowHeight(nameFragment, [...materialFragment, material[materialOffset]]) <= capacity + EPSILON) materialFragment.push(material[materialOffset++]);
      }
      addRow(line, index + 1, nameFragment, materialFragment, continuation, materialContinuation);
      continuation = true;
      if (nameOffset < name.length || materialOffset < material.length) newPage();
    }
  }
  return pageRows.map((lines, pageIndex) => {
    const rows = lines.map(({ y, height }) => ({ y, height }));
    let y = rows.length ? rows[rows.length - 1].y + rows[rows.length - 1].height : layout.tableTop;
    const bottom = layout.tableTop + capacity;
    while (y < bottom - EPSILON) {
      const height = Math.min(layout.rowHeight, bottom - y);
      rows.push({ y, height }); y += height;
    }
    const columnXs = getReceiptColumnBoundaries(receipt.subcategory, receipt.document.columnWidths);
    return {
      pageIndex, pageCount: pageRows.length, number: receipt.number, showTotals: pageIndex === pageRows.length - 1, lines,
      header: buildReceiptHeader(receipt.subcategory, receipt.document.columnWidths),
      table: { x: columnXs[0], y: layout.tableTop, width: columnXs[columnXs.length - 1] - columnXs[0], height: capacity, columnXs, lineWidth: a5 ? 0.35 : 0.12, striped: !a5, rows },
    };
  });
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

export type ReceiptDocumentTextKey = Exclude<keyof PrintingReceipt["document"], "lines" | "customerId" | "title" | "columnWidths">;
export interface ReceiptSheetField extends ReceiptField {
  key: string; value: string; label: string;
  documentField?: ReceiptDocumentTextKey;
  receiptField?: "number";
  lineId?: string;
  lineField?: "name" | "material" | "quantity" | "price";
  multiline?: boolean;
  inputType?: "text" | "number" | "date" | "time";
  whiteBackground?: boolean;
  textLines?: string[];
  topAligned?: boolean;
  continuation?: boolean;
}

export function getPrintingReceiptPageFields(receipt: PrintingReceipt, page: ReturnType<typeof buildPrintingReceiptPages>[number], transaction?: PrintingReceiptPayment | null): ReceiptSheetField[] {
  const layout = getPrintingReceiptLayout(receipt.subcategory, receipt.document.columnWidths);
  const fields: ReceiptSheetField[] = [];
  const add = (field: ReceiptSheetField) => { if (field.width > 0 && field.height > 0) fields.push(field); };
  add({ ...layout.fields.number, key: "number", receiptField: "number", label: "Nomor nota", value: receipt.number });
  const documentFields: [ReceiptDocumentTextKey, string, ReceiptSheetField["inputType"]?, boolean?][] = [
    ["date", "Tanggal nota", "date"], ["customerName", "Nama pelanggan", "text", true], ["customerPhone", "Telepon pelanggan"],
    ["note", "Keterangan", "text", true], ["completionTime", "Jam selesai", "time"], ["completionDate", "Hari selesai", "date"],
    ["receiver", "Penerima"], ["setter", "Petugas seting"], ["signatory", "Hormat kami"],
  ];
  for (const [key, label, inputType, multiline] of documentFields) add({ ...layout.fields[key], key, value: receipt.document[key], label, documentField: key, inputType, multiline, whiteBackground: key === "date" || key === "customerName" || key === "customerPhone" });
  if (receipt.subcategory === "SPANDUK") add({ ...box(21, 24.5, 22, 4.3, 9), color: "#373396", bold: true, key: "number-label", label: "", value: "No. Nota:" });
  for (const { line, number, y, height, nameLines, materialLines, continuation, materialContinuation } of page.lines) {
    const a5 = receipt.subcategory !== "SPANDUK";
    if (!a5 && !continuation) add({ ...layout.columns.index, y, topAligned: true, key: `${line.id}-index`, label: `Nomor baris ${number}`, value: String(number) });
    const nameHeight = a5 && materialLines.length ? textHeight(nameLines, layout.columns.name.fontSize ?? 10) : height;
    for (const [key, label] of [["name", "Nama item"], ["material", "Bahan"], ["quantity", "Banyaknya"], ["price", "Harga satuan"]] as const) {
      const isText = key === "name" || key === "material";
      if (continuation && !isText) continue;
      const column = layout.columns[key];
      const textLines = key === "name" ? nameLines : materialLines;
      const fieldContinuation = key === "material" ? materialContinuation : continuation;
      const materialY = y + nameHeight + (nameLines.length && materialLines.length ? MATERIAL_GAP : 0);
      add({ ...column, y: a5 && key === "material" ? materialY : y,
        height: !isText ? column.height : !a5 ? height : key === "name" ? nameHeight : textHeight(materialLines, 7),
        fontSize: a5 && key === "material" ? 7 : column.fontSize, key: `${line.id}-${key}${fieldContinuation ? `-fragment-${page.pageIndex}` : ""}`, label: `${label} baris ${number}`,
        lineId: line.id, lineField: key, value: fieldContinuation ? textLines.join("\n") : line[key] === null ? "" : String(line[key]), multiline: isText,
        topAligned: true, continuation: fieldContinuation, ...(isText ? { textLines } : {}), inputType: key === "price" || key === "quantity" ? "number" : "text" });
    }
    if (!continuation) add({ ...layout.columns.total, y, topAligned: true, key: `${line.id}-total`, label: `Jumlah baris ${number}`, value: printingLineAmount(line) });
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
