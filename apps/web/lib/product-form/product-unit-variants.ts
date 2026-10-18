export type UnitDirection = "larger" | "smaller";
export type UnitBadgeRole = "primary" | "additional" | "small" | "large" | "equal";

export interface UnitVariantDraft {
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
  return { id, unit: "", direction: "larger", quantity: "", price: "", priceEdited: false,
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

export function resolveUnitVariantValues(primary: UnitPrimaryValues, row: UnitVariantDraft) {
  const convertedCost = Number(primary.costPrice) * relativeUnitQuantity(row.direction, row.quantity);
  const costPrice = row.costPrice.trim() ? row.costPrice
    : primary.costPrice?.trim() && Number.isFinite(convertedCost) && convertedCost >= 0
      ? String(Math.round(convertedCost * 100) / 100) : "";
  return {
    costPrice,
    price: row.priceEdited ? row.price : suggestUnitPrice(costPrice, 1.35),
    sku: row.skuEdited ? row.sku : generateUnitVariantSku(primary.sku, row.unit),
  };
}

const normalizeUnitName = (unit: string) => unit.trim().replace(/\s+/g, " ").toLowerCase();

export function validateUnitDrafts(primary: UnitPrimaryValues, rows: UnitVariantDraft[]): Record<string, string> {
  const errors: Record<string, string> = {};
  const units = new Set([normalizeUnitName(primary.unit)]);
  const skus = new Set([primary.sku.trim().toUpperCase()]);
  for (const row of rows) {
    const unit = normalizeUnitName(row.unit);
    const values = resolveUnitVariantValues(primary, row);
    const sku = values.sku.trim().toUpperCase();
    const ratio = relativeUnitQuantity(row.direction, row.quantity);
    let message = "";
    if (!unit) message = "Isi nama unit tambahan.";
    else if (units.has(unit)) message = "Nama unit sudah digunakan. Pilih unit yang berbeda.";
    else if (!Number.isFinite(ratio) || ratio <= 0) message = "Isi konversi dengan angka 1 atau lebih.";
    else if (values.costPrice.trim() && (!Number.isFinite(Number(values.costPrice)) || Number(values.costPrice) < 0))
      message = "Harga modal harus berupa angka 0 atau lebih.";
    else if (!values.price.trim() || !Number.isFinite(Number(values.price)) || Number(values.price) < 0)
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
  return rows.map((row) => {
    const values = resolveUnitVariantValues(primary, row);
    return {
      unit: row.unit.trim(), sku: values.sku.trim(),
      relativeQuantity: relativeUnitQuantity(row.direction, row.quantity),
      price: Number(values.price),
      ...(row.barcode.trim() ? { barcode: row.barcode.trim() } : {}),
      ...(values.costPrice.trim() ? { costPrice: Number(values.costPrice) } : {}),
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

export function getProductUnitBadges(rows: UnitVariantDraft[]): UnitBadgeRole[] {
  if (!rows.length) return ["primary"];
  const quantities = [1, ...rows.map((row) => relativeUnitQuantity(row.direction, row.quantity))];
  if (rows.some((row) => !row.unit.trim()) || quantities.some((value) => !Number.isFinite(value) || value <= 0))
    return ["primary", ...rows.map(() => "additional" as const)];
  if (quantities.every((value) => value === 1)) return quantities.map(() => "equal");
  const minimum = quantities.reduce((value, quantity) => Math.min(value, quantity), 1);
  return quantities.map((quantity) => quantity === minimum ? "small" : "large");
}
