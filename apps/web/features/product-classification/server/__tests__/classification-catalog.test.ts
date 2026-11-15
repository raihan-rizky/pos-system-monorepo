import { beforeEach, describe, expect, it, vi } from "vitest";
import { manageClassificationSubcategory } from "../classification-catalog";

const fixture = vi.hoisted(() => ({ rows: [] as any[], products: [] as any[], rules: [] as any[] }));
vi.mock("@pos/db", () => ({
  db: { $transaction: async (run: (tx: any) => Promise<unknown>) => {
    const rows = structuredClone(fixture.rows);
    const tx = {
      $queryRaw: async () => [],
      productSubcategory: {
        findMany: async () => rows,
        findUnique: async ({ where }: any) => rows.find((row) => row.id === where.id) ?? null,
        create: async ({ data }: any) => { const row = { id: `new-${rows.length}`, legacyCategoryId: null, ...data }; rows.push(row); return row; },
        update: async ({ where, data }: any) => { const row = rows.find((item) => item.id === where.id); Object.assign(row, data); return row; },
        delete: async ({ where }: any) => { const index = rows.findIndex((row) => row.id === where.id); return rows.splice(index, 1)[0]; },
      },
      product: { count: async ({ where }: any) => fixture.products.filter((row) => row.catalogSubcategoryId === where.catalogSubcategoryId).length },
      subcategoryCustomerPricingRule: { count: async ({ where }: any) => fixture.rules.filter((row) => row.subcategoryId === where.subcategoryId).length },
    };
    const result = await run(tx);
    fixture.rows = rows;
    return result;
  } },
}));

beforeEach(() => {
  fixture.rows = [
    { id: "bot", group: "ATK", name: "BOT", legacyCategoryId: "legacy-bot" },
    { id: "print", group: "PERCETAKAN", name: "PRINT", legacyCategoryId: null },
  ];
  fixture.products = [];
  fixture.rules = [];
});

describe("subcategory management", () => {
  it("creates an ATK subcategory and preserves the three fixed printing choices", async () => {
    const row = await manageClassificationSubcategory({ action: "create", name: "  Cartridge  " });
    expect(row).toMatchObject({ group: "ATK", name: "Cartridge", legacyCategoryId: null });
    expect(fixture.rows.find((item) => item.id === "print")?.name).toBe("PRINT");
  });

  it("rejects duplicate ATK names regardless of spaces and capitalization", async () => {
    await expect(manageClassificationSubcategory({ action: "create", name: " bOt " })).rejects.toMatchObject({ status: 409 });
  });

  it("allows the same name under different main categories", async () => {
    await expect(manageClassificationSubcategory({ action: "create", name: "PRINT" })).resolves.toMatchObject({ group: "ATK", name: "PRINT" });
  });

  it("renames ATK subcategories while keeping their legacy link", async () => {
    await manageClassificationSubcategory({ action: "update", id: "bot", name: "Tinta" });
    expect(fixture.rows.find((item) => item.id === "bot")).toMatchObject({ name: "Tinta", legacyCategoryId: "legacy-bot" });
  });

  it("rejects changing or deleting fixed PERCETAKAN entries", async () => {
    await expect(manageClassificationSubcategory({ action: "update", id: "print", name: "Lain" })).rejects.toMatchObject({ status: 403 });
    await expect(manageClassificationSubcategory({ action: "delete", id: "print" })).rejects.toMatchObject({ status: 403 });
  });

  it("does not delete a subcategory used by a product in another store", async () => {
    fixture.products.push({ id: "other-store", storeId: "store-b", catalogSubcategoryId: "bot" });
    await expect(manageClassificationSubcategory({ action: "delete", id: "bot" })).rejects.toMatchObject({ status: 409 });
    expect(fixture.rows.some((row) => row.id === "bot")).toBe(true);
  });

  it("explains why a subcategory used by any pricing rule cannot be deleted", async () => {
    fixture.rules.push({ subcategoryId: "bot", storeId: "store-b", isActive: false });
    await expect(manageClassificationSubcategory({ action: "delete", id: "bot" })).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/aturan harga/i) });
    expect(fixture.rows.some((row) => row.id === "bot")).toBe(true);
  });
});
