import { describe, expect, it } from "vitest";
import { summarizeGiro } from "../giro-ledger";

describe("giro payment balances", () => {
  const payments = [
    { amount: 30_000, paidAt: "2026-11-10" },
    { amount: 70_000, paidAt: "2026-12-10" },
  ];

  it("keeps an unverified history unknown rather than inventing a balance", () => {
    expect(summarizeGiro(100_000, payments, false, "2026-11-30")).toEqual({
      status: "UNKNOWN", paid: null, remaining: null,
    });
  });

  it.each([
    ["2026-10-31", "UNPAID", 0, 100_000],
    ["2026-11-30", "PARTIAL", 30_000, 70_000],
    ["2026-12-31", "PAID", 100_000, 0],
  ] as const)("uses payments up to %s for historical balances", (date, status, paid, remaining) => {
    expect(summarizeGiro(100_000, payments, true, date)).toEqual({ status, paid, remaining });
  });

  it("adds fractional rupiah using integer cents", () => {
    expect(summarizeGiro(10.03, [
      { amount: 0.01, paidAt: "2026-11-01" },
      { amount: 0.02, paidAt: "2026-11-02" },
    ], true, "2026-11-30")).toEqual({ status: "PARTIAL", paid: 0.03, remaining: 10 });
  });

  it("rejects an overpaid ledger instead of hiding the inconsistency", () => {
    expect(() => summarizeGiro(100, [{ amount: 101, paidAt: "2026-11-01" }], true, "2026-11-30"))
      .toThrow(/melebihi/i);
  });
});
