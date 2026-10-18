import { beforeEach, describe, expect, it, vi } from "vitest";
import { executeCategoryAction } from "../category-management";

const fixture = vi.hoisted(() => ({ state: {} as Record<string, any[]>, calls: [] as string[], failDelete: false, options: {} }));
vi.mock("@pos/db", () => {
  const matches = (row: any, where: any = {}): boolean => Object.entries(where).every(([key, value]: [string, any]) => {
    if (key === "OR") return value.some((condition: any) => matches(row, condition));
    if (key === "NOT") return !matches(row, value);
    if (value && typeof value === "object" && "in" in value) return value.in.includes(row[key]);
    if (value && typeof value === "object" && "equals" in value) return value.mode === "insensitive" ? row[key].toLowerCase() === value.equals.toLowerCase() : row[key] === value.equals;
    return row[key] === value;
  });
  return { db: { $transaction: async (fn: any, options: any) => {
    fixture.options = options;
    const working = structuredClone(fixture.state);
    const model = (key: string) => ({
      findMany: vi.fn(async ({ where }: any = {}) => working[key].filter(row => matches(row, where)).sort((a, b) => a.id.localeCompare(b.id))),
      create: vi.fn(async ({ data }: any) => { const row = { id: `new-${working[key].length}`, ...data, _count: { products: 0 } }; working[key].push(row); return row; }),
      update: vi.fn(async ({ where, data }: any) => { const row = working[key].find(row => matches(row, where)); Object.assign(row!, data); return row; }),
      updateMany: vi.fn(async ({ where, data }: any) => { fixture.calls.push(`${key}.updateMany`); const rows = working[key].filter(row => matches(row, where)); rows.forEach(row => Object.assign(row, data)); return { count: rows.length }; }),
      deleteMany: vi.fn(async ({ where }: any) => { fixture.calls.push(`${key}.deleteMany`); if (key === "category" && fixture.failDelete) throw new Error("database failure"); const rows = working[key].filter(row => matches(row, where)); working[key] = working[key].filter(row => !matches(row, where)); return { count: rows.length }; }),
    });
    const result = await fn({ category: model("category"), product: model("product"), categoryCustomerPricingRule: model("rule") });
    fixture.state = working;
    return result;
  } } };
});

const owner = { id: "owner", role: "OWNER", storeId: "s1" };
const admin = { id: "admin", role: "ADMIN", storeId: "s1" };
const category = (id: string, name: string) => ({ id, name, icon: null, color: null, order: 0, salesGroup: "OTHER", _count: { products: 0 } });
const mapping = { old: "next" };
const deletion = { action: "preview-delete", categoryIds: ["old"], destinations: mapping };

beforeEach(() => {
  vi.useRealTimers();
  vi.stubEnv("CATEGORY_PREVIEW_SECRET", "test-secret-for-category-preview-at-least-32-chars");
  fixture.failDelete = false;
  fixture.calls = [];
  fixture.state = {
    category: [category("old", "Lama"), category("next", "Tujuan")],
    product: [
      { id: "p1", categoryId: "old", storeId: "s1", isActive: true, updatedAt: "2026-10-18T00:00:00Z", store: { id: "s1", name: "Toko Satu" } },
      { id: "p2", categoryId: "old", storeId: "s2", isActive: false, updatedAt: "2026-10-18T00:00:00Z", store: { id: "s2", name: "Toko Dua" } },
    ],
    rule: [{ id: "r1", categoryId: "old", storeId: "s1", customerType: null, customerTypes: ["AGEN"], unit: "pcs", brandId: null, brand: null, mode: "FIXED_PRICE", value: "1000", isActive: false, updatedAt: "2026-10-18T00:00:00Z", store: { id: "s1", name: "Toko Satu" } }],
  };
});

async function deleteInput() {
  const preview = await executeCategoryAction(deletion, owner) as any;
  return { ...deletion, action: "delete", token: preview.token, acknowledged: true, confirmation: "HAPUS 1 KATEGORI" };
}

