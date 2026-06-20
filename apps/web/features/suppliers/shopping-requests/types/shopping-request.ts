export type ShoppingRequestStatus = "DRAFT" | "APPROVED" | "CANCELLED";

export const SHOPPING_REQUEST_STATUSES: ShoppingRequestStatus[] = [
  "DRAFT",
  "APPROVED",
  "CANCELLED",
];

export interface ShoppingRequestListItem {
  id: string;
  number: string;
  status: ShoppingRequestStatus;
  supplierId: string | null;
  supplierName: string | null;
  requestedByName: string | null;
  approvedByName: string | null;
  itemCount: number;
  totalRequestedQty: number;
  totalApprovedQty: number | null;
  createdAt: string;
  approvedAt: string | null;
  note: string | null;
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
}

export interface ShoppingRequestDetail extends ShoppingRequestListItem {
  items: ShoppingRequestItemRecord[];
}

export interface ShoppingRequestItemInput {
  productId: string;
  requestedQty: number;
}

export interface CreateShoppingRequestInput {
  supplierId?: string | null;
  requestedByName?: string | null;
  note?: string | null;
  items: ShoppingRequestItemInput[];
}

export interface ApproveShoppingRequestItemInput {
  id: string;
  approvedQty: number;
}

export interface ApproveShoppingRequestInput {
  items: ApproveShoppingRequestItemInput[];
}

export interface ShoppingRequestActor {
  id: string;
  name: string | null;
  storeId: string;
}
