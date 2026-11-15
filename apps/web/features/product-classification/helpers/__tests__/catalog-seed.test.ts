import { describe, expect, it } from "vitest";
import { planCatalogSeed } from "../../../../../../packages/db/src/catalog-seed";

describe("catalog subcategory seeding", () => {
  it("links an unused default Cartridge and preserves legacy categories on a fresh seed", () => {
    const plan = planCatalogSeed([
      { id: "old-atk", name: "ATK" },
      { id: "old-bot", name: "BOT" },
      { id: "old-cartridge", name: "Cartridge" },
    ], [
      { id: "default-cartridge", group: "ATK", name: "Cartridge", legacyCategoryId: null, productCount: 0 },
      { id: "print", group: "PERCETAKAN", name: "PRINT", legacyCategoryId: null, productCount: 0 },
      { id: "plat", group: "PERCETAKAN", name: "PLAT", legacyCategoryId: null, productCount: 0 },
      { id: "stempel", group: "PERCETAKAN", name: "STEMPEL", legacyCategoryId: null, productCount: 0 },
    ]);
    expect(plan.links).toEqual([{ subcategoryId: "default-cartridge", legacyCategoryId: "old-cartridge" }]);
    expect(plan.creates.map((row: { legacyCategoryId: string | null }) => row.legacyCategoryId).sort()).toEqual(["old-atk", "old-bot"]);
  });

  it("keeps case-different legacy categories as distinct subcategories", () => {
    const plan = planCatalogSeed([{ id: "old-a", name: "BOT" }, { id: "old-b", name: " bot " }], []);
    expect(plan.creates.flatMap((row) => row.legacyCategoryId ? [row.legacyCategoryId] : []).sort()).toEqual(["old-a", "old-b"]);
  });

  it("does not attach legacy pricing to an already-used unlinked subcategory", () => {
    const plan = planCatalogSeed([{ id: "old-bot", name: "BOT" }], [
      { id: "used-bot", group: "ATK", name: "BOT", legacyCategoryId: null, productCount: 3 },
    ]);
    expect(plan.links).toEqual([]);
    expect(plan.creates).toEqual(expect.arrayContaining([expect.objectContaining({ legacyCategoryId: "old-bot", group: "ATK" })]));
    const legacy = plan.creates.find((row) => row.legacyCategoryId === "old-bot");
    expect(legacy).toBeDefined();
    expect(legacy?.name).not.toBe("BOT");
  });

  it("adds only the three supported printing defaults", () => {
    const plan = planCatalogSeed([], []);
    expect(plan.creates.filter((row: { group: string }) => row.group === "PERCETAKAN").map((row: { name: string }) => row.name).sort()).toEqual(["PLAT", "PRINT", "STEMPEL"]);
  });
});
