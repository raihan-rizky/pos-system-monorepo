import type {
  CustomerRecapExportData,
  CustomerRecapExportGroup,
} from "./export-core";

const TYPE_LABELS: Record<string, string> = {
  AGEN: "Agen",
  UMUM: "Umum",
  PEMERINTAH: "Pemerintah",
  INDUSTRI: "Industri",
};

const COLORS = {
  brand: "0F172A",
  brandText: "FFFFFF",
  text: "0F172A",
  muted: "64748B",
  border: "CBD5E1",
  zebra: "F8FAFC",
  section: "E2E8F0",
} as const;

const NUMBER_FORMAT = "#,##0;[Red]-#,##0";

function formatRupiah(value: number): string {
  return `Rp ${Math.round(value).toLocaleString("id-ID")}`;
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
}

function formatPeriod(dateFrom: string, dateTo: string): string {
  return dateFrom === dateTo ? dateFrom : `${dateFrom} - ${dateTo}`;
}

function buildFilename(data: CustomerRecapExportData, extension: "xlsx" | "pdf"): string {
  return `rekap-pelanggan-${data.dateFrom}-${data.dateTo}.${extension}`;
}

function thinBorder() {
  return {
    top: { style: "thin", color: { rgb: COLORS.border } },
    bottom: { style: "thin", color: { rgb: COLORS.border } },
    left: { style: "thin", color: { rgb: COLORS.border } },
    right: { style: "thin", color: { rgb: COLORS.border } },
  };
}

type XlsxModule = typeof import("xlsx-js-style");

function setCellStyle(
  XLSX: XlsxModule,
  worksheet: Record<string, any>,
  row: number,
  column: number,
  style: Record<string, unknown>,
) {
  const reference = XLSX.utils.encode_cell({ r: row, c: column });
  const cell = worksheet[reference] ?? { t: "s", v: "" };
  cell.s = { ...(cell.s ?? {}), ...style };
  worksheet[reference] = cell;
}

function styleHeader(
  XLSX: XlsxModule,
  worksheet: Record<string, any>,
  row: number,
  columnCount: number,
) {
  for (let column = 0; column < columnCount; column += 1) {
    setCellStyle(XLSX, worksheet, row, column, {
      font: { name: "Calibri", sz: 10, bold: true, color: { rgb: COLORS.brandText } },
      fill: { patternType: "solid", fgColor: { rgb: COLORS.brand } },
      alignment: { horizontal: column === 0 ? "left" : "right", vertical: "center" },
      border: thinBorder(),
    });
  }
}

function styleTableRows(
  XLSX: XlsxModule,
  worksheet: Record<string, any>,
  startRow: number,
  endRow: number,
  columnCount: number,
  numericColumns: Set<number>,
) {
  for (let row = startRow; row <= endRow; row += 1) {
    for (let column = 0; column < columnCount; column += 1) {
      const isNumeric = numericColumns.has(column);
      setCellStyle(XLSX, worksheet, row, column, {
        font: { name: "Calibri", sz: 10, color: { rgb: COLORS.text } },
        fill: row % 2 === 0
          ? { patternType: "solid", fgColor: { rgb: COLORS.zebra } }
          : undefined,
        alignment: { horizontal: isNumeric ? "right" : "left", vertical: "center", wrapText: column === 7 },
        border: thinBorder(),
        ...(isNumeric ? { numFmt: NUMBER_FORMAT } : {}),
      });
    }
  }
}

function styleTitle(
  XLSX: XlsxModule,
  worksheet: Record<string, any>,
  row: number,
  columnCount: number,
  size: number,
) {
  setCellStyle(XLSX, worksheet, row, 0, {
    font: { name: "Calibri", sz: size, bold: true, color: { rgb: COLORS.text } },
    alignment: { horizontal: "left", vertical: "center" },
  });
  worksheet["!merges"] = worksheet["!merges"] ?? [];
  worksheet["!merges"].push({
    s: { r: row, c: 0 },
    e: { r: row, c: columnCount - 1 },
  });
}

