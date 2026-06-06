import type {
  SupplierInput,
  SupplierListItem,
  SupplierType,
  SupplierWarning,
} from "@/features/suppliers/types/supplier";

export type SupplierPagination = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

export type SupplierListResponse = {
  data: SupplierListItem[];
  pagination: SupplierPagination;
};

export type SupplierWriteResponse = {
  data: SupplierListItem;
  warnings: SupplierWarning[];
};

export type SupplierSummaryRow = {
  supplierId: string;
  supplierName: string;
  supplierType: string;
  purchaseValue: number;
  restockQuantity: number;
  restockCount: number;
  missingCostCount: number;
  lastStockInAt: string | null;
  topProductName: string | null;
};

export type SupplierSummary = {
  totalPurchaseValue: number;
  totalRestockQuantity: number;
  activeSupplierCount: number;
  missingCostCount: number;
  topSupplier: SupplierSummaryRow | null;
  suppliers: SupplierSummaryRow[];
};

export type SupplierStockInRecapItem = {
  id: string;
  supplierId: string | null;
  supplier: { id: string; name: string; type: SupplierType } | null;
  productId: string;
  product: {
    id: string;
    name: string;
    sku: string;
    unit: string;
    category: { id: string; name: string };
  };
  quantity: number;
  unitCost: number | string | null;
  note: string | null;
  person: string | null;
  approverName: string | null;
  createdAt: string;
  decidedAt: string | null;
};

export type SupplierStockInRecapResponse = {
  data: SupplierStockInRecapItem[];
  pagination: SupplierPagination;
};

export type SupplierListFilters = {
  q?: string;
  type?: SupplierType;
  isActive?: boolean;
  page?: number;
  limit?: number;
};

export type SupplierApiErrorPayload = {
  message?: string;
  code?: string;
  errors?: Record<string, string[]>;
};

export class SupplierApiError extends Error {
  readonly status: number;
  readonly payload: SupplierApiErrorPayload | null;

  constructor(
    message: string,
    status: number,
    payload: SupplierApiErrorPayload | null,
  ) {
    super(message);
    this.name = "SupplierApiError";
    this.status = status;
    this.payload = payload;
  }
}

async function supplierRequest<T>(
  url: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const errorPayload = payload as SupplierApiErrorPayload | null;
    throw new SupplierApiError(
      errorPayload?.message || `Request failed (${response.status})`,
      response.status,
      errorPayload,
    );
  }

  return payload as T;
}

export function listSuppliers(
  filters: SupplierListFilters = {},
): Promise<SupplierListResponse> {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.type) params.set("type", filters.type);
  if (filters.isActive !== undefined) {
    params.set("isActive", String(filters.isActive));
  }
  if (filters.page) params.set("page", String(filters.page));
  if (filters.limit) params.set("limit", String(filters.limit));

  const query = params.toString();
  return supplierRequest<SupplierListResponse>(
    query ? `/api/suppliers?${query}` : "/api/suppliers",
  );
}

export function createSupplier(input: SupplierInput): Promise<SupplierWriteResponse> {
  return supplierRequest<SupplierWriteResponse>("/api/suppliers", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateSupplier(
  id: string,
  input: SupplierInput,
): Promise<SupplierWriteResponse> {
  return supplierRequest<SupplierWriteResponse>(`/api/suppliers/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deactivateSupplier(id: string): Promise<SupplierWriteResponse> {
  return supplierRequest<SupplierWriteResponse>(
    `/api/suppliers/${id}/deactivate`,
    { method: "POST" },
  );
}

export function reactivateSupplier(id: string): Promise<SupplierWriteResponse> {
  return supplierRequest<SupplierWriteResponse>(
    `/api/suppliers/${id}/reactivate`,
    { method: "POST" },
  );
}

export function getSupplierSummary(filters: {
  from?: string;
  to?: string;
  supplierId?: string;
} = {}): Promise<SupplierSummary> {
  const params = new URLSearchParams();
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.supplierId) params.set("supplierId", filters.supplierId);
  const query = params.toString();
  return supplierRequest<SupplierSummary>(
    query ? `/api/suppliers/summary?${query}` : "/api/suppliers/summary",
  );
}

export function getSupplierStockInRecap(filters: {
  from?: string;
  to?: string;
  supplierId?: string;
  productId?: string;
  categoryId?: string;
  page?: number;
  limit?: number;
} = {}): Promise<SupplierStockInRecapResponse> {
  const params = new URLSearchParams();
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.supplierId) params.set("supplierId", filters.supplierId);
  if (filters.productId) params.set("productId", filters.productId);
  if (filters.categoryId) params.set("categoryId", filters.categoryId);
  if (filters.page) params.set("page", String(filters.page));
  if (filters.limit) params.set("limit", String(filters.limit));
  const query = params.toString();
  return supplierRequest<SupplierStockInRecapResponse>(
    query
      ? `/api/suppliers/stock-in-recap?${query}`
      : "/api/suppliers/stock-in-recap",
  );
}