describe("category batches", () => {
  it("creates several trimmed categories atomically with defaults", async () => {
    const result = await executeCategoryAction({ action: "create", categories: [{ name: "  Buku  " }, { name: "Tinta", salesGroup: "INK" }] }, owner) as any;
    expect(result.categories).toHaveLength(2);
    expect(result.categories[0]).toMatchObject({ name: "Buku", order: 0, salesGroup: "OTHER", icon: null });
    expect(fixture.options).toMatchObject({ isolationLevel: "Serializable" });
  });
  it.each([[[{ name: " " }]], [[{ name: "Buku" }, { name: " buku " }]], [[{ name: "Lama" }]], [[{ name: "Buku", order: -1 }]], [[{ name: "Buku", salesGroup: "INVALID" }]]])("rejects invalid or duplicate rows without creating any", async (categories) => {
    await expect(executeCategoryAction({ action: "create", categories }, owner)).rejects.toMatchObject({ status: expect.any(Number) });
    expect(fixture.state.category).toHaveLength(2);
  });
  it("patches only supplied fields across several categories", async () => {
    fixture.state.category[0].color = "#123456";
    await executeCategoryAction({ action: "update", categories: [{ id: "old", name: "Baru" }, { id: "next", order: 3 }] }, owner);
    expect(fixture.state.category[0]).toMatchObject({ name: "Baru", color: "#123456" });
    expect(fixture.state.category[1]).toMatchObject({ name: "Tujuan", order: 3 });
  });
  it("creates categories with visual catalog icons and preserves the selected IDs", async () => {
    const result = await executeCategoryAction({ action: "create", categories: [
      { name: "Kopi", icon: "coffee" },
      { name: "Belanja", icon: "shopping-bag" },
    ] }, owner) as any;
    expect(result.categories.map((row: any) => row.icon)).toEqual(["coffee", "shopping-bag"]);
  });
  it("replaces an existing icon with a visual catalog icon", async () => {
    await executeCategoryAction({ action: "update", categories: [{ id: "old", icon: "coffee" }] }, owner);
    expect(fixture.state.category[0].icon).toBe("coffee");
  });
  it.each(["not-an-icon", "__proto__", "constructor", "toString"])("rejects unknown icon %s before saving any row", async icon => {
    for (const input of [
      { action: "create", categories: [{ name: "Baru", icon: "package" }, { name: "Tidak valid", icon }] },
      { action: "update", categories: [{ id: "old", name: "Berubah" }, { id: "next", icon }] },
    ]) {
      await expect(executeCategoryAction(input, owner)).rejects.toMatchObject({ status: 422, errors: { "categories.1.icon": expect.any(Array) } });
      expect(fixture.state.category.map(row => row.name)).toEqual(["Lama", "Tujuan"]);
    }
  });
  it("clears icon and color explicitly while preserving omitted appearance fields", async () => {
    Object.assign(fixture.state.category[0], { icon: "package", color: "#123456" });
    Object.assign(fixture.state.category[1], { icon: "printer", color: "#abcdef" });
    await executeCategoryAction({ action: "update", categories: [
      { id: "old", icon: null, color: null },
      { id: "next", name: "Tujuan baru" },
    ] }, owner);
    expect(fixture.state.category[0]).toMatchObject({ icon: null, color: null });
    expect(fixture.state.category[1]).toMatchObject({ icon: "printer", color: "#abcdef" });
  });
  it("rejects duplicate IDs, empty patches, and missing edited categories", async () => {
    for (const categories of [[{ id: "old", name: "A" }, { id: "old", name: "B" }], [{ id: "old" }], [{ id: "missing", name: "A" }]]) {
      await expect(executeCategoryAction({ action: "update", categories }, owner)).rejects.toMatchObject({ status: expect.any(Number) });
    }
    expect(fixture.state.category[0].name).toBe("Lama");
  });
});

