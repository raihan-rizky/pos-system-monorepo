import type { ImportRowDecision, NormalizedImportRow } from "../types";
import { DEFAULT_IMPORT_CATEGORY } from "../types";
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
  hargaDinasProvided?: boolean;
  hargaAgen?: number | null;
  hargaAgenProvided?: boolean;
  unitMultiplierToBase?: number | null;
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

function unitMultiplierMatches(row: NormalizedImportRow, product: ExistingImportProduct): boolean {
  if (row.unitMultiplierToBase == null || product.unitMultiplierToBase == null) return true;
  return Number(row.unitMultiplierToBase) === Number(product.unitMultiplierToBase);
}

function optionalPriceMatches(
  rowValue: number | null | undefined,
  productValue: number | null | undefined,
  provided?: boolean,
): boolean {
  if (!provided && rowValue == null) return true;
  return normalizePrice(rowValue ?? null) === normalizePrice(productValue ?? null);
}

function priceDataMatches(row: NormalizedImportRow, product: ExistingImportProduct): boolean {
  return (
    normalizePrice(row.price) === normalizePrice(product.price) &&
    normalizePrice(row.costPrice ?? null) === normalizePrice(product.costPrice) &&
    optionalPriceMatches(row.hargaDinas, product.hargaDinas, row.hargaDinasProvided) &&
    optionalPriceMatches(row.hargaAgen, product.hargaAgen, row.hargaAgenProvided) &&
    unitMultiplierMatches(row, product)
  );
}

function describePriceDataChanges(row: NormalizedImportRow, product: ExistingImportProduct): string {
  const changed: string[] = [];
  if (normalizePrice(row.price) !== normalizePrice(product.price)) changed.push("price");
  if (normalizePrice(row.costPrice ?? null) !== normalizePrice(product.costPrice)) changed.push("cost");
  if (
    (row.hargaDinasProvided || row.hargaDinas != null) &&
    normalizePrice(row.hargaDinas ?? null) !== normalizePrice(product.hargaDinas ?? null)
  ) {
    changed.push("Harga Dinas");
  }
  if (
    (row.hargaAgenProvided || row.hargaAgen != null) &&
    normalizePrice(row.hargaAgen) !== normalizePrice(product.hargaAgen ?? null)
  ) {
    changed.push("Harga Agen");
  }
  if (!unitMultiplierMatches(row, product)) {
    changed.push("unit multiplier");
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
    hargaAgen: row.hargaAgen ?? null,
    unitMultiplierToBase: row.unitMultiplierToBase ?? null,
    stockGroupId: row.matchedStockGroupId ?? `row-group:${row.rowNumber}`,
    stockGroupBaseUnit: row.unit,
    productKey,
  };
}

