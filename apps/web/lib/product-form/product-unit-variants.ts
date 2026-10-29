import { adjustmentFactor, type Adjustment } from "@/features/product-stock-groups/pricing-drafts";
import { decimalToRatio, divideRatios, multiplyRatios, roundMoney, type ExactRatio, type PricingMode } from "@/features/product-stock-groups/automatic-pricing";
export type UnitDirection = "larger" | "smaller";
export type UnitBadgeRole = "primary" | "additional" | "small" | "large" | "equal";

export interface UnitVariantDraft {
  pricingMode?: PricingMode;
  adjustment?: Adjustment;
  percent?: string;
  id: string;
  unit: string;
  direction: UnitDirection;
  quantity: string;
  price: string;
  priceEdited: boolean;
  sku: string;
  skuEdited: boolean;
  barcode: string;
  costPrice: string;
}

export interface AdditionalUnitInput {
  pricingMode?: PricingMode;
  priceFactor?: ExactRatio;
  unit: string;
  sku: string;
  relativeQuantity: number;
  price: number;
  barcode?: string | null;
  costPrice?: number | null;
}

export interface UnitPrimaryValues {
  unit: string;
  sku: string;
  price: string;
  stock: string;
  costPrice?: string;
}

export interface NormalizedUnitGroup {
  baseUnit: string;
  baseStock: number;
  primaryMultiplier: number;
  additionalMultipliers: number[];
}

export function createUnitVariantDraft(id: string): UnitVariantDraft {
  return { id, pricingMode: "MANUAL", adjustment: "none", percent: "0", unit: "", direction: "larger", quantity: "", price: "", priceEdited: false,
    sku: "", skuEdited: false, barcode: "", costPrice: "" };
}

export function relativeUnitQuantity(direction: UnitDirection, quantity: string): number {
  const count = Number(quantity);
  if (!quantity.trim() || !Number.isFinite(count) || count < 1) return NaN;
  return direction === "larger" ? count : 1 / count;
}

export function suggestUnitPrice(price: string, relativeQuantity: number): string {
  const value = Number(price) * relativeQuantity;
  return price.trim() && Number.isFinite(value) && value >= 0
    ? String(Math.round(value)) : "";
}

export function generateUnitVariantSku(primarySku: string, unit: string): string {
  const sku = primarySku.trim();
  const suffix = unit.trim().replace(/\s+/g, "-").toUpperCase();
  if (!sku || !suffix) return "";
  const family = sku.includes("-") ? sku.slice(0, sku.lastIndexOf("-")) : sku;
  return `${family}-${suffix}`;
}

function unitConversionRatio(row: UnitVariantDraft): ExactRatio {
  if (!Number.isFinite(relativeUnitQuantity(row.direction, row.quantity))) throw new Error("Konversi belum valid.");
  const quantity = decimalToRatio(row.quantity);
  return row.direction === "larger" ? quantity : divideRatios(decimalToRatio("1"), quantity);
}

function newUnitSource(primary: UnitPrimaryValues, rows: UnitVariantDraft[]) {
  const sourceRatio = Math.min(1, ...rows.map(row => relativeUnitQuantity(row.direction, row.quantity)));
  if (!(sourceRatio > 0)) throw new Error("Konversi belum valid.");
  const source = sourceRatio < 1 ? rows.find(row => relativeUnitQuantity(row.direction, row.quantity) === sourceRatio) : undefined;
  if (source && !source.unit.trim()) throw new Error("Nama sumber belum diisi.");
  const values = source ? resolveUnitVariantValues(primary, source, true) : primary;
  // Normalize anchor money once, then project every Auto unit from those cents.
  return { source, ratio: source ? unitConversionRatio(source) : decimalToRatio("1"),
    price: roundMoney(decimalToRatio(values.price)),
    costPrice: values.costPrice?.trim() ? roundMoney(decimalToRatio(values.costPrice)) : "" };
}

