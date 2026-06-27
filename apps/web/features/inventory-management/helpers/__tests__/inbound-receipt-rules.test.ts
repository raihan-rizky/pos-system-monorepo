import { describe, expect, it } from "vitest";
import {
  canCancelInboundReceipt,
  canEditInboundReceipt,
  getInboundStockQuantity,
  getRemainingReceivableQuantity,
  requiresInboundLineNote,
} from "../inbound-receipt-rules";

describe("inbound receipt rules", () => {
  it("increases stock only for received, partial, and over-received lines", () => {
    expect(getInboundStockQuantity({ status: "RECEIVED", receivedQuantity: 10 })).toBe(10);
    expect(getInboundStockQuantity({ status: "PARTIAL", receivedQuantity: 4 })).toBe(4);
    expect(getInboundStockQuantity({ status: "OVER_RECEIVED", receivedQuantity: 12 })).toBe(12);
    expect(getInboundStockQuantity({ status: "MISSING", receivedQuantity: 0 })).toBe(0);
    expect(getInboundStockQuantity({ status: "DAMAGED", receivedQuantity: 3 })).toBe(0);
    expect(getInboundStockQuantity({ status: "MISMATCH", receivedQuantity: 3 })).toBe(0);
  });

  it("requires notes for non-normal inbound line statuses", () => {
    expect(requiresInboundLineNote("RECEIVED")).toBe(false);
    expect(requiresInboundLineNote("PARTIAL")).toBe(true);
    expect(requiresInboundLineNote("MISSING")).toBe(true);
    expect(requiresInboundLineNote("DAMAGED")).toBe(true);
    expect(requiresInboundLineNote("MISMATCH")).toBe(true);
    expect(requiresInboundLineNote("OVER_RECEIVED")).toBe(true);
  });

  it("subtracts approved and submitted reserved quantities from remaining receivable quantity", () => {
    expect(
      getRemainingReceivableQuantity({
        expectedQuantity: 20,
        approvedReceivedQuantity: 7,
        submittedReservedQuantity: 5,
      }),
    ).toBe(8);
  });

  it("allows editing drafts and needs-revision receipts only", () => {
    expect(canEditInboundReceipt("DRAFT")).toBe(true);
    expect(canEditInboundReceipt("NEEDS_REVISION")).toBe(true);
    expect(canEditInboundReceipt("SUBMITTED")).toBe(false);
    expect(canEditInboundReceipt("APPROVED")).toBe(false);
  });

  it("allows creators to cancel draft, needs-revision, and submitted receipts before owner action", () => {
    expect(canCancelInboundReceipt({ status: "DRAFT", isCreator: true })).toBe(true);
    expect(canCancelInboundReceipt({ status: "NEEDS_REVISION", isCreator: true })).toBe(true);
    expect(canCancelInboundReceipt({ status: "SUBMITTED", isCreator: true })).toBe(true);
    expect(canCancelInboundReceipt({ status: "SUBMITTED", isCreator: false })).toBe(false);
    expect(canCancelInboundReceipt({ status: "APPROVED", isCreator: true })).toBe(false);
    expect(canCancelInboundReceipt({ status: "REJECTED", isCreator: true })).toBe(false);
  });
});
