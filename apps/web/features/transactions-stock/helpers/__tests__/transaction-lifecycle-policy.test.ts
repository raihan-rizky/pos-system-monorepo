import { describe, expect, it } from "vitest";
import { canVoidTransaction, isUnconvertedQuotation } from "../transaction-lifecycle-policy";

describe("canVoidTransaction", () => {
  it.each([
    ["DRAFT", true],
    ["PENDING_APPROVAL", true],
    ["COMPLETED", true],
    ["DP", true],
    ["VOIDED", false],
    ["REFUNDED", false],
    ["UNKNOWN", false],
    ["", false],
  ])("allows VOID for %s: %s", (status, expected) => {
    expect(canVoidTransaction(status as string)).toBe(expected);
  });
});

describe("isUnconvertedQuotation", () => {
  it.each([
    [{ status: "DRAFT" }, true],
    [{ status: "DRAFT", invoiceNumber: null }, true],
    [{ status: "VOIDED", invoiceNumber: null, draftNumber: "CUSTOM-123" }, true],
    [{ status: "COMPLETED", invoiceNumber: "", draftNumber: "Penawaran 12" }, true],
    [{ status: "PENDING_APPROVAL", draftNumber: "CUSTOM-123" }, true],
    [{ status: "VOIDED", invoiceNumber: null }, false],
    [{ status: "VOIDED", invoiceNumber: null, draftNumber: "" }, false],
    [{ status: "VOIDED", invoiceNumber: null, draftNumber: "   " }, false],
    [{ status: "DRAFT", invoiceNumber: "INV-123", draftNumber: "CUSTOM-123" }, false],
    [{ status: "VOIDED", invoiceNumber: "DRAFT-123", draftNumber: "CUSTOM-123" }, false],
    [{ status: "COMPLETED", invoiceNumber: "PENAWARAN-123" }, false],
  ])("uses conversion data for %j: %s", (transaction, expected) => {
    expect(isUnconvertedQuotation(transaction)).toBe(expected);
  });
});
