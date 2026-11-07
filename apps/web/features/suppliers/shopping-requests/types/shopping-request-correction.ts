export type CorrectionPaymentSchedule = { method: "TRANSFER" | "GIRO"; amount: string; dueDate: string | null; note: string | null };

export type CorrectionLine = {
  clientLineKey: string;
  requestItemId: string | null;
  purchaseItemId: string | null;
  productId: string;
  unit: string | null;
  requestedQty: number;
  approvedQty: number | null;
  orderedQty: number;
  unitPrice: string;
  receipts: Array<{ receiptLineId: string | null; receivedQty: number }>;
};

export type ShoppingRequestCorrectionInput = {
  idempotencyKey: string;
  expectedVersion: string;
  expectedPreviewVersion?: string;
  reason: string;
  header: {
    name: string;
    number: string;
    businessDate: string;
    supplierId: string | null;
    requestedByName: string | null;
    note: string | null;
  };
  items: CorrectionLine[];
  payment: {
    schedule?: CorrectionPaymentSchedule[];
    method: "TRANSFER" | "GIRO" | null;
    dueDate: string | null;
    allocations: Array<{ paymentId: string; sourceKind: "TRANSFER_EXPENSE" | "PAYABLE_PAYMENT"; method: "TRANSFER" | "GIRO"; amount: string }>;
    corrections: Array<{ paymentId: string; sourceKind: "TRANSFER_EXPENSE" | "PAYABLE_PAYMENT"; amount: string; paidAt: string }>;
  };
  catalog: Array<{
    productId: string;
    costPrice: string | null;
    salePrice: string | null;
    expectedUpdatedAt: string;
  }>;
};

export type CorrectionPreview = {
  version: string;
  stock: Array<{ productId: string; baseDelta: number; unit: string }>;
  oldTotal: string;
  newTotal: string;
  paid: string;
  overpaid: string;
  affectedDates: string[];
  changes: Array<{ field: string; before: unknown; after: unknown }>;
};

export type CorrectionResult = {
  requestId: string;
  correctionId: string;
  preview: CorrectionPreview;
};
