import type { Product } from "@pos/db";
import type { Role } from "@/features/rbac/helpers/rbac-core";
import type {
  GoodsPurchaseFulfillmentStatus,
  InboundReceiptMatchStatus,
} from "../helpers/inbound-receipt-rules";

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
  unmarkedSuratJalan?: number;
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
  countUnmarkedSuratJalan(storeId: string): Promise<number>;
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
  goodsPurchaseId: string | null;
  status: InboundReceiptStatus;
  lines: InboundReceiptApprovalLine[];
}

export interface InboundReceiptData {
  id: string;
  status: InboundReceiptStatus;
}

export interface InboundReceiptMutationResult {
  data: InboundReceiptData;
  finalized: boolean;
  conflict?: boolean;
  bundle?: InboundReceiptStockBundleResult;
}

export interface InboundReceiptStockImpact {
  productId: string;
  sku: string;
  stockGroupId: string | null;
  receiptLineId: string | null;
  beforeStock: number;
  afterStock: number;
  delta: number;
  baseDelta: number;
  inventoryLogId: string | null;
  beforeSnapshot: Record<string, unknown>;
  afterSnapshot: Record<string, unknown>;
}

export interface InboundReceiptStockBundleResult {
  id: string;
  type: "INBOUND_RECEIPT";
  title: string;
  stockGroupCount: number;
  canonicalImpacts: InboundReceiptStockImpact[];
  variantImpacts: InboundReceiptStockImpact[];
}

export interface LockedSubmittedInboundReceiptLine {
  id: string;
  productId: string;
  status: InboundReceiptLineStatus;
  expectedQuantity: number;
  receivedQuantity: number;
  matchStatus: InboundReceiptMatchStatus | null;
  reviewStatus: "PENDING" | "APPROVED" | null;
  approvedById: string | null;
  approvedByName: string | null;
  approvedAt: Date | null;
  note: string | null;
  product: Product;
  stockGroupId: string | null;
  unitMultiplierToBase: number;
  conversionNeedsReview: boolean;
  goodsPurchaseItem: {
    id: string;
    goodsPurchaseId: string;
    productId: string;
    quantity: number;
    latestUnitPrice: number;
  } | null;
  approvedReceivedExcludingCurrentReceipt: number;
}

export interface LockedSubmittedInboundReceipt {
  id: string;
  storeId: string;
  status: "SUBMITTED";
  goodsPurchaseId: string | null;
  goodsPurchaseNumber: string | null;
  stockBundleId: string | null;
  supplierId: string | null;
  supplierName: string;
  lines: LockedSubmittedInboundReceiptLine[];
}

export type FinalizableInboundReceipt = LockedSubmittedInboundReceipt;

export interface LockedInboundStockGroup {
  id: string;
  storeId: string;
  baseStock: number;
  variants: Product[];
}

export interface StandaloneInboundStockMutation {
  product: Product;
  beforeStock: number;
  afterStock: number;
}

export interface CreateInboundReceiptStockBundleInput {
  type: "INBOUND_RECEIPT";
  status: "COMMITTED";
  storeId: string;
  createdBy: string;
  approvedByName: string | null;
  approvedAt: Date;
  title: string;
  receiptId: string;
  goodsPurchaseId: string;
  goodsPurchaseNumber: string;
  supplierId: string | null;
  supplierName: string;
  canonicalImpacts: InboundReceiptStockImpact[];
  variantImpacts: InboundReceiptStockImpact[];
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
  goodsPurchaseId: string;
  goodsPurchaseNumber: string;
  supplierId: string | null;
  supplierName: string;
  fulfillmentStatus: GoodsPurchaseFulfillmentStatus;
  itemId: string;
  productId: string;
  productName: string;
  sku: string;
  unit: string | null;
  orderedQuantity: number;
  approvedReceivedQuantity: number;
  pendingReservedQuantity: number;
  pendingReceiptIds: string[];
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
  hasActiveReceipt: boolean;
  activeReceiptCount: number;
  activeReceiptStatuses: InboundReceiptStatus[];
  isFullyReceived: boolean;
}

export interface ReceivingQueuePurchase {
  id: string;
  number: string;
  supplierId: string | null;
  supplierName: string;
  fulfillmentStatus: GoodsPurchaseFulfillmentStatus;
  pendingReceiptCount: number;
  items: ReceivingQueuePurchaseItem[];
}

export interface ReceivingQueuePurchaseItem {
  goodsPurchaseItemId: string;
  productId: string;
  productName: string;
  sku: string;
  unit: string | null;
  orderedQuantity: number;
  approvedReceivedQuantity: number;
  pendingReservedQuantity: number;
  availableQuantity: number;
}

export interface ReceivingQueueResult {
  purchases: ReceivingQueuePurchase[];
  items: ReceivingQueueItem[];
}

export interface GoodsPurchaseReceivingComparison {
  goodsPurchaseId: string;
  goodsPurchaseNumber: string;
  supplierName: string;
  fulfillmentStatus: GoodsPurchaseFulfillmentStatus;
  items: Array<{
    goodsPurchaseItemId: string;
    productName: string;
    sku: string;
    unit: string | null;
    orderedQuantity: number;
    approvedReceivedQuantity: number;
    pendingReservedQuantity: number;
    remainingQuantity: number;
  }>;
  receipts: Array<{
    id: string;
    createdAt: string;
    status: InboundReceiptStatus;
    approvedAt: string | null;
    approverName: string | null;
    lines: Array<{
      goodsPurchaseItemId: string;
      receivedQuantity: number;
      matchStatus: InboundReceiptMatchStatus;
      note: string | null;
    }>;
  }>;
}

