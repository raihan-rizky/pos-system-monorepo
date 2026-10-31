import { utils } from "xlsx-js-style";
import type { WorkBook, WorkSheet } from "xlsx-js-style";
import { MONTHLY_CONTENT_PALETTES } from "./monthly-workbook-theme";

type Palette = { head: string; ink: string; light: string; stripe: string };
const { brand, brandDeep, brandMedium, accent, accentSoft, success, warning, danger, surface, input } = MONTHLY_CONTENT_PALETTES;
const RECEIPTS = [brand, brandDeep, accentSoft, accent, success, brandMedium, warning];
const EXPENSES = [accent, accentSoft, success, warning, brandDeep];

export type PurchaseColorSection = { firstRow: number; totalRow: number; method: string };
type ContentLayout = {
  dailyTotal: number;
  rcEnd: number;
  rcTotal: number;
  rpEnd: number;
  rpTotal: number;
  balanceEnd: number;
  balanceTotal: number;
  debtRow: number;
  debtTotal: number;
  purchaseSections: PurchaseColorSection[];
};

/** Touch styles only: values, formulas, formats, merges and dimensions stay intact. */
function paint(sheet: WorkSheet, top: number, left: number, bottom: number, right: number, color: Palette, solid = false): void {
  for (let row = top; row <= bottom; row++) {
    for (let col = left; col <= right; col++) {
      const cell = sheet[utils.encode_cell({ r: row - 1, c: col - 1 })];
      if (!cell) continue;
      cell.s = {
        ...cell.s,
        fill: { fgColor: { rgb: solid ? color.head : row % 2 ? color.light : color.stripe } },
        font: { ...cell.s?.font, color: { rgb: solid ? "FFFFFF" : color.ink }, ...(solid ? { bold: true } : {}) },
      };
    }
  }
}

