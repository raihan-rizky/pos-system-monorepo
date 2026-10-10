import { describe, expect, it } from "vitest";
import { chooseUnitVariant } from "../shopping-request-unit-choice";

const pcs = { id: "pcs", unit: "pcs", stockGroupId: "group-1" };
const dus = { id: "dus", unit: "dus", stockGroupId: "group-1" };
const unrelated = { id: "other", unit: "dus", stockGroupId: "group-2" };

describe("chooseUnitVariant", () => {
  it("keeps the numeric quantity when changing the unit of an added item", () => {
    expect(chooseUnitVariant([{ product: pcs, requestedQty: 12 }], "pcs", dus))
      .toEqual([{ product: dus, requestedQty: 12 }]);
  });

  it("rejects a variant from another stock group", () => {
    expect(() => chooseUnitVariant([{ product: pcs, requestedQty: 12 }], "pcs", unrelated))
      .toThrow("grup stok yang sama");
  });

  it("rejects a duplicate product already in the list", () => {
    expect(() => chooseUnitVariant([
      { product: pcs, requestedQty: 12 },
      { product: dus, requestedQty: 3 },
    ], "pcs", dus)).toThrow("sudah ada");
  });
});
