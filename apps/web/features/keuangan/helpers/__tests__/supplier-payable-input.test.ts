import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jakartaToday, parseAmount, parsePayable, validDate } from "../supplier-payable-input";

describe("supplier payable input", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-20T18:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("uses the Jakarta calendar day and checks real calendar dates", () => {
    expect(jakartaToday()).toBe("2026-10-21");
    expect(validDate("2024-02-29")).toBe(true);
    expect(validDate("2025-02-29")).toBe(false);
    expect(validDate("2026-2-01")).toBe(false);
  });

  it.each([
    ["0", null], ["-1", null], ["2.001", null], ["1e3", null],
    ["10000000000", null], ["0.01", 0.01], ["9999999999.99", 9999999999.99],
  ])("validates amount %s as %s", (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
  });

  const payable = {
    supplierName: "  Pemasok A  ", amount: "1000.50", debtDate: "2026-10-01",
    dueDate: "", note: "  kertas  ", initialPayment: "", initialPaidAt: "",
  };

  it("accepts a debt without an initial payment and trims its details", () => {
    expect(parsePayable(payable)).toEqual({
      supplierName: "Pemasok A", amount: 1000.5, debtDate: "2026-10-01",
      dueDate: null, note: "kertas", initialPayment: null, initialPaidAt: null,
    });
  });

  it("accepts a partial payment on the debt date", () => {
    expect(parsePayable({ ...payable, initialPayment: "250.25", initialPaidAt: "2026-10-01" }))
      .toMatchObject({ amount: 1000.5, initialPayment: 250.25, initialPaidAt: "2026-10-01" });
  });

  it.each([
    { supplierName: "  " }, { amount: "0" }, { debtDate: "2026-10-22" },
    { dueDate: "2026-09-30" }, { initialPayment: "1000.51", initialPaidAt: "2026-10-01" },
    { initialPayment: "50", initialPaidAt: "2026-09-30" },
    { initialPayment: "50", initialPaidAt: "2026-10-22" },
    { initialPayment: "50", initialPaidAt: "" },
  ])("rejects an invalid debt or initial payment: %j", (changes) => {
    expect(parsePayable({ ...payable, ...changes })).toBeNull();
  });
});