export function resolveUnitVariantValues(primary: UnitPrimaryValues, row: UnitVariantDraft, isSource = false, rows: UnitVariantDraft[] = []): { price: string; costPrice: string; sku: string } {
  const sku = row.skuEdited ? row.sku : generateUnitVariantSku(primary.sku, row.unit);
  if (row.pricingMode === "AUTO" && !isSource) {
    try {
      const source = newUnitSource(primary, rows);
      const multiplier = divideRatios(unitConversionRatio(row), source.ratio);
      return { sku, price: roundMoney(multiplyRatios(decimalToRatio(source.price), multiplier, adjustmentFactor(row.adjustment ?? "none", row.percent ?? "0"))),
        costPrice: source.costPrice ? String(Number(roundMoney(multiplyRatios(decimalToRatio(source.costPrice), multiplier)))) : "" };
    } catch { return { sku, price: "", costPrice: "" }; }
  }
  const convertedCost = Number(primary.costPrice) * relativeUnitQuantity(row.direction, row.quantity);
  let generatedSourceCost = "";
  if (isSource && primary.costPrice?.trim()) {
    try { generatedSourceCost = String(Number(roundMoney(multiplyRatios(decimalToRatio(primary.costPrice), unitConversionRatio(row))))); } catch { /* Incomplete source fields remain blank. */ }
  }
  const costPrice = row.pricingMode !== "AUTO" && row.costPrice.trim() ? row.costPrice
    : isSource ? generatedSourceCost : primary.costPrice?.trim() && Number.isFinite(convertedCost) && convertedCost >= 0
      ? String(Math.round(convertedCost * 100) / 100) : "";
  return {
    costPrice,
    price: row.pricingMode === "AUTO"
      ? (() => { try { return roundMoney(multiplyRatios(decimalToRatio(primary.price), unitConversionRatio(row))); } catch { return ""; } })()
      : row.priceEdited ? row.price : suggestUnitPrice(costPrice, 1.35),
    sku,
  };
}

const normalizeUnitName = (unit: string) => unit.trim().replace(/\s+/g, " ").toLowerCase();

export function validateUnitDrafts(primary: UnitPrimaryValues, rows: UnitVariantDraft[]): Record<string, string> {
  const errors: Record<string, string> = {};
  const units = new Set([normalizeUnitName(primary.unit)]);
  const skus = new Set([primary.sku.trim().toUpperCase()]);
  for (const row of rows) {
    const unit = normalizeUnitName(row.unit);
    const sourceRatio = Math.min(1, ...rows.map(value => relativeUnitQuantity(value.direction, value.quantity)));
    const values = resolveUnitVariantValues(primary, row, sourceRatio < 1 && relativeUnitQuantity(row.direction, row.quantity) === sourceRatio);
    const sku = values.sku.trim().toUpperCase();
    const ratio = relativeUnitQuantity(row.direction, row.quantity);
    const automatic = row.pricingMode === "AUTO" && ratio !== sourceRatio;
    let adjustmentError = "";
    try { if (automatic) adjustmentFactor(row.adjustment ?? "none", row.percent ?? "0"); }
    catch (cause) { adjustmentError = cause instanceof Error ? cause.message : "Periksa penyesuaian harga."; }
    let message = "";
    if (!unit) message = "Isi nama unit tambahan.";
    else if (units.has(unit)) message = "Nama unit sudah digunakan. Pilih unit yang berbeda.";
    else if (!Number.isFinite(ratio) || ratio <= 0) message = "Isi konversi dengan angka 1 atau lebih.";
    else if (adjustmentError) message = adjustmentError;
    else if (!automatic && values.costPrice.trim() && (!Number.isFinite(Number(values.costPrice)) || Number(values.costPrice) < 0))
      message = "Harga modal harus berupa angka 0 atau lebih.";
    else if (!automatic && (!values.price.trim() || !Number.isFinite(Number(values.price)) || Number(values.price) < 0))
      message = "Isi harga jual dengan angka 0 atau lebih.";
    else if (!sku) message = "Isi SKU unit tambahan di Detail tambahan.";
    else if (skus.has(sku)) message = "SKU sudah digunakan. Ubah SKU di Detail tambahan.";
    if (message) errors[row.id] = message;
    units.add(unit);
    skus.add(sku);
  }
  return errors;
}