export interface InboundReceiptForEdit {
  id: string;
  storeId: string;
  status: InboundReceiptStatus;
  submittedBy: string | null;
  goodsPurchaseId: string | null;
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
      stockBundleId?: string;
      legacyOnly?: boolean;
      lineLogIds: Array<{
        lineId: string;
        inventoryLogId: string;
        unitCost?: number;
      }>;
    },
  ): Promise<InboundReceiptData>;
  markReceiptRejected(
    tx: unknown,
    input: {
      storeId: string;
      receiptId: string;
      rejectedBy: string;
      rejectionReason: string;
    },
  ): Promise<InboundReceiptData>;
  markReceiptNeedsRevision(
    tx: unknown,
    input: {
      storeId: string;
      receiptId: string;
      revisedBy: string;
      revisionReason: string;
    },
  ): Promise<InboundReceiptData>;
  markReceiptSubmitted(
    tx: unknown,
    input: {
      storeId: string;
      receiptId: string;
      submittedBy: string;
      submittedAt: Date;
    },
  ): Promise<InboundReceiptData>;
  findReceiptForEdit(
    tx: unknown,
    input: { storeId: string; receiptId: string },
  ): Promise<InboundReceiptForEdit | null>;
  updateReceiptDraft(
    tx: unknown,
    input: {
      storeId: string;
      receiptId: string;
      note?: string | null;
      lines: Array<{
        id: string;
        productId: string;
        expectedQuantity: number;
        receivedQuantity: number;
        status: InboundReceiptLineStatus;
        note?: string | null;
      }>;
    },
  ): Promise<InboundReceiptData>;
  createInboundReceiptDraft(
    tx: unknown,
    input: CreateInboundReceiptDraftInput,
  ): Promise<InboundReceiptData>;
  lockSubmittedReceipt(
    tx: unknown,
    input: { storeId: string; receiptId: string },
  ): Promise<LockedSubmittedInboundReceipt | null>;
  lockGoodsPurchase(
    tx: unknown,
    input: { storeId: string; goodsPurchaseId: string },
  ): Promise<boolean>;
  findReceiptForFinalization(
    tx: unknown,
    input: { storeId: string; receiptId: string },
  ): Promise<FinalizableInboundReceipt | null>;
  lockStockGroup(
    tx: unknown,
    input: { storeId: string; stockGroupId: string },
  ): Promise<LockedInboundStockGroup | null>;
  incrementStockGroupBase(
    tx: unknown,
    input: {
      storeId: string;
      stockGroupId: string;
      baseDelta: number;
    },
  ): Promise<void>;
  incrementStandaloneProductStock(
    tx: unknown,
    input: {
      storeId: string;
      productId: string;
      quantity: number;
    },
  ): Promise<StandaloneInboundStockMutation>;
  createCanonicalInventoryLog(
    tx: unknown,
    input: {
      productId: string;
      supplierId: string | null;
      type: "IN";
      reason: "RESTOCK";
      quantity: number;
      unitCost: number;
      note: string;
      createdBy: string;
      person: string | null;
      status: "APPROVED";
      approvedBy: string;
      approverName: string | null;
      decidedAt: Date;
    },
  ): Promise<{ id: string }>;
  createReceiptStockBundle(
    tx: unknown,
    input: CreateInboundReceiptStockBundleInput,
  ): Promise<{ id: string }>;
  listGoodsPurchaseFulfillmentItems(
    tx: unknown,
    input: { storeId: string; goodsPurchaseId: string },
  ): Promise<
    Array<{
      orderedQuantity: number;
      approvedReceivedQuantity: number;
    }>
  >;
  updateGoodsPurchaseFulfillment(
    tx: unknown,
    input: {
      storeId: string;
      goodsPurchaseId: string;
      fulfillmentStatus: GoodsPurchaseFulfillmentStatus;
    },
  ): Promise<void>;
  approveReceiptLine(
    tx: unknown,
    input: {
      storeId: string;
      receiptId: string;
      itemId: string;
      reviewStatus: "APPROVED";
      approvedById: string;
      approvedByName: string | null;
      approvedAt: Date;
    },
  ): Promise<void>;
  updateReceiptLine(
    tx: unknown,
    input: {
      storeId: string;
      receiptId: string;
      itemId: string;
      matchStatus: InboundReceiptMatchStatus;
      receivedQuantity: number;
      note: string | null;
      reviewStatus: "PENDING";
      approvedById: null;
      approvedByName: null;
      approvedAt: null;
    },
  ): Promise<void>;
  removeReceiptLine(
    tx: unknown,
    input: { storeId: string; receiptId: string; itemId: string },
  ): Promise<void>;
  listInboundReceipts(
    storeId: string,
    input: { status?: InboundReceiptStatus },
  ): Promise<unknown[]>;
  listReceivingQueue(
    storeId: string,
    input: {
      search?: string | null;
      take?: number;
      goodsPurchaseId?: string | null;
    },
  ): Promise<ReceivingQueueRepositoryRow[]>;
  getGoodsPurchaseReceivingComparison(
    storeId: string,
    goodsPurchaseId: string,
  ): Promise<GoodsPurchaseReceivingComparison | null>;
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
