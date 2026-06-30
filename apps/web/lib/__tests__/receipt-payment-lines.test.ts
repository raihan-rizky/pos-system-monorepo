import { describe, expect, it } from "vitest";
import { buildReceiptPaymentLines } from "../receipt-payment-lines";

describe("buildReceiptPaymentLines", () => {
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
});
