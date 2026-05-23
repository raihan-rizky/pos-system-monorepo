"use client";

import {
  REPORT_HEADER,
  PAYMENT_METHODS,
  buildReportSheetData,
  type ReportCategorySummary,
  type ReportRow,
  type ReportFooter,
  type ReportPeriod,
} from "./journal-core";

const PERIOD_LABEL_ID: Record<ReportPeriod, string> = {
  daily: "Harian",
  weekly: "Mingguan",
  monthly: "Bulanan",
};

function formatRupiah(value: number): string {
  return `Rp ${Math.round(value).toLocaleString("id-ID")}`;
}

function todayJakartaKey(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function buildFilename(period: ReportPeriod, ext: "xlsx" | "pdf"): string {
  return `laporan-keuangan-${period}-${todayJakartaKey()}.${ext}`;
}

function periodTitle(period: ReportPeriod, from: string, to: string): string {
  if (from === to) return `Laporan ${PERIOD_LABEL_ID[period]} · ${from}`;
  return `Laporan ${PERIOD_LABEL_ID[period]} · ${from} – ${to}`;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type ExportInput = {
  period: ReportPeriod;
  from: string;
  to: string;
  rows: ReportRow[];
  footer: ReportFooter;
  categories?: ReportCategorySummary[];
};

// ── XLSX ──────────────────────────────────────────────────────────────────
const COLOR = {
  brand: "0F172A", // slate-900 (header bar)
  brandText: "FFFFFF",
  titleText: "0F172A",
  zebra: "F8FAFC", // surface-50
  border: "E2E8F0", // surface-200
  footerBg: "F1F5F9", // surface-100
  separator: "CBD5E1", // surface-300
  pemasukan: "047857", // emerald-700
  pengeluaran: "B91C1C", // red-700
  negative: "DC2626", // red-600
  muted: "64748B", // surface-500
} as const;

const NUM_FMT = "#,##0;[Red]-#,##0";

function thinBorder() {
  return {
    top: { style: "thin", color: { rgb: COLOR.border } },
    bottom: { style: "thin", color: { rgb: COLOR.border } },
    left: { style: "thin", color: { rgb: COLOR.border } },
    right: { style: "thin", color: { rgb: COLOR.border } },
  };
}

export async function exportReportXlsx(input: ExportInput): Promise<void> {
  const XLSX = (await import("xlsx-js-style")) as typeof import("xlsx-js-style");
  const sheetData = buildReportSheetData(input.rows, input.footer);
  const titleRow: (string | number)[] = [
    periodTitle(input.period, input.from, input.to),
  ];
  const subtitleRow: (string | number)[] = [
    `Diunduh: ${new Intl.DateTimeFormat("id-ID", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Jakarta",
    }).format(new Date())}`,
  ];
  const aoa: (string | number)[][] = [titleRow, subtitleRow, [], ...sheetData];
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  const lastCol = REPORT_HEADER.length - 1;
  const colWidths = [14, 20, 24, 38, 26, 14, 18, 14].map((w) => ({ wch: w }));
  ws["!cols"] = colWidths;

  // Merge title + subtitle across all columns
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: lastCol } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: lastCol } },
  ];

  // Row heights — title taller, header a touch taller for breathing room
  ws["!rows"] = [{ hpt: 28 }, { hpt: 16 }];

  const setStyle = (r: number, c: number, style: Record<string, unknown>) => {
    const ref = XLSX.utils.encode_cell({ r, c });
    let cell = ws[ref];
    if (!cell) {
      cell = { t: "s", v: "" };
      ws[ref] = cell;
    }
    cell.s = { ...(cell.s || {}), ...style };
  };

  // Title styling (row 0)
  setStyle(0, 0, {
    font: { name: "Calibri", sz: 16, bold: true, color: { rgb: COLOR.titleText } },
    alignment: { horizontal: "left", vertical: "center" },
  });
  // Subtitle (row 1)
  setStyle(1, 0, {
    font: { name: "Calibri", sz: 9, italic: true, color: { rgb: COLOR.muted } },
    alignment: { horizontal: "left", vertical: "center" },
  });

  const headerRow = 3; // 0:title, 1:subtitle, 2:blank, 3:header
  const dataStart = headerRow + 1;
  const dataEnd = dataStart + input.rows.length - 1; // inclusive; -1 if no rows
  // sheetData layout after header: data rows, blank, 3 totals, blank, 5 method rows
  const blankAfterData = dataEnd + 1; // points to blank separator (sheetData index)
  const totalsStart = blankAfterData + 1;
  const totalsEnd = totalsStart + 2; // 3 total rows
  const methodSeparator = totalsEnd + 1;
  const methodStart = methodSeparator + 1;
  const methodEnd = methodStart + 4; // 5 methods

  // Header row styling
  for (let c = 0; c <= lastCol; c++) {
    setStyle(headerRow, c, {
      font: {
        name: "Calibri",
        sz: 11,
        bold: true,
        color: { rgb: COLOR.brandText },
      },
      fill: { patternType: "solid", fgColor: { rgb: COLOR.brand } },
      alignment: { horizontal: c === 6 ? "right" : "left", vertical: "center" },
      border: thinBorder(),
    });
  }

  // Data row styling (zebra + borders + amount format/color + status color)
  if (input.rows.length > 0) {
    for (let i = 0; i < input.rows.length; i++) {
      const R = dataStart + i;
      const isOdd = i % 2 === 1;
      const row = input.rows[i]!;
      for (let c = 0; c <= lastCol; c++) {
        const isAmount = c === 6;
        const isStatus = c === 5;
        const baseFontColor = isStatus
          ? row.status === "Pemasukan"
            ? COLOR.pemasukan
            : COLOR.pengeluaran
          : isAmount && row.amount < 0
            ? COLOR.negative
            : "111827"; // surface-900-ish
        const style: Record<string, unknown> = {
          font: {
            name: "Calibri",
            sz: 10,
            bold: isStatus || isAmount,
            color: { rgb: baseFontColor },
          },
          alignment: {
            horizontal: isAmount ? "right" : "left",
            vertical: "center",
            wrapText: c === 3 || c === 4, // products / categories
          },
          border: thinBorder(),
        };
        if (isOdd) {
          style.fill = { patternType: "solid", fgColor: { rgb: COLOR.zebra } };
        }
        if (isAmount) {
          (style as { numFmt?: string }).numFmt = NUM_FMT;
        }
        setStyle(R, c, style);
      }
    }
  }

  // Totals styling (Total Pemasukan / Pengeluaran / Grand Total)
  for (let r = totalsStart; r <= totalsEnd; r++) {
    const isGrand = r === totalsEnd;
    for (let c = 0; c <= lastCol; c++) {
      setStyle(r, c, {
        font: {
          name: "Calibri",
          sz: isGrand ? 12 : 11,
          bold: true,
          color: { rgb: COLOR.titleText },
        },
        fill: {
          patternType: "solid",
          fgColor: { rgb: isGrand ? COLOR.separator : COLOR.footerBg },
        },
        alignment: {
          horizontal: c === 6 ? "right" : "left",
          vertical: "center",
        },
        border: thinBorder(),
        ...(c === 6 ? { numFmt: NUM_FMT } : {}),
      });
    }
    // Merge label across columns 0..5 for a cleaner look
    (ws["!merges"] as { s: { r: number; c: number }; e: { r: number; c: number } }[]).push({
      s: { r, c: 0 },
      e: { r, c: 5 },
    });
  }

  // Per-method rows
  for (let r = methodStart; r <= methodEnd; r++) {
    for (let c = 0; c <= lastCol; c++) {
      setStyle(r, c, {
        font: { name: "Calibri", sz: 10, color: { rgb: COLOR.titleText } },
        fill: { patternType: "solid", fgColor: { rgb: COLOR.footerBg } },
        alignment: {
          horizontal: c === 6 ? "right" : "left",
          vertical: "center",
        },
        border: thinBorder(),
        ...(c === 6 ? { numFmt: NUM_FMT } : {}),
      });
    }
    (ws["!merges"] as { s: { r: number; c: number }; e: { r: number; c: number } }[]).push({
      s: { r, c: 0 },
      e: { r, c: 5 },
    });
  }

  // Freeze the header row and the title rows
  (ws as { [key: string]: unknown })["!freeze"] = { xSplit: 0, ySplit: dataStart };
  // Some viewers prefer the explicit views API
  (ws as { [key: string]: unknown })["!views"] = [
    { state: "frozen", xSplit: 0, ySplit: dataStart, topLeftCell: "A" + (dataStart + 1), activePane: "bottomLeft" },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Laporan");
  if (input.categories && input.categories.length > 0) {
    const categorySheetData: (string | number)[][] = [
      ["Kategori Produk", "Transaksi", "Revenue"],
      ...input.categories.map((category) => [
        category.categoryName,
        category.transactionCount,
        category.revenue,
      ]),
    ];
    const categoryWs = XLSX.utils.aoa_to_sheet(categorySheetData);
    categoryWs["!cols"] = [{ wch: 28 }, { wch: 12 }, { wch: 18 }];

    for (let c = 0; c <= 2; c++) {
      const ref = XLSX.utils.encode_cell({ r: 0, c });
      const cell = categoryWs[ref];
      if (cell) {
        cell.s = {
          font: {
            name: "Calibri",
            sz: 11,
            bold: true,
            color: { rgb: COLOR.brandText },
          },
          fill: { patternType: "solid", fgColor: { rgb: COLOR.brand } },
          alignment: { horizontal: c === 2 ? "right" : "left", vertical: "center" },
          border: thinBorder(),
        };
      }
    }

    for (let r = 1; r <= input.categories.length; r++) {
      for (let c = 0; c <= 2; c++) {
        const ref = XLSX.utils.encode_cell({ r, c });
        const cell = categoryWs[ref];
        if (!cell) continue;
        cell.s = {
          font: { name: "Calibri", sz: 10, color: { rgb: COLOR.titleText } },
          alignment: { horizontal: c === 2 ? "right" : "left", vertical: "center" },
          border: thinBorder(),
          ...(c === 2 ? { numFmt: NUM_FMT } : {}),
        };
      }
    }

    XLSX.utils.book_append_sheet(wb, categoryWs, "Kategori Produk");
  }
  XLSX.writeFile(wb, buildFilename(input.period, "xlsx"));
}

