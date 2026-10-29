import { beforeEach, describe, expect, it, vi } from "vitest";
import { executeCategoryAction } from "../category-management";

const fixture = vi.hoisted(() => ({ state: {} as Record<string, any[]> }));

vi.mock("@pos/db", () => {
  const matches = (row: any, where: any = {}): boolean => Object.entries(where).every(([key, value]: [string, any]) => {
    if (key === "OR") return value.some((condition: any) => matches(row, condition));
    if (key === "NOT") return !matches(row, value);
    if (value && typeof value === "object" && "in" in value) return value.in.includes(row[key]);
    if (value && typeof value === "object" && "notIn" in value) return !value.notIn.includes(row[key]);
    return row[key] === value;
  });

  return { db: { $transaction: async (run: any) => {
    const working = structuredClone(fixture.state);
    const model = (key: string) => ({
      findMany: vi.fn(async ({ where }: any = {}) => working[key].filter(row => matches(row, where)).sort((a, b) => a.id.localeCompare(b.id))),
      findFirst: vi.fn(async ({ where }: any) => working[key].find(row => matches(row, where)) ?? null),
      findUnique: vi.fn(async ({ where }: any) => {
        const scope = where.storeId_groupKey ?? where;
        return working[key].find(row => matches(row, scope)) ?? null;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const row = working[key].find(row => matches(row, where));
        Object.assign(row!, data);
        return row;
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const rows = working[key].filter(row => matches(row, where));
        rows.forEach(row => Object.assign(row, data));
        return { count: rows.length };
      }),
      deleteMany: vi.fn(async ({ where }: any) => {
        const rows = working[key].filter(row => matches(row, where));
        working[key] = working[key].filter(row => !matches(row, where));
        return { count: rows.length };
      }),
    });
    const result = await run({
      category: model("category"),
      product: model("product"),
      productStockGroup: model("group"),
      categoryCustomerPricingRule: model("rule"),
      $queryRaw: async (query: TemplateStringsArray, id: string, storeId: string) => {
        const key = query.join("").includes("pos_product_stock_groups") ? "group" : "product";
        return working[key].some(row => row.id === id && row.storeId === storeId) ? [{ id }] : [];
      },
    });
    fixture.state = working;
    return result;
  } } };
});

const actor = { id: "owner", role: "OWNER", storeId: "s1" };

beforeEach(() => {
  vi.stubEnv("CATEGORY_PREVIEW_SECRET", "test-secret-for-category-group-moves");
  const store = { id: "s1", name: "Toko Satu" };
  fixture.state = {
    category: [
      { id: "old", name: "Lama", icon: null, color: null, order: 0, salesGroup: "OTHER" },
      { id: "next", name: "Tujuan", icon: null, color: null, order: 0, salesGroup: "OTHER" },
    ],
    product: [
      { id: "rim", name: "Kertas", categoryId: "old", storeId: "s1", stockGroupId: "group-1", isActive: true, updatedAt: "2026-10-18", material: null, size: null, store },
      { id: "dus", name: "Kertas", categoryId: "old", storeId: "s1", stockGroupId: "group-1", isActive: false, updatedAt: "2026-10-18", material: null, size: null, store },
    ],
    group: [{ id: "group-1", storeId: "s1", groupKey: "kertas|old||", baseUnit: "rim", baseStock: 10, pricingConfig: { revision: 1 }, updatedAt: "2026-10-18" }],
    rule: [],
  };
});

