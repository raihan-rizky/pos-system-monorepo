export type InboundReceiptStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "NEEDS_REVISION"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED";

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
