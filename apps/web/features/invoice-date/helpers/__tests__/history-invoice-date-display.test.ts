import { describe, expect, it } from "vitest";
import {
  getLatestPreviousInvoiceDate,
  getTransactionInvoiceDate,
  hasInvoiceDateChange,
} from "../history-invoice-date-display";

describe("history invoice date display helpers", () => {
  it("uses invoiceDate as the primary history date", () => {
    expect(
      getTransactionInvoiceDate({
        invoiceDate: "2026-07-08T03:15:00.000Z",
        createdAt: "2026-07-09T03:15:00.000Z",
      }),
    ).toBe("2026-07-08T03:15:00.000Z");
  });

  it("falls back to createdAt when invoiceDate is missing", () => {
    expect(
      getTransactionInvoiceDate({
        invoiceDate: null,
        createdAt: "2026-07-09T03:15:00.000Z",
      }),
    ).toBe("2026-07-09T03:15:00.000Z");
  });

  it("returns the previous invoice date from the latest change summary", () => {
    expect(
      getLatestPreviousInvoiceDate({
        latestInvoiceDateChange: {
          oldInvoiceDate: "2026-07-09T03:15:00.000Z",
        },
      }),
    ).toBe("2026-07-09T03:15:00.000Z");
  });

  it("detects whether a transaction has invoice date changes", () => {
    expect(
      hasInvoiceDateChange({
        latestInvoiceDateChange: { oldInvoiceDate: "2026-07-09T03:15:00.000Z" },
      }),
    ).toBe(true);
    expect(hasInvoiceDateChange({ latestInvoiceDateChange: null })).toBe(false);
  });
});
