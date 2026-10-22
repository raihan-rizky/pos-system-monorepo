import * as XLSX from "xlsx-js-style";
import type { CellObject, WorkBook, WorkSheet } from "xlsx-js-style";
import type { ExpenseGroup, IncomeGroup, MonthlyFinancialReport } from "./monthly-report-types";
import { applyMonthlyPrintLayout } from "./monthly-workbook-print";
import { MONTHLY_SHEET_THEMES } from "./monthly-workbook-theme";
import { colorMonthlyWorkbookContent, type PurchaseColorSection } from "./monthly-workbook-content";
import { buildMonthlyGuide } from "./monthly-workbook-guide";

const MONTHS = ["JANUARI", "FEBRUARI", "MARET", "APRIL", "MEI", "JUNI", "JULI", "AGUSTUS", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DESEMBER"];
const INCOME: IncomeGroup[] = ["CETAK", "PLAT", "STEMPEL", "SPANDUK", "ATK", "PRINT", "UNMAPPED"];
const EXPENSE: ExpenseGroup[] = ["CETAK_PLAT", "SPANDUK", "ATK", "OTHER", "SALARY"];
const GROUP_LABELS: Record<ExpenseGroup, string> = { CETAK_PLAT: "Cetak / Plat", SPANDUK: "Spanduk", ATK: "ATK", OTHER: "Lain-lain", SALARY: "Gaji / Mingguan" };
const COLORS = { ink: "0F172A", accent: "0079C7", muted: "64748B", line: "E2E8F0", stripe: "F8FAFC", soft: "E0EFFE", input: "FEF3C7", white: "FFFFFF" };
const MONEY = '#,##0.00;[Red](#,##0.00);"-"';
const dateSerial = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86_400_000 + 25569;
const moneySum = (values: number[]) => values.reduce((total, value) => total + Math.round(value * 100), 0) / 100;
const quote = (name: string) => `'${name.replace(/'/g, "''")}'`;
const address = (row: number, column: number) => XLSX.utils.encode_cell({ r: row - 1, c: column - 1 });

export function monthlySheetNames(month: number): string[] {
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error("Bulan laporan tidak valid.");
  const name = MONTHS[month - 1];
  return ["LAP KEU", "BERSIH", name, `RC ${name}`, `RP ${name}`, "PENGELUARAN BELANJA", "PIUTANG & HUTANG", "PANDUAN"];
}

function put(sheet: WorkSheet, row: number, column: number, value: string | number, formula?: string): CellObject {
  const cell: CellObject = { t: typeof value === "number" ? "n" : "s", v: value };
  if (formula) cell.f = formula;
  cell.s = {
    font: { name: "Calibri", sz: 10, color: { rgb: COLORS.ink } },
    fill: { fgColor: { rgb: COLORS.white } },
    alignment: { vertical: "center", horizontal: typeof value === "number" || formula ? "right" : "left", wrapText: true },
  };
  if (typeof value === "number" || formula) cell.z = MONEY;
  sheet[address(row, column)] = cell;
  return cell;
}

function merge(sheet: WorkSheet, row: number, column: number, endRow: number, endColumn: number): void {
  (sheet["!merges"] ??= []).push({ s: { r: row - 1, c: column - 1 }, e: { r: endRow - 1, c: endColumn - 1 } });
}

function band(sheet: WorkSheet, row: number, from: number, to: number, color = COLORS.ink): void {
  for (let col = from; col <= to; col++) {
    const cell = sheet[address(row, col)] ?? put(sheet, row, col, "");
    cell.s = { ...cell.s, fill: { fgColor: { rgb: color } }, font: { name: "Calibri", sz: 10, bold: true, color: { rgb: color === COLORS.soft ? COLORS.ink : COLORS.white } }, alignment: { ...cell.s?.alignment, vertical: "center", wrapText: true } };
  }
}

function heading(sheet: WorkSheet, row: number, text: string, columns: number, color = COLORS.ink): void {
  put(sheet, row, 1, text);
  merge(sheet, row, 1, row, columns);
  band(sheet, row, 1, columns, color);
}

function makeSheet(title: string, report: MonthlyFinancialReport, widths: number[]): WorkSheet {
  const sheet: WorkSheet = { "!cols": widths.map((wch) => ({ wch })), "!rows": [] };
  heading(sheet, 2, title, widths.length);
  merge(sheet, 2, 1, 3, widths.length);
  // heading already registered its single-row merge; replace with the taller title.
  sheet["!merges"]!.shift();
  put(sheet, 4, 1, `${report.from} s.d. ${report.to} · Rupiah · Basis kas`);
  merge(sheet, 4, 1, 4, widths.length);
  sheet["!rows"]![1] = { hpt: 22 };
  sheet["!rows"]![2] = { hpt: 18 };
  sheet["!rows"]![3] = { hpt: 27 };
  return sheet;
}

function tableHeader(sheet: WorkSheet, row: number, labels: string[]): void {
  labels.forEach((label, index) => put(sheet, row, index + 1, label));
  band(sheet, row, 1, labels.length);
  sheet["!rows"]![row - 1] = { hpt: 32 };
}

function dateCell(sheet: WorkSheet, row: number, column: number, value: string): CellObject {
  const cell = put(sheet, row, column, dateSerial(value));
  cell.z = "dd/mm/yyyy";
  cell.s.alignment.horizontal = "center";
  return cell;
}

function finish(sheet: WorkSheet, lastRow: number, columns: number, firstDataRow = 7): void {
  sheet["!ref"] = `A1:${address(lastRow, columns)}`;
  sheet["!margins"] = { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 };
  for (let row = 1; row <= lastRow; row++) {
    sheet["!rows"]![row - 1] ??= { hpt: 23 };
    for (let col = 1; col <= columns; col++) {
      const cell = sheet[address(row, col)] ?? put(sheet, row, col, "");
      if (row < firstDataRow) continue;
      const plainFill = cell.s?.fill?.fgColor?.rgb === COLORS.white;
      cell.s = { ...cell.s, border: { bottom: { style: "hair", color: { rgb: COLORS.line } } }, ...(plainFill && row % 2 === 0 ? { fill: { fgColor: { rgb: COLORS.stripe } } } : {}) };
    }
  }
}

function comment(cell: CellObject, text: string): void {
  cell.c = [{ a: "Laporan Keuangan", t: text }];
  cell.c.hidden = true;
}

function sumFormula(sheet: WorkSheet, row: number, column: number, start: number, end: number, cache: number): void {
  put(sheet, row, column, cache, `SUM(${address(start, column)}:${address(end, column)})`);
}

function insight(sheet: WorkSheet, row: number, columns: number, text: string, formula: string): void {
  heading(sheet, row, text, columns, COLORS.soft);
  const cell = sheet[address(row, 1)];
  cell.f = formula;
  cell.s.alignment.horizontal = "left";
  sheet["!rows"]![row - 1] = { hpt: 30 };
}

function applySheetTheme(sheet: WorkSheet, index: number): void {
  const theme = MONTHLY_SHEET_THEMES[index];
  const fills: Record<string, string> = { [COLORS.ink]: theme.primary, [COLORS.accent]: theme.primary, [COLORS.soft]: theme.soft, [COLORS.stripe]: theme.stripe };
  for (const key of Object.keys(sheet)) {
    if (key.startsWith("!")) continue;
    const cell = sheet[key] as CellObject;
    const fill = cell.s?.fill?.fgColor?.rgb;
    if (fills[fill]) cell.s.fill = { fgColor: { rgb: fills[fill] } };
    if (fill === COLORS.soft) cell.s.font = { ...cell.s.font, color: { rgb: theme.primary } };
  }
  // Keep the full merged title/note colored, including its empty continuation cells.
  for (const range of sheet["!merges"] ?? []) {
    const fill = sheet[XLSX.utils.encode_cell(range.s)]?.s?.fill;
    if (!fill) continue;
    for (let row = range.s.r; row <= range.e.r; row++) {
      for (let col = range.s.c; col <= range.e.c; col++) {
        const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
        if (cell) cell.s = { ...cell.s, fill };
      }
    }
  }
}

/** Pure builder: no network, file system, customer fixtures or download side effects. */
export function buildMonthlyWorkbook(report: MonthlyFinancialReport): WorkBook {
  const names = monthlySheetNames(report.month);
  const [overviewName, netName, dailyName, rcName, rpName, purchaseName, balanceName] = names;
  const month = MONTHS[report.month - 1];
  const income = [...report.income].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const expenses = [...report.expenses].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const incomeTotals = Object.fromEntries(INCOME.map((group) => [group, moneySum(income.map((row) => row.amounts[group]))])) as Record<IncomeGroup, number>;
  const expenseTotals = Object.fromEntries(EXPENSE.map((group) => [group, moneySum(expenses.filter((row) => row.group === group).map((row) => row.amount))])) as Record<ExpenseGroup, number>;
  const totalIncome = moneySum(Object.values(incomeTotals));
  const totalExpense = moneySum(Object.values(expenseTotals));
  const netAmount = moneySum([totalIncome, -totalExpense]);
  const totalReceivables = moneySum(report.receivables.map((row) => row.amount));
  const wb = XLSX.utils.book_new();
  wb.Props = { Title: `Laporan Keuangan ${month} ${report.year}`, Subject: "Laporan penerimaan dan pengeluaran bulanan", Author: "Laporan Keuangan", Comments: "Modal awal perlu diisi. Saldo yang belum tersedia tidak dianggap nol." };

  const rc = makeSheet(`RINCIAN PENDAPATAN BULAN ${month} ${report.year}`, report, [14, 13, 13, 13, 13, 13, 13, 15, 16]);
  tableHeader(rc, 5, ["Tanggal", "Cetak", "Plat", "Stempel", "Spanduk", "ATK", "Print", "Perlu pemetaan", "TOTAL"]);
  const rcEnd = 6 + Math.max(1, income.length);
  income.forEach((entry, index) => {
    const row = index + 7;
    comment(dateCell(rc, row, 1, entry.date), `${entry.reference}\n${entry.description}`);
    INCOME.forEach((group, column) => put(rc, row, column + 2, entry.amounts[group]));
    put(rc, row, 9, moneySum(INCOME.map((group) => entry.amounts[group])), `SUM(B${row}:H${row})`);
  });
  if (!income.length) { put(rc, 7, 1, "Belum ada penerimaan"); for (let col = 2; col <= 9; col++) put(rc, 7, col, 0); }
  const rcTotal = rcEnd + 2;
  put(rc, rcTotal, 1, "TOTAL PENDAPATAN");
  INCOME.forEach((group, index) => sumFormula(rc, rcTotal, index + 2, 7, rcEnd, incomeTotals[group]));
  sumFormula(rc, rcTotal, 9, 7, rcEnd, totalIncome);
  band(rc, rcTotal, 1, 9, COLORS.accent);
  heading(rc, rcTotal + 2, "Perlu pemetaan tetap dihitung dalam TOTAL. Arahkan ke tanggal untuk melihat referensi.", 9, COLORS.soft);
  rc["!rows"]![rcTotal + 1] = { hpt: 30 };
  finish(rc, rcTotal + 2, 9);

  const rp = makeSheet(`RINCIAN PENGELUARAN BULAN ${month} ${report.year}`, report, [14, 25, 18, 16, 17, 17, 18]);
  tableHeader(rp, 5, ["Tanggal", "Keterangan", "", "Nilai", "Gaji / Mingguan", "TOTAL", "Kelompok"]);
  merge(rp, 5, 2, 5, 3);
  const rpEnd = 6 + Math.max(1, expenses.length);
  expenses.forEach((entry, index) => {
    const row = index + 7;
    dateCell(rp, row, 1, entry.date);
    put(rp, row, 2, entry.description);
    merge(rp, row, 2, row, 3);
    put(rp, row, 4, entry.group === "SALARY" ? 0 : entry.amount);
    put(rp, row, 5, entry.group === "SALARY" ? entry.amount : 0);
    put(rp, row, 6, entry.amount, `SUM(D${row}:E${row})`);
    put(rp, row, 7, GROUP_LABELS[entry.group]);
    rp["!rows"]![row - 1] = { hpt: Math.max(28, Math.ceil(entry.description.length / 45) * 14) };
  });
  if (!expenses.length) { put(rp, 7, 2, "Belum ada pengeluaran"); for (let col = 4; col <= 6; col++) put(rp, 7, col, 0); }
  const rpTotal = rpEnd + 2;
  put(rp, rpTotal, 1, "TOTAL PENGELUARAN");
  sumFormula(rp, rpTotal, 4, 7, rpEnd, moneySum([totalExpense, -expenseTotals.SALARY]));
  sumFormula(rp, rpTotal, 5, 7, rpEnd, expenseTotals.SALARY);
  sumFormula(rp, rpTotal, 6, 7, rpEnd, totalExpense);
  band(rp, rpTotal, 1, 7, COLORS.accent);
  heading(rp, rpTotal + 2, "Belanja di sheet berikutnya adalah rincian biaya yang sama dan tidak dijumlahkan ulang.", 7, COLORS.soft);
  rp["!rows"]![rpTotal + 1] = { hpt: 32 };
  finish(rp, rpTotal + 2, 7);

  const daily = makeSheet(`PENDAPATAN SEHARI-HARI BULAN ${month} ${report.year}`, report, [14, 13, 13, 13, 13, 13, 13, 14, 13, 13, 14, 16]);
  put(daily, 5, 1, "BULAN");
  put(daily, 5, 2, "PENDAPATAN"); merge(daily, 5, 2, 6, 7);
  put(daily, 5, 8, "PENGELUARAN"); merge(daily, 5, 8, 6, 12);
  band(daily, 5, 1, 12);
  tableHeader(daily, 7, ["Tanggal", "Cetak", "Plat", "Stempel", "Spanduk", "ATK", "Print", "Cetak / Plat", "Spanduk", "ATK", "Lain-lain", "Gaji / Mingguan"]);
  const days = Number(report.to.slice(-2));
  for (let day = 1; day <= days; day++) {
    const row = day + 8;
    const date = `${report.from.slice(0, 8)}${String(day).padStart(2, "0")}`;
    dateCell(daily, row, 1, date);
    INCOME.slice(0, 6).forEach((group, index) => {
      const column = XLSX.utils.encode_col(index + 1);
      put(daily, row, index + 2, moneySum(income.filter((entry) => entry.date === date).map((entry) => entry.amounts[group])), `SUMIF(${quote(rcName)}!$A$7:$A$${rcEnd},$A${row},${quote(rcName)}!$${column}$7:$${column}$${rcEnd})`);
    });
    EXPENSE.forEach((group, index) => {
      put(daily, row, index + 8, moneySum(expenses.filter((entry) => entry.date === date && entry.group === group).map((entry) => entry.amount)), `SUMIFS(${quote(rpName)}!$F$7:$F$${rpEnd},${quote(rpName)}!$A$7:$A$${rpEnd},$A${row},${quote(rpName)}!$G$7:$G$${rpEnd},"${GROUP_LABELS[group]}")`);
    });
  }
  const dailyTotal = 9 + days;
  put(daily, dailyTotal, 1, "TOTAL");
  INCOME.slice(0, 6).forEach((group, index) => sumFormula(daily, dailyTotal, index + 2, 9, dailyTotal - 1, incomeTotals[group]));
  EXPENSE.forEach((group, index) => sumFormula(daily, dailyTotal, index + 8, 9, dailyTotal - 1, expenseTotals[group]));
  band(daily, dailyTotal, 1, 12, COLORS.accent);
  put(daily, dailyTotal + 2, 1, "Penerimaan perlu pemetaan"); merge(daily, dailyTotal + 2, 1, dailyTotal + 2, 5);
  put(daily, dailyTotal + 2, 7, incomeTotals.UNMAPPED, `${quote(rcName)}!H${rcTotal}`);
  heading(daily, dailyTotal + 5, "LABA / RUGI PENDAPATAN SEHARI-HARI", 12);
  [["TOTAL PENDAPATAN", totalIncome, `${quote(rcName)}!I${rcTotal}`], ["TOTAL PENGELUARAN", totalExpense, `${quote(rpName)}!F${rpTotal}`], ["TOTAL AKHIR", netAmount, `J${dailyTotal + 7}-J${dailyTotal + 8}`]].forEach(([label, value, formula], index) => {
    const row = dailyTotal + 7 + index;
    put(daily, row, 7, String(label)); merge(daily, row, 7, row, 9);
    put(daily, row, 10, Number(value), String(formula)); merge(daily, row, 10, row, 12);
  });
  finish(daily, dailyTotal + 10, 12, 9);

  const net = makeSheet(`LABA / RUGI BULAN ${month} ${report.year}`, report, [5, 15, 15, 15, 15, 16, 15, 15, 15, 17]);
  put(net, 8, 2, "PENDAPATAN"); merge(net, 8, 2, 9, 5); band(net, 8, 2, 5);
  put(net, 8, 6, "PENGELUARAN"); merge(net, 8, 6, 9, 10); band(net, 8, 6, 10);
  ["Cetak / Plat / Stempel", "Spanduk", "ATK", "Print", "Cetak / Plat", "Spanduk", "ATK", "Lain-lain", "Gaji / Mingguan"].forEach((label, index) => put(net, 10, index + 2, label));
  net["!rows"]![9] = { hpt: 32 };
  const incomeRefs = [`SUM(${quote(dailyName)}!B${dailyTotal}:D${dailyTotal})`, `${quote(dailyName)}!E${dailyTotal}`, `${quote(dailyName)}!F${dailyTotal}`, `${quote(dailyName)}!G${dailyTotal}`];
  const incomeValues = [moneySum([incomeTotals.CETAK, incomeTotals.PLAT, incomeTotals.STEMPEL]), incomeTotals.SPANDUK, incomeTotals.ATK, incomeTotals.PRINT];
  incomeRefs.forEach((ref, index) => { put(net, 13, index + 2, incomeValues[index], ref); put(net, 15, index + 2, incomeValues[index], address(13, index + 2)); });
  EXPENSE.forEach((group, index) => { put(net, 13, index + 6, expenseTotals[group], `${quote(dailyName)}!${address(dailyTotal, index + 8)}`); put(net, 15, index + 6, expenseTotals[group], address(13, index + 6)); });
  put(net, 17, 2, "Perlu pemetaan"); merge(net, 17, 2, 17, 4);
  put(net, 17, 5, incomeTotals.UNMAPPED, `${quote(rcName)}!H${rcTotal}`);
  heading(net, 19, "LABA / RUGI PENDAPATAN SEHARI-HARI", 10);
  const summaryLine = (row: number, label: string, value: number | string, formula: string) => { put(net, row, 1, label); merge(net, row, 1, row, 4); put(net, row, 5, ":"); put(net, row, 6, value, formula); merge(net, row, 6, row, 8); };
  summaryLine(24, "TOTAL PENDAPATAN", totalIncome, "SUM(B15:E15)+E17");
  summaryLine(25, "TOTAL PENGELUARAN", totalExpense, "SUM(F15:J15)");
  summaryLine(27, "TOTAL AKHIR", netAmount, "F24-F25"); band(net, 27, 1, 8, COLORS.accent);

  const balances = makeSheet(`PIUTANG & HUTANG · ${month} ${report.year}`, report, [7, 14, 14, 17, 30, 31, 18]);
  heading(balances, 1, "PIUTANG", 7);
  tableHeader(balances, 5, ["No", "Tanggal nota", "Jatuh tempo", "Nilai", "Pekerjaan", "Keterangan", "TOTAL"]);
  const balanceEnd = 6 + Math.max(1, report.receivables.length);
  report.receivables.forEach((entry, index) => {
    const row = index + 7;
    put(balances, row, 1, index + 1).z = "0";
    dateCell(balances, row, 2, entry.date);
    if (entry.dueDate) dateCell(balances, row, 3, entry.dueDate);
    put(balances, row, 4, entry.amount);
    put(balances, row, 5, entry.description);
    put(balances, row, 6, `${entry.customer}\n${entry.reference}`);
    put(balances, row, 7, entry.amount, `D${row}`);
    const wrappedLines = (text: string, width: number) => text.split("\n").reduce((lines, part) => lines + Math.max(1, Math.ceil(part.length / width)), 0);
    const lines = Math.max(wrappedLines(entry.description, 27), wrappedLines(`${entry.customer}\n${entry.reference}`, 28));
    balances["!rows"]![row - 1] = { hpt: Math.max(34, lines * 14 + 6) };
  });
  if (!report.receivables.length) { put(balances, 7, 5, "Tidak ada piutang tercatat pada akhir periode"); put(balances, 7, 7, 0); }
  const balanceTotal = balanceEnd + 2;
  put(balances, balanceTotal, 1, "TOTAL PIUTANG"); merge(balances, balanceTotal, 1, balanceTotal, 6);
  sumFormula(balances, balanceTotal, 7, 7, balanceEnd, totalReceivables); band(balances, balanceTotal, 1, 7, COLORS.accent);
  const debtRow = balanceTotal + 5;
  heading(balances, debtRow - 2, "HUTANG", 7);
  tableHeader(balances, debtRow - 1, ["No", "Tanggal nota", "Jatuh tempo", "Nilai", "Pekerjaan", "Keterangan", "TOTAL"]);
  put(balances, debtRow, 5, "Belum tersedia dari sistem"); merge(balances, debtRow, 5, debtRow, 6);
  comment(put(balances, debtRow, 4, ""), "Belum tersedia dari sistem: tidak ada ledger saldo hutang pemasok historis. Bukan nol.");
  const debtTotal = debtRow + 2;
  put(balances, debtTotal, 1, "TOTAL HUTANG"); merge(balances, debtTotal, 1, debtTotal, 6);
  put(balances, debtTotal, 7, "", `IF(COUNT(D${debtRow})=0,"",SUM(D${debtRow}))`); band(balances, debtTotal, 1, 7, COLORS.soft);
  finish(balances, debtTotal + 1, 7);
  summaryLine(32, "PIUTANG", totalReceivables, `${quote(balanceName)}!G${balanceTotal}`);
  summaryLine(34, "HUTANG", "", `IF(ISNUMBER(${quote(balanceName)}!G${debtTotal}),${quote(balanceName)}!G${debtTotal},"")`);
  heading(net, 37, "Selisih penerimaan dan pengeluaran berbasis kas, bukan laba akrual lengkap.", 10, COLORS.soft);
  net["!rows"]![36] = { hpt: 30 };
  finish(net, 38, 10);

  const overview = makeSheet("LAPORAN KEUANGAN", report, [5, 19, 23, 19, 17, 20, 22]);
  put(overview, 5, 2, `PERIODE ${report.to.split("-").reverse().join(" ")} · ${month} ${report.year}`); merge(overview, 5, 2, 5, 7);
  [[8, "MODAL AWAL"], [9, "PIUTANG"], [13, "HUTANG"], [17, `INVENTORY AKHIR ${month}`], [24, "PENDAPATAN HARIAN"], [26, "PENGELUARAN HARIAN"]].forEach(([row, label]) => { put(overview, Number(row), 2, String(label)); merge(overview, Number(row), 2, Number(row), 3); });
  const capital = put(overview, 8, 4, ""); capital.z = MONEY; capital.s.fill = { fgColor: { rgb: COLORS.input } }; comment(capital, "Isi modal awal di sini. Sel kosong berbeda dengan nilai 0. Hasil yang memerlukan input lengkap akan dihitung setelah dilengkapi.");
  put(overview, 9, 4, totalReceivables, `${quote(netName)}!F32`);
  put(overview, 11, 3, "TOTAL HARTA"); put(overview, 11, 6, "", 'IF(ISNUMBER(D8),SUM(D8:D9),"")');
  const debtRef = `${quote(netName)}!F34`;
  comment(put(overview, 13, 4, "", `IF(ISNUMBER(${debtRef}),${debtRef},"")`), "Belum tersedia dari sistem. Lihat bagian HUTANG di sheet PIUTANG & HUTANG.");
  put(overview, 15, 3, "TOTAL HUTANG"); put(overview, 15, 6, "", 'IF(ISNUMBER(D13),D13,"")');
  const inventory = put(overview, 17, 4, ""); inventory.z = MONEY; comment(inventory, "Belum tersedia dari sistem: nilai persediaan akhir historis tidak memiliki snapshot lengkap. Bukan nol.");
  put(overview, 19, 3, `TOTAL INVENTORY ${month}`); put(overview, 19, 6, "", 'IF(ISNUMBER(D17),D17,"")');
  put(overview, 21, 3, "JUMLAH HARTA"); merge(overview, 21, 3, 21, 5); put(overview, 21, 7, "", 'IF(COUNT(F11,F15,F19)=3,F11-F15+F19,"")');
  put(overview, 24, 5, totalIncome, `${quote(netName)}!F24`);
  put(overview, 26, 5, totalExpense, `${quote(netName)}!F25`);
  put(overview, 29, 3, "PENGHASILAN BERSIH"); merge(overview, 29, 3, 29, 5); put(overview, 29, 7, netAmount, "E24-E26"); band(overview, 29, 3, 7, COLORS.accent);
  put(overview, 32, 2, "KEKAYAAN BERSIH"); merge(overview, 32, 2, 33, 3); put(overview, 32, 4, "", 'IF(ISNUMBER(G21),G21+G29,"")'); merge(overview, 32, 4, 33, 7); band(overview, 32, 2, 7, COLORS.soft);
  const notes = ["Isi modal awal pada sel kuning D8 langsung di Excel.", "Hutang pemasok dan persediaan akhir belum tersedia dari sistem. Sel kosong bukan nol.", "Ringkasan kekayaan menunggu input lengkap. Penerimaan/pengeluaran memakai basis kas.", ...report.warnings];
  notes.forEach((note, index) => { const row = 36 + index * 2; put(overview, row, 2, note); merge(overview, row, 2, row + 1, 7); overview["!rows"]![row - 1] = { hpt: 20 }; });
  finish(overview, 37 + notes.length * 2, 7);

  const purchases = makeSheet(`PENGELUARAN BELANJA · ${month} ${report.year}`, report, [7, 17, 14, 14, 18, 58]);
  tableHeader(purchases, 5, ["No", "Pembayaran", "Tanggal", "Jatuh tempo", "Nilai", "Keterangan"]);
  let purchaseRow = 7;
  const purchasedExpenses = expenses.filter((entry) => entry.purchase);
  const purchaseTotalCells: string[] = [];
  const purchaseSections: PurchaseColorSection[] = [];
  const methods = [...new Set(["GIRO", "TRANSFER", ...purchasedExpenses.map((entry) => entry.purchase!.method || "LAINNYA")])];
  for (const method of methods) {
    heading(purchases, purchaseRow, method === "LAINNYA" ? "METODE LAIN / BELUM TERSEDIA" : `VIA ${method}`, 6);
    tableHeader(purchases, purchaseRow + 1, ["No", "Pembayaran", "Tanggal", "Jatuh tempo", "Nilai", "Keterangan"]);
    const rows = purchasedExpenses.filter((entry) => (entry.purchase!.method || "LAINNYA") === method);
    const first = purchaseRow + 2;
    rows.forEach((entry, index) => {
      const row = first + index;
      put(purchases, row, 1, index + 1).z = "0";
      put(purchases, row, 2, method === "LAINNYA" ? "Belum tersedia" : method);
      dateCell(purchases, row, 3, entry.date);
      if (entry.purchase!.dueDate) dateCell(purchases, row, 4, entry.purchase!.dueDate);
      put(purchases, row, 5, entry.amount);
      put(purchases, row, 6, `${entry.purchase!.reference} · ${entry.purchase!.supplier}\n${entry.description}`);
      purchases["!rows"]![row - 1] = { hpt: Math.max(36, Math.ceil(entry.description.length / 60) * 14 + 16) };
    });
    if (!rows.length) { put(purchases, first, 6, "Belum ada belanja tercatat untuk metode ini."); put(purchases, first, 5, 0); }
    const total = first + Math.max(1, rows.length);
    put(purchases, total, 2, "TOTAL"); sumFormula(purchases, total, 5, first, total - 1, moneySum(rows.map((entry) => entry.amount))); band(purchases, total, 1, 6, COLORS.soft);
    purchaseTotalCells.push(`E${total}`);
    purchaseSections.push({ firstRow: first, totalRow: total, method });
    purchaseRow = total + 3;
  }
  heading(purchases, purchaseRow, "Rincian belanja sudah termasuk pengeluaran pada RP. Giro tidak otomatis berarti hutang.", 6, COLORS.soft);
  purchases["!rows"]![purchaseRow - 1] = { hpt: 32 };
  finish(purchases, purchaseRow + 1, 6);

  const currency = (amount: number) => amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const cashStatus = netAmount < 0 ? "Defisit kas" : netAmount > 0 ? "Surplus kas" : "Kas seimbang";
  insight(overview, 6, 7, `${cashStatus}: Rp ${currency(netAmount)} · Modal awal: isi D8`, 'IF(G29<0,"Defisit kas",IF(G29>0,"Surplus kas","Kas seimbang"))&": Rp "&TEXT(G29,"#,##0.00")&" · Modal awal: isi D8"');
  insight(net, 6, 10, totalIncome > 0 ? `Sisa kas: ${(netAmount / totalIncome * 100).toFixed(1)}% dari penerimaan · Basis kas` : "Belum ada penerimaan · Persentase sisa kas belum tersedia", 'IF(F24>0,"Sisa kas: "&TEXT(F27/F24,"0.0%")&" dari penerimaan · Basis kas","Belum ada penerimaan · Persentase sisa kas belum tersedia")');
  insight(daily, 8, 12, `Perlu pemetaan: Rp ${currency(incomeTotals.UNMAPPED)} · Sudah termasuk total pendapatan`, `"Perlu pemetaan: Rp "&TEXT(G${dailyTotal + 2},"#,##0.00")&" · Sudah termasuk total pendapatan"`);
  insight(rc, 6, 9, `${income.length} penerimaan · Perlu pemetaan: Rp ${currency(incomeTotals.UNMAPPED)}`, `COUNT(A7:A${rcEnd})&" penerimaan · Perlu pemetaan: Rp "&TEXT(H${rcTotal},"#,##0.00")`);
  insight(rp, 6, 7, `${expenses.length} pengeluaran · Gaji / mingguan: Rp ${currency(expenseTotals.SALARY)}`, `COUNT(A7:A${rpEnd})&" pengeluaran · Gaji / mingguan: Rp "&TEXT(E${rpTotal},"#,##0.00")`);
  insight(purchases, 6, 6, `Belanja: Rp ${currency(moneySum(purchasedExpenses.map(entry => entry.amount)))} · Sudah termasuk RP`, `"Belanja: Rp "&TEXT(SUM(${purchaseTotalCells.join(",")}),"#,##0.00")&" · Sudah termasuk RP"`);
  insight(balances, 6, 7, `${report.receivables.length} nota piutang · Hutang belum tersedia`, `COUNT(B7:B${balanceEnd})&" nota piutang · Hutang belum tersedia"`);

  const sheets = [overview, net, daily, rc, rp, purchases, balances];
  sheets.forEach((sheet, index) => {
    applySheetTheme(sheet, index);
    XLSX.utils.book_append_sheet(wb, sheet, names[index]);
  });
  colorMonthlyWorkbookContent(wb, { dailyTotal, rcEnd, rcTotal, rpEnd, rpTotal, balanceEnd, balanceTotal, debtRow, debtTotal, purchaseSections });
  const guide = buildMonthlyGuide({ monthName: month, debtRow, period: `${report.from} s.d. ${report.to}` });
  XLSX.utils.book_append_sheet(wb, guide, names[7]);
  sheets.push(guide);
  wb.Workbook = { Names: sheets.flatMap((sheet, index) => [
    { Name: "_xlnm.Print_Area", Sheet: index, Ref: `${quote(names[index])}!$${sheet["!ref"]!.replace(":", ":$").replace(/(\D)(\d)/g, "$1$$$2")}` },
    { Name: "_xlnm.Print_Titles", Sheet: index, Ref: `${quote(names[index])}!$1:$${index === 7 ? 4 : index === 2 ? 8 : index === 5 ? 5 : 6}` },
  ]) };
  return wb;
}

export function serializeMonthlyWorkbook(report: MonthlyFinancialReport): Uint8Array {
  const workbook = buildMonthlyWorkbook(report);
  const bytes = new Uint8Array(XLSX.write(workbook, { type: "array", bookType: "xlsx", cellStyles: true, compression: true }));
  return applyMonthlyPrintLayout(bytes, workbook);
}
