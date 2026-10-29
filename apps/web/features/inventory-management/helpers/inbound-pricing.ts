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
