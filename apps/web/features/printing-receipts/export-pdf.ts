import { jsPDF } from "jspdf";
import { getPrintingReceiptLayout, getPrintingReceiptWatermark, RECEIPT_TEXT_LINE_HEIGHT, RECEIPT_TEXT_PADDING_X, RECEIPT_TEXT_PADDING_Y, type PrintingReceiptPayment, type ReceiptHeader } from "./layout";
import { buildPrintingReceiptPresentation, type PrintingReceiptPresentedField } from "./presentation";
import type { PrintingReceipt } from "./types";

type ReceiptPayment = PrintingReceiptPayment | null;

async function loadArtwork(path: string): Promise<string> {
  const response = await fetch(path);
  if (!response.ok) throw new Error("Desain nota belum bisa dimuat. Coba unduh kembali.");
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Desain nota tidak dapat dibaca."));
    reader.readAsDataURL(blob);
  });
}

function drawField(pdf: jsPDF, field: PrintingReceiptPresentedField) {
  if (!field.value) return;
  if (field.whiteBackground) {
    pdf.setFillColor(255, 255, 255);
    pdf.rect(field.x, field.y, field.width, field.height, "F");
  }
  const fontSize = field.fittedFontSize;
  pdf.setFont("helvetica", field.bold ? "bold" : "normal");
  pdf.setTextColor(field.color ?? "#242239");
  pdf.setFontSize(fontSize);
  const lines = field.textLines;
  const align = field.align ?? "left";
  const x = align === "right" ? field.x + field.width - RECEIPT_TEXT_PADDING_X : align === "center" ? field.x + field.width / 2 : field.x + RECEIPT_TEXT_PADDING_X;
  const textHeight = lines.length * fontSize / 2.83465 * RECEIPT_TEXT_LINE_HEIGHT;
  const y = field.y + (field.topAligned ? RECEIPT_TEXT_PADDING_Y : Math.max(0.4, (field.height - textHeight) / 2)) + fontSize / 2.83465 * 0.83;
  pdf.text(lines, x, y, { align, lineHeightFactor: RECEIPT_TEXT_LINE_HEIGHT });
}

function drawTable(pdf: jsPDF, table: ReturnType<typeof buildPrintingReceiptPresentation>["pages"][number]["table"]) {
  pdf.saveGraphicsState();
  pdf.setFillColor(255, 255, 255);
  pdf.rect(table.x - .25, table.y - .25, table.width + .5, table.height + .5, "F");
  if (table.striped) {
    pdf.setFillColor("#efefef");
    table.rows.forEach((row, index) => { if (index % 2 === 1) pdf.rect(table.x, row.y, table.width, row.height, "F"); });
  }
  pdf.setDrawColor("#373396");
  pdf.setLineWidth(table.lineWidth);
  for (const x of table.columnXs) pdf.line(x, table.y, x, table.y + table.height);
  for (const y of [table.y, ...table.rows.map(row => row.y + row.height)]) pdf.line(table.x, y, table.x + table.width, y);
  pdf.restoreGraphicsState();
}

function drawWatermark(pdf: jsPDF, watermark: string | null, width: number, height: number) {
  if (!watermark) return;
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(32); pdf.setTextColor(220, 219, 238);
  pdf.setFontSize(Math.min(32, 32 * width * 0.8 / pdf.getTextWidth(watermark)));
  pdf.text(watermark, width / 2, height / 2, { align: "center", angle: 22 });
}

function drawHeader(pdf: jsPDF, header: ReceiptHeader) {
  if (!header.redraw) return;
  pdf.saveGraphicsState();
  pdf.setFillColor("#ffffff");
  pdf.rect(header.x - .25, header.y - .25, header.width + .5, header.height + .25, "F");
  pdf.setFillColor(header.fill);
  pdf.rect(header.x, header.y, header.width, header.height, "F");
  pdf.setLineWidth(header.lineWidth);
  header.rules.forEach((rule, index) => {
    pdf.setDrawColor(header.fill !== "#ffffff" && rule.x1 === rule.x2 && index > 0 && index < header.columnXs.length - 1 ? "#ffffff" : "#373396");
    pdf.line(rule.x1, rule.y1, rule.x2, rule.y2);
  });
  for (const label of header.labels) {
    const fontSize = label.fontSize ?? 9;
    pdf.setFont("helvetica", label.bold ? "bold" : "normal");
    pdf.setFontSize(fontSize);
    pdf.setTextColor(header.color);
    const y = label.y + (label.height - label.textLines.length * fontSize / 2.83465 * RECEIPT_TEXT_LINE_HEIGHT) / 2 + fontSize / 2.83465 * .83;
    pdf.text(label.textLines, label.x + label.width / 2, y, { align: "center", lineHeightFactor: RECEIPT_TEXT_LINE_HEIGHT });
  }
  pdf.restoreGraphicsState();
}

