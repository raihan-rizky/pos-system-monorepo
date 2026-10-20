import { jsPDF } from "jspdf";
import { buildPrintingReceiptPages, getPrintingReceiptLayout, getPrintingReceiptPageFields, getReceiptFieldDisplayValue, type PrintingReceiptPayment, type ReceiptSheetField } from "./layout";
import type { PrintingReceipt } from "./types";

export interface PrintingReceiptPresentedField extends ReceiptSheetField {
  textLines: string[];
  fittedFontSize: number;
  displayValue: string;
}
export interface PrintingReceiptAppendixPage { lines: { text: string; bold: boolean; y: number }[] }

/** One text layout drives the screen preview and PDF, including complete overflow values. */
export function buildPrintingReceiptPresentation(receipt: PrintingReceipt, transaction?: PrintingReceiptPayment | null, measurementPdf?: jsPDF) {
  const layout = getPrintingReceiptLayout(receipt.subcategory);
  const pdf = measurementPdf ?? new jsPDF({ unit: "mm", format: [layout.width, layout.height], orientation: layout.width > layout.height ? "landscape" : "portrait" });
  pdf.setFont("helvetica", "normal");
  const overflow = new Map<string, { reference: number; label: string; value: string }>();
  const pages = buildPrintingReceiptPages(receipt).map(page => ({ ...page, fields: getPrintingReceiptPageFields(receipt, page, transaction).map(field => {
    const value = getReceiptFieldDisplayValue(field);
    const width = Math.max(0.1, field.width - 1.4);
    const height = Math.max(1, field.height - 0.35);
    let fontSize = field.fontSize ?? 9;
    const minimum = Math.min(fontSize, 7, Math.max(5, height * 2.83465 / 1.12));
    const split = (text: string) => { pdf.setFontSize(fontSize); return pdf.splitTextToSize(text, width) as string[]; };
    let lines = value ? split(value) : [];
    while (lines.length * fontSize / 2.83465 * 1.12 > height && fontSize > minimum) {
      fontSize = Math.max(minimum, fontSize - 0.25);
      lines = split(value);
    }
    if (value && lines.length * fontSize / 2.83465 * 1.12 > height) {
      let entry = overflow.get(field.key);
      if (!entry) { entry = { reference: overflow.size + 1, label: field.label || field.key, value }; overflow.set(field.key, entry); }
      const marker = ` [${entry.reference}]`;
      const capacity = Math.max(1, Math.floor(height / (fontSize / 2.83465 * 1.12)));
      lines = lines.slice(0, capacity);
      let lastLine = lines.at(-1) ?? "";
      while (lastLine && pdf.getTextWidth(`${lastLine}...${marker}`) > width) lastLine = lastLine.slice(0, -1);
      lines[lines.length - 1] = `${lastLine ? `${lastLine}...` : ""}${marker.trimStart()}`;
    }
    return { ...field, textLines: lines, fittedFontSize: fontSize, displayValue: lines.join("\n") };
  }) }));

  if (receipt.subcategory !== "SPANDUK") {
    for (const [key, label] of [["note", "Keterangan"], ["completionDate", "Hari selesai"], ["completionTime", "Jam selesai"], ["receiver", "Penerima"], ["setter", "Petugas seting"]] as const) {
      const value = receipt.document[key];
      if (value.trim()) overflow.set(`supplemental-${key}`, { reference: overflow.size + 1, label, value: key === "completionDate" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split("-").reverse().join("/") : value });
    }
  }
  const appendixTitle = `Lampiran nota ${receipt.number}`;
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(12);
  const appendixTitleFontSize = Math.max(7, Math.min(12, 12 * (layout.width - 20) / Math.max(1, pdf.getTextWidth(appendixTitle))));
  pdf.setFontSize(appendixTitleFontSize);
  const appendixTitleLines = pdf.splitTextToSize(appendixTitle, layout.width - 20) as string[];
  const appendixSubtitleY = 19 + (appendixTitleLines.length - 1) * appendixTitleFontSize / 2.83465 * 1.12;
  const appendixContentY = appendixSubtitleY + 7;
  const appendixPages: PrintingReceiptAppendixPage[] = [];
  let appendix: PrintingReceiptAppendixPage | undefined;
  let y = appendixContentY;
  const addLine = (text: string, bold: boolean) => {
    if (!appendix || y > layout.height - 13) { appendix = { lines: [] }; appendixPages.push(appendix); y = appendixContentY; }
    appendix.lines.push({ text, bold, y }); y += 4;
  };
  for (const entry of overflow.values()) {
    pdf.setFontSize(9); pdf.setFont("helvetica", "bold");
    const label = `[${entry.reference}] ${entry.label}`;
    addLine(label, true);
    pdf.setFont("helvetica", "normal");
    const lines = pdf.splitTextToSize(entry.value, layout.width - 20) as string[];
    for (const line of lines) {
      if (y > layout.height - 13) addLine(`${label} (lanjutan)`, true);
      addLine(line, false);
    }
    y += 3;
  }
  return { pages, appendixPages, appendixTitle, appendixTitleFontSize, appendixTitleLines, appendixSubtitleY };
}