export function buildAdditionalUnitInputs(primary: UnitPrimaryValues, rows: UnitVariantDraft[]): AdditionalUnitInput[] {
  const errors = validateUnitDrafts(primary, rows);
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
  const sourceRatio = Math.min(1, ...rows.map(row => relativeUnitQuantity(row.direction, row.quantity)));
  return rows.map((row) => {
    const isSource = relativeUnitQuantity(row.direction, row.quantity) === sourceRatio && sourceRatio < 1;
    const automatic = row.pricingMode === "AUTO" && !isSource;
    const values = resolveUnitVariantValues(primary, row, isSource);
    return {
      unit: row.unit.trim(), sku: values.sku.trim(),
      relativeQuantity: relativeUnitQuantity(row.direction, row.quantity),
      ...(automatic ? { pricingMode: "AUTO" as const, priceFactor: adjustmentFactor(row.adjustment ?? "none", row.percent ?? "0"), price: 0 }
        : { ...(isSource ? {} : { pricingMode: "MANUAL" as const }), price: Number(values.price) }),
      ...(row.barcode.trim() ? { barcode: row.barcode.trim() } : {}),
      ...(!automatic && values.costPrice.trim() ? { costPrice: Number(values.costPrice) } : {}),
    };
  });
}

export function normalizeProductUnitGroup(primaryUnit: string, stock: number, variants: AdditionalUnitInput[]): NormalizedUnitGroup {
  if (!primaryUnit.trim() || !Number.isFinite(stock) || stock < 0)
    throw new Error("Isi unit dan stok awal yang valid.");
  const units = new Set([normalizeUnitName(primaryUnit)]);
  for (const variant of variants) {
    const unit = normalizeUnitName(variant.unit);
    if (!unit || units.has(unit)) throw new Error("Nama unit sudah digunakan. Pilih unit yang berbeda.");
    units.add(unit);
    if (!Number.isFinite(variant.relativeQuantity) || variant.relativeQuantity <= 0)
      throw new Error("Konversi unit harus berupa angka positif.");
  }
  const minimum = variants.reduce((value, variant) => Math.min(value, variant.relativeQuantity), 1);
  const primaryMultiplier = 1 / minimum;
  const additionalMultipliers = variants.map((variant) => variant.relativeQuantity / minimum);
  const baseStock = stock * primaryMultiplier;
  if (!Number.isFinite(baseStock) || !Number.isFinite(primaryMultiplier) ||
      additionalMultipliers.some((value) => !Number.isFinite(value) || value <= 0))
    throw new Error("Konversi atau stok terlalu besar. Periksa kembali angkanya.");
  const smallest = variants.find((variant) => variant.relativeQuantity === minimum);
  return { baseUnit: minimum < 1 ? smallest!.unit.trim() : primaryUnit.trim(),
    baseStock, primaryMultiplier, additionalMultipliers };
}

export function newUnitPrimaryPreview(primary: UnitPrimaryValues, rows: UnitVariantDraft[]) {
  try {
    const source = newUnitSource(primary, rows);
    if (!source.source) return null;
    const multiplier = divideRatios(decimalToRatio("1"), source.ratio);
    return { sourceUnit: source.source.unit, price: roundMoney(multiplyRatios(decimalToRatio(source.price), multiplier)),
      costPrice: source.costPrice ? roundMoney(multiplyRatios(decimalToRatio(source.costPrice), multiplier)) : "" };
  } catch { return null; }
}

export function getProductUnitBadges(rows: UnitVariantDraft[]): UnitBadgeRole[] {
  if (!rows.length) return ["primary"];
  const quantities = [1, ...rows.map((row) => relativeUnitQuantity(row.direction, row.quantity))];
  if (rows.some((row) => !row.unit.trim()) || quantities.some((value) => !Number.isFinite(value) || value <= 0))
    return ["primary", ...rows.map(() => "additional" as const)];
  if (quantities.every((value) => value === 1)) return quantities.map(() => "equal");
  const minimum = quantities.reduce((value, quantity) => Math.min(value, quantity), 1);
  return quantities.map((quantity) => quantity === minimum ? "small" : "large");
}