function buildTypeWorksheet(XLSX: XlsxModule, data: CustomerRecapExportData, group: CustomerRecapExportGroup) {
  const customerHeaders = [
    "No",
    "Nama Pelanggan",
    "Jumlah Transaksi",
    "Total Belanja",
    "Rata-rata Belanja",
    "Piutang Tersisa",
    "Kunjungan Terakhir",
    "Produk Favorit",
  ];
  const productHeaders = ["No", "Nama Produk", "Jumlah Terjual", "Total Nilai Belanja"];
  const rows: (string | number)[][] = [
    [`Rekap Pelanggan - ${TYPE_LABELS[group.type]}`],
    [`Periode: ${formatPeriod(data.dateFrom, data.dateTo)}`],
    [],
    customerHeaders,
  ];
  const customerHeaderRow = 3;
  const customerDataStart = rows.length;

  if (group.customers.length > 0) {
    rows.push(
      ...group.customers.map((customer, index) => [
        index + 1,
        customer.name,
        customer.orderCount,
        customer.totalSpent,
        customer.averageOrderValue,
        customer.totalDebt,
        formatDate(customer.lastVisitAt),
        customer.favoriteProducts || "-",
      ]),
    );
  } else {
    rows.push(["Tidak ada data"]);
  }

  rows.push([]);
  const productTitleRow = rows.length;
  rows.push(["Top 10 Produk"]);
  const productHeaderRow = rows.length;
  rows.push(productHeaders);
  const productDataStart = rows.length;

  if (group.topProducts.length > 0) {
    rows.push(
      ...group.topProducts.map((product, index) => [
        index + 1,
        product.productName,
        product.quantity,
        product.subtotal,
      ]),
    );
  } else {
    rows.push(["Tidak ada data"]);
  }

  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  worksheet["!cols"] = [
    { wch: 6 },
    { wch: 30 },
    { wch: 18 },
    { wch: 18 },
    { wch: 20 },
    { wch: 18 },
    { wch: 20 },
    { wch: 36 },
  ];
  worksheet["!rows"] = [{ hpt: 26 }, { hpt: 18 }];
  styleTitle(XLSX, worksheet, 0, customerHeaders.length, 15);
  styleTitle(XLSX, worksheet, 1, customerHeaders.length, 9);
  styleHeader(XLSX, worksheet, customerHeaderRow, customerHeaders.length);
  styleTableRows(
    XLSX,
    worksheet,
    customerDataStart,
    customerDataStart + Math.max(group.customers.length, 1) - 1,
    customerHeaders.length,
    new Set([0, 2, 3, 4, 5]),
  );
  styleTitle(XLSX, worksheet, productTitleRow, productHeaders.length, 12);
  styleHeader(XLSX, worksheet, productHeaderRow, productHeaders.length);
  styleTableRows(
    XLSX,
    worksheet,
    productDataStart,
    productDataStart + Math.max(group.topProducts.length, 1) - 1,
    productHeaders.length,
    new Set([0, 2, 3]),
  );
  worksheet["!freeze"] = { xSplit: 0, ySplit: customerDataStart };
  return worksheet;
}

