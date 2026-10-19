import { describe, expect, it } from "vitest";
import { applyCartItemDiscounts, discountedLineSubtotal } from "../item-discount";

const items = [
  { cartLineId: "a", price: 10000, quantity: 3 },
  { cartLineId: "b", price: 5000, quantity: 2 },
  { cartLineId: "c", price: 2000, quantity: 1, discount: 200 },
];

describe("item discounts", () => {
  it("keeps a transient negative custom-price input from producing a negative discount", () => {
    const result = applyCartItemDiscounts([{ cartLineId: "a", price: -1, quantity: 3 }], { a: { mode: "RP", value: 5000 } });
    expect(result[0]).toMatchObject({ price: -1, discount: 0 });
  });

  it("applies one rupiah discount to each selected line, preserving other lines", () => {
    const result = applyCartItemDiscounts(items, { a: { mode: "RP", value: 5000 }, b: { mode: "RP", value: 5000 } });
    expect(result.map(item => discountedLineSubtotal(item.price, item.quantity, item.discount))).toEqual([25000, 5000, 1800]);
    expect(items[0]).not.toHaveProperty("discount");
  });
  it("replaces existing discounts and can remove them with zero", () => {
    expect(applyCartItemDiscounts(items, { c: { mode: "RP", value: 0 } })[2].discount).toBe(0);
    expect(applyCartItemDiscounts(items, { c: { mode: "PERCENT", value: 25 } })[2].discount).toBe(500);
  });
  it("calculates percentages independently from each gross line, rounded to cents", () => {
    const result = applyCartItemDiscounts([{ cartLineId: "a", price: 333.33, quantity: 3 }, items[1]], { a: { mode: "PERCENT", value: 12.5 }, b: { mode: "PERCENT", value: 12.5 } });
    expect(result.map(item => item.discount)).toEqual([125, 1250]);
  });
  it("recalculates percentage discounts and caps fixed amounts when repricing shrinks a line", () => {
    expect(applyCartItemDiscounts([{ ...items[0], price: 1000, quantity: 1 }], { a: { mode: "RP", value: 5000 } })[0].discount).toBe(1000);
    expect(applyCartItemDiscounts([{ ...items[0], price: 20000 }], { a: { mode: "PERCENT", value: 10 } })[0].discount).toBe(6000);
  });
  it.each([-1, NaN, Infinity, 30001])("rejects an invalid persisted line discount %s", discount => {
    expect(() => discountedLineSubtotal(10000, 3, discount)).toThrow("ITEM_DISCOUNT_INVALID");
  });
  it("allows a 100 percent line discount without a negative subtotal", () => {
    expect(discountedLineSubtotal(10000, 3, 30000)).toBe(0);
  });
});


describe("item discount boundaries", () => {
  it.each([
    { price: 0, quantity: 3, discount: 0, net: 0 },
    { price: 1000, quantity: 0, discount: 0, net: 0 },
    { price: 0.01, quantity: 1, discount: 0.01, net: 0 },
    { price: 1000, quantity: 0.5, discount: 25, net: 475 },
    { price: 333.33, quantity: 1.5, discount: 0.5, net: 499.5 },
    { price: 100.01, quantity: 0.5, discount: 0.01, net: 50 },
    { price: 0.1, quantity: 3, discount: 0.1, net: 0.2 },
    { price: 999999999.99, quantity: 2, discount: 0.01, net: 1999999999.97 },
  ])("deducts a row discount with $price x $quantity", ({ price, quantity, discount, net }) => {
    expect(discountedLineSubtotal(price, quantity, discount)).toBe(net);
  });

  it.each([
    { price: NaN, quantity: 1 },
    { price: Infinity, quantity: 1 },
    { price: 1000, quantity: NaN },
    { price: 1000, quantity: Infinity },
    { price: Number.MAX_VALUE, quantity: 2 },
    { price: -1, quantity: 1 },
    { price: 1000, quantity: -1 },
  ])("rejects an invalid gross line $price x $quantity", ({ price, quantity }) => {
    expect(() => discountedLineSubtotal(price, quantity)).toThrow("ITEM_DISCOUNT_INVALID");
  });

  it.each([
    { mode: "RP" as const, value: -0.01 },
    { mode: "RP" as const, value: NaN },
    { mode: "RP" as const, value: Infinity },
    { mode: "PERCENT" as const, value: -0.01 },
    { mode: "PERCENT" as const, value: 100.01 },
    { mode: "PERCENT" as const, value: NaN },
    { mode: "PERCENT" as const, value: Infinity },
  ])("rejects invalid local $mode input $value", input => {
    expect(() => applyCartItemDiscounts(items, { a: input })).toThrow("ITEM_DISCOUNT_INVALID");
  });

  it("binds discounts to cart rows even when two rows use the same product", () => {
    const rows = [
      { cartLineId: "front", productId: "paper", price: 1000, quantity: 2 },
      { cartLineId: "back", productId: "paper", price: 1000, quantity: 2 },
    ];
    const result = applyCartItemDiscounts(rows, { front: { mode: "RP", value: 100 } });
    expect(result.map(row => row.discount)).toEqual([100, 0]);
  });

  it("ignores removed selections without discounting replacement rows", () => {
    expect(applyCartItemDiscounts([{ cartLineId: "new", price: 1000, quantity: 1 }], {
      removed: { mode: "PERCENT", value: 100 },
    })[0].discount).toBe(0);
  });

  it("does not stack the same percentage when recalculating checkout", () => {
    const edits = { a: { mode: "PERCENT" as const, value: 10 } };
    const first = applyCartItemDiscounts(items, edits);
    const second = applyCartItemDiscounts(first, edits);
    expect(second.map(row => row.discount)).toEqual([3000, 0, 200]);
  });

  it("preserves frozen source data while clamping a saved discount after a price drop", () => {
    const original = Object.freeze({ cartLineId: "saved", price: 20, quantity: 2, discount: 100, name: "Contoh" });
    const edits = Object.freeze({});
    const [result] = applyCartItemDiscounts([original], edits);
    expect(result).toMatchObject({ name: "Contoh", discount: 40 });
    expect(original.discount).toBe(100);
    expect(result).not.toBe(original);
  });
});