// ── PDF ───────────────────────────────────────────────────────────────────
const PDF_COLOR = {
  brand: [15, 23, 42] as [number, number, number], // slate-900
  brandText: [255, 255, 255] as [number, number, number],
  pageBg: [248, 250, 252] as [number, number, number], // surface-50
  zebra: [248, 250, 252] as [number, number, number],
  border: [226, 232, 240] as [number, number, number], // surface-200
  footerBg: [241, 245, 249] as [number, number, number], // surface-100
  grandBg: [203, 213, 225] as [number, number, number], // surface-300
  text: [15, 23, 42] as [number, number, number],
  muted: [100, 116, 139] as [number, number, number], // surface-500
  pemasukan: [4, 120, 87] as [number, number, number], // emerald-700
  pengeluaran: [185, 28, 28] as [number, number, number], // red-700
  negative: [220, 38, 38] as [number, number, number], // red-600
  cardPemasukan: [236, 253, 245] as [number, number, number], // emerald-50
  cardPengeluaran: [254, 242, 242] as [number, number, number], // red-50
  cardGrand: [241, 245, 249] as [number, number, number],
} as const;

export async function exportReportPdf(input: ExportInput): Promise<void> {
  const [{ default: jsPDF }, autoTableModule] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = autoTableModule.default ?? autoTableModule;

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 32;

  // ── Title bar ──────────────────────────────────────────────────────────
  const barH = 56;
  doc.setFillColor(...PDF_COLOR.brand);
  doc.rect(0, 0, pageWidth, barH, "F");

  doc.setTextColor(...PDF_COLOR.brandText);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(periodTitle(input.period, input.from, input.to), margin, 28);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(203, 213, 225); // slate-300 for subtitle on dark bar
  doc.text("Laporan Keuangan", margin, 44);

  doc.setTextColor(...PDF_COLOR.brandText);
  doc.setFontSize(9);
  doc.text(
    `Diunduh: ${new Intl.DateTimeFormat("id-ID", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Jakarta",
    }).format(new Date())}`,
    pageWidth - margin,
    44,
    { align: "right" },
  );

  // ── Summary cards ──────────────────────────────────────────────────────
  const cardsTop = barH + 16;
  const cardH = 52;
  const gap = 12;
  const cardW = (pageWidth - margin * 2 - gap * 2) / 3;

  const cards: Array<{
    label: string;
    value: string;
    bg: readonly [number, number, number];
    valueColor: readonly [number, number, number];
  }> = [
    {
      label: "Total Pemasukan",
      value: formatRupiah(input.footer.totalPemasukan),
      bg: PDF_COLOR.cardPemasukan,
      valueColor: PDF_COLOR.pemasukan,
    },
    {
      label: "Total Pengeluaran",
      value: formatRupiah(input.footer.totalPengeluaran),
      bg: PDF_COLOR.cardPengeluaran,
      valueColor: PDF_COLOR.pengeluaran,
    },
    {
      label: "Grand Total",
      value: formatRupiah(input.footer.grandTotal),
      bg: PDF_COLOR.cardGrand,
      valueColor: PDF_COLOR.text,
    },
  ];

  cards.forEach((card, i) => {
    const x = margin + i * (cardW + gap);
    doc.setFillColor(card.bg[0], card.bg[1], card.bg[2]);
    doc.setDrawColor(...PDF_COLOR.border);
    doc.setLineWidth(0.5);
    doc.roundedRect(x, cardsTop, cardW, cardH, 6, 6, "FD");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...PDF_COLOR.muted);
    doc.text(card.label.toUpperCase(), x + 12, cardsTop + 16);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(card.valueColor[0], card.valueColor[1], card.valueColor[2]);
    doc.text(card.value, x + 12, cardsTop + 38);
  });

  // ── Main table ─────────────────────────────────────────────────────────
  const tableTop = cardsTop + cardH + 14;
  const body = input.rows.map((row) => [
    row.tanggal,
    row.invoice,
    row.person,
    row.products,
    row.categories,
    row.status,
    formatRupiah(row.amount),
    row.method,
  ]);

  autoTable(doc, {
    head: [[...REPORT_HEADER]],
    body,
    startY: tableTop,
    margin: { left: margin, right: margin, top: barH + 12, bottom: 32 },
    theme: "grid",
    styles: {
      fontSize: 8,
      cellPadding: 5,
      overflow: "linebreak",
      lineColor: PDF_COLOR.border,
      lineWidth: 0.4,
      textColor: PDF_COLOR.text,
      valign: "middle",
    },
    headStyles: {
      fillColor: PDF_COLOR.brand,
      textColor: PDF_COLOR.brandText,
      fontStyle: "bold",
      halign: "left",
      fontSize: 9,
      cellPadding: 6,
      lineWidth: 0,
    },
    alternateRowStyles: {
      fillColor: PDF_COLOR.zebra,
    },
    columnStyles: {
      0: { cellWidth: 60 },
      1: { cellWidth: 78 },
      5: { halign: "center", cellWidth: 64, fontStyle: "bold" },
      6: { halign: "right", cellWidth: 90, fontStyle: "bold" },
      7: { halign: "center", cellWidth: 56 },
    },
    didParseCell: (data) => {
      if (data.section !== "body") return;
      const raw = input.rows[data.row.index];
      if (!raw) return;
      if (data.column.index === 5) {
        data.cell.styles.textColor =
          raw.status === "Pemasukan"
            ? PDF_COLOR.pemasukan
            : PDF_COLOR.pengeluaran;
      }
      if (data.column.index === 6 && raw.amount < 0) {
        data.cell.styles.textColor = PDF_COLOR.negative;
      }
    },
  });

  // ── Per-method breakdown table ─────────────────────────────────────────
  type DocWithAuto = typeof doc & { lastAutoTable?: { finalY: number } };
  const afterTableY = (doc as DocWithAuto).lastAutoTable?.finalY ?? tableTop;
  const breakdownTop = afterTableY + 18;

  // If too close to page bottom, add a new page
  const breakdownEstHeight = 24 + PAYMENT_METHODS.length * 22;
  if (breakdownTop + breakdownEstHeight > pageHeight - 32) {
    doc.addPage();
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...PDF_COLOR.text);
  doc.text(
    "Rincian per Metode Pembayaran",
    margin,
    (doc as DocWithAuto).lastAutoTable?.finalY != null
      ? Math.min(breakdownTop, pageHeight - breakdownEstHeight - 32)
      : breakdownTop,
  );

  autoTable(doc, {
    head: [["Metode", "Jumlah"]],
    body: PAYMENT_METHODS.map((m) => [m, formatRupiah(input.footer.byMethod[m])]),
    startY:
      ((doc as DocWithAuto).lastAutoTable?.finalY ?? breakdownTop) + 6,
    margin: { left: margin, right: margin, bottom: 32 },
    theme: "grid",
    tableWidth: 280,
    styles: {
      fontSize: 9,
      cellPadding: 6,
      lineColor: PDF_COLOR.border,
      lineWidth: 0.4,
      textColor: PDF_COLOR.text,
    },
    headStyles: {
      fillColor: PDF_COLOR.footerBg,
      textColor: PDF_COLOR.text,
      fontStyle: "bold",
      lineWidth: 0,
    },
    columnStyles: {
      0: { cellWidth: 120, fontStyle: "bold" },
      1: { halign: "right", cellWidth: 160 },
    },
  });

  // Category revenue breakdown
  if (input.categories && input.categories.length > 0) {
    const afterMethodY = (doc as DocWithAuto).lastAutoTable?.finalY ?? breakdownTop;
    const categoryEstHeight = 24 + input.categories.length * 22;
    const categoryTop =
      afterMethodY + 18 + categoryEstHeight > pageHeight - 32 ? 52 : afterMethodY + 18;

    if (categoryTop === 52) {
      doc.addPage();
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...PDF_COLOR.text);
    doc.text("Revenue per Kategori Produk", margin, categoryTop);

    autoTable(doc, {
      head: [["Kategori Produk", "Transaksi", "Revenue"]],
      body: input.categories.map((category) => [
        category.categoryName,
        String(category.transactionCount),
        formatRupiah(category.revenue),
      ]),
      startY: categoryTop + 6,
      margin: { left: margin, right: margin, bottom: 32 },
      theme: "grid",
      tableWidth: 360,
      styles: {
        fontSize: 9,
        cellPadding: 6,
        lineColor: PDF_COLOR.border,
        lineWidth: 0.4,
        textColor: PDF_COLOR.text,
      },
      headStyles: {
        fillColor: PDF_COLOR.footerBg,
        textColor: PDF_COLOR.text,
        fontStyle: "bold",
        lineWidth: 0,
      },
      columnStyles: {
        0: { cellWidth: 170, fontStyle: "bold" },
        1: { halign: "right", cellWidth: 80 },
        2: { halign: "right", cellWidth: 110 },
      },
    });
  }

  // ── Page footer (page numbers + brand line) ────────────────────────────
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setDrawColor(...PDF_COLOR.border);
    doc.setLineWidth(0.5);
    doc.line(margin, pageHeight - 24, pageWidth - margin, pageHeight - 24);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...PDF_COLOR.muted);
    doc.text("Laporan Keuangan", margin, pageHeight - 12);
    doc.text(
      `Halaman ${p} dari ${totalPages}`,
      pageWidth - margin,
      pageHeight - 12,
      { align: "right" },
    );
  }

  doc.save(buildFilename(input.period, "pdf"));
}
