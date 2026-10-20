import { describe, expect, it, vi } from "vitest";
import {
  applyComputedCustomerDebt,
  loadCustomerDebtByActiveDp,
  normalizeCustomerDebtName,
  summarizeActiveCustomerDebtByCustomer,
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

  it("loads linked customer debt from DP and final Tempo transactions", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        customerId: "customer-1",
        customerName: "Agen Sabar Subur",
        total: 100000,
        amountPaid: 25000,
        status: "COMPLETED",
        paymentMethod: "TEMPO",
      },
    ]);
    const db = { transaction: { findMany }, customerReceivable: { findMany: vi.fn().mockResolvedValue([]) } } as unknown as Parameters<
      typeof loadCustomerDebtByActiveDp
    >[0];

    const debt = await loadCustomerDebtByActiveDp(db, {
      storeId: "store-1",
      customers: [{ id: "customer-1", name: "Agen Sabar Subur" }],
    });

    expect(debt.get("customer-1")).toBe(75000);
    const query = findMany.mock.calls[0][0];
    expect(query.where.AND[0]).toEqual({
      OR: [
        { status: "DP" },
        { status: "COMPLETED", paymentMethod: "TEMPO" },
      ],
    });
    expect(query.where.AND[1]).toEqual({
      OR: [
        { customerId: { in: ["customer-1"] } },
        {
          customerId: null,
          customerName: { equals: "Agen Sabar Subur", mode: "insensitive" },
        },
      ],
    });
    expect(query.select).toMatchObject({ status: true, paymentMethod: true });
  });

  it("includes manual balances in computed debt without counting settled entries", async () => {
    const manualFind = vi.fn().mockResolvedValue([
      { customerId: "customer-1", amount: "125000", amountPaid: "25000" },
      { customerId: "customer-1", amount: "3000", amountPaid: "3000" },
    ]);
    const db = { transaction: { findMany: vi.fn().mockResolvedValue([]) }, customerReceivable: { findMany: manualFind } } as unknown as Parameters<typeof loadCustomerDebtByActiveDp>[0];
    const debt = await loadCustomerDebtByActiveDp(db, { storeId: "store-1", customers: [{ id: "customer-1", name: "Budi" }] });
    expect(debt.get("customer-1")).toBe(100000);
    expect(manualFind).toHaveBeenCalledWith(expect.objectContaining({ where: { storeId: "store-1", customerId: { in: ["customer-1"] } } }));
  });

  it("counts only outstanding DP and Tempo invoices", () => {
    const debt = summarizeActiveCustomerDebtByCustomer(
      [{ id: "customer-1", name: "Budi" }],
      [
        {
          customerId: "customer-1",
          customerName: "Budi",
          total: 200000,
          amountPaid: 50000,
          status: "DP",
          paymentMethod: "CASH",
        },
        {
          customerId: null,
          customerName: " BUDI ",
          total: 100000,
          amountPaid: 25000,
          status: "COMPLETED",
          paymentMethod: "TEMPO",
        },
        {
          customerId: "customer-1",
          customerName: "Budi",
          total: 999999,
          amountPaid: 0,
          status: "COMPLETED",
          paymentMethod: "CASH",
        },
        {
          customerId: "customer-1",
          customerName: "Budi",
          total: 50000,
          amountPaid: 0,
          status: "VOIDED",
          paymentMethod: "TEMPO",
        },
      ],
    );

    expect(debt.get("customer-1")).toBe(225000);
  });

  it("combines DP, Tempo, and manual balances independently for multiple customers", async () => {
    const transactionFind = vi.fn().mockResolvedValue([
      { customerId: "customer-1", customerName: "Budi", total: "100.50", amountPaid: "20.25", status: "DP", paymentMethod: "CASH" },
      { customerId: null, customerName: " SITI ", total: 200, amountPaid: 50, status: "COMPLETED", paymentMethod: "TEMPO" },
      { customerId: "customer-1", customerName: "Budi", total: 1000, amountPaid: 0, status: "COMPLETED", paymentMethod: "CASH" },
    ]);
    const manualFind = vi.fn().mockResolvedValue([
      { customerId: "customer-1", amount: "50.50", amountPaid: "10.25" },
      { customerId: "customer-2", amount: "70.25", amountPaid: "20" },
      { customerId: "customer-2", amount: "9", amountPaid: "9" },
    ]);
    const db = { transaction: { findMany: transactionFind }, customerReceivable: { findMany: manualFind } } as unknown as Parameters<typeof loadCustomerDebtByActiveDp>[0];

    const debt = await loadCustomerDebtByActiveDp(db, {
      storeId: "store-2", customers: [{ id: "customer-1", name: "Budi" }, { id: "customer-2", name: "Siti" }],
    });

    expect([...debt]).toEqual([["customer-1", 120.5], ["customer-2", 200.25]]);
    expect(transactionFind).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ storeId: "store-2" }) }));
    expect(manualFind).toHaveBeenCalledWith(expect.objectContaining({ where: { storeId: "store-2", customerId: { in: ["customer-1", "customer-2"] } } }));
  });

  it("skips both database queries when no customers were requested", async () => {
    const transactionFind = vi.fn();
    const manualFind = vi.fn();
    const db = { transaction: { findMany: transactionFind }, customerReceivable: { findMany: manualFind } } as unknown as Parameters<typeof loadCustomerDebtByActiveDp>[0];

    expect(await loadCustomerDebtByActiveDp(db, { storeId: "store-1", customers: [] })).toEqual(new Map());
    expect(transactionFind).not.toHaveBeenCalled();
    expect(manualFind).not.toHaveBeenCalled();
  });
});
