import { describe, expect, it } from "vitest";
import { assertValidReasonForType } from "../write-inventory-log";

describe("assertValidReasonForType", () => {
  it("accepts forward pairs", () => {
    expect(() => assertValidReasonForType("IN", "RESTOCK")).not.toThrow();
    expect(() => assertValidReasonForType("IN", "SALE_RETURN")).not.toThrow();
    expect(() => assertValidReasonForType("OUT", "SALE")).not.toThrow();
    expect(() => assertValidReasonForType("OUT", "WASTE")).not.toThrow();
    expect(() => assertValidReasonForType("OUT", "USAGE")).not.toThrow();
    expect(() =>
      assertValidReasonForType("OUT", "SUPPLIER_RETURN"),
    ).not.toThrow();
    expect(() => assertValidReasonForType("ADJUSTMENT", "OPNAME")).not.toThrow();
    expect(() =>
      assertValidReasonForType("ADJUSTMENT", "MANUAL_ADJUSTMENT"),
    ).not.toThrow();
  });

  it("rejects WASTE on type=IN in forward direction", () => {
    expect(() => assertValidReasonForType("IN", "WASTE")).toThrow(
      /reason WASTE is not valid for type IN/i,
    );
  });

  it("rejects RESTOCK on type=OUT in forward direction", () => {
    expect(() => assertValidReasonForType("OUT", "RESTOCK")).toThrow();
  });

  it("rejects OPNAME on type=IN/OUT", () => {
    expect(() => assertValidReasonForType("IN", "OPNAME")).toThrow();
    expect(() => assertValidReasonForType("OUT", "OPNAME")).toThrow();
  });

  it("allows reversal pairs when direction is REVERSAL", () => {
    expect(() =>
      assertValidReasonForType("IN", "WASTE", "REVERSAL"),
    ).not.toThrow();
    expect(() =>
      assertValidReasonForType("OUT", "RESTOCK", "REVERSAL"),
    ).not.toThrow();
  });
});
