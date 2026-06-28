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

export interface DailyMatchingRow {
  productId: string;
  product: {
    id: string;
    name: string;
    sku: string;
    unit: string;
    imageUrl: string | null;
    category: { name: string; icon: string | null } | null;
  };
  stockBeforeOut: number;
  totalOut: number;
  expectedAfterStock: number;
  logCount: number;
}

export interface DailyMatchingPreview {
  periodKey: string;
  rows: DailyMatchingRow[];
  pendingBundle: null | {
    id: string;
    status: string;
    summary: Record<string, unknown>;
    items: unknown[];
  };
}

export async function fetchDailyStockMatching(): Promise<DailyMatchingPreview> {
  const response = await fetch("/api/inventory-management/daily-stock-matching", {
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Failed to load daily stock matching");
  const body = (await response.json()) as { data: DailyMatchingPreview };
  return body.data;
}

export function submitDailyStockMatching(input: {
  lines: Array<{ productId: string; physicalStock: number; note?: string | null }>;
}) {
  return postInventoryManagement(
    "/api/inventory-management/daily-stock-matching",
    input,
  );
}

export function approveDailyStockMatching(
  batchId: string,
  input: { lines?: Array<{ productId: string; physicalStock: number }> } = {},
) {
  return postInventoryManagement(
    `/api/inventory-management/daily-stock-matching/${batchId}/approve`,
    input,
  );
}

export function cancelInventoryBundle(batchId: string) {
  return postInventoryManagement(`/api/inventory/bulk/${batchId}/cancel`, {});
}

export interface StockGroupBulkPreview {
  stockGroupId: string;
  displayName: string;
  baseUnit: string;
  type: "OUT" | "ADJUSTMENT";
  stockInput: { mode: "BASE" } | { mode: "VARIANT"; variantProductId: string };
  inputValue: number;
  beforeBaseStock: number;
  afterBaseStock: number;
  baseDelta: number;
  variants: Array<{
    id: string;
    name: string;
    sku: string;
    unit: string;
    unitMultiplierToBase: number;
    beforeStock: number;
    afterStock: number;
    delta: number;
  }>;
  changedVariants: StockGroupBulkPreview["variants"];
}

export function previewStockGroupBulk(input: {
  stockGroupId: string;
  type: "OUT" | "ADJUSTMENT";
  stockInput: { mode: "BASE" } | { mode: "VARIANT"; variantProductId: string };
  inputValue: number;
  note?: string | null;
}) {
  return postInventoryManagement<StockGroupBulkPreview>(
    "/api/inventory-management/stock-group-bulk",
    { ...input, action: "preview" },
  );
}

export function submitStockGroupBulk(input: {
  stockGroupId: string;
  type: "OUT" | "ADJUSTMENT";
  stockInput: { mode: "BASE" } | { mode: "VARIANT"; variantProductId: string };
  inputValue: number;
  note?: string | null;
}) {
  return postInventoryManagement<{
    batchOperationId: string;
    status: "PENDING";
    preview: StockGroupBulkPreview;
  }>("/api/inventory-management/stock-group-bulk", {
    ...input,
    action: "submit",
  });
}

export function approveStockGroupBulk(
  batchId: string,
  input: {
    stockInput?: { mode: "BASE" } | { mode: "VARIANT"; variantProductId: string };
    inputValue?: number;
  },
) {
  return postInventoryManagement(
    `/api/inventory-management/stock-group-bulk/${batchId}/approve`,
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

export interface InboundReceiptListLine {
  id: string;
  productNameSnapshot: string | null;
  skuSnapshot: string | null;
  unitSnapshot: string | null;
  expectedQuantity: number;
  receivedQuantity: number;
  status: string;
  note: string | null;
}

export interface InboundReceiptListItem {
  id: string;
  status: InboundReceiptStatus;
  createdAt: string;
  supplier: { name: string } | null;
  note: string | null;
  lines: InboundReceiptListLine[];
}

export async function fetchInboundReceipts(input: {
  status?: InboundReceiptStatus;
} = {}): Promise<InboundReceiptListItem[]> {
  const params = new URLSearchParams();
  if (input.status) params.set("status", input.status);
  const url = `/api/inventory-management/inbound-receipts${params.size ? `?${params}` : ""}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Failed to load inbound receipts");
  }
  const body = (await response.json()) as { data: InboundReceiptListItem[] };
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