describe("deletion impact and confirmation", () => {
  it("counts inactive products/rules and all affected stores with rule details", async () => {
    const preview = await executeCategoryAction(deletion, owner) as any;
    expect(preview).toMatchObject({ kind: "delete", totals: { categories: 1, products: 2, activeProducts: 1, inactiveProducts: 1, rules: 1, stores: 2 } });
    expect(preview.categories[0]).toMatchObject({ name: "Lama", targetCategoryName: "Tujuan", rules: [expect.objectContaining({ storeName: "Toko Satu", value: "1000", isActive: false })] });
    expect(preview.stores).toHaveLength(2);
    expect(fixture.calls).toEqual([]);
  });
  it("allows impact preview before choosing a destination", async () => {
    const preview = await executeCategoryAction({ ...deletion, destinations: {} }, owner) as any;
    expect(preview.categories[0].targetCategoryId).toBeNull();
    expect(preview.totals.products).toBe(2);
  });
  it("moves all products, deletes rules and then deletes categories", async () => {
    const result = await executeCategoryAction(await deleteInput(), owner);
    expect(result).toMatchObject({ deletedCategories: 1, movedProducts: 2, deletedRules: 1 });
    expect(fixture.state.product.every(p => p.categoryId === "next")).toBe(true);
    expect(fixture.state.rule).toEqual([]);
    expect(fixture.state.category.map(c => c.id)).toEqual(["next"]);
    expect(fixture.calls).toEqual(["product.updateMany", "rule.deleteMany", "category.deleteMany"]);
  });
  it("rolls back products and rules if category deletion fails", async () => {
    const input = await deleteInput();
    fixture.failDelete = true;
    await expect(executeCategoryAction(input, owner)).rejects.toThrow("database failure");
    expect(fixture.state.product.every(p => p.categoryId === "old")).toBe(true);
    expect(fixture.state.rule).toHaveLength(1);
    expect(fixture.state.category).toHaveLength(2);
  });
  it("keeps destination rules instead of copying the source rules", async () => {
    fixture.state.rule.push({ ...fixture.state.rule[0], id: "target-rule", categoryId: "next", value: "2000" });
    await executeCategoryAction(await deleteInput(), owner);
    expect(fixture.state.rule).toEqual([expect.objectContaining({ id: "target-rule", categoryId: "next", value: "2000" })]);
  });
  it.each(["token", "confirmation", "acknowledged"])("rejects invalid %s without mutations", async (field) => {
    const input = { ...await deleteInput(), [field]: field === "acknowledged" ? false : "invalid" };
    await expect(executeCategoryAction(input, owner)).rejects.toMatchObject({ status: expect.any(Number) });
    expect(fixture.calls).toEqual([]);
  });
  it.each(["rule-value", "product-member", "category-name", "target-name"])("requires fresh review after %s changes", async change => {
    const input = await deleteInput();
    if (change === "rule-value") fixture.state.rule[0].value = "2000";
    if (change === "product-member") fixture.state.product[0].id = "replacement";
    if (change === "category-name") fixture.state.category[0].name = "Berubah";
    if (change === "target-name") fixture.state.category[1].name = "Berubah";
    await expect(executeCategoryAction(input, owner)).rejects.toMatchObject({ status: 409 });
    expect(fixture.calls).toEqual([]);
  });
  it("expires previews and binds them to the confirming actor", async () => {
    vi.useFakeTimers();
    const input = await deleteInput();
    await expect(executeCategoryAction(input, { ...owner, id: "other" })).rejects.toMatchObject({ status: 409 });
    vi.advanceTimersByTime(600_001);
    await expect(executeCategoryAction(input, owner)).rejects.toMatchObject({ status: 409 });
  });
  it("rejects missing destinations or destinations that will also be deleted", async () => {
    await expect(executeCategoryAction({ ...await deleteInput(), destinations: {} }, owner)).rejects.toMatchObject({ status: expect.any(Number) });
    await expect(executeCategoryAction({ ...deletion, destinations: { old: "old" } }, owner)).rejects.toMatchObject({ status: 422 });
    await expect(executeCategoryAction({ ...deletion, destinations: { old: "missing" } }, owner)).rejects.toMatchObject({ status: expect.any(Number) });
    expect(fixture.calls).toEqual([]);
  });
  it("deletes an empty category without requiring a destination", async () => {
    fixture.state.product = [];
    fixture.state.rule = [];
    const preview = await executeCategoryAction({ ...deletion, destinations: {} }, owner) as any;
    await executeCategoryAction({ ...deletion, action: "delete", destinations: {}, token: preview.token, acknowledged: true, confirmation: "HAPUS 1 KATEGORI" }, owner);
    expect(fixture.state.category.map(c => c.id)).toEqual(["next"]);
  });
  it("requires Owner for rules or products in other stores", async () => {
    await expect(executeCategoryAction(deletion, admin)).rejects.toMatchObject({ status: 403 });
    fixture.state.rule = [];
    await expect(executeCategoryAction(deletion, admin)).rejects.toMatchObject({ status: 403 });
    fixture.state.product = fixture.state.product.slice(0, 1);
    const preview = await executeCategoryAction(deletion, admin) as any;
    await executeCategoryAction({ ...deletion, action: "delete", token: preview.token, acknowledged: true, confirmation: "HAPUS 1 KATEGORI" }, admin);
    expect(fixture.state.product[0].categoryId).toBe("next");
  });
  it("deletes several categories with a separate destination for each source", async () => {
    fixture.state.category.push(category("old-two", "Asal Dua"), category("next-two", "Tujuan Dua"));
    fixture.state.product[1].categoryId = "old-two";
    const input = { action: "preview-delete", categoryIds: ["old-two", "old"], destinations: { old: "next", "old-two": "next-two" } };
    const preview = await executeCategoryAction(input, owner) as any;
    expect(preview.totals).toMatchObject({ categories: 2, products: 2, stores: 2 });
    await executeCategoryAction({ ...input, action: "delete", token: preview.token, acknowledged: true, confirmation: "HAPUS 2 KATEGORI" }, owner);
    expect(fixture.state.product.map(p => p.categoryId)).toEqual(["next", "next-two"]);
    expect(fixture.state.category.map(c => c.id).sort()).toEqual(["next", "next-two"]);
  });
  it("breaks down affected stores for each source category", async () => {
    fixture.state.category.push(category("old-two", "Asal Dua"));
    fixture.state.product[1].categoryId = "old-two";
    const preview = await executeCategoryAction({ action: "preview-delete", categoryIds: ["old", "old-two"], destinations: {} }, owner) as any;
    expect(preview.categories.find((row: any) => row.id === "old").stores).toEqual([{ id: "s1", name: "Toko Satu", products: 1, rules: 1 }]);
    expect(preview.categories.find((row: any) => row.id === "old-two").stores).toEqual([{ id: "s2", name: "Toko Dua", products: 1, rules: 0 }]);
  });
  it("allows several source categories to share a surviving destination", async () => {
    fixture.state.category.push(category("old-two", "Asal Dua"));
    fixture.state.product[1].categoryId = "old-two";
    const input = { action: "preview-delete", categoryIds: ["old-two", "old"], destinations: { old: "next", "old-two": "next" } };
    const preview = await executeCategoryAction(input, owner) as any;
    await executeCategoryAction({ ...input, action: "delete", token: preview.token, acknowledged: true, confirmation: "HAPUS 2 KATEGORI" }, owner);
    expect(fixture.state.product.every(p => p.categoryId === "next")).toBe(true);
    expect(fixture.state.category).toHaveLength(1);
  });
});

