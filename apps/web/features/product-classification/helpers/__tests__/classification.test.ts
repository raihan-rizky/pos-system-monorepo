import { describe, expect, it } from "vitest";
import type { CatalogSubcategory } from "../../types";
import { listCatalogSubcategories, resolveCatalogClassification, validateCatalogSubcategory } from "../classification";

const categories = [
  { id: "atk-bot", group: "ATK", name: "BOT", legacyCategoryId: "legacy-bot" },
  { id: "print", group: "PERCETAKAN", name: "PRINT", legacyCategoryId: null },
  { id: "stempel", group: "PERCETAKAN", name: "STEMPEL", legacyCategoryId: null },
  { id: "plat", group: "PERCETAKAN", name: "PLAT", legacyCategoryId: null },
  { id: "old-spanduk", group: "PERCETAKAN", name: "SPANDUK", legacyCategoryId: null },
] satisfies CatalogSubcategory[];

describe("product classification", () => {
  it("offers only PRINT, STEMPEL, and PLAT as printing destinations", () => {
    const names = listCatalogSubcategories("PERCETAKAN", categories).map((row: { name: string }) => row.name);
    expect(names.sort()).toEqual(["PLAT", "PRINT", "STEMPEL"]);
  });

  it("rejects a duplicate name within the same main category after normalization", () => {
    expect(validateCatalogSubcategory({ group: "ATK", name: "  bOt  " }, categories)).toMatchObject({ valid: false });
  });

  it("allows the same subcategory name under a different main category", () => {
    expect(validateCatalogSubcategory({ group: "ATK", name: "PRINT" }, categories)).toMatchObject({ valid: true });
  });

  it("rejects a printing subcategory outside the three supported choices", () => {
    expect(validateCatalogSubcategory({ group: "PERCETAKAN", name: "Spanduk" }, [])).toMatchObject({ valid: false });
  });

  it("retains the legacy category of a product that has not been classified", () => {
    expect(resolveCatalogClassification({
      category: { id: "legacy-bot", name: "BOT" },
      catalogSubcategory: null,
    })).toMatchObject({
      group: null,
      subcategory: null,
      legacyCategory: { id: "legacy-bot", name: "BOT" },
    });
  });

  it("uses the selected subcategory while retaining the original legacy category", () => {
    expect(resolveCatalogClassification({
      category: { id: "legacy-bot", name: "BOT" },
      catalogSubcategory: categories[1],
    })).toMatchObject({
      group: "PERCETAKAN",
      subcategory: { id: "print", name: "PRINT" },
      legacyCategory: { id: "legacy-bot", name: "BOT" },
    });
  });
});
