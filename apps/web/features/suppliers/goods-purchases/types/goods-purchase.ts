export type GoodsPurchaseStatus = "PENDING" | "APPROVED" | "REJECTED";
export type GoodsPurchaseItemReviewStatus = "PENDING" | "APPROVED";

export type GoodsPurchaseActor = {
  id: string;
  name: string | null;
  storeId: string;
};

export type GoodsPurchaseItemInput = {
  productId: string;
  quantity: number;
  latestUnitPrice: number;
  updateMasterHpp: boolean;
};

export type CreateGoodsPurchaseInput = {
  shoppingRequestId: string;
  items: Array<GoodsPurchaseItemInput & { shoppingRequestItemId: string }>;
};

export type EditGoodsPurchaseItemInput = GoodsPurchaseItemInput;
export type AddGoodsPurchaseItemInput = GoodsPurchaseItemInput;

export type GoodsPurchaseItemRecord = {
  id: string;
  shoppingRequestItemId: string | null;
  productId: string;
  productName: string;
  sku: string;
  unit: string | null;
  unitMultiplierToBase: number;
  quantity: number;
  masterCostPriceSnapshot: number | null;
  latestUnitPrice: number;
  lineTotal: number;
  updateMasterHpp: boolean;
  reviewStatus: GoodsPurchaseItemReviewStatus;
  approvedByName: string | null;
  approvedAt: string | null;
};

export type GoodsPurchaseListItem = {
  id: string;
  number: string;
  shoppingRequestId: string;
  shoppingRequestNumber: string;
  supplierName: string;
  status: GoodsPurchaseStatus;
  itemCount: number;
  pendingItemCount: number;
  totalAmount: number;
  createdByName: string | null;
  createdAt: string;
  approvedAt: string | null;
  rejectedAt: string | null;
};

export type GoodsPurchaseDetail = GoodsPurchaseListItem & {
  supplierId: string | null;
  approvedByName: string | null;
  rejectedByName: string | null;
  rejectionReason: string | null;
  items: GoodsPurchaseItemRecord[];
};

export type GoodsPurchaseMutationResult = {
  data: GoodsPurchaseDetail;
  finalized: boolean;
};

export type EligibleShoppingRequestItem = {
  shoppingRequestItemId: string;
  productId: string;
  productName: string;
  sku: string;
  unit: string | null;
  unitMultiplierToBase: number;
  approvedQty: number;
  currentCostPrice: number | null;
};

export type EligibleShoppingRequest = {
  id: string;
  number: string;
  supplierId: string;
  supplierName: string;
  approvedAt: string | null;
  items: EligibleShoppingRequestItem[];
};

export type LargeUnitProductOption = {
  id: string;
  name: string;
  sku: string;
  unit: string | null;
  unitMultiplierToBase: number;
  costPrice: number | null;
  stockGroupId: string | null;
  stockGroupName: string | null;
};

export type GoodsPurchaseListParams = {
  q?: string;
  status?: GoodsPurchaseStatus;
  page?: number;
  limit?: number;
};

export type GoodsPurchasePagination = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

export type GoodsPurchaseListResponse = {
  data: GoodsPurchaseListItem[];
  pagination: GoodsPurchasePagination;
};
