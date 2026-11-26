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
import { fetchFinancialReport } from "../hooks/useFinancialReport";
import { buildReportBreakdownTables } from "./report-breakdowns";

type ExportPeriod = ReportPeriod | "custom";

const PERIOD_LABEL_ID: Record<ExportPeriod, string> = {
  daily: "Harian",
  weekly: "Mingguan",
  monthly: "Bulanan",
  "30d": "30 Hari Terakhir",
  custom: "Periode Pilihan",
};

export type ReportExportFormat = "xlsx" | "pdf";
export type ReportPdfPageMode = "single" | "multiple";

function formatRupiah(value: number): string {
  const cents = Math.round(value * 100);
  return `Rp ${(cents / 100).toLocaleString("id-ID", { minimumFractionDigits: cents % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;
}

function todayJakartaKey(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function buildFilename(period: ExportPeriod, ext: "xlsx" | "pdf"): string {
  return `laporan-keuangan-${period}-${todayJakartaKey()}.${ext}`;
}

function periodTitle(period: ExportPeriod, from: string, to: string): string {
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
  period: ExportPeriod;
  from: string;
  to: string;
  rows: ReportRow[];
  footer: ReportFooter;
  categories?: ReportCategorySummary[];
  details?: {
    note?: string;
    showExpenseTotals?: boolean;
    tables: Array<{ title: string; headers: string[]; rows: string[][] }>;
  };
};

export type ReportExportResult = { advice: string[] };

export function buildFinancialExportAdvice(input: ExportInput): string[] {
  const { totalPemasukan, totalPengeluaran, grandTotal, byMethod } = input.footer;
  if (totalPemasukan <= 0) {
    return ["Belum ada pemasukan pada periode ini. Cek kembali periode laporan atau aktivitas transaksi toko."];
  }

  const expenseRatio = totalPengeluaran / totalPemasukan;
  const dominantMethod = Object.entries(byMethod).sort((a, b) => b[1] - a[1])[0];
  const advice = [
    expenseRatio >= 0.5
      ? `Pengeluaran mencapai ${Math.round(expenseRatio * 100)}% dari pemasukan. Review pos biaya terbesar sebelum menentukan budget berikutnya.`
      : `Pengeluaran berada di ${Math.round(expenseRatio * 100)}% dari pemasukan. Pertahankan kontrol biaya dan pantau perubahan rasionya.`,
    grandTotal < 0
      ? "Arus bersih periode ini negatif. Prioritaskan penagihan dan tunda pengeluaran yang tidak mendesak."
      : "Arus bersih periode ini positif. Sisihkan sebagian untuk buffer kas dan kebutuhan stok prioritas.",
  ];
  if (dominantMethod && dominantMethod[1] > 0) {
    advice.push(`Metode pembayaran terbesar adalah ${dominantMethod[0]}. Cocokkan nilainya dengan settlement atau kas fisik.`);
  }
  return advice;
}

export async function exportFinancialReportFile(
  period: ExportPeriod,
  format: ReportExportFormat,
  previewSales = false,
  range?: { from: string; to: string },
  pageMode: ReportPdfPageMode = "multiple",
): Promise<ReportExportResult> {
  const params = new URLSearchParams({ period });
  if (period === "custom" && range) { params.set("from", range.from); params.set("to", range.to); }
  if (previewSales) params.set("view", "sales");
  const response = await fetch(`/api/finance/report/journal?${params}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { message?: string };
    throw new Error(body.message || `Gagal memuat data (${response.status})`);
  }

  const input = await response.json() as ExportInput;
  if (format === "xlsx") {
    await exportReportXlsx(input);
  } else if (pageMode === "single") {
    const report = await fetchFinancialReport({
      dateFrom: input.from,
      dateTo: input.to,
      summaryCatalog: true,
      ...(previewSales ? { view: "sales" } : {}),
    });
    if (!report.summaryCatalog) throw new Error("Daftar kategori laporan belum tersedia. Silakan coba lagi.");
    const paymentMethods = PAYMENT_METHODS.map(method => ({ method, amount: input.footer.byMethod[method] ?? 0 }));
    const tables = buildReportBreakdownTables(report, paymentMethods, report.summaryCatalog, formatRupiah);
    await exportReportPdf({ ...input, details: { tables } }, pageMode);
  } else {
    await exportReportPdf(input, pageMode);
  }
  return { advice: buildFinancialExportAdvice(input) };
}

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

