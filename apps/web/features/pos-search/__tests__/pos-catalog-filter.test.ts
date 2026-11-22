import { describe, expect, it } from "vitest";
import { buildPosCatalogFilterWhere, matchesPosCatalogFilter } from "../pos-catalog-filter";

describe("POS catalog filter", () => {
  it("matches explicit subcategories before legacy category mappings", () => {
    expect(matchesPosCatalogFilter({
      catalogSubcategoryId: "printing",
      catalogSubcategory: { id: "printing", group: "PERCETAKAN" },
      category: { catalogSubcategory: { id: "atk", group: "ATK" } },
    }, { group: "PERCETAKAN", subcategoryId: "printing" })).toBe(true);
    expect(matchesPosCatalogFilter({
      catalogSubcategoryId: "printing",
      catalogSubcategory: { id: "printing", group: "PERCETAKAN" },
      category: { catalogSubcategory: { id: "atk", group: "ATK" } },
    }, { group: "ATK", subcategoryId: "atk" })).toBe(false);
  });

  it("uses the mapped legacy subcategory only when the explicit id is empty", () => {
    expect(matchesPosCatalogFilter({
      catalogSubcategoryId: null,
      catalogSubcategory: null,
      category: { catalogSubcategory: { id: "atk", group: "ATK" } },
    }, { group: "ATK", subcategoryId: "atk" })).toBe(true);
  });

  it("builds explicit-first Prisma alternatives for both classification sources", () => {
    expect(buildPosCatalogFilterWhere({ group: "ATK", subcategoryId: "atk" })).toEqual({
      OR: [
        { catalogSubcategory: { is: { id: "atk", group: "ATK" } } },
        { catalogSubcategoryId: null, category: { catalogSubcategory: { is: { id: "atk", group: "ATK" } } } },
      ],
    });
  });
});