function createVariantRowFromCandidate(input: {
  row: NormalizedImportRow;
  candidate: ProductCandidate;
  productKey: string;
  usedSkus: Set<string>;
  reasonPrefix?: string;
}): NormalizedImportRow {
  const { row, candidate, productKey, usedSkus, reasonPrefix } = input;
  const generatedSku = generateVariantSku(candidate.sku, row.unit, usedSkus);
  usedSkus.add(generatedSku);
  const conversion = resolveImportUnitMultiplier({
    unit: row.unit,
    baseUnit: candidate.stockGroupBaseUnit ?? candidate.unit,
    providedMultiplier: row.unitMultiplierToBase,
  });

  return {
    ...row,
    sku: generatedSku,
    generatedSku,
    unitMultiplierToBase: conversion.multiplier,
    conversionNeedsReview: conversion.conversionNeedsReview,
    stockIgnoredForVariant: true,
    autoAction: "auto_create_variant",
    autoActionReason: conversion.conversionNeedsReview
      ? `${reasonPrefix ?? "Variant"}: linked to existing stock group; imported stock ignored. Review needed: unit conversion was not recognized.`
      : `${reasonPrefix ?? "Variant"}: linked to existing stock group; imported stock ignored.`,
    matchedProductId: candidate.id,
    matchedProductSku: candidate.sku,
    matchedStockGroupId: candidate.stockGroupId,
    normalizedProductKey: productKey,
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
  const candidatesByName = new Map<string, ProductCandidate[]>();

  const addCandidate = (candidate: ProductCandidate) => {
    const nameKey = normalizeProductDuplicateKey({ name: candidate.name, category: "" });
    candidatesByKey.set(candidate.productKey, [...(candidatesByKey.get(candidate.productKey) ?? []), candidate]);
    candidatesByName.set(nameKey, [...(candidatesByName.get(nameKey) ?? []), candidate]);
  };

  for (const product of input.existingProducts) {
    const productKey = normalizeProductDuplicateKey({
      name: product.name,
      category: product.category,
    });
    const candidate: ProductCandidate = { ...product, productKey };
    addCandidate(candidate);
  }

  return input.rows.map((sourceRow) => {
    const existingSkuProduct = skuToProduct.get(sourceRow.sku);
    const decision = input.decisions?.[String(sourceRow.rowNumber)] ?? input.decisions?.[sourceRow.sku];
    const categoryProvided = sourceRow.categoryProvided ?? Boolean(sourceRow.category.trim());
    const nameKey = normalizeProductDuplicateKey({ name: sourceRow.name, category: "" });
    const matchingSkuProduct = existingSkuProduct &&
      normalizeProductDuplicateKey({ name: existingSkuProduct.name, category: "" }) === nameKey
      ? existingSkuProduct
      : undefined;
    const nameMatches = candidatesByName.get(nameKey) ?? [];
    const unitMatches = nameMatches.filter((candidate) => normalizeUnit(candidate.unit) === normalizeUnit(sourceRow.unit));
    const categoryMatches = unitMatches.length > 0 ? unitMatches : nameMatches;
    const categoryNames = new Set(categoryMatches.map((candidate) => candidate.category.trim().toLowerCase()));
    const ambiguousCategorylessMatch = !categoryProvided && !matchingSkuProduct &&
      (categoryNames.size > 1 || unitMatches.length > 1);
    const row: NormalizedImportRow = {
      ...sourceRow,
      categoryProvided,
      category: categoryProvided
        ? sourceRow.category
        : ambiguousCategorylessMatch
          ? DEFAULT_IMPORT_CATEGORY
          : matchingSkuProduct?.category ?? (categoryNames.size === 1 ? categoryMatches[0].category : DEFAULT_IMPORT_CATEGORY),
    };
    const productKey = normalizeProductDuplicateKey({
      name: row.name,
      category: row.category,
    });
    const matchingCandidates = ambiguousCategorylessMatch && decision === "create"
      ? []
      : candidatesByKey.get(productKey) ?? [];

    if (decision === "skip") {
      return {
        ...row,
        autoAction: "auto_skip",
        autoActionReason: "Skipped by user.",
        normalizedProductKey: productKey,
      };
    }

    if (ambiguousCategorylessMatch && decision !== "create") {
      return {
        ...row,
        autoAction: "conflict",
        autoActionReason: "Beberapa produk cocok dengan nama dan satuan ini. Isi kategori atau pilih buat produk baru atau lewati.",
        matchedProductId: undefined,
        normalizedProductKey: productKey,
      };
    }

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
          addCandidate(createCandidateFromRow(resolved));
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
      (candidate) => candidate.id === existingSkuProduct?.id && normalizeUnit(candidate.unit) === normalizeUnit(row.unit),
    ) ?? matchingCandidates.find(
      (candidate) => normalizeUnit(candidate.unit) === normalizeUnit(row.unit),
    );

    if ((decision === "create" || decision === "create-variant") && matchingCandidates.length > 0) {
      const candidate = sameUnit ?? matchingCandidates[0];
      const resolved = createVariantRowFromCandidate({
        row,
        candidate,
        productKey,
        usedSkus,
        reasonPrefix: "Variant: user kept duplicate SKU as a new variant",
      });
      addCandidate(createCandidateFromRow(resolved));
      return resolved;
    }

    if (sameUnit) {
      const autoAction = priceDataMatches(row, sameUnit)
        ? "auto_skip"
        : "auto_price_update";
      return {
        ...row,
        sku: sameUnit.sku,
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
      const resolved = createVariantRowFromCandidate({
        row,
        candidate: differentUnit,
        productKey,
        usedSkus,
      });
      addCandidate(createCandidateFromRow(resolved));
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
    addCandidate(createCandidateFromRow(resolved));
    return resolved;
  });
}
