import { describe, expect, it } from "vitest";
import type { CartUnitOption, ProductCartItem } from "@/hooks/useCart";
import { changeCartUnit } from "../cart-unit-change";

const balOption: CartUnitOption = {
  productId: "product-bal",
  name: "Amplop",
  price: 70000,
  catalogPrice: 70000,
  costPrice: 50000,
  hargaAgen: 65000,
  hargaDinas: 68000,
  unit: "Bal",
  stock: 10,
  unitMultiplierToBase: 5,
  stockGroup: { id: "envelope-group", baseUnit: "Pcs" },
  categoryId: "atk",
  categoryName: "ATK",
};

const dusItem: ProductCartItem = {
  cartLineId: "PRODUCT:product-dus::",
  lineType: "PRODUCT",
  productId: "product-dus",
  name: "Amplop",
  price: 15500,
  catalogPrice: 15500,
  transactionPrice: 10000,
  quantity: 2,
  unit: "Dus",
  stock: 50,
  unitMultiplierToBase: 1,
  stockGroup: { id: "envelope-group", baseUnit: "Pcs" },
  categoryId: "atk",
  categoryName: "ATK",
  unitOptions: [
    {
      productId: "product-dus",
      name: "Amplop",
      price: 15500,
      catalogPrice: 15500,
      costPrice: 10000,
      hargaAgen: null,
      hargaDinas: null,
      unit: "Dus",
      stock: 50,
      unitMultiplierToBase: 1,
      stockGroup: { id: "envelope-group", baseUnit: "Pcs" },
      categoryId: "atk",
      categoryName: "ATK",
    },
    balOption,
  ],
};

describe("changeCartUnit", () => {
  it("changes 2 Dus to 2 Bal at the target catalog price and clears source overrides", () => {
    const [changed] = changeCartUnit([dusItem], dusItem.cartLineId, balOption);

    expect(changed).toMatchObject({
      productId: "product-bal",
      unit: "Bal",
      quantity: 2,
      price: 70000,
      catalogPrice: 70000,
      transactionPrice: null,
      appliedPricing: null,
      unitMultiplierToBase: 5,
    });
  });

  it("rejects an unavailable target without changing the source cart", () => {
    const unavailable = { ...balOption, productId: "other-group-product" };

    expect(() =>
      changeCartUnit([dusItem], dusItem.cartLineId, unavailable),
    ).toThrow("Pilihan satuan tidak tersedia untuk produk ini.");
    expect(dusItem.quantity).toBe(2);
    expect(dusItem.productId).toBe("product-dus");
  });

  it("merges into an existing target line while preserving that line's price override", () => {
    const targetLine: ProductCartItem = {
      ...dusItem,
      cartLineId: "PRODUCT:product-bal::",
      productId: "product-bal",
      price: 62000,
      catalogPrice: 70000,
      transactionPrice: 62000,
      quantity: 3,
      unit: "Bal",
      unitMultiplierToBase: 5,
    };
    const otherLine: ProductCartItem = {
      ...dusItem,
      cartLineId: "PRODUCT:other::",
      productId: "other",
      quantity: 1,
    };
    const result = changeCartUnit(
      [dusItem, targetLine, otherLine],
      dusItem.cartLineId,
      balOption,
    );

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      productId: "product-bal",
      quantity: 5,
      price: 62000,
      transactionPrice: 62000,
    });
    expect(result[1]).toBe(otherLine);
  });

  it("leaves the cart unchanged when the same unit is selected", () => {
    const items = [dusItem];

    expect(changeCartUnit(items, dusItem.cartLineId, dusItem.unitOptions![0])).toBe(
      items,
    );
  });
});