describe("selected product transfer", () => {
  const move = { action: "preview-move", productIds: ["p1"], targetCategoryId: "next" };
  it("previews origins, and only moves explicit products within current store", async () => {
    const preview = await executeCategoryAction(move, admin) as any;
    expect(preview).toMatchObject({ kind: "move", targetCategoryName: "Tujuan", totals: { products: 1, unchanged: 0 }, origins: [{ id: "old", name: "Lama", products: 1 }] });
    await executeCategoryAction({ ...move, action: "move", token: preview.token, acknowledged: true }, admin);
    expect(fixture.state.product.map(p => p.categoryId)).toEqual(["next", "old"]);
  });
  it("reports products already at the destination as unchanged", async () => {
    fixture.state.product[0].categoryId = "next";
    const preview = await executeCategoryAction(move, owner) as any;
    expect(preview.totals).toEqual({ products: 0, unchanged: 1 });
  });
  it("rejects out-of-store IDs and duplicates without revealing products", async () => {
    await expect(executeCategoryAction({ ...move, productIds: ["p2"] }, owner)).rejects.toMatchObject({ status: 409 });
    await expect(executeCategoryAction({ ...move, productIds: ["p1", "p1"] }, owner)).rejects.toMatchObject({ status: 422 });
  });
  it("requires fresh preview if product or destination pricing changes", async () => {
    const preview = await executeCategoryAction(move, owner) as any;
    fixture.state.rule.push({ ...fixture.state.rule[0], id: "target-rule", categoryId: "next" });
    await expect(executeCategoryAction({ ...move, action: "move", token: preview.token, acknowledged: true }, owner)).rejects.toMatchObject({ status: 409 });
    expect(fixture.calls).toEqual([]);
  });
});

