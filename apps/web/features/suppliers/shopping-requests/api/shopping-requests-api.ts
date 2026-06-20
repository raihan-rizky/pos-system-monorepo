import type {
  ShoppingRequestDetail,
  ShoppingRequestListItem,
  ShoppingRequestStatus,
  CreateShoppingRequestInput,
  ApproveShoppingRequestInput,
} from "../types/shopping-request";

export type ShoppingRequestListParams = {
  q?: string;
  status?: ShoppingRequestStatus;
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
  if (params.supplierId) searchParams.set("supplierId", params.supplierId);
  if (params.page) searchParams.set("page", String(params.page));
  if (params.limit) searchParams.set("limit", String(params.limit));

  const res = await fetch(`/api/suppliers/shopping-requests?${searchParams.toString()}`);
  if (!res.ok) throw new Error("Failed to fetch shopping requests");
  return res.json();
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