export async function createPrintingReceiptPdf(receipt: PrintingReceipt, transaction?: ReceiptPayment, artworkDataUrl?: string): Promise<jsPDF> {
  const layout = getPrintingReceiptLayout(receipt.subcategory, receipt.document.columnWidths);
  const artwork = artworkDataUrl ?? await loadArtwork(layout.artwork);
  const orientation = layout.width > layout.height ? "landscape" : "portrait";
  const pdf = new jsPDF({ orientation, unit: "mm", format: [layout.width, layout.height], compress: false });
  pdf.setProperties({ title: `Nota ${receipt.number}`, subject: `Nota ${receipt.subcategory}`, creator: "POS Toko Teladan" });
  const { pages, appendixPages, appendixTitleLines, appendixTitleFontSize, appendixSubtitleY } = buildPrintingReceiptPresentation(receipt, transaction, pdf);
  const watermark = getPrintingReceiptWatermark(receipt, transaction);
  for (const page of pages) {
    if (page.pageIndex > 0) pdf.addPage([layout.width, layout.height], orientation);
    pdf.addImage(artwork, "PNG", 0, 0, layout.width, layout.height, undefined, "FAST");
    if (layout.numberMask) {
      pdf.setFillColor(255, 255, 255);
      pdf.rect(layout.numberMask.x, layout.numberMask.y, layout.numberMask.width, layout.numberMask.height, "F");
    }
    drawTable(pdf, page.table);
    drawHeader(pdf, page.header);
    drawWatermark(pdf, watermark, layout.width, layout.height);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(36, 34, 57);
    for (const field of page.fields) drawField(pdf, field);
  }
  for (const [index, page] of appendixPages.entries()) {
    pdf.addPage([layout.width, layout.height], orientation);
    drawWatermark(pdf, watermark, layout.width, layout.height);
    pdf.setTextColor(36, 34, 57); pdf.setFont("helvetica", "bold"); pdf.setFontSize(appendixTitleFontSize);
    pdf.text(appendixTitleLines, 10, 12, { lineHeightFactor: 1.12 });
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(8);
    pdf.text("Rincian lengkap dan keterangan tambahan", 10, appendixSubtitleY);
    pdf.text(`Lampiran ${index + 1}/${appendixPages.length}`, layout.width - 10, layout.height - 6, { align: "right" });
    for (const line of page.lines) {
      pdf.setFont("helvetica", line.bold ? "bold" : "normal"); pdf.setFontSize(9);
      pdf.text(line.text, 10, line.y);
    }
  }
  return pdf;
}

export async function downloadPrintingReceiptPdf(receipt: PrintingReceipt, transaction?: ReceiptPayment) {
  const pdf = await createPrintingReceiptPdf(receipt, transaction);
  pdf.save(`nota-${receipt.subcategory.toLowerCase()}-${receipt.number.replace(/[^a-zA-Z0-9_-]/g, "-")}.pdf`);
}

export async function printPrintingReceiptPdf(receipt: PrintingReceipt, transaction?: ReceiptPayment) {
  const preview = window.open("", "_blank");
  if (!preview) throw new Error("Izinkan popup untuk membuka dan mencetak PDF nota.");
  preview.document.title = "Menyiapkan nota...";
  try {
    const pdf = await createPrintingReceiptPdf(receipt, transaction);
    pdf.autoPrint();
    const url = URL.createObjectURL(pdf.output("blob"));
    preview.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 300_000);
  } catch (error) { preview.close(); throw error; }
}
