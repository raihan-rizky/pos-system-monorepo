import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DebtTransactionsList } from "../DebtTransactionsList";

const useTransactionHistoryMock = vi.hoisted(() => vi.fn());
const usePayTransactionDebtMock = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/useTransactions", () => ({
  useTransaction: () => ({}),
  useTransactionHistory: useTransactionHistoryMock,
}));
vi.mock("../../hooks/useReceivableInvoices", () => ({ useReceivableInvoices: useTransactionHistoryMock }));

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

  it("defaults to read-only invoice details in desktop and mobile layouts", () => {
    const markup = renderToStaticMarkup(<DebtTransactionsList />);
    expect(markup).toContain("INV-TEMPO-1");
    expect(markup).not.toContain("Bayar Piutang");
    expect(markup).not.toContain("Lihat <");
  });

  it("shows payment controls only with an explicit grant", () => {
    const markup = renderToStaticMarkup(<DebtTransactionsList canPay={true} />);
    expect(markup.match(/Bayar Piutang/g)).toHaveLength(2);
  });

  it("uses the independent minimal receivable query", () => {
    renderToStaticMarkup(<DebtTransactionsList canPay={false} />);
    expect(useTransactionHistoryMock).toHaveBeenCalledWith(expect.objectContaining({ status: "all" }));
  });
});
