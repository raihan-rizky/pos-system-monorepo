import {
  decimalToRatio,
  divideRatios,
  multiplyRatios,
  roundMoney,
} from "@/features/product-stock-groups/automatic-pricing";
import type {
  InboundPricingInput,
  InboundPricingSnapshot,
  InboundPricingUnit,
} from "../types/inventory-management";

const MAX_PRICE = 9_999_999_999.99;

export function inboundPricingReference(pricing: InboundPricingInput | null | undefined, units: InboundPricingUnit[] | undefined) {
  const unit = units?.find((candidate) => candidate.productId === pricing?.productId);
  if (!unit || pricing?.costPrice == null || !Number.isFinite(pricing.costPrice) || pricing.costPrice < 0) return null;
  try {
    const source = unit.autoCostSource;
    const costPrice = source
      ? roundMoney(multiplyRatios(decimalToRatio(pricing.costPrice), divideRatios(
          decimalToRatio(source.unitMultiplierToBase), decimalToRatio(unit.unitMultiplierToBase),
        )))
      : pricing.costPrice.toFixed(2);
    return { productId: source?.productId ?? unit.productId, unit: source?.unit ?? unit.unit, costPrice };
  } catch {
    return null;
  }
}

export function inboundAutoCostRoundingError(unit: InboundPricingUnit | undefined | null, costPrice: number | null): string | null {
  if (!unit?.autoCostSource || costPrice === null || !Number.isFinite(costPrice) || costPrice < 0) return null;
  try {
    const sourceMultiplier = decimalToRatio(unit.autoCostSource.unitMultiplierToBase);
    const unitMultiplier = decimalToRatio(unit.unitMultiplierToBase);
    const sourceCost = roundMoney(multiplyRatios(decimalToRatio(costPrice), divideRatios(sourceMultiplier, unitMultiplier)));
    const projectedCost = roundMoney(multiplyRatios(decimalToRatio(sourceCost), divideRatios(unitMultiplier, sourceMultiplier)));
    if (projectedCost !== costPrice.toFixed(2)) {
      return `HPP satuan otomatis tidak dapat dihitung tepat setelah pembulatan (hasil ${projectedCost.replace(".", ",")}). Pilih satuan acuan ${unit.autoCostSource.unit} atau ubah HPP.`;
    }
    return null;
  } catch {
    return "Konversi HPP satuan otomatis tidak valid. Pilih satuan acuan atau periksa HPP.";
  }
}

export function createInboundPricingSnapshot(
  pricing: InboundPricingInput | null | undefined,
  units: InboundPricingUnit[],
  required: boolean,
  orderedUnitMultiplierToBase: number,
): InboundPricingSnapshot {
  const productId = pricing?.productId || null;
  const unit = productId ? units.find((candidate) => candidate.productId === productId) : null;
  if (productId && !unit) {
    throw new Error("Satuan harga tidak tersedia untuk produk ini.");
  }

  const values = {
    costPrice: pricing?.costPrice ?? null,
    price: pricing?.price ?? null,
    hargaAgen: pricing?.hargaAgen ?? null,
    hargaDinas: pricing?.hargaDinas ?? null,
  };
  for (const value of Object.values(values)) {
    if (value !== null && (!Number.isFinite(value) || value < 0 || value > MAX_PRICE ||
      Math.abs(value * 100 - Math.round(value * 100)) > 0.0001)) {
      throw new Error("Harga harus berupa angka dari 0 sampai 9.999.999.999,99.");
    }
  }
  if (required && (!unit || Object.values(values).some((value) => value === null))) {
    throw new Error("Pilih satuan dan lengkapi HPP unit serta semua harga jual.");
  }
  if (!productId && Object.values(values).some((value) => value !== null)) {
    throw new Error("Pilih satuan untuk harga yang diisi.");
  }
  const roundingError = required ? inboundAutoCostRoundingError(unit, values.costPrice) : null;
  if (roundingError) throw new Error(roundingError);
  return {
    version: 1,
    productId,
    unit: unit?.unit ?? null,
    unitMultiplierToBase: unit?.unitMultiplierToBase ?? null,
    orderedUnitMultiplierToBase,
    ...values,
  };
}

export function inboundCostForOrderedUnit(
  pricing: InboundPricingSnapshot,
  orderedMultiplier: number,
): number | null {
  if (pricing.costPrice === null || pricing.unitMultiplierToBase === null) return null;
  if (!Number.isFinite(orderedMultiplier) || orderedMultiplier <= 0 ||
    !Number.isFinite(pricing.unitMultiplierToBase) || pricing.unitMultiplierToBase <= 0) {
    throw new Error("Konversi satuan produk perlu ditinjau.");
  }
  const converted = Number(roundMoney(multiplyRatios(
    decimalToRatio(pricing.costPrice),
    divideRatios(decimalToRatio(orderedMultiplier), decimalToRatio(pricing.unitMultiplierToBase)),
  )));
  if (!Number.isFinite(converted) || converted > MAX_PRICE) {
    throw new Error("HPP pada satuan pesanan melebihi batas harga.");
  }
  return converted;
}
