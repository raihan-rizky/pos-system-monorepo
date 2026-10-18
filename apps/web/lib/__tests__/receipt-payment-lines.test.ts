import { describe, expect, it } from "vitest";
import { buildReceiptPaymentLines } from "../receipt-payment-lines";

describe("buildReceiptPaymentLines", () => {
  it("preserves gross receipts when lower tax returns change after debt repayment", () => {
    const lines = buildReceiptPaymentLines({ total: 100000, amountPaid: 110000, status: "COMPLETED", paymentMethod: "CASH",
      payments: [{ method: "CASH", amount: 50000 }],
      debtPaymentLogs: [{ paymentMethod: "TRANSFER", amount: 60000 }],
    });
    expect(lines.map(line => line.amount)).toEqual([50000, 60000]);
  });
  it("excludes cash already returned before adding tax while preserving transfer amounts", () => {
    expect(buildReceiptPaymentLines({ total: 99000, amountPaid: 90000, status: "DP", paymentMethod: "CASH",
      payments: [{ method: "CASH", amount: 20000 }, { method: "TRANSFER", amount: 80000 }],
    })).toEqual([
      { label: "TUNAI", amount: 10000, amountFormatted: "10.000", subLabel: "DP" },
      { label: "TRANSFER", amount: 80000, amountFormatted: "80.000", subLabel: "DP" },
    ]);
  });
  it("does not duplicate a fully paid debt invoice when amountPaid already includes debt logs", () => {
    const lines = buildReceiptPaymentLines({
      total: 32000,
      amountPaid: 32000,
      paymentMethod: "TRANSFER",
      status: "COMPLETED",
      payments: [{ method: "TRANSFER", amount: 32000 }],
      debtPaymentLogs: [
        {
          id: "log-1",
          createdAt: "2026-06-30T04:00:00.000Z",
          paymentMethod: "TRANSFER",
          amount: 32000,
        },
      ],
    });

    expect(lines).toEqual([
      {
        label: "TRANSFER",
        amount: 32000,
        amountFormatted: "32.000",
        subLabel: "pelunasan",
      },
    ]);
  });

  it("shows only the original DP amount before later debt payments", () => {
    const lines = buildReceiptPaymentLines({
      total: 32000,
      amountPaid: 32000,
      paymentMethod: "CASH",
      status: "COMPLETED",
      payments: [{ method: "CASH", amount: 32000 }],
      debtPaymentLogs: [
        {
          id: "log-1",
          createdAt: "2026-06-30T04:00:00.000Z",
          paymentMethod: "TRANSFER",
          amount: 27000,
        },
      ],
    });

    expect(lines).toEqual([
      {
        label: "TUNAI",
        amount: 5000,
        amountFormatted: "5.000",
        subLabel: "DP",
      },
      {
        label: "TRANSFER",
        amount: 27000,
        amountFormatted: "27.000",
        subLabel: "pelunasan",
      },
    ]);
  });

  it("keeps active DP payments labeled as DP", () => {
    const lines = buildReceiptPaymentLines({
      total: 32000,
      amountPaid: 5000,
      paymentMethod: "QRIS",
      status: "DP",
      payments: [{ method: "QRIS", amount: 5000 }],
      debtPaymentLogs: [],
    });

    expect(lines).toEqual([
      {
        label: "QRIS",
        amount: 5000,
        amountFormatted: "5.000",
        subLabel: "DP",
      },
    ]);
  });

  it("labels Tempo's actual first payment separately from an initial down payment", () => {
    const lines = buildReceiptPaymentLines(
      {
        total: 100000,
        amountPaid: 30000,
        paymentMethod: "TEMPO",
        status: "COMPLETED",
        payments: [{ method: "CASH", amount: 10000 }],
        debtPaymentLogs: [
          { id: "log-1", paymentMethod: "TRANSFER", amount: 20000 },
        ],
      },
      "COMPLETED",
    );

    expect(lines).toEqual([
      {
        label: "TUNAI",
        amount: 10000,
        amountFormatted: "10.000",
        subLabel: "pembayaran awal",
      },
      {
        label: "TRANSFER",
        amount: 20000,
        amountFormatted: "20.000",
        subLabel: "pelunasan",
      },
    ]);
  });

  it("never prints TEMPO itself as an actual payment method", () => {
    const lines = buildReceiptPaymentLines(
      {
        total: 100000,
        amountPaid: 25000,
        paymentMethod: "TEMPO",
        status: "COMPLETED",
        payments: [],
        debtPaymentLogs: [],
      },
      "COMPLETED",
    );

    expect(lines).toEqual([]);
  });
});
