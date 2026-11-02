import { describe, expect, it, vi } from "vitest";
const transact = vi.hoisted(() => vi.fn());
vi.mock("@pos/db", () => ({ db: { $transaction: transact }, Prisma: {} }));
import { importPricingDatabase } from "./import-pricing-database";
import { commitProductImportChunk } from "../product-import-commit-service";
import { priceProductForCustomerType } from "@/features/customer-category-pricing/helpers/pricing-rules";
import { normalizeImportRows } from "../../helpers/import-core";

describe("committed import member price priority", () => {
  it("keeps imported Agen and Dinas prices through persistence and customer pricing", async () => {
    const database = importPricingDatabase();
    transact.mockImplementation(database.transaction);
    database.addRow("rim", 2, 0, 15000, 10000);
    Object.assign(database.planned[0].rowData, { hargaAgen: 10000, hargaDinas: 20000, hargaAgenProvided: true, hargaDinasProvided: true });

    await commitProductImportChunk({ batchOperationId: "batch", cursor: 0, chunkSize: 1 }, { id: "user", storeId: "store-main" });

    const stored = database.products.find(product => product.id === "rim");
    expect(Number(stored.price)).toBe(15000);
    expect(Number(stored.hargaAgen)).toBe(10000);
    expect(Number(stored.hargaDinas)).toBe(20000);
    const product = { categoryId: "cat", price: Number(stored.price), hargaAgen: Number(stored.hargaAgen), hargaDinas: Number(stored.hargaDinas) };
    for (const enabled of [false, true]) {
      expect(priceProductForCustomerType(product, "AGEN", [], "SPECIAL", enabled).unitPrice).toBe(10000);
      expect(priceProductForCustomerType(product, "PEMERINTAH", [], "SPECIAL", enabled).unitPrice).toBe(20000);
    }
  });
});

describe.each(["fast price update", "mixed price update", "full update"])("existing member price fallback through %s", (path) => {
  it.each([
    { label: "absent columns", prices: {}, agen: 15000, dinas: 15000 },
    { label: "blank values", prices: { hargaAgen: "", hargaDinas: "" }, agen: 15000, dinas: 15000 },
    { label: "zero values", prices: { hargaAgen: 0, hargaDinas: 0 }, agen: 15000, dinas: 15000 },
    { label: "only Agen supplied", prices: { hargaAgen: 10000 }, agen: 10000, dinas: 15000 },
    { label: "only Dinas supplied", prices: { hargaDinas: 20000 }, agen: 15000, dinas: 20000 },
  ])("persists fallback for $label and records matching snapshots", async ({ prices, agen, dinas }) => {
    const database = importPricingDatabase();
    transact.mockImplementation(database.transaction);
    const existing = database.products.find(product => product.id === "rim")!;
    Object.assign(existing, { price: 15000, costPrice: 10000, hargaAgen: 10000, hargaDinas: 20000 });
    const { rows } = normalizeImportRows([{
      name: existing.name, sku: existing.sku, category: "ATK", unit: existing.unit,
      stock: existing.stock, price: 15000, costPrice: 10000, ...prices,
    }], new Map(), new Set(["atk"]));
    database.addRow("rim", 2, 0, 15000, 10000, path === "full update" ? "update" : "update-price");
    Object.assign(database.planned[0].rowData, rows[0]);
    if (path === "mixed price update") database.addRow("dus", 3, 1, 225000, 150000, "update");

    await commitProductImportChunk({ batchOperationId: "batch", cursor: 0, chunkSize: 2 }, { id: "user", storeId: "store-main" });

    const stored = database.products.find(product => product.id === "rim")!;
    const snapshots = database.items.find(item => item.productId === "rim")!;
    expect(snapshots.beforeSnapshot).toMatchObject({ hargaAgen: 10000, hargaDinas: 20000 });
    for (const source of [stored, snapshots.afterSnapshot]) {
      expect(Number(source.hargaAgen) || null).toBe(agen === 15000 ? null : agen);
      expect(Number(source.hargaDinas) || null).toBe(dinas === 15000 ? null : dinas);
      for (const enabled of [false, true]) {
        expect(priceProductForCustomerType(source, "AGEN", [], "SPECIAL", enabled).unitPrice).toBe(agen);
        expect(priceProductForCustomerType(source, "PEMERINTAH", [], "SPECIAL", enabled).unitPrice).toBe(dinas);
      }
    }
  });
});