function buildSummaryWorksheet(XLSX: XlsxModule, data: CustomerRecapExportData, aiAnalysis: string[]) {
  const rows: (string | number)[][] = [
    ["Ringkasan Semua Tipe Pelanggan"],
    [`Periode: ${formatPeriod(data.dateFrom, data.dateTo)}`],
    [],
    ["KPI Keseluruhan", "Nilai"],
    ["Pelanggan Baru", data.summary.newCustomers],
    ["Pelanggan Kembali", data.summary.returningCustomers],
    ["Risiko Churn", data.summary.churnedCustomers],
    ["Piutang Total", data.summary.totalDebtOutstanding],
    ["Piutang Terbayar", data.summary.debtCollectedInPeriod],
    ["Rata-rata Belanja", data.summary.avgOrderValue],
    ["Frekuensi Order", data.summary.orderFrequency],
    ["Rasio Pembelian Ulang", data.summary.repeatPurchaseRate],
    [],
    ["Ringkasan per Tipe"],
    ["Tipe Pelanggan", "Pelanggan Aktif", "Jumlah Transaksi", "Total Belanja", "Rata-rata Belanja", "Piutang Tersisa"],
    ...data.typeSummaries.map((summary) => [
      TYPE_LABELS[summary.type],
      summary.customerCount,
      summary.transactionCount,
      summary.totalSpent,
      summary.averageOrderValue,
      summary.debtOutstanding,
    ]),
    [],
    ["Analisis AI"],
    ...aiAnalysis.map((point) => [`- ${point}`]),
  ];
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  worksheet["!cols"] = [
    { wch: 28 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 20 },
    { wch: 18 },
  ];
  worksheet["!rows"] = [{ hpt: 26 }, { hpt: 18 }];
  styleTitle(XLSX, worksheet, 0, 6, 15);
  styleTitle(XLSX, worksheet, 1, 6, 9);
  styleHeader(XLSX, worksheet, 3, 2);
  styleTableRows(XLSX, worksheet, 4, 11, 2, new Set([1]));
  styleTitle(XLSX, worksheet, 13, 6, 12);
  styleHeader(XLSX, worksheet, 14, 6);
  styleTableRows(XLSX, worksheet, 15, 14 + data.typeSummaries.length, 6, new Set([1, 2, 3, 4, 5]));
  const aiTitleRow = 16 + data.typeSummaries.length;
  styleTitle(XLSX, worksheet, aiTitleRow, 6, 12);
  for (let row = aiTitleRow + 1; row < rows.length; row += 1) {
    setCellStyle(XLSX, worksheet, row, 0, {
      font: { name: "Calibri", sz: 10, color: { rgb: COLORS.text } },
      alignment: { horizontal: "left", vertical: "top", wrapText: true },
    });
  }
  worksheet["!merges"] = worksheet["!merges"] ?? [];
  for (let row = aiTitleRow + 1; row < rows.length; row += 1) {
    worksheet["!merges"].push({ s: { r: row, c: 0 }, e: { r: row, c: 5 } });
  }
  worksheet["!freeze"] = { xSplit: 0, ySplit: 4 };
  return worksheet;
}

export async function exportCustomerRecapXlsx(
  data: CustomerRecapExportData,
  aiAnalysis: string[],
): Promise<void> {
  const XLSX = (await import("xlsx-js-style")) as XlsxModule;
  const workbook = XLSX.utils.book_new();

  for (const group of data.groups) {
    XLSX.utils.book_append_sheet(
      workbook,
      buildTypeWorksheet(XLSX, data, group),
      TYPE_LABELS[group.type],
    );
  }
  XLSX.utils.book_append_sheet(
    workbook,
    buildSummaryWorksheet(XLSX, data, aiAnalysis),
    "Ringkasan",
  );
  XLSX.writeFile(workbook, buildFilename(data, "xlsx"));
}

function drawPdfHeader(doc: any, title: string, period: string) {
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(title, 40, 42);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 116, 139);
  doc.text(`Periode: ${period}`, 40, 60);
}

