import { describe, expect, it } from "vitest";
import type { CartItem } from "@/hooks/useCart";
import { clearOwnedCart, readOwnedCart, writeOwnedCart } from "../cart-session-storage";

const owner = { userId: "sales-a", storeId: "store-1" };
const items: CartItem[] = [{
  cartLineId: "printing-1",
  lineType: "PRINTING_SERVICE",
  printingServiceId: "service-1",
  name: "Cetak A4",
  price: 3000,
  quantity: 2,
  unit: "lembar",
  needsMaterial: false,
}];

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
  };
}

describe("checkout cart recovery", () => {
  it("restores only for the same account and store", () => {
    const storage = memoryStorage();
    expect(writeOwnedCart(storage, owner, items)).toEqual({ ok: true });
    expect(readOwnedCart(storage, owner)).toEqual(items);
    expect(readOwnedCart(storage, { ...owner, userId: "sales-b" })).toEqual([]);
    expect(readOwnedCart(storage, { ...owner, storeId: "store-2" })).toEqual([]);
  });

  it("keeps other carts when clearing a completed cart", () => {
    const storage = memoryStorage();
    const a = { userId: "a:b", storeId: "c" };
    const b = { userId: "a", storeId: "b:c" };
    const c = { userId: "a", storeId: null };
    const d = { userId: "a", storeId: "null" };
    for (const account of [a, b, c, d]) writeOwnedCart(storage, account, items);
    clearOwnedCart(storage, a);
    clearOwnedCart(storage, c);
    expect(readOwnedCart(storage, a)).toEqual([]);
    expect(readOwnedCart(storage, b)).toEqual(items);
    expect(readOwnedCart(storage, c)).toEqual([]);
    expect(readOwnedCart(storage, d)).toEqual(items);
  });

  it("does not adopt a legacy cart without a verified owner", () => {
    const storage = memoryStorage();
    storage.setItem("pos_cart_v1", JSON.stringify(items));
    expect(readOwnedCart(storage, owner)).toEqual([]);
    expect(storage.getItem("pos_cart_v1")).toBe(JSON.stringify(items));
  });

  it("does not trust a mismatched or corrupt stored owner", () => {
    const storage = memoryStorage();
    writeOwnedCart(storage, owner, items);
    const key = [...storage.data.keys()][0];
    storage.setItem(key, JSON.stringify({ version: 2, owner: { ...owner, storeId: "store-2" }, items }));
    expect(readOwnedCart(storage, owner)).toEqual([]);
    storage.setItem(key, "{");
    expect(readOwnedCart(storage, owner)).toEqual([]);
  });

  it("reports storage failure so the cashier knows the cart is only in memory", () => {
    const storage = memoryStorage();
    storage.setItem = () => { throw new DOMException("full", "QuotaExceededError"); };
    expect(writeOwnedCart(storage, owner, items)).toEqual({ ok: false, reason: "storage-unavailable" });
    expect(readOwnedCart(storage, owner)).toEqual([]);
  });
});