const NUM_FMT = "#,##0.00;[Red]-#,##0.00";

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
  const sheetData = buildReportSheetData(
    input.rows,
    input.footer,
    input.categories ?? [],
  );
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
  const hasCategories = Boolean(input.categories && input.categories.length > 0);
  const categorySeparator = methodEnd + 1;
  const categoryTitle = categorySeparator + 1;
  const categoryHeader = categoryTitle + 1;
  const categoryStart = categoryHeader + 1;
  const categoryEnd = hasCategories
    ? categoryStart + (input.categories?.length ?? 0) - 1
    : categoryStart - 1;

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

  if (hasCategories) {
    for (let c = 0; c <= lastCol; c++) {
      setStyle(categoryTitle, c, {
        font: {
          name: "Calibri",
          sz: 12,
          bold: true,
          color: { rgb: COLOR.titleText },
        },
        fill: { patternType: "solid", fgColor: { rgb: COLOR.separator } },
        alignment: { horizontal: "left", vertical: "center" },
        border: thinBorder(),
      });
    }
    (ws["!merges"] as { s: { r: number; c: number }; e: { r: number; c: number } }[]).push({
      s: { r: categoryTitle, c: 0 },
      e: { r: categoryTitle, c: lastCol },
    });

    for (let c = 0; c <= lastCol; c++) {
      setStyle(categoryHeader, c, {
        font: {
          name: "Calibri",
          sz: 10,
          bold: true,
          color: { rgb: COLOR.brandText },
        },
        fill: { patternType: "solid", fgColor: { rgb: COLOR.brand } },
        alignment: {
          horizontal: c === 1 || c === 6 ? "right" : "left",
          vertical: "center",
        },
        border: thinBorder(),
        ...(c === 6 ? { numFmt: NUM_FMT } : {}),
      });
    }

    for (let r = categoryStart; r <= categoryEnd; r++) {
      const isOdd = (r - categoryStart) % 2 === 1;
      for (let c = 0; c <= lastCol; c++) {
        const style: Record<string, unknown> = {
          font: {
            name: "Calibri",
            sz: 10,
            bold: c === 0 || c === 6,
            color: { rgb: COLOR.titleText },
          },
          alignment: {
            horizontal: c === 1 || c === 6 ? "right" : "left",
            vertical: "center",
          },
          border: thinBorder(),
          ...(c === 6 ? { numFmt: NUM_FMT } : {}),
        };
        if (isOdd) {
          style.fill = { patternType: "solid", fgColor: { rgb: COLOR.zebra } };
        }
        setStyle(r, c, style);
      }
    }
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

export async function createReportPdf(
  input: ExportInput,
  pageMode: ReportPdfPageMode = "multiple",
  formatAmount = formatRupiah,
) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  let scale = 1;
  for (let attempt = 0; attempt < 5; attempt++) {
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4", putOnlyUsedFonts: true });
    drawJournalPdf(doc, autoTable, input, pageMode, scale, formatAmount);
    if (pageMode === "multiple" || doc.getNumberOfPages() === 1) return doc;
    scale /= doc.getNumberOfPages();
  }
  throw new Error("Ringkasan belum bisa dimuat dalam satu lembar. Pilih Banyak halaman.");
}

export async function exportReportPdf(input: ExportInput, pageMode: ReportPdfPageMode = "multiple"): Promise<void> {
  const doc = await createReportPdf(input, pageMode);
  doc.save(buildFilename(input.period, "pdf"));
}