describe("category management use cases and regressions", () => {
  it("creates, edits, fills, and removes a category without losing its products", async () => {
    const created = await executeCategoryAction({ action: "create", categories: [{ name: "  Promosi  ", icon: "stamp", color: "#abc", salesGroup: "ATK" }] }, owner) as any;
    const categoryId = created.categories[0].id;
    const edited = await executeCategoryAction({ action: "update", categories: [{ id: categoryId, name: "Promo Akhir Tahun", icon: null, color: null, order: 5 }] }, owner) as any;
    expect(edited.categories[0]).toMatchObject({ name: "Promo Akhir Tahun", icon: null, color: null, order: 5, salesGroup: "ATK" });

    const move = { action: "preview-move", productIds: ["p1"], targetCategoryId: categoryId };
    const movePreview = await executeCategoryAction(move, admin) as any;
    expect(movePreview).toMatchObject({ targetCategoryName: "Promo Akhir Tahun", totals: { products: 1, unchanged: 0 } });
    await executeCategoryAction({ ...move, action: "move", token: movePreview.token, acknowledged: true }, admin);
    expect(fixture.state.product.map(product => product.categoryId)).toEqual([categoryId, "old"]);

    const remove = { action: "preview-delete", categoryIds: [categoryId], destinations: { [categoryId]: "next" } };
    const deletePreview = await executeCategoryAction(remove, owner) as any;
    expect(deletePreview).toMatchObject({ categories: [expect.objectContaining({ name: "Promo Akhir Tahun", products: 1, targetCategoryName: "Tujuan" })] });
    const result = await executeCategoryAction({ ...remove, action: "delete", token: deletePreview.token, acknowledged: true, confirmation: "HAPUS 1 KATEGORI" }, owner);
    expect(result).toMatchObject({ deletedCategories: 1, movedProducts: 1, deletedRules: 0 });
    expect(fixture.state.category.map(row => row.id)).toEqual(["old", "next"]);
    expect(fixture.state.product.map(product => ({ id: product.id, categoryId: product.categoryId }))).toEqual([{ id: "p1", categoryId: "next" }, { id: "p2", categoryId: "old" }]);
    expect(fixture.state.rule).toEqual([expect.objectContaining({ id: "r1", categoryId: "old" })]);
  });

  it.each([
    [{ id: "old", name: "Baru" }, { id: "next", name: " baru " }],
    [{ id: "old", order: 7 }, { id: "next", name: " lama " }],
  ])("rejects conflicting batch edits without saving earlier valid rows", async (first, second) => {
    const before = structuredClone(fixture.state);
    await expect(executeCategoryAction({ action: "update", categories: [first, second] }, owner)).rejects.toMatchObject({ status: 409, errors: { "categories.1.name": expect.any(Array) } });
    expect(fixture.state).toEqual(before);
  });

  it("allows keeping the same category name while changing its capitalization", async () => {
    const result = await executeCategoryAction({ action: "update", categories: [{ id: "old", name: "  LAMA  " }] }, owner) as any;
    expect(result.categories[0]).toMatchObject({ id: "old", name: "LAMA" });
    expect(fixture.state.category[1].name).toBe("Tujuan");
  });

  it("deletes a rule-only category without a destination and preserves unrelated products", async () => {
    fixture.state.product.forEach(product => { product.categoryId = "next"; });
    const preview = await executeCategoryAction({ ...deletion, destinations: {} }, owner) as any;
    expect(preview.totals).toMatchObject({ products: 0, rules: 1, stores: 1 });
    const result = await executeCategoryAction({ ...deletion, action: "delete", destinations: {}, token: preview.token, acknowledged: true, confirmation: "HAPUS 1 KATEGORI" }, owner);
    expect(result).toMatchObject({ deletedCategories: 1, movedProducts: 0, deletedRules: 1 });
    expect(fixture.state.product.map(product => product.id)).toEqual(["p1", "p2"]);
    expect(fixture.state.product.every(product => product.categoryId === "next")).toBe(true);
    expect(fixture.state.rule).toEqual([]);
  });

  it("moves a mixed selection across origins including inactive products and leaves existing destination members unchanged", async () => {
    fixture.state.category.push(category("other", "Lainnya"));
    fixture.state.product.push(
      { ...fixture.state.product[0], id: "p3", categoryId: "other", isActive: false },
      { ...fixture.state.product[0], id: "p4", categoryId: "next" },
    );
    const rulesBefore = structuredClone(fixture.state.rule);
    const move = { action: "preview-move", productIds: ["p4", "p3", "p1"], targetCategoryId: "next" };
    const preview = await executeCategoryAction(move, admin) as any;
    expect(preview.totals).toEqual({ products: 2, unchanged: 1 });
    expect(preview.origins).toEqual([{ id: "next", name: "Tujuan", products: 1 }, { id: "old", name: "Lama", products: 1 }, { id: "other", name: "Lainnya", products: 1 }]);
    const result = await executeCategoryAction({ ...move, action: "move", productIds: ["p1", "p3", "p4"], token: preview.token, acknowledged: true }, admin);
    expect(result).toMatchObject({ movedProducts: 2, unchangedProducts: 1 });
    expect(fixture.state.product.map(product => ({ id: product.id, categoryId: product.categoryId, isActive: product.isActive }))).toEqual([
      { id: "p1", categoryId: "next", isActive: true },
      { id: "p2", categoryId: "old", isActive: false },
      { id: "p3", categoryId: "next", isActive: false },
      { id: "p4", categoryId: "next", isActive: true },
    ]);
    expect(fixture.state.rule).toEqual(rulesBefore);
  });

  it("confirms an already completed selection without rewriting products", async () => {
    fixture.state.product[0].categoryId = "next";
    const before = structuredClone(fixture.state);
    const move = { action: "preview-move", productIds: ["p1"], targetCategoryId: "next" };
    const preview = await executeCategoryAction(move, admin) as any;
    const result = await executeCategoryAction({ ...move, action: "move", token: preview.token, acknowledged: true }, admin);
    expect(result).toMatchObject({ movedProducts: 0, unchangedProducts: 1 });
    expect(fixture.state).toEqual(before);
    expect(fixture.calls).toEqual([]);
  });

  it.each(["source-pricing", "product-edit", "product-origin", "deleted-target"])("rejects transfer confirmation after %s changes", async change => {
    const move = { action: "preview-move", productIds: ["p1"], targetCategoryId: "next" };
    const preview = await executeCategoryAction(move, admin) as any;
    if (change === "source-pricing") fixture.state.rule[0].value = "2500";
    if (change === "product-edit") fixture.state.product[0].updatedAt = "2026-10-18T00:01:00Z";
    if (change === "product-origin") fixture.state.product[0].categoryId = "next";
    if (change === "deleted-target") fixture.state.category = fixture.state.category.filter(row => row.id !== "next");
    const before = structuredClone(fixture.state);
    await expect(executeCategoryAction({ ...move, action: "move", token: preview.token, acknowledged: true }, admin)).rejects.toMatchObject({ status: 409 });
    expect(fixture.state).toEqual(before);
    expect(fixture.calls).toEqual([]);
  });

  it.each(["role", "store"])("rejects transfer confirmation when the actor's %s changes", async field => {
    const move = { action: "preview-move", productIds: ["p1"], targetCategoryId: "next" };
    const preview = await executeCategoryAction(move, admin) as any;
    const changedActor = { ...admin, [field === "role" ? "role" : "storeId"]: field === "role" ? "OWNER" : "s2" };
    const before = structuredClone(fixture.state);
    await expect(executeCategoryAction({ ...move, action: "move", token: preview.token, acknowledged: true }, changedActor)).rejects.toMatchObject({ status: 409 });
    expect(fixture.state).toEqual(before);
    expect(fixture.calls).toEqual([]);
  });

  it("requires a new deletion preview after choosing a different surviving destination", async () => {
    fixture.state.category.push(category("alternative", "Tujuan Alternatif"));
    const input = await deleteInput();
    const before = structuredClone(fixture.state);
    await expect(executeCategoryAction({ ...input, destinations: { old: "alternative" } }, owner)).rejects.toMatchObject({ status: 409 });
    expect(fixture.state).toEqual(before);
    expect(fixture.calls).toEqual([]);
  });
});
