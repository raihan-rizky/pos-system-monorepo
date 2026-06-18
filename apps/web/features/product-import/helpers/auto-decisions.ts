import type { ImportRowDecision, NormalizedImportRow } from "../types";
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
  hargaDinas?: number | null;
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
  decisions?: Record<string, ImportRowDecision>;
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
    normalizePrice(row.costPrice ?? null) === normalizePrice(product.costPrice) &&
    (row.hargaDinas == null ||
      normalizePrice(row.hargaDinas) === normalizePrice(product.hargaDinas ?? null))
  );
}

function describePriceDataChanges(row: NormalizedImportRow, product: ExistingImportProduct): string {
  const changed: string[] = [];
  if (normalizePrice(row.price) !== normalizePrice(product.price)) changed.push("price");
  if (normalizePrice(row.costPrice ?? null) !== normalizePrice(product.costPrice)) changed.push("cost");
  if (
    row.hargaDinas != null &&
    normalizePrice(row.hargaDinas) !== normalizePrice(product.hargaDinas ?? null)
  ) {
    changed.push("Harga Dinas");
  }
  return changed.join("/") || "price/cost";
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
    hargaDinas: row.hargaDinas ?? null,
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

    const decision = input.decisions?.[String(row.rowNumber)] ?? input.decisions?.[row.sku];

    if (
      existingSkuProduct &&
      normalizeProductDuplicateKey({
        name: existingSkuProduct.name,
        category: existingSkuProduct.category,
      }) !== productKey
    ) {
      if (decision === "create" || decision === "create-variant") {
        const generatedSku = generateVariantSku(row.sku, "new", usedSkus);
        usedSkus.add(generatedSku);
        const resolved: NormalizedImportRow = {
          ...row,
          sku: generatedSku,
          generatedSku,
          autoAction: "conflict",
          autoActionReason: `Conflict: User decided to ${
            decision === "create" ? "create new" : "create variant"
          } with new SKU.`,
          matchedProductId: existingSkuProduct.id,
          normalizedProductKey: productKey,
        };
        if (decision === "create") {
          candidatesByKey.set(productKey, [...matchingCandidates, createCandidateFromRow(resolved)]);
        }
        return resolved;
      }

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
            : `Updated: same product and unit, ${describePriceDataChanges(row, sameUnit)} changed.`,
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
        stockIgnoredForVariant: true,
        autoAction: "auto_create_variant",
        autoActionReason: conversion.conversionNeedsReview
          ? "Variant: linked to existing stock group; imported stock ignored. Review needed: unit conversion was not recognized."
          : "Variant: linked to existing stock group; imported stock ignored.",
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
      autoActionReason: row.stockProvided === false
        ? "Created: no matching product found. Stock not provided; product will start at 0."
        : "Created: no matching product found.",
      normalizedProductKey: productKey,
    };
    candidatesByKey.set(productKey, [...matchingCandidates, createCandidateFromRow(resolved)]);
    return resolved;
  });
}
