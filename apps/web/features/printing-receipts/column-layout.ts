import type { PrintingSubcategory } from "./types";

const SPANDUK = { x: 21.25, widths: [6.85, 108.9, 7.6, 11.35, 23.45, 27.35], minimums: [6, 30, 6, 8, 14, 16], names: ["No.", "Nama File", "Bahan", "Banyak", "Harga satuan", "Jumlah"] };
const A5 = { x: 5.45, widths: [20.7, 60.6, 26.05, 30.45], minimums: [12, 30, 16, 18], names: ["Banyaknya", "Nama Barang", "Harga satuan", "Jumlah"] };
export const roundReceiptColumn = (value: number) => Math.round(value * 10000) / 10000;

/** Physical millimetres, shared by preview, pagination, PDF and the resize controls. */
export function getReceiptColumnConstraints(subcategory: PrintingSubcategory) {
  const source = subcategory === "SPANDUK" ? SPANDUK : A5;
  return { x: source.x, widths: [...source.widths], minimums: [...source.minimums], names: [...source.names] };
}

export function getReceiptColumnWidths(subcategory: PrintingSubcategory, saved?: readonly number[]): number[] {
  const { widths, minimums } = getReceiptColumnConstraints(subcategory);
  if (!Array.isArray(saved) || saved.length !== widths.length || saved.some((width, index) => !Number.isFinite(width) || width < minimums[index])
    || Math.abs(saved.reduce((total, width) => total + width, 0) - widths.reduce((total, width) => total + width, 0)) > .001) return widths;
  return saved.map(roundReceiptColumn);
}

export function hasValidReceiptColumnWidths(subcategory: PrintingSubcategory, saved?: readonly number[]): saved is readonly number[] {
  if (!Array.isArray(saved)) return false;
  const effective = getReceiptColumnWidths(subcategory, saved);
  return saved.length === effective.length && saved.every((width, index) => Number.isFinite(width) && Math.abs(width - effective[index]) < .0001);
}

/** Boundary index is the column on its left; the two outer table edges never move. */
export function resizeReceiptColumnBoundary(subcategory: PrintingSubcategory, saved: readonly number[] | undefined, boundary: number, delta: number): number[] {
  const widths = getReceiptColumnWidths(subcategory, saved);
  const { minimums } = getReceiptColumnConstraints(subcategory);
  if (!Number.isInteger(boundary) || boundary < 0 || boundary >= widths.length - 1 || !Number.isFinite(delta)) return widths;
  const pair = roundReceiptColumn(widths[boundary] + widths[boundary + 1]);
  widths[boundary] = roundReceiptColumn(Math.max(minimums[boundary], Math.min(pair - minimums[boundary + 1], widths[boundary] + delta)));
  widths[boundary + 1] = roundReceiptColumn(pair - widths[boundary]);
  return widths;
}

export function getReceiptColumnBoundaries(subcategory: PrintingSubcategory, saved?: readonly number[]): number[] {
  const result = [getReceiptColumnConstraints(subcategory).x];
  for (const width of getReceiptColumnWidths(subcategory, saved)) result.push(roundReceiptColumn(result[result.length - 1] + width));
  return result;
}
