import type { ShoppingRequestPaymentMethod } from "../helpers/shopping-request-payment";

export type ShoppingRequestStatus = "REQUESTED" | "APPROVED" | "CANCELLED" | "REJECTED";

export type ShoppingRequestStockMode = "GROUP_STOCK" | "PRODUCT_ONLY";
export type ShoppingRequestItemDecisionStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED";

export const SHOPPING_REQUEST_STATUSES: ShoppingRequestStatus[] = [
  "REQUESTED",
  "APPROVED",
  "CANCELLED",
  "REJECTED",
];

export interface ShoppingRequestKpiSummary {
  pendingRequestCount: number;
  pendingRequestedQty: number;
  approvedRequestCount: number;
  fulfillmentRate: number;
}

export interface ShoppingRequestListItem {
  kind?: "SHOPPING_REQUEST";
  id: string;
  purchase?: {
    id: string;
    number: string;
    status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
    statusBeforeCancellation?: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" | null;
    fulfillmentStatus: "NOT_RECEIVED" | "PARTIALLY_RECEIVED" | "RECEIVED";
    totalAmount: number;
    paymentMethod?: ShoppingRequestPaymentMethod | null;
    paymentDueDate?: string | null;
    payments?: Array<{ method: ShoppingRequestPaymentMethod; amount: number; dueDate: string | null; note: string | null }>;
  } | null;
  purchaseHistory?: NonNullable<ShoppingRequestListItem["purchase"]>[];
  approvalFlowVersion?: number;
  correctionCount?: number;
  correctionStockChanged?: boolean;
  number: string;
  name: string;
  status: ShoppingRequestStatus;
  deletion?: { actorName: string | null; reason: string; createdAt: string; previousStatus?: ShoppingRequestStatus } | null;
  supplierId: string | null;
  supplierName: string | null;
  requestedByName: string | null;
  approvedByName: string | null;
  itemCount: number;
  decidedItemCount: number;
  pendingItemCount: number;
  totalRequestedQty: number;
  totalApprovedQty: number | null;
  createdAt: string;
  businessDate?: string | null;
  approvedAt: string | null;
  rejectedAt?: string | null;
  rejectedByName?: string | null;
  rejectionReason?: string | null;
  note: string | null;
  stockAppliedAt: string | null;
}

export interface BackdatedPurchaseListItem {
  kind: "BACKDATED_PURCHASE";
  id: string;
  purchaseDate: string;
  dueDate: string;
  paymentMethod: "GIRO" | "TRANSFER";
  reference: string;
  amountCents: number;
  paidCents: number;
  remainingCents: number;
  paymentStatus: "UNPAID" | "PARTIAL" | "PAID";
  createdAt: string;
  payments: Array<{ id: string; paidAt: string; amountCents: number; createdAt: string }>;
}

export type ShoppingListRecord = ShoppingRequestListItem | BackdatedPurchaseListItem;

export interface ShoppingRequestItemRecord {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  unit: string | null;
  stockOnHand: number;
  requestedQty: number;
  approvedQty: number | null;
  stockMode: ShoppingRequestStockMode;
  decisionStatus: ShoppingRequestItemDecisionStatus;
  decidedById: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  itemStockAppliedAt: string | null;
  costPriceSnapshot: number | string | null;
  imageUrl: string | null;
  product: {
    costPrice?: number | string | null;
    unitMultiplierToBase?: number | null;
    conversionNeedsReview?: boolean;
    stockGroup?: {
      id: string;
      displayName: string;
      baseUnit: string | null;
      baseStock: number;
    } | null;
  };
}

export interface ShoppingRequestDetail extends ShoppingRequestListItem {
  items: ShoppingRequestItemRecord[];
}

export interface ShoppingRequestItemInput {
  productId: string;
  requestedQty: number;
}

export interface CreateShoppingRequestInput {
  supplierId: string;
  name?: string | null;
  requestedByName?: string | null;
  note?: string | null;
  items: ShoppingRequestItemInput[];
}

export interface ApproveShoppingRequestItemInput {
  id: string;
}

export interface ApproveShoppingRequestInput {
  items: ApproveShoppingRequestItemInput[];
  confirmOverRequested?: boolean;
}

export interface SaveShoppingRequestApprovedQuantitiesInput {
  items: Array<{ id: string; approvedQty: number }>;
  confirmOverRequested?: boolean;
}

export interface ApproveShoppingRequestIndividualItemInput {
  confirmOverRequested?: boolean;
}

export interface UpdateShoppingRequestInput {
  supplierId: string;
  name?: string | null;
  note?: string | null;
  items: ShoppingRequestItemInput[];
}

export interface ShoppingRequestActor {
  id: string;
  name: string | null;
  storeId: string;
}
