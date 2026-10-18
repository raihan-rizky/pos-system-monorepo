import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { CategoryEditor, categoryPatches, remapCategoryPatchErrors } from "../components/CategoryEditor";
import { CategoryRequestError, categoryRowErrors } from "../hooks/useCategoryManagement";
import { canConfirmCategoryDelete, CategoryDeleteImpact } from "../components/CategoryDeleteDialog";
import { MoveProductsImpact } from "../components/MoveProductsDialog";
import { selectVisibleCategories } from "../components/CategoryManagementTab";
import type { DeletePreview, ManagedCategory } from "../types";

const category: ManagedCategory = { id: "old", name: "Kertas", icon: "file-text", color: "#ffffff", order: 1, salesGroup: "PAPER", _count: { products: 7 } };
export const preview: DeletePreview = {
  kind: "delete", token: "signed", expiresAt: Date.now() + 600000,
  categories: [{ id: "old", name: "Kertas", targetCategoryId: "next", targetCategoryName: "ATK", products: 7, activeProducts: 5, inactiveProducts: 2,
    rules: [{ id: "r", storeId: "s", storeName: "Toko Selatan", customerTypes: ["AGEN"], unit: "rim", brandName: "Sinar", mode: "COST_PLUS_FLAT", value: "2000", isActive: false }], stores: [{ id: "s", name: "Toko Selatan", products: 7, rules: 1 }] }],
  totals: { categories: 1, products: 7, activeProducts: 5, inactiveProducts: 2, rules: 1, stores: 1 },
  stores: [{ id: "s", name: "Toko Selatan", products: 7, rules: 1 }],
};

describe("category management UI", () => {
  it("only allows delete after complete fresh impact, target, checkbox and exact phrase", () => {
    expect(canConfirmCategoryDelete(preview, true, "HAPUS 1 KATEGORI", false)).toBe(true);
    expect(canConfirmCategoryDelete(preview, false, "HAPUS 1 KATEGORI", false)).toBe(false);
    expect(canConfirmCategoryDelete(preview, true, "hapus 1 kategori", false)).toBe(false);
    expect(canConfirmCategoryDelete(preview, true, "HAPUS 1 KATEGORI", true)).toBe(false);
    expect(canConfirmCategoryDelete({ ...preview, expiresAt: 0 }, true, "HAPUS 1 KATEGORI", false)).toBe(false);
    expect(canConfirmCategoryDelete({ ...preview, categories: [{ ...preview.categories[0], targetCategoryId: null }] }, true, "HAPUS 1 KATEGORI", false)).toBe(false);
  });
  it("shows active and inactive products, exact rule details, store and irreversible warning", () => {
    const html = renderToStaticMarkup(<CategoryDeleteImpact preview={preview} />);
    for (const text of ["7 produk", "5 aktif", "2 nonaktif", "1 aturan", "1 toko", "Toko Selatan", "AGEN", "rim", "Sinar", "2000", "Nonaktif", "tidak dapat dipulihkan", "harga pelanggan", "Dampak toko untuk Kertas"]) expect(html.includes(text), text).toBe(true);
  });
  it("builds edit patches without resetting unchanged fields or submitting untouched rows", () => {
    expect(categoryPatches([category], [{ ...category, name: "Kertas A4" }])).toEqual([{ id: "old", name: "Kertas A4" }]);
    expect(categoryPatches([category], [category])).toEqual([]);
  });
  it("places errors from a filtered update batch on the original changed row", () => {
    const second = { ...category, id: "second", name: "Tinta" };
    const originals = [category, second];
    const patches = categoryPatches(originals, [category, { ...second, name: "Duplikat" }]);
    const failure = new CategoryRequestError("Nama sudah digunakan", 422, "VALIDATION", { "categories.0.name": ["Pilih nama lain"], categories: ["Periksa masukan"] });
    const mapped = remapCategoryPatchErrors(failure, originals, patches);
    expect(categoryRowErrors(mapped, 0)).toEqual([]);
    expect(categoryRowErrors(mapped, 1)).toEqual(["Pilih nama lain"]);
    expect(mapped).toMatchObject({ message: "Nama sudah digunakan", status: 422, code: "VALIDATION", errors: { categories: ["Periksa masukan"] } });
  });
  it("shows independent batch row fields and row validation errors", () => {
    const html = renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}><CategoryEditor categories={[category, { ...category, id: "next", name: "ATK" }]} onClose={() => {}} onSaved={() => {}} /></QueryClientProvider>);
    expect(html).toContain("Nama kategori 1");
    expect(html).toContain("Nama kategori 2");
    expect(html).toContain("Kelompok penjualan 2");
  });
  it("selects only visible categories while preserving explicit hidden selection", () => {
    expect([...selectVisibleCategories(new Set(["hidden"]), ["a", "b"], true)]).toEqual(["hidden", "a", "b"]);
    expect([...selectVisibleCategories(new Set(["hidden", "a", "b"]), ["a", "b"], false)]).toEqual(["hidden"]);
  });
  it("shows origins, moved and unchanged totals before moving selected products", () => {
    const html = renderToStaticMarkup(<MoveProductsImpact preview={{ kind: "move", token: "t", expiresAt: 1, targetCategoryId: "next", targetCategoryName: "ATK", totals: { products: 4, unchanged: 1 }, origins: [{ id: "old", name: "Kertas", products: 4 }] }} />);
    for (const text of ["4 produk", "1 produk", "Kertas", "ATK", "harga pelanggan"]) expect(html).toContain(text);
  });
});
