import { describe, expect, it } from "vitest";
import {
  applyComputedCustomerDebt,
  normalizeCustomerDebtName,
  summarizeDebtByCustomer,
} from "../customer-debt-summary";

describe("customer debt summary", () => {
  it("normalizes customer names for exact debt matching", () => {
    expect(normalizeCustomerDebtName("  Agen   Sabar Subur ")).toBe(
      "agen sabar subur",
    );
  });

  it("counts linked and exact name-matched unlinked DP transactions", () => {
    const debt = summarizeDebtByCustomer(
      [{ id: "customer-1", name: "Agen Sabar Subur" }],
      [
        {
          customerId: "customer-1",
          customerName: "Agen Sabar Subur",
          total: 200000,
          amountPaid: 50000,
        },
        {
          customerId: null,
          customerName: "agen sabar subur",
          total: "100000",
          amountPaid: "25000",
        },
        {
          customerId: null,
          customerName: "Agen Sabar Subur Cabang",
          total: 999999,
          amountPaid: 0,
        },
      ],
    );

    expect(debt.get("customer-1")).toBe(225000);
  });

  it("overwrites stale customer totalDebt with computed active DP debt", () => {
    const customers = applyComputedCustomerDebt(
      [{ id: "customer-1", name: "Agen Sabar Subur", totalDebt: 0 }],
      new Map([["customer-1", 225000]]),
    );

    expect(customers[0].totalDebt).toBe(225000);
  });
});
