import { jsPDF } from "jspdf";
import { getPrintingReceiptLayout, getPrintingReceiptWatermark, type PrintingReceiptPayment } from "./layout";
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
  pdf.setFontSize(fontSize);
  const lines = field.textLines;
  const align = field.align ?? "left";
  const x = align === "right" ? field.x + field.width - 0.7 : align === "center" ? field.x + field.width / 2 : field.x + 0.7;
  const textHeight = lines.length * fontSize / 2.83465 * 1.12;
  const y = field.y + Math.max(0.4, (field.height - textHeight) / 2) + fontSize / 2.83465 * 0.83;
  pdf.text(lines, x, y, { align, lineHeightFactor: 1.12 });
}

function drawWatermark(pdf: jsPDF, watermark: string | null, width: number, height: number) {
  if (!watermark) return;
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(32); pdf.setTextColor(220, 219, 238);
  pdf.setFontSize(Math.min(32, 32 * width * 0.8 / pdf.getTextWidth(watermark)));
  pdf.text(watermark, width / 2, height / 2, { align: "center", angle: 22 });
}

export async function createPrintingReceiptPdf(receipt: PrintingReceipt, transaction?: ReceiptPayment, artworkDataUrl?: string): Promise<jsPDF> {
  const layout = getPrintingReceiptLayout(receipt.subcategory);
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
