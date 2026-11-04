import { describe, expect, it } from "vitest";
import * as deletion from "../shopping-request-deletion";

const buildPlan = (deletion as any).buildShoppingRequestDeletionPlan;

function source(productId: string, groupId: string | null, delta: number, baseDelta: number, kind = "CANONICAL") {
  return {
    productId: productId as string | null,
    inventoryLogId: kind === "CANONICAL" ? `log-${productId}-${baseDelta}` : null,
    afterSnapshot: {
      unit: "pcs",
      inboundReceiptImpact: { kind, receiptId: "receipt-1", receiptLineId: kind === "CANONICAL" ? `line-${productId}-${baseDelta}` : null, stockGroupId: groupId, delta, baseDelta },
    },
  };
}

function input(items: ReturnType<typeof source>[] = []) {
  return {
    receipts: [{ id: "receipt-1", bundleStatus: "COMMITTED", items }],
    products: [
      { id: "a", name: "Barang A", unit: "pcs", stock: 7, stockGroupId: "group-1", unitMultiplierToBase: 1, conversionNeedsReview: false },
      { id: "b", name: "Barang B", unit: "pcs", stock: 5, stockGroupId: "group-1", unitMultiplierToBase: 3, conversionNeedsReview: false },
      { id: "c", name: "Barang C", unit: "pcs", stock: 9, stockGroupId: null, unitMultiplierToBase: 1, conversionNeedsReview: false },
    ],
    groups: [{ id: "group-1", baseStock: 30 }],
  };
}

describe("rencana pembalikan stok daftar belanja", () => {
  it("tidak mengurangi stok ketika belum ada dampak penerimaan", () => {
    expect(buildPlan).toBeTypeOf("function");
    expect(buildPlan({ receipts: [], products: [], groups: [] }).movements).toEqual([]);
  });

  it("menjumlahkan dampak canonical grup tanpa menghitung proyeksi varian", () => {
    expect(buildPlan).toBeTypeOf("function");
    const plan = buildPlan(input([source("a", "group-1", 12, 12), source("b", "group-1", 1, 3), source("a", "group-1", 15, 15, "VARIANT")]));
    expect(plan.movements).toHaveLength(1);
    expect(plan.movements[0]).toMatchObject({ stockGroupId: "group-1", baseQuantity: 15, sourceLogIds: ["log-a-12", "log-b-3"] });
  });

  it("menolak saat stok grup kurang dari jumlah yang harus dibalik", () => {
    expect(buildPlan).toBeTypeOf("function");
    const data = input([source("a", "group-1", 12, 12), source("b", "group-1", 1, 3)]);
    data.groups[0].baseStock = 14;
    expect(() => buildPlan(data)).toThrow(/stok.*tidak cukup/i);
  });

  it("menolak kekurangan stok nyata meskipun jumlahnya besar", () => {
    const data = input([source("c", null, 10_000_000, 10_000_000)]);
    data.products[2].stock = 9_999_999.5;
    expect(() => buildPlan(data)).toThrow(/stok.*tidak cukup/i);
  });

  it("menolak konversi, grup, atau data sumber yang tidak lagi dapat dipastikan", () => {
    expect(buildPlan).toBeTypeOf("function");
    const changed = input([source("b", "group-1", 1, 3)]);
    changed.products[1].unitMultiplierToBase = 6;
    expect(() => buildPlan(changed)).toThrow(/konversi|stok.*berubah/i);
    const removed = input([source("a", "group-1", 1, 1)]);
    removed.products[0].stockGroupId = null;
    expect(() => buildPlan(removed)).toThrow(/grup|stok.*berubah/i);
    const invalid = input([source("a", "group-1", 1, 1)]);
    (invalid.receipts[0].items[0].afterSnapshot as any).inboundReceiptImpact.baseDelta = null;
    expect(() => buildPlan(invalid)).toThrow(/dampak stok|data stok/i);
  });

  it("memisahkan produk tunggal dan menolak sumber yang sudah dibatalkan", () => {
    expect(buildPlan).toBeTypeOf("function");
    const data = input([source("a", "group-1", 2, 2), source("c", null, 4, 4)]);
    expect(buildPlan(data).movements).toEqual(expect.arrayContaining([
      expect.objectContaining({ stockGroupId: "group-1", baseQuantity: 2 }),
      expect.objectContaining({ productId: "c", stockGroupId: null, baseQuantity: 4 }),
    ]));
    data.receipts[0].bundleStatus = "UNDONE";
    expect(() => buildPlan(data)).toThrow(/sudah.*dibatalkan|sudah.*dibalik/i);
  });

  it("menolak proyeksi varian yang kehilangan identitas produk atau dampak numerik", () => {
    const missingProduct = input([source("a", "group-1", 2, 2), source("a", "group-1", 2, 2, "VARIANT")]);
    missingProduct.receipts[0].items[1].productId = null;
    expect(() => buildPlan(missingProduct)).toThrow(/dampak stok|produk|data stok/i);

    const mismatchedGroup = input([source("a", "group-1", 2, 2), source("a", "group-1", 2, 2, "VARIANT")]);
    (mismatchedGroup.receipts[0].items[1].afterSnapshot as any).inboundReceiptImpact.stockGroupId = "group-missing";
    expect(() => buildPlan(mismatchedGroup)).toThrow(/grup|data stok|dampak stok/i);

    const invalidDelta = input([source("a", "group-1", 2, 2), source("a", "group-1", 2, 2, "VARIANT")]);
    (invalidDelta.receipts[0].items[1].afterSnapshot as any).inboundReceiptImpact.baseDelta = 0;
    expect(() => buildPlan(invalidDelta)).toThrow(/dampak stok|data stok/i);
  });

  it("menolak varian dengan dampak yang tidak sama dengan jumlah canonical grupnya", () => {
    const data = input([source("a", "group-1", 2, 2), source("b", "group-1", 1, 3, "VARIANT")]);
    expect(() => buildPlan(data)).toThrow(/dampak stok|data stok/i);
  });

  it("menolak proyeksi varian yang berulang atau mempunyai log stok sendiri", () => {
    const duplicate = input([source("a", "group-1", 2, 2), source("b", "group-1", 2 / 3, 2, "VARIANT"), source("b", "group-1", 2 / 3, 2, "VARIANT")]);
    expect(() => buildPlan(duplicate)).toThrow(/dampak stok|data stok|lebih dari sekali/i);
    const withLog = input([source("a", "group-1", 2, 2), source("b", "group-1", 2 / 3, 2, "VARIANT")]);
    withLog.receipts[0].items[1].inventoryLogId = "log-extra";
    expect(() => buildPlan(withLog)).toThrow(/dampak stok|data stok/i);
  });

  it("menampilkan satuan dasar grup dan satuan produk pada pratinjau", () => {
    const data = input([source("a", "group-1", 2, 2), source("c", null, 4, 4)]);
    Object.assign(data.groups[0], { baseUnit: "lembar" });
    expect(buildPlan(data).movements).toEqual(expect.arrayContaining([
      expect.objectContaining({ stockGroupId: "group-1", unit: "lembar" }),
      expect.objectContaining({ productId: "c", unit: "pcs" }),
    ]));
  });
});
