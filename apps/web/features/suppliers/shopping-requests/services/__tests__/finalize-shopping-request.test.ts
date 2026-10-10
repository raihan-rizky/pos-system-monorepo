import { describe, expect, it } from "vitest";
import { validateFinalApproval } from "../finalize-shopping-request";

const requestItems = [
  { id: "item-1", productId: "pcs", requestedQty: 12, stockGroupId: "group-1" },
];
const products = [
  { id: "pcs", stockGroupId: "group-1" },
  { id: "dus", stockGroupId: "group-1" },
  { id: "other", stockGroupId: "group-2" },
];
const input = {
  items: [{ shoppingRequestItemId: "item-1", productId: "dus", approvedQty: 12, latestUnitPrice: 1000, updateMasterHpp: false }],
  extraItems: [],
};

describe("validateFinalApproval", () => {
  it("allows a same-group unit change while keeping the quantity number", () => {
    expect(validateFinalApproval(requestItems, products, input)).toEqual(input);
  });

  it("requires explicit confirmation when approved quantity exceeds requested quantity", () => {
    expect(() => validateFinalApproval(requestItems, products, {
      ...input, items: [{ ...input.items[0], approvedQty: 13 }],
    })).toThrow("melebihi");
  });

  it("rejects unrelated variants, duplicate products, and an all-zero approval", () => {
    expect(() => validateFinalApproval(requestItems, products, {
      ...input, items: [{ ...input.items[0], productId: "other" }],
    })).toThrow("grup stok");
    expect(() => validateFinalApproval(requestItems, products, {
      ...input, extraItems: [{ productId: "dus", quantity: 1, latestUnitPrice: 1000, updateMasterHpp: false }],
    })).toThrow("dua kali");
    expect(() => validateFinalApproval(requestItems, products, {
      ...input, items: [{ ...input.items[0], approvedQty: 0 }],
    })).toThrow("minimal satu");
  });

  it("rejects a duplicate product even when a requested row is declined", () => {
    expect(() => validateFinalApproval(requestItems, products, {
      ...input,
      items: [{ ...input.items[0], approvedQty: 0 }],
      extraItems: [{ productId: "dus", quantity: 1, latestUnitPrice: 1000, updateMasterHpp: false }],
    })).toThrow("dua kali");
  });
});
