import type { InventorySummary } from "../types/inventory-management";
import type {
  InboundReceiptLineStatus,
  InboundReceiptStatus,
} from "../types/inventory-management";

export async function fetchInventorySummary(): Promise<InventorySummary> {
  const response = await fetch("/api/inventory-management/summary");
  if (!response.ok) {
    throw new Error("Failed to load inventory summary");
  }

  const body = (await response.json()) as { data: InventorySummary };
  return body.data;
}

async function postInventoryManagement<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    data?: T;
    message?: string;
  };

  if (!response.ok) {
    throw new Error(payload.message || "Inventory management request failed");
  }

  return payload.data as T;
}

export function submitWeeklyCleaningProof(input: {
  proofUrl: string;
  note?: string | null;
}) {
  return postInventoryManagement(
    "/api/inventory-management/weekly-cleaning-proof",
    input,
  );
}

export function reportDamagedProduct(input: {
  productId: string;
  quantity: number;
  proofUrl: string;
  note?: string | null;
}) {
  return postInventoryManagement(
    "/api/inventory-management/damaged-products",
    input,
  );
}

export function submitDailyStockMatching(input: {
  note?: string | null;
}) {
  return postInventoryManagement(
    "/api/inventory-management/daily-stock-matching",
    input,
  );
}

export interface CreateInboundReceiptInput {
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

export async function fetchInboundReceipts(input: {
  status?: InboundReceiptStatus;
} = {}) {
  const params = new URLSearchParams();
  if (input.status) params.set("status", input.status);
  const url = `/api/inventory-management/inbound-receipts${params.size ? `?${params}` : ""}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Failed to load inbound receipts");
  }
  const body = (await response.json()) as { data: unknown[] };
  return body.data;
}

export async function fetchReceivingQueue(input: {
  search?: string;
  take?: number;
} = {}) {
  const params = new URLSearchParams();
  if (input.search) params.set("search", input.search);
  if (input.take) params.set("take", String(input.take));
  const url = `/api/inventory-management/receiving-queue${params.size ? `?${params}` : ""}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Failed to load receiving queue");
  }
  const body = (await response.json()) as { data: unknown };
  return body.data;
}

export function createInboundReceipt(input: CreateInboundReceiptInput) {
  return postInventoryManagement(
    "/api/inventory-management/inbound-receipts",
    input,
  );
}

export function submitInboundReceipt(id: string) {
  return postInventoryManagement(
    `/api/inventory-management/inbound-receipts/${id}/submit`,
    {},
  );
}

export function approveInboundReceipt(id: string) {
  return postInventoryManagement(
    `/api/inventory-management/inbound-receipts/${id}/approve`,
    {},
  );
}

export function needsRevisionInboundReceipt(id: string, revisionReason: string) {
  return postInventoryManagement(
    `/api/inventory-management/inbound-receipts/${id}/needs-revision`,
    { revisionReason },
  );
}

export function rejectInboundReceipt(id: string, rejectionReason: string) {
  return postInventoryManagement(
    `/api/inventory-management/inbound-receipts/${id}/reject`,
    { rejectionReason },
  );
}

export function createInternalStockOutRequest(input: {
  productId: string;
  quantity: number;
  reason: string;
}) {
  return postInventoryManagement("/api/internal-stock-out", input);
}

export function createInternalUseStockLog(input: {
  productId: string;
  quantity: number;
  reason: string;
}) {
  return postInventoryManagement("/api/inventory", {
    productId: input.productId,
    type: "OUT",
    reason: "USAGE",
    quantity: input.quantity,
    note: input.reason,
  });
}

export function approveInternalStockOutRequest(id: string) {
  return postInventoryManagement(`/api/internal-stock-out/${id}/approve`, {});
}

export function rejectInternalStockOutRequest(id: string, rejectionReason: string) {
  return postInventoryManagement(`/api/internal-stock-out/${id}/reject`, {
    rejectionReason,
  });
}
