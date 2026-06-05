import type { InternalUseRecap } from "../types";

function formatRupiah(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

function drawLine(doc: import("jspdf").default, y: number): void {
  doc.setDrawColor(226, 232, 240);
  doc.line(32, y, 563, y);
}

export async function buildInternalUseRecapPdf(recap: InternalUseRecap): Promise<ArrayBuffer> {
  const [{ default: jsPDF }, autoTableModule] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = autoTableModule.default ?? autoTableModule;

  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, 595, 70, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Rekap Pemakaian Internal", 32, 30);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(recap.range.label, 32, 50);

  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Ringkasan", 32, 102);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Entri: ${recap.summary.entryCount}`, 32, 124);
  doc.text(`Produk: ${recap.summary.productCount}`, 132, 124);
  doc.text(`Kelompok unit: ${recap.summary.unitGroupCount}`, 232, 124);
  doc.text(`Nilai: ${formatRupiah(recap.summary.totalValue)}`, 372, 124);
  if (recap.summary.hasIncompleteValue) {
    doc.setTextColor(185, 28, 28);
    doc.text(
      `${recap.summary.missingUnitCostCount} entri tanpa HPP, nilai belum lengkap.`,
      32,
      144,
    );
    doc.setTextColor(15, 23, 42);
  }
  drawLine(doc, 158);

  autoTable(doc, {
    startY: 176,
    head: [["Produk", "SKU", "Qty", "Unit", "Nilai"]],
    body: recap.products.map((product) => [
      product.name,
      product.sku,
      product.quantity.toLocaleString("id-ID"),
      product.unit,
      product.missingUnitCostCount > 0
        ? `${formatRupiah(product.value)}*`
        : formatRupiah(product.value),
    ]),
    styles: { font: "helvetica", fontSize: 8, cellPadding: 5 },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
    columnStyles: {
      2: { halign: "right" },
      4: { halign: "right" },
    },
    margin: { left: 32, right: 32 },
  });

  const finalY =
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ??
    176;
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(
    "Dokumen internal. Sumber data: log stok OUT dengan alasan Pemakaian Internal dan status Disetujui.",
    32,
    Math.min(finalY + 28, 800),
  );

  return doc.output("arraybuffer");
}
