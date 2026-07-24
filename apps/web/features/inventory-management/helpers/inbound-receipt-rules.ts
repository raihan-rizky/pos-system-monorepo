export type InboundReceiptStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "NEEDS_REVISION"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED";

export type GoodsPurchaseFulfillmentStatus =
  | "NOT_RECEIVED"
  | "PARTIALLY_RECEIVED"
  | "RECEIVED";

export type InboundReceiptMatchStatus = "MATCHED" | "MISMATCHED";
export type InboundReceiptItemReviewStatus = "PENDING" | "APPROVED";

export type InboundReceiptLineStatus =
  | "RECEIVED"
  | "PARTIAL"
  | "MISSING"
  | "DAMAGED"
  | "MISMATCH"
  | "OVER_RECEIVED";

export interface InboundLineQuantityInput {
  status: InboundReceiptLineStatus;
  receivedQuantity: number;
}

export interface RemainingReceivableInput {
  expectedQuantity: number;
  approvedReceivedQuantity: number;
  submittedReservedQuantity: number;
}

export interface InboundAvailability {
  orderedQuantity: number;
  approvedReceivedQuantity: number;
  pendingReservedQuantity: number;
  availableQuantity: number;
}

export function calculateInboundAvailability(input: {
  orderedQuantity: number;
  approvedReceivedQuantity: number;
  pendingReservedQuantity: number;
}): InboundAvailability {
  return {
    ...input,
    availableQuantity: Math.max(
      0,
      input.orderedQuantity -
        input.approvedReceivedQuantity -
        input.pendingReservedQuantity,
    ),
  };
}

export function requiresInboundQuantityNote(
  expectedQuantity: number,
  receivedQuantity: number,
): boolean {
  return Math.abs(expectedQuantity - receivedQuantity) > 1e-9;
}

export function hasInboundQuantityConflict(input: {
  orderedQuantity: number;
  approvedReceivedQuantity: number;
  currentReceiptQuantity: number;
}): boolean {
  return (
    input.approvedReceivedQuantity + input.currentReceiptQuantity >
    input.orderedQuantity + 1e-9
  );
}

export function resolveGoodsPurchaseFulfillment(
  items: Array<{
    orderedQuantity: number;
    approvedReceivedQuantity: number;
  }>,
): GoodsPurchaseFulfillmentStatus {
  const received = items.reduce(
    (sum, item) => sum + item.approvedReceivedQuantity,
    0,
  );
  if (received <= 1e-9) return "NOT_RECEIVED";

  return items.every(
    (item) => item.approvedReceivedQuantity + 1e-9 >= item.orderedQuantity,
  )
    ? "RECEIVED"
    : "PARTIALLY_RECEIVED";
}

export function getInboundStockQuantity(input: InboundLineQuantityInput): number {
  if (
    input.status === "RECEIVED" ||
    input.status === "PARTIAL" ||
    input.status === "OVER_RECEIVED"
  ) {
    return input.receivedQuantity;
  }

  return 0;
}

export function requiresInboundLineNote(status: InboundReceiptLineStatus): boolean {
  return status !== "RECEIVED";
}

export function getRemainingReceivableQuantity(input: RemainingReceivableInput): number {
  return Math.max(
    0,
    input.expectedQuantity -
      input.approvedReceivedQuantity -
      input.submittedReservedQuantity,
  );
}

export function canEditInboundReceipt(status: InboundReceiptStatus): boolean {
  return status === "DRAFT" || status === "NEEDS_REVISION";
}

export function canCancelInboundReceipt(input: {
  status: InboundReceiptStatus;
  isCreator: boolean;
}): boolean {
  return (
    input.isCreator &&
    (input.status === "DRAFT" ||
      input.status === "NEEDS_REVISION" ||
      input.status === "SUBMITTED")
  );
}