describe("category changes for shared stock groups", () => {
  it("previews and moves every unit, including inactive units, without changing shared stock", async () => {
    const input = { action: "preview-move", productIds: ["rim"], targetCategoryId: "next" };
    const preview = await executeCategoryAction(input, actor) as any;
    expect(preview.totals).toEqual({ products: 2, unchanged: 0 });
    await executeCategoryAction({ ...input, action: "move", token: preview.token, acknowledged: true }, actor);
    expect(fixture.state.product.map(product => [product.id, product.categoryId, product.stockGroupId])).toEqual([
      ["rim", "next", "group-1"], ["dus", "next", "group-1"],
    ]);
    expect(fixture.state.group[0]).toMatchObject({ groupKey: "kertas|next||", baseStock: 10, pricingConfig: { revision: 1 } });
  });

  it("rejects a move into an existing group key rather than merging stock", async () => {
    fixture.state.group.push({ ...fixture.state.group[0], id: "group-2", groupKey: "kertas|next||", baseStock: 99 });
    const before = structuredClone(fixture.state);
    await expect(executeCategoryAction({ action: "preview-move", productIds: ["rim"], targetCategoryId: "next" }, actor)).rejects.toMatchObject({ status: 409 });
    expect(fixture.state).toEqual(before);
  });

  it("requires a fresh preview when an unselected group member changes", async () => {
    const input = { action: "preview-move", productIds: ["rim"], targetCategoryId: "next" };
    const preview = await executeCategoryAction(input, actor) as any;
    fixture.state.product[1].updatedAt = "2026-10-19";
    const before = structuredClone(fixture.state);
    await expect(executeCategoryAction({ ...input, action: "move", token: preview.token, acknowledged: true }, actor)).rejects.toMatchObject({ status: 409 });
    expect(fixture.state).toEqual(before);
  });

  it("updates the group key when deleting the source category", async () => {
    const input = { action: "preview-delete", categoryIds: ["old"], destinations: { old: "next" } };
    const preview = await executeCategoryAction(input, actor) as any;
    await executeCategoryAction({ ...input, action: "delete", token: preview.token, acknowledged: true, confirmation: "HAPUS 1 KATEGORI" }, actor);
    expect(fixture.state.product.map(product => product.categoryId)).toEqual(["next", "next"]);
    expect(fixture.state.group[0]).toMatchObject({ groupKey: "kertas|next||", baseStock: 10 });
  });

  it("preserves a manual group key while moving every member", async () => {
    fixture.state.group[0].groupKey = "manual:group-1";
    const input = { action: "preview-move", productIds: ["rim"], targetCategoryId: "next" };
    const preview = await executeCategoryAction(input, actor) as any;
    await executeCategoryAction({ ...input, action: "move", token: preview.token, acknowledged: true }, actor);
    expect(fixture.state.product.map(product => product.categoryId)).toEqual(["next", "next"]);
    expect(fixture.state.group[0]).toMatchObject({ groupKey: "manual:group-1", baseStock: 10 });
  });

  it("requires a fresh preview when a group gains an inactive member", async () => {
    const input = { action: "preview-move", productIds: ["rim"], targetCategoryId: "next" };
    const preview = await executeCategoryAction(input, actor) as any;
    fixture.state.product.push({ ...fixture.state.product[1], id: "pack" });
    const before = structuredClone(fixture.state);
    await expect(executeCategoryAction({ ...input, action: "move", token: preview.token, acknowledged: true }, actor)).rejects.toMatchObject({ status: 409 });
    expect(fixture.state).toEqual(before);
  });

  it("rejects deleting a category when a stock group is already split across categories", async () => {
    fixture.state.product[1].categoryId = "next";
    const before = structuredClone(fixture.state);
    await expect(executeCategoryAction({ action: "preview-delete", categoryIds: ["old"], destinations: { old: "next" } }, actor)).rejects.toMatchObject({ status: 409 });
    expect(fixture.state).toEqual(before);
  });

  it("does not treat a destination group in another store as a collision", async () => {
    fixture.state.group.push({ ...fixture.state.group[0], id: "other", storeId: "s2", groupKey: "kertas|next||", baseStock: 99 });
    const input = { action: "preview-move", productIds: ["rim"], targetCategoryId: "next" };
    const preview = await executeCategoryAction(input, actor) as any;
    await executeCategoryAction({ ...input, action: "move", token: preview.token, acknowledged: true }, actor);
    expect(fixture.state.group.find(group => group.id === "other")).toMatchObject({ storeId: "s2", baseStock: 99 });
    expect(fixture.state.product.every(product => product.categoryId === "next")).toBe(true);
  });

  it("rejects two source groups that would acquire the same destination key", async () => {
    fixture.state.category.push({ ...fixture.state.category[0], id: "third", name: "Lain" });
    fixture.state.group.push({ ...fixture.state.group[0], id: "group-2", groupKey: "kertas|third||", baseStock: 50 });
    fixture.state.product.push({ ...fixture.state.product[0], id: "box", stockGroupId: "group-2", categoryId: "third" });
    const before = structuredClone(fixture.state);
    await expect(executeCategoryAction({ action: "preview-move", productIds: ["rim", "box"], targetCategoryId: "next" }, actor)).rejects.toMatchObject({ status: 409 });
    expect(fixture.state).toEqual(before);
  });
});
