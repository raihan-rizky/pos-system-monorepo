import { describe, expect, it } from "vitest";
import { allocateCustomerDebtPayment } from "../customer-debt-allocation";

describe("allocateCustomerDebtPayment", () => {
  it("allocates oldest-first without changing Tempo out of COMPLETED", () => {
    const allocations = allocateCustomerDebtPayment({
      amount: 125000,
      transactions: [
        {
          id: "dp-1",
          total: 100000,
          amountPaid: 50000,
          status: "DP",
          paymentMethod: "CASH",
        },
        {
          id: "tempo-1",
          total: 100000,
          amountPaid: 25000,
          status: "COMPLETED",
          paymentMethod: "TEMPO",
        },
      ],
    });

    expect(allocations).toEqual([
      { transactionId: "dp-1", amount: 50000, amountPaid: 100000, status: "COMPLETED" },
      { transactionId: "tempo-1", amount: 75000, amountPaid: 100000, status: "COMPLETED" },
    ]);
  });

  it("skips non-debt transactions and rejects an over-allocation", () => {
    expect(() =>
      allocateCustomerDebtPayment({
        amount: 50001,
        transactions: [
          {
            id: "paid-cash",
            total: 100000,
            amountPaid: 0,
            status: "COMPLETED",
            paymentMethod: "CASH",
          },
          {
            id: "tempo-1",
            total: 50000,
            amountPaid: 0,
            status: "COMPLETED",
            paymentMethod: "TEMPO",
          },
        ],
      }),
    ).toThrow("Jumlah pembayaran melebihi total piutang aktif.");
  });

  it("does not allocate against a transaction with an invalid balance", () => {
    const allocations = allocateCustomerDebtPayment({
      amount: 100,
      transactions: [
        {
          id: "corrupt",
          total: 100,
          amountPaid: Number.NaN,
          status: "DP",
          paymentMethod: "CASH",
        },
        {
          id: "valid",
          total: 100,
          amountPaid: 0,
          status: "COMPLETED",
          paymentMethod: "TEMPO",
        },
      ],
    });

    expect(allocations).toEqual([
      { transactionId: "valid", amount: 100, amountPaid: 100, status: "COMPLETED" },
    ]);
  });
});
