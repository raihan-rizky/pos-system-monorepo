import type { NormalizedImportRow } from "../types";
import { normalizeProductDuplicateKey } from "./name-normalization";
import { resolveImportUnitMultiplier } from "./unit-conversion";
import { generateVariantSku } from "./variant-sku";

export interface ExistingImportProduct {
  id: string;
  name: string;
  sku: string;
  category: string;
  unit: string;
  price: number;
  costPrice: number | null;
  stockGroupId?: string | null;
  stockGroupBaseUnit?: string | null;
}

interface ProductCandidate extends ExistingImportProduct {
  productKey: string;
}

export interface ResolveProductImportAutoDecisionsInput {
  rows: NormalizedImportRow[];
  existingProducts: ExistingImportProduct[];
  existingSkus: Set<string>;
}

function normalizeUnit(value: string): string {
  return value.trim().toLowerCase();
}

function normalizePrice(value: number | null | undefined): number | null {
  return value == null ? null : Number(value);
}

function priceDataMatches(row: NormalizedImportRow, product: ExistingImportProduct): boolean {
  return (
    normalizePrice(row.price) === normalizePrice(product.price) &&
    normalizePrice(row.costPrice ?? null) === normalizePrice(product.costPrice)
  );
}

function createCandidateFromRow(row: NormalizedImportRow): ProductCandidate {
  const productKey = normalizeProductDuplicateKey({
    name: row.name,
    category: row.category,
  });

  return {
    id: `row:${row.rowNumber}`,
    name: row.name,
    sku: row.generatedSku ?? row.sku,
    category: row.category,
    unit: row.unit,
    price: row.price,
    costPrice: row.costPrice ?? null,
    stockGroupId: row.matchedStockGroupId ?? `row-group:${row.rowNumber}`,
    stockGroupBaseUnit: row.unit,
    productKey,
  };
}

export function resolveProductImportAutoDecisions(
  input: ResolveProductImportAutoDecisionsInput,
): NormalizedImportRow[] {
  const usedSkus = new Set(input.existingSkus);
  const skuToProduct = new Map(
    input.existingProducts.map((product) => [product.sku, product]),
  );
  const candidatesByKey = new Map<string, ProductCandidate[]>();

  for (const product of input.existingProducts) {
    const productKey = normalizeProductDuplicateKey({
      name: product.name,
      category: product.category,
    });
    const candidate: ProductCandidate = { ...product, productKey };
    candidatesByKey.set(productKey, [...(candidatesByKey.get(productKey) ?? []), candidate]);
  }

  return input.rows.map((row) => {
    const productKey = normalizeProductDuplicateKey({
      name: row.name,
      category: row.category,
    });
    const existingSkuProduct = skuToProduct.get(row.sku);
    const matchingCandidates = candidatesByKey.get(productKey) ?? [];

    if (
      existingSkuProduct &&
      normalizeProductDuplicateKey({
        name: existingSkuProduct.name,
        category: existingSkuProduct.category,
      }) !== productKey
    ) {
      return {
        ...row,
        autoAction: "conflict",
        autoActionReason: "Conflict: SKU belongs to another product.",
        matchedProductId: existingSkuProduct.id,
        normalizedProductKey: productKey,
      };
    }

    const sameUnit = matchingCandidates.find(
      (candidate) => normalizeUnit(candidate.unit) === normalizeUnit(row.unit),
    );

    if (sameUnit) {
      const autoAction = priceDataMatches(row, sameUnit)
        ? "auto_skip"
        : "auto_price_update";
      return {
        ...row,
        autoAction,
        autoActionReason:
          autoAction === "auto_skip"
            ? "Skipped: same product, same unit, same price/cost."
            : "Updated: same product and unit, price/cost changed.",
        matchedProductId: sameUnit.id,
        matchedProductSku: sameUnit.sku,
        matchedStockGroupId: sameUnit.stockGroupId,
        normalizedProductKey: productKey,
      };
    }

    const differentUnit = matchingCandidates[0];
    if (differentUnit) {
      const generatedSku = generateVariantSku(differentUnit.sku, row.unit, usedSkus);
      usedSkus.add(generatedSku);
      const conversion = resolveImportUnitMultiplier({
        unit: row.unit,
        baseUnit: differentUnit.stockGroupBaseUnit ?? differentUnit.unit,
        providedMultiplier: row.unitMultiplierToBase,
      });
      const resolved: NormalizedImportRow = {
        ...row,
        sku: generatedSku,
        generatedSku,
        unitMultiplierToBase: conversion.multiplier,
        conversionNeedsReview: conversion.conversionNeedsReview,
        autoAction: "auto_create_variant",
        autoActionReason: conversion.conversionNeedsReview
          ? "Variant: same product, different unit. Review needed: unit conversion was not recognized."
          : "Variant: same product, different unit.",
        matchedProductId: differentUnit.id,
        matchedProductSku: differentUnit.sku,
        matchedStockGroupId: differentUnit.stockGroupId,
        normalizedProductKey: productKey,
      };
      candidatesByKey.set(productKey, [...matchingCandidates, createCandidateFromRow(resolved)]);
      return resolved;
    }

    const sku = usedSkus.has(row.sku) ? generateVariantSku(row.sku, "new", usedSkus) : row.sku;
    usedSkus.add(sku);
    const resolved: NormalizedImportRow = {
      ...row,
      sku,
      generatedSku: sku !== row.sku ? sku : undefined,
      autoAction: "create",
      autoActionReason: "Created: no matching product found.",
      normalizedProductKey: productKey,
    };
    candidatesByKey.set(productKey, [...matchingCandidates, createCandidateFromRow(resolved)]);
    return resolved;
  });
}