function drawPdfFooter(doc: any) {
  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Dibuat ${new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date())} - Halaman ${page}/${totalPages}`,
      40,
      doc.internal.pageSize.getHeight() - 24,
    );
  }
}

export async function exportCustomerRecapPdf(
  data: CustomerRecapExportData,
  aiAnalysis: string[],
): Promise<void> {
  const [{ default: jsPDF }, autoTableModule] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = autoTableModule.default ?? autoTableModule;
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const period = formatPeriod(data.dateFrom, data.dateTo);
  const customerHead = [[
    "No",
    "Nama Pelanggan",
    "Transaksi",
    "Total Belanja",
    "Rata-rata",
    "Piutang",
    "Kunjungan Terakhir",
    "Produk Favorit",
  ]];
  const productHead = [["No", "Nama Produk", "Jumlah Terjual", "Total Nilai Belanja"]];

  data.groups.forEach((group, index) => {
    if (index > 0) doc.addPage();
    drawPdfHeader(doc, `Rekap Pelanggan - ${TYPE_LABELS[group.type]}`, period);
    autoTable(doc, {
      startY: 78,
      head: customerHead,
      body: group.customers.length > 0
        ? group.customers.map((customer, customerIndex) => [
            customerIndex + 1,
            customer.name,
            customer.orderCount,
            formatRupiah(customer.totalSpent),
            formatRupiah(customer.averageOrderValue),
            formatRupiah(customer.totalDebt),
            formatDate(customer.lastVisitAt),
            customer.favoriteProducts || "-",
          ])
        : [["", "Tidak ada data", "", "", "", "", "", ""]],
      theme: "grid",
      styles: { font: "helvetica", fontSize: 8, cellPadding: 5, textColor: [15, 23, 42], lineColor: [203, 213, 225], lineWidth: 0.4 },
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: { 0: { cellWidth: 26 }, 2: { halign: "right", cellWidth: 54 }, 3: { halign: "right", cellWidth: 86 }, 4: { halign: "right", cellWidth: 86 }, 5: { halign: "right", cellWidth: 82 }, 7: { cellWidth: 145 } },
    });

    const customerEndY = (doc as any).lastAutoTable?.finalY ?? 100;
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text("Top 10 Produk", 40, customerEndY + 24);
    autoTable(doc, {
      startY: customerEndY + 32,
      head: productHead,
      body: group.topProducts.length > 0
        ? group.topProducts.map((product, productIndex) => [
            productIndex + 1,
            product.productName,
            product.quantity,
            formatRupiah(product.subtotal),
          ])
        : [["", "Tidak ada data", "", ""]],
      theme: "grid",
      styles: { font: "helvetica", fontSize: 8, cellPadding: 5, textColor: [15, 23, 42], lineColor: [203, 213, 225], lineWidth: 0.4 },
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: { 0: { cellWidth: 30 }, 2: { halign: "right", cellWidth: 100 }, 3: { halign: "right", cellWidth: 130 } },
    });
  });

  doc.addPage();
  drawPdfHeader(doc, "Ringkasan Semua Tipe Pelanggan", period);
  autoTable(doc, {
    startY: 78,
    head: [["KPI Keseluruhan", "Nilai"]],
    body: [
      ["Pelanggan Baru", String(data.summary.newCustomers)],
      ["Pelanggan Kembali", String(data.summary.returningCustomers)],
      ["Risiko Churn", String(data.summary.churnedCustomers)],
      ["Piutang Total", formatRupiah(data.summary.totalDebtOutstanding)],
      ["Piutang Terbayar", formatRupiah(data.summary.debtCollectedInPeriod)],
      ["Rata-rata Belanja", formatRupiah(data.summary.avgOrderValue)],
      ["Frekuensi Order", data.summary.orderFrequency.toFixed(2)],
      ["Rasio Pembelian Ulang", `${(data.summary.repeatPurchaseRate * 100).toFixed(1)}%`],
    ],
    theme: "grid",
    styles: { font: "helvetica", fontSize: 9, cellPadding: 5, textColor: [15, 23, 42], lineColor: [203, 213, 225], lineWidth: 0.4 },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: "bold" },
    columnStyles: { 1: { halign: "right" } },
  });
  const kpiEndY = (doc as any).lastAutoTable?.finalY ?? 200;
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Ringkasan per Tipe", 40, kpiEndY + 24);
  autoTable(doc, {
    startY: kpiEndY + 32,
    head: [["Tipe", "Pelanggan Aktif", "Transaksi", "Total Belanja", "Rata-rata", "Piutang"]],
    body: data.typeSummaries.map((summary) => [
      TYPE_LABELS[summary.type],
      summary.customerCount,
      summary.transactionCount,
      formatRupiah(summary.totalSpent),
      formatRupiah(summary.averageOrderValue),
      formatRupiah(summary.debtOutstanding),
    ]),
    theme: "grid",
    styles: { font: "helvetica", fontSize: 8, cellPadding: 5, textColor: [15, 23, 42], lineColor: [203, 213, 225], lineWidth: 0.4 },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" } },
  });
  const typeEndY = (doc as any).lastAutoTable?.finalY ?? 300;
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Analisis AI", 40, typeEndY + 24);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    doc.splitTextToSize(aiAnalysis.map((point) => `- ${point}`).join("\n"), 760),
    40,
    typeEndY + 42,
  );
  drawPdfFooter(doc);
  doc.save(buildFilename(data, "pdf"));
}
