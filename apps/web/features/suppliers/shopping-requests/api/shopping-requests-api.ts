import type {
  ShoppingRequestDetail,
  ShoppingRequestListItem,
  ShoppingRequestStatus,
  ShoppingRequestKpiSummary,
  CreateShoppingRequestInput,
  ApproveShoppingRequestInput,
  ApproveShoppingRequestIndividualItemInput,
  SaveShoppingRequestApprovedQuantitiesInput,
  UpdateShoppingRequestInput,
} from "../types/shopping-request";
import type { FinalizeShoppingRequestInput } from "../services/finalize-shopping-request";
import type { GoodsPurchaseFulfillmentStatus } from "../../goods-purchases/types/goods-purchase";
import type { ShoppingRequestPaymentMethod } from "../helpers/shopping-request-payment";

export type ShoppingRequestListParams = {
  q?: string;
  status?: ShoppingRequestStatus;
  fulfillmentStatus?: GoodsPurchaseFulfillmentStatus;
  paymentMethod?: ShoppingRequestPaymentMethod;
  paymentDueDate?: string;
  supplierId?: string;
  page?: number;
  limit?: number;
};

export type ShoppingRequestListResponse = {
  data: ShoppingRequestListItem[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
};

export async function listShoppingRequests(
  params: ShoppingRequestListParams = {},
): Promise<ShoppingRequestListResponse> {
  const searchParams = new URLSearchParams();
  if (params.q) searchParams.set("q", params.q);
  if (params.status) searchParams.set("status", params.status);
  if (params.fulfillmentStatus) searchParams.set("fulfillmentStatus", params.fulfillmentStatus);
  if (params.paymentMethod) searchParams.set("paymentMethod", params.paymentMethod);
  if (params.paymentDueDate) searchParams.set("paymentDueDate", params.paymentDueDate);
  if (params.supplierId) searchParams.set("supplierId", params.supplierId);
  if (params.page) searchParams.set("page", String(params.page));
  if (params.limit) searchParams.set("limit", String(params.limit));

  const res = await fetch(`/api/suppliers/shopping-requests?${searchParams.toString()}`);
  if (!res.ok) throw new Error("Failed to fetch shopping requests");
  return res.json();
}

export async function getShoppingRequestSummary(): Promise<ShoppingRequestKpiSummary> {
  const res = await fetch("/api/suppliers/shopping-requests/summary");
  if (!res.ok) throw new Error("Gagal memuat ringkasan daftar belanja");
  const payload = (await res.json()) as { data: ShoppingRequestKpiSummary };
  return payload.data;
}

export async function getShoppingRequest(
  id: string,
): Promise<{ data: ShoppingRequestDetail }> {
  const res = await fetch(`/api/suppliers/shopping-requests/${id}`);
  if (!res.ok) throw new Error("Failed to fetch shopping request");
  return res.json();
}

export async function createShoppingRequest(
  input: CreateShoppingRequestInput,
): Promise<{ data: ShoppingRequestDetail }> {
  const res = await fetch("/api/suppliers/shopping-requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || "Failed to create shopping request");
  }
  return res.json();
}

export async function approveShoppingRequest(
  id: string,
  input: ApproveShoppingRequestInput,
): Promise<{ data: ShoppingRequestDetail }> {
  const res = await fetch(`/api/suppliers/shopping-requests/${id}/approval`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || "Failed to approve shopping request");
  }
  return res.json();
}

export async function saveShoppingRequestApprovedQuantities(
  id: string,
  input: SaveShoppingRequestApprovedQuantitiesInput,
): Promise<{ data: ShoppingRequestDetail }> {
  const res = await fetch(
    `/api/suppliers/shopping-requests/${id}/approved-quantities`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  if (!res.ok) {
    const error = await res.json().catch(() => null);
    throw new Error(error?.message || "Gagal menyimpan Jumlah yang Di-ACC");
  }
  return res.json();
}

export async function approveShoppingRequestItem(
  id: string,
  itemId: string,
  input: ApproveShoppingRequestIndividualItemInput,
): Promise<{ data: ShoppingRequestDetail }> {
  const res = await fetch(
    `/api/suppliers/shopping-requests/${id}/items/${itemId}/approval`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  if (!res.ok) {
    const error = await res.json().catch(() => null);
    throw new Error(error?.message || "Gagal menyetujui item permohonan");
  }
  return res.json();
}

export async function updateShoppingRequest(
  id: string,
  input: UpdateShoppingRequestInput,
): Promise<{ data: ShoppingRequestDetail }> {
  const res = await fetch(`/api/suppliers/shopping-requests/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => null);
    throw new Error(error?.message || "Gagal memperbarui daftar belanja");
  }
  return res.json();
}

export async function cancelShoppingRequest(
  id: string,
): Promise<{ data: ShoppingRequestDetail }> {
  const res = await fetch(`/api/suppliers/shopping-requests/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || "Failed to cancel shopping request");
  }
  return res.json();
}

export async function finalizeShoppingRequest(
  id: string,
  input: FinalizeShoppingRequestInput,
): Promise<{ data: { shoppingRequestId: string; goodsPurchaseId: string } }> {
  const response = await fetch(`/api/suppliers/shopping-requests/${id}/finalize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "Daftar belanja belum bisa disetujui.");
  return payload;
}

export async function rejectShoppingRequest(id: string, reason: string) {
  const response = await fetch(`/api/suppliers/shopping-requests/${id}/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "Daftar belanja belum bisa ditolak.");
  return payload;
}