function drawJournalPdf(
  doc: import("jspdf").jsPDF,
  autoTable: typeof import("jspdf-autotable").autoTable,
  input: ExportInput,
  pageMode: ReportPdfPageMode,
  scale: number,
  formatAmount: (value: number) => string,
) {
  const money = (amount: number) => formatAmount(amount).replaceAll("\u00a0", " ");
  // Leave more room for the text by shrinking cell padding first.
  const fontScale = Math.sqrt(scale);
  const paddingScale = scale * scale;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 32;
  const title = periodTitle(input.period, input.from, input.to);
  doc.setProperties({ title });

  // ── Title bar ──────────────────────────────────────────────────────────
  const barH = 56;
  doc.setFillColor(...PDF_COLOR.brand);
  doc.rect(0, 0, pageWidth, barH, "F");

  doc.setTextColor(...PDF_COLOR.brandText);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(title, margin, 28);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(203, 213, 225); // slate-300 for subtitle on dark bar
  doc.text(pageMode === "single" ? "Ringkasan Laporan Keuangan" : "Laporan Keuangan", margin, 44);

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

  const cards: Array<{
    label: string;
    value: string;
    bg: readonly [number, number, number];
    valueColor: readonly [number, number, number];
  }> = [
    {
      label: "Total Pemasukan",
      value: money(input.footer.totalPemasukan),
      bg: PDF_COLOR.cardPemasukan,
      valueColor: PDF_COLOR.pemasukan,
    },
    {
      label: "Total Pengeluaran",
      value: money(input.footer.totalPengeluaran),
      bg: PDF_COLOR.cardPengeluaran,
      valueColor: PDF_COLOR.pengeluaran,
    },
    {
      label: "Grand Total",
      value: money(input.footer.grandTotal),
      bg: PDF_COLOR.cardGrand,
      valueColor: PDF_COLOR.text,
    },
  ];

  const visibleCards = input.details?.showExpenseTotals === false ? cards.slice(0, 1) : cards;
  const cardW = (pageWidth - margin * 2 - gap * (visibleCards.length - 1)) / visibleCards.length;
  visibleCards.forEach((card, i) => {
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

  let tableTop = cardsTop + cardH + 14;
  if (input.details?.note) {
    doc.setFont("helvetica", "normal").setFontSize(8);
    doc.setTextColor(...PDF_COLOR.muted);
    const note: string[] = doc.splitTextToSize(input.details.note, pageWidth - 2 * margin);
    doc.text(note, margin, tableTop);
    tableTop += note.length * 11 + 5;
  }
  if (pageMode === "multiple") {
    const body = input.rows.map((row) => [
      row.tanggal,
      row.invoice,
      row.person,
      row.products,
      row.categories,
      row.status,
      money(row.amount),
      row.method,
    ]);

    autoTable(doc, {
      head: [[...REPORT_HEADER]],
      body: body.length ? body : [[{ content: "Belum ada transaksi.", colSpan: REPORT_HEADER.length }]],
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
      rowPageBreak: "avoid",
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
  }

  type DocWithAuto = typeof doc & { lastAutoTable?: { finalY: number } };
  const tables = input.details?.tables ?? [
    {
      title: "Rincian per Metode Pembayaran",
      headers: ["Metode", "Jumlah"],
      rows: PAYMENT_METHODS.map(method => [method, money(input.footer.byMethod[method])]),
    },
    ...(input.categories?.length ? [{
      title: "Revenue per Kategori Produk",
      headers: ["Kategori Produk", "Transaksi", "Revenue"],
      rows: input.categories.map(category => [category.categoryName, String(category.transactionCount), money(category.revenue)]),
    }] : []),
  ];
  const useSummaryColumns = pageMode === "single" && input.details && tables.length > 2;
  const columnGap = 16;
  const columnWidth = (pageWidth - 2 * margin - columnGap) / 2;
  const tableGap = 12 * scale;
  let startY = ((doc as DocWithAuto).lastAutoTable?.finalY ?? tableTop) + tableGap;
  for (const [index, table] of tables.entries()) {
    const useRightColumn = useSummaryColumns && index === tables.length - 1;
    if (useRightColumn) {
      doc.setPage(1);
      startY = tableTop + tableGap;
    }
    autoTable(doc, {
      head: [[{ content: table.title, colSpan: table.headers.length }], table.headers],
      body: table.rows.length
        ? table.rows.map(row => row.map(cell => cell.replaceAll("\u00a0", " ")))
        : [[{ content: "Belum ada data.", colSpan: table.headers.length }]],
      startY,
      margin: {
        left: useRightColumn ? margin + columnWidth + columnGap : margin,
        right: useSummaryColumns && !useRightColumn ? margin + columnWidth + columnGap : margin,
        top: 36,
        bottom: 32,
      },
      theme: "grid",
      tableWidth: useSummaryColumns ? columnWidth : table.headers.length === 2 ? 320 : 360,
      rowPageBreak: "avoid",
      styles: {
        fontSize: 9 * fontScale,
        cellPadding: 6 * paddingScale,
        lineColor: PDF_COLOR.border,
        lineWidth: 0.4 * scale,
        textColor: PDF_COLOR.text,
      },
      headStyles: {
        fillColor: PDF_COLOR.footerBg,
        textColor: PDF_COLOR.text,
        fontStyle: "bold",
        lineWidth: 0,
      },
      columnStyles: {
        [table.headers.length - 1]: { halign: "right", cellWidth: 110 },
      },
    });
    startY = ((doc as DocWithAuto).lastAutoTable?.finalY ?? startY) + tableGap;
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

}
