export type ShoppingRequestStatus = "REQUESTED" | "APPROVED" | "CANCELLED";

export type ShoppingRequestStockMode = "GROUP_STOCK" | "PRODUCT_ONLY";
export type ShoppingRequestItemDecisionStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED";

export const SHOPPING_REQUEST_STATUSES: ShoppingRequestStatus[] = [
  "REQUESTED",
  "APPROVED",
  "CANCELLED",
];

export interface ShoppingRequestKpiSummary {
  pendingRequestCount: number;
  pendingRequestedQty: number;
  approvedRequestCount: number;
  fulfillmentRate: number;
}

export interface ShoppingRequestListItem {
  id: string;
  number: string;
  status: ShoppingRequestStatus;
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
  approvedAt: string | null;
  note: string | null;
  stockAppliedAt: string | null;
}

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
  stockMode: ShoppingRequestStockMode;
}

export interface CreateShoppingRequestInput {
  supplierId: string;
  requestedByName?: string | null;
  note?: string | null;
  items: ShoppingRequestItemInput[];
}

export interface ApproveShoppingRequestItemInput {
  id: string;
  stockMode?: ShoppingRequestStockMode;
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
  stockMode?: ShoppingRequestStockMode;
  confirmOverRequested?: boolean;
}

export interface UpdateShoppingRequestInput {
  supplierId: string;
  note?: string | null;
  items: ShoppingRequestItemInput[];
}

export interface ShoppingRequestActor {
  id: string;
  name: string | null;
  storeId: string;
}
