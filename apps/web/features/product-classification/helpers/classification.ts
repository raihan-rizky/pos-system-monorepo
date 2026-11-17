import type { CatalogGroup, CatalogSubcategory, LegacyCategory } from "../types";

const PRINTING_SUBCATEGORIES = new Set(["print", "stempel", "plat", "cetak", "spanduk"]);

export function normalizeSubcategoryName(name: string): string {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("id-ID");
}

export function listCatalogSubcategories<T extends CatalogSubcategory>(
  group: CatalogGroup,
  subcategories: readonly T[],
): T[] {
  return subcategories.filter((subcategory) =>
    subcategory.group === group &&
    (group !== "PERCETAKAN" || PRINTING_SUBCATEGORIES.has(normalizeSubcategoryName(subcategory.name))),
  );
}

export function validateCatalogSubcategory(
  draft: { group: CatalogGroup; name: string },
  subcategories: readonly CatalogSubcategory[],
  ignoreId?: string,
): { valid: true } | { valid: false; reason: "empty" | "fixed" | "duplicate" } {
  const name = normalizeSubcategoryName(draft.name);
  if (!name) return { valid: false, reason: "empty" };
  if (draft.group === "PERCETAKAN" && !PRINTING_SUBCATEGORIES.has(name)) {
    return { valid: false, reason: "fixed" };
  }
  if (subcategories.some((subcategory) =>
    subcategory.group === draft.group &&
    subcategory.id !== ignoreId &&
    normalizeSubcategoryName(subcategory.name) === name,
  )) {
    return { valid: false, reason: "duplicate" };
  }
  return { valid: true };
}

export function resolveCatalogClassification(input: {
  category: LegacyCategory;
  catalogSubcategory: CatalogSubcategory | null;
}): {
  group: CatalogGroup | null;
  subcategory: CatalogSubcategory | null;
  legacyCategory: LegacyCategory;
} {
  return {
    group: input.catalogSubcategory?.group ?? null,
    subcategory: input.catalogSubcategory,
    legacyCategory: input.category,
  };
}
