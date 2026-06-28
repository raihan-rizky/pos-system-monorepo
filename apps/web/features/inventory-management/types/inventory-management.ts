import type { Role } from "@/features/rbac/helpers/rbac-core";

export interface InventoryManagementUser {
  id: string;
  role: Role;
  storeId: string | null;
}

export interface InventorySummaryCounts {
  pendingStockRequests: number;
  unverifiedOutLogs: number;
  submittedInboundReceipts: number;
  weeklyProofMissing: boolean;
  dailyMatchingIncomplete: boolean;
  damagedReportsPending: number;
  needsRevisionReceipts: number;
  rejectedOwnRequests: number;
  pendingSuratJalan?: number;
  negativeStockProducts?: number;
  outOfStockProducts?: number;
  lowStockProducts?: number;
  dailyChecklistRemaining?: number;
}

export interface InventorySummaryPeriod {
  dateKey: string;
  weekKey: string;
}

export interface InventoryChartData {
  inboundOutbound: Array<{ day: string; inbound: number; outbound: number }>;
  health: {
    accuracy: number;
    availability: number;
    fulfillment: number;
  };
}

export interface InventorySummary {
  urgentCount: number;
  counts: InventorySummaryCounts;
  period: InventorySummaryPeriod;
  chartData: InventoryChartData;
}

export interface InventorySummaryRepository {
  countPendingStockRequests(storeId: string): Promise<number>;
  countUnverifiedOutLogs(storeId: string, dateKey: string): Promise<number>;
  countSubmittedInboundReceipts(storeId: string): Promise<number>;
  isWeeklyProofMissing(storeId: string, weekKey: string): Promise<boolean>;
  isDailyMatchingIncomplete(storeId: string, dateKey: string): Promise<boolean>;
  countPendingDamagedReports(storeId: string): Promise<number>;
  countNeedsRevisionReceipts(storeId: string): Promise<number>;
  countRejectedRequestsForUser(storeId: string, userId: string): Promise<number>;
  countPendingSuratJalan(storeId: string): Promise<number>;
  countNegativeStockProducts(storeId: string): Promise<number>;
  countOutOfStockProducts(storeId: string): Promise<number>;
  countLowStockProducts(storeId: string): Promise<number>;
  countDailyChecklistRemaining(storeId: string, dateKey: string): Promise<number>;
  getChartData(storeId: string, dateKey: string): Promise<InventoryChartData>;
}

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

export interface InboundReceiptApprovalLine {
  id: string;
  productId: string;
  status: InboundReceiptLineStatus;
  receivedQuantity: number;
  latestCostPrice: number | null;
  productIsActive: boolean;
}

export interface InboundReceiptForApproval {
  id: string;
  storeId: string;
  supplierId: string | null;
  status: InboundReceiptStatus;
  lines: InboundReceiptApprovalLine[];
}

export interface InboundReceiptMutationResult {
  id: string;
  status: InboundReceiptStatus;
}

export interface CreateInboundReceiptDraftInput {
  storeId: string;
  createdBy: string;
  supplierId?: string | null;
  shoppingRequestId?: string | null;
  note?: string | null;
  lines: Array<{
    productId: string;
    shoppingRequestItemId?: string | null;
    expectedQuantity: number;
    receivedQuantity: number;
    status: InboundReceiptLineStatus;
    note?: string | null;
  }>;
}

export interface ReceivingQueueReceiptLine {
  receiptStatus: InboundReceiptStatus;
  lineStatus: InboundReceiptLineStatus;
  receivedQuantity: number;
}

export interface ReceivingQueueRepositoryRow {
  shoppingRequestId: string;
  shoppingRequestNumber: string;
  supplierName: string | null;
  itemId: string;
  productId: string;
  productName: string;
  unit: string | null;
  expectedQuantity: number;
  receiptLines: ReceivingQueueReceiptLine[];
}

export interface ReceivingQueueItem {
  shoppingRequestId: string;
  shoppingRequestNumber: string;
  supplierName: string | null;
  itemId: string;
  productId: string;
  productName: string;
  unit: string | null;
  expectedQuantity: number;
  approvedReceivedQuantity: number;
  submittedReservedQuantity: number;
  remainingQuantity: number;
}

export interface ReceivingQueueResult {
  items: ReceivingQueueItem[];
}

export interface InventoryInboundReceiptRepository {
  runInTransaction<T>(callback: (tx: unknown) => Promise<T>): Promise<T>;
  findReceiptForApproval(
    tx: unknown,
    input: { storeId: string; receiptId: string },
  ): Promise<InboundReceiptForApproval | null>;
  createInboundStockLog(
    tx: unknown,
    input: {
      productId: string;
      quantity: number;
      unitCost: number;
      supplierId?: string | null;
      createdBy: string;
      person: string | null;
      note: string | null;
    },
  ): Promise<{ id: string }>;
  applyProductStockDelta(
    tx: unknown,
    input: { storeId: string; productId: string; delta: number },
  ): Promise<unknown>;
  markReceiptApproved(
    tx: unknown,
    input: {
      storeId: string;
      receiptId: string;
      approvedBy: string;
      approvedAt: Date;
      lineLogIds: Array<{ lineId: string; inventoryLogId: string }>;
    },
  ): Promise<InboundReceiptMutationResult>;
  markReceiptRejected(
    tx: unknown,
    input: {
      storeId: string;
      receiptId: string;
      rejectedBy: string;
      rejectionReason: string;
    },
  ): Promise<InboundReceiptMutationResult>;
  markReceiptNeedsRevision(
    tx: unknown,
    input: {
      storeId: string;
      receiptId: string;
      revisedBy: string;
      revisionReason: string;
    },
  ): Promise<InboundReceiptMutationResult>;
  markReceiptSubmitted(
    tx: unknown,
    input: {
      storeId: string;
      receiptId: string;
      submittedBy: string;
      submittedAt: Date;
    },
  ): Promise<InboundReceiptMutationResult>;
  createInboundReceiptDraft(
    tx: unknown,
    input: CreateInboundReceiptDraftInput,
  ): Promise<InboundReceiptMutationResult>;
  listInboundReceipts(
    storeId: string,
    input: { status?: InboundReceiptStatus },
  ): Promise<unknown[]>;
  listReceivingQueue(
    storeId: string,
    input: { search?: string | null; take?: number },
  ): Promise<ReceivingQueueRepositoryRow[]>;
}

export type InternalStockOutRequestStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface InternalStockOutRequestMutationResult {
  id: string;
  status: InternalStockOutRequestStatus;
}

export interface InternalStockOutRepository {
  createRequest(input: {
    storeId: string;
    productId: string;
    quantity: number;
    reason: string;
    requestedBy: string;
    requestedByName: string;
    requestedByRole: Role;
  }): Promise<InternalStockOutRequestMutationResult>;
  approveRequest(
    tx: unknown,
    input: {
      storeId: string;
      requestId: string;
      approvedBy: string;
      approvedByName: string;
    },
  ): Promise<InternalStockOutRequestMutationResult>;
  rejectRequest(input: {
    storeId: string;
    requestId: string;
    rejectedBy: string;
    rejectedByName: string;
    rejectionReason: string;
  }): Promise<InternalStockOutRequestMutationResult>;
  runInTransaction<T>(callback: (tx: unknown) => Promise<T>): Promise<T>;
}