/** Color content by meaning as well as by sheet, without rebuilding any table. */
export function colorMonthlyWorkbookContent(workbook: WorkBook, layout: ContentLayout): void {
  const [overview, net, daily, rc, rp, purchases, balances] = workbook.SheetNames.map(name => workbook.Sheets[name]);
  const resultColor = Number(overview.G29.v) < 0 ? danger : success;

  paint(overview, 8, 2, 8, 4, brandDeep);
  paint(overview, 9, 2, 9, 4, success);
  paint(overview, 11, 3, 11, 6, brand);
  paint(overview, 13, 2, 13, 4, danger);
  paint(overview, 15, 3, 15, 6, danger);
  paint(overview, 17, 2, 17, 4, brandDeep);
  paint(overview, 19, 3, 19, 6, brandDeep);
  paint(overview, 21, 3, 21, 7, brand, true);
  paint(overview, 24, 2, 24, 5, success);
  paint(overview, 26, 2, 26, 5, accent);
  paint(overview, 29, 3, 29, 7, resultColor, true);
  paint(overview, 32, 2, 33, 7, brandDeep, true);
  for (const range of overview["!merges"] ?? []) {
    if (range.s.r >= 35) paint(overview, range.s.r + 1, 2, range.e.r + 1, 7, range.s.r === 35 ? input : warning);
  }

  paint(net, 8, 2, 9, 5, success, true);
  paint(net, 8, 6, 9, 10, accent, true);
  const netCategories = [brand, accent, success, brandDeep, ...EXPENSES];
  netCategories.forEach((color, index) => {
    paint(net, 10, index + 2, 10, index + 2, color, true);
    paint(net, 13, index + 2, 13, index + 2, color);
    paint(net, 15, index + 2, 15, index + 2, color);
  });
  paint(net, 17, 2, 17, 5, warning);
  paint(net, 24, 1, 24, 8, success);
  paint(net, 25, 1, 25, 8, accent);
  paint(net, 27, 1, 27, 8, resultColor, true);
  paint(net, 32, 1, 32, 8, success);
  paint(net, 34, 1, 34, 8, danger);

  paint(daily, 5, 1, 6, 1, surface, true);
  paint(daily, 5, 2, 6, 7, success, true);
  paint(daily, 5, 8, 6, 12, accent, true);
  paint(daily, 7, 1, 7, 1, surface, true);
  paint(daily, 9, 1, layout.dailyTotal - 1, 1, surface);
  [...RECEIPTS.slice(0, 6), ...EXPENSES].forEach((color, index) => {
    const col = index + 2;
    paint(daily, 7, col, 7, col, color, true);
    paint(daily, 9, col, layout.dailyTotal - 1, col, color);
    paint(daily, layout.dailyTotal, col, layout.dailyTotal, col, color, true);
  });
  paint(daily, layout.dailyTotal + 2, 1, layout.dailyTotal + 2, 7, warning);
  [success, accent, resultColor].forEach((color, index) => {
    const row = layout.dailyTotal + 7 + index;
    paint(daily, row, 7, row, 12, color, index === 2);
  });

  paint(rc, 5, 1, 5, 1, surface, true);
  paint(rc, 7, 1, layout.rcEnd, 1, surface);
  RECEIPTS.forEach((color, index) => {
    const col = index + 2;
    paint(rc, 5, col, 5, col, color, true);
    paint(rc, 7, col, layout.rcEnd, col, color);
    paint(rc, layout.rcTotal, col, layout.rcTotal, col, color, true);
  });
  paint(rc, 5, 9, 5, 9, success, true);
  paint(rc, 7, 9, layout.rcEnd, 9, success);
  paint(rc, layout.rcTotal, 9, layout.rcTotal, 9, success, true);

  paint(rp, 5, 1, 5, 1, surface, true);
  paint(rp, 7, 1, layout.rpEnd, 1, surface);
  paint(rp, 7, 2, layout.rpEnd, 3, accent);
  [accent, brandDeep, brand].forEach((color, index) => {
    const col = index + 4;
    paint(rp, 5, col, 5, col, color, true);
    paint(rp, 7, col, layout.rpEnd, col, color);
    paint(rp, layout.rpTotal, col, layout.rpTotal, col, color, true);
  });
  const expenseGroups: Record<string, Palette> = { "Cetak / Plat": accent, Spanduk: accentSoft, ATK: success, "Lain-lain": warning, "Gaji / Mingguan": brandDeep };
  for (let row = 7; row <= layout.rpEnd; row++) paint(rp, row, 7, row, 7, expenseGroups[String(rp[`G${row}`]?.v)] ?? surface);

  const purchaseHeader = (row: number, method: Palette) => {
    [surface, method, brand, warning, accent, method].forEach((color, index) => paint(purchases, row, index + 1, row, index + 1, color, true));
  };
  purchaseHeader(5, accent);
  for (const section of layout.purchaseSections) {
    const method = section.method === "GIRO" ? brandDeep : section.method === "TRANSFER" ? brand : success;
    paint(purchases, section.firstRow - 2, 1, section.firstRow - 2, 6, method, true);
    purchaseHeader(section.firstRow - 1, method);
    paint(purchases, section.firstRow, 1, section.totalRow - 1, 6, method);
    paint(purchases, section.firstRow, 3, section.totalRow - 1, 3, brand);
    paint(purchases, section.firstRow, 4, section.totalRow - 1, 4, warning);
    paint(purchases, section.firstRow, 5, section.totalRow - 1, 5, accent);
    paint(purchases, section.totalRow, 1, section.totalRow, 6, method);
    paint(purchases, section.totalRow, 5, section.totalRow, 5, accent, true);
  }

  paint(balances, 1, 1, 1, 7, success, true);
  [surface, brand, warning, success, success, success, brandDeep].forEach((color, index) => {
    paint(balances, 5, index + 1, 5, index + 1, color, true);
    paint(balances, 7, index + 1, layout.balanceEnd, index + 1, color);
  });
  paint(balances, layout.balanceTotal, 1, layout.balanceTotal, 7, success, true);
  paint(balances, layout.debtRow - 2, 1, layout.debtRow - 2, 7, danger, true);
  paint(balances, layout.debtRow - 1, 1, layout.debtRow - 1, 7, danger, true);
  paint(balances, layout.debtRow, 1, layout.debtTotal - 2, 7, danger);
  paint(balances, layout.debtTotal, 1, layout.debtTotal, 7, danger);
}
