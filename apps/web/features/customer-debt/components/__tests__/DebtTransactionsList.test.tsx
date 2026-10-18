import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DebtTransactionsList } from "../DebtTransactionsList";

const useTransactionHistoryMock = vi.hoisted(() => vi.fn());
const usePayTransactionDebtMock = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/useTransactions", () => ({
  useTransactionHistory: useTransactionHistoryMock,
}));

vi.mock("@/hooks/useCustomers", () => ({
  usePayTransactionDebt: usePayTransactionDebtMock,
}));

vi.mock("@/hooks/useDebounce", () => ({
  useDebounce: (value: unknown) => value,
}));

describe("DebtTransactionsList", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useTransactionHistoryMock.mockReturnValue({
      data: {
        data: [
          {
            id: "tempo-1",
            status: "COMPLETED",
            paymentMethod: "TEMPO",
            total: 100000,
            amountPaid: 25000,
            customerName: "Budi",
            customerId: "customer-1",
            invoiceNumber: "INV-TEMPO-1",
            createdAt: "2026-10-05T10:00:00.000Z",
            debtPaymentLogs: [],
          },
        ],
        pagination: { total: 1, totalPages: 1 },
      },
      isLoading: false,
      isFetching: false,
    });
    usePayTransactionDebtMock.mockReturnValue({ mutateAsync: vi.fn() });
  });

  it("shows Tempo debt, paid amount, and remaining balance in the list", () => {
    const markup = renderToStaticMarkup(<DebtTransactionsList />);

    expect(markup).toContain(">Tempo</span>");
    expect(markup).toContain("Belum lunas");
    expect(markup).toContain("Sisa");
    expect(markup).toContain("Dibayar");
    expect(markup).not.toContain("Dibayar (DP)");
  });
});
