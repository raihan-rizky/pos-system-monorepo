import type { InventorySummary } from "../types/inventory-management";
import type {
  InboundReceiptLineStatus,
  InboundReceiptStatus,
} from "../types/inventory-management";
import type { OutLogVerificationState } from "../helpers/inventory-management-rules";

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

export interface InventoryDaySessionProduct {
  id: string;
  name: string;
  sku: string;
  stock: number;
  minStock: number;
  unit: string;
}

export interface InventoryDaySessionRecord {
  id: string;
  storeId: string;
  periodKey: string;
  status: "NOT_CHECKED_IN" | "CHECKED_IN" | "CHECKED_OUT" | string;
  morningCheckSnapshot: unknown | null;
  checkOutSnapshot: unknown | null;
  checkInByName: string | null;
  checkedInAt: string | null;
  checkOutByName: string | null;
  checkedOutAt: string | null;
}

export interface InventoryDaySessionPreview {
  dateKey: string;
  session: InventoryDaySessionRecord | null;
  stockRisk: {
    negative: InventoryDaySessionProduct[];
    outOfStock: InventoryDaySessionProduct[];
    lowStock: InventoryDaySessionProduct[];
  };
  productionMaterials: Array<{
    source: "PINNED" | "AUTO";
    product: InventoryDaySessionProduct;
  }>;
  workspaceSafetyItems: Array<{ id: string; label: string }>;
  completion: InventoryDayCompletion;
  checkOutPreview?: InventoryCheckOutSnapshot;
}

export interface InventoryDayCompletion {
  dateKey: string;
  weekKey: string;
  isSaturday: boolean;
  tasks: Array<{ id: string; label: string; completed: boolean; required: boolean }>;
  blockers: string[];
}

export interface InventoryCheckOutSnapshot {
  checkedOutAt: string;
  note: string | null;
  exceptionNotes: Record<string, string>;
  completion: InventoryDayCompletion;
  stockRisk: InventoryDaySessionPreview["stockRisk"];
  movementSummary: {
    stockInQuantity: number;
    stockOutQuantity: number;
    internalUseQuantity: number;
    damagedQuantity: number;
    adjustmentQuantity: number;
    approvedLogCount: number;
    pendingRequestCount: number;
  };
  workflowSummary: {
    submittedInboundReceipts: number;
    needsRevisionReceipts: number;
    pendingSuratJalan: number;
    unmarkedSuratJalan: number;
    dailyChecklistRemaining: number;
    unverifiedOutLogs: number;
    damagedReportsPending: number;
  };
  morningCheckSnapshot: unknown | null;
}

export async function fetchInventoryDaySession(): Promise<InventoryDaySessionPreview> {
  const response = await fetch("/api/inventory-management/day-session", {
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Failed to load inventory day session");
  const body = (await response.json()) as { data: InventoryDaySessionPreview };
  return body.data;
}

export function checkInInventoryDay(input: {
  stockRiskAcknowledged: boolean;
  materialCounts: Array<{ productId: string; actualQuantity: number; note?: string | null }>;
  safetyChecks: Array<{ id: string; checked: boolean }>;
}) {
  return postInventoryManagement<InventoryDaySessionRecord>(
    "/api/inventory-management/day-session/check-in",
    input,
  );
}

export async function checkOutInventoryDay(input: {
  note?: string | null;
  exceptionNotes?: Record<string, string>;
}) {
  const response = await fetch("/api/inventory-management/day-session/check-out", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    data?: InventoryDaySessionRecord;
    message?: string;
    blockers?: string[];
    completion?: InventoryDayCompletion;
    missingExceptionTaskIds?: string[];
  };

  if (!response.ok) {
    const error = new Error(payload.message || "Failed to check out inventory day") as Error & {
      blockers?: string[];
      completion?: InventoryDayCompletion;
      missingExceptionTaskIds?: string[];
    };
    error.blockers = payload.blockers;
    error.completion = payload.completion;
    error.missingExceptionTaskIds = payload.missingExceptionTaskIds;
    throw error;
  }

  return payload.data as InventoryDaySessionRecord;
}

export async function fetchInventoryDaySessionHistory(): Promise<InventoryDaySessionRecord[]> {
  const response = await fetch("/api/inventory-management/day-session/history", {
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Failed to load inventory day session history");
  const body = (await response.json()) as { data: InventoryDaySessionRecord[] };
  return body.data;
}

export interface StockGroupBulkPreview {
  stockGroupId: string;
  displayName: string;
  baseUnit: string;
  type: "IN" | "OUT" | "ADJUSTMENT";
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

export type ProductFirstStockMode = "GROUP_STOCK" | "PRODUCT_ONLY";

export interface ProductFirstStockBulkRequestRow {
  productId: string;
  mode: ProductFirstStockMode;
  type: "IN" | "OUT" | "ADJUSTMENT";
  inputValue: number;
  note?: string | null;
}

export interface ProductOnlyStockPreview {
  id: string;
  productId: string;
  name: string;
  sku: string;
  unit: string;
  mode: "PRODUCT_ONLY";
  type: "IN" | "OUT" | "ADJUSTMENT";
  inputValue: number;
  beforeStock: number;
  afterStock: number;
  delta: number;
  note: string;
}

export interface ProductFirstStockGroupPreview extends StockGroupBulkPreview {
  mode: "GROUP_STOCK";
  productId: string;
  productName: string;
  stockGroupName: string;
}

export interface ProductFirstStockGroupBulkPreview {
  rows: Array<ProductFirstStockGroupPreview | ProductOnlyStockPreview>;
  bundledRows: ProductFirstStockGroupPreview[];
  standaloneRows: ProductOnlyStockPreview[];
}

type LegacyStockGroupBulkInput = {
  stockGroupId: string;
  type: "IN" | "OUT" | "ADJUSTMENT";
  stockInput: { mode: "BASE" } | { mode: "VARIANT"; variantProductId: string };
  inputValue: number;
  note?: string | null;
};

type ProductFirstStockGroupBulkInput = {
  rows: ProductFirstStockBulkRequestRow[];
};

export function previewStockGroupBulk(input: LegacyStockGroupBulkInput): Promise<StockGroupBulkPreview>;
export function previewStockGroupBulk(input: ProductFirstStockGroupBulkInput): Promise<ProductFirstStockGroupBulkPreview>;
export function previewStockGroupBulk(
  input: LegacyStockGroupBulkInput | ProductFirstStockGroupBulkInput,
) {
  return postInventoryManagement<StockGroupBulkPreview | ProductFirstStockGroupBulkPreview>(
    "/api/inventory-management/stock-group-bulk",
    { ...input, action: "preview" },
  );
}

export function submitStockGroupBulk(input: LegacyStockGroupBulkInput): Promise<{
    batchOperationId: string;
    status: "PENDING";
    preview: StockGroupBulkPreview;
  }>;
export function submitStockGroupBulk(input: ProductFirstStockGroupBulkInput): Promise<{
  bundleBatchOperationId: string | null;
  standaloneLogIds: string[];
  status: "PENDING";
  preview: ProductFirstStockGroupBulkPreview;
}>;
export function submitStockGroupBulk(
  input: LegacyStockGroupBulkInput | ProductFirstStockGroupBulkInput,
) {
  return postInventoryManagement("/api/inventory-management/stock-group-bulk", {
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
  submitImmediately?: boolean;
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
  productId: string;
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
  submittedBy: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  revisionReason: string | null;
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

export function updateAndSubmitInboundReceipt(
  id: string,
  input: {
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
) {
  return fetch(`/api/inventory-management/inbound-receipts/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }).then(async (response) => {
    const payload = (await response.json().catch(() => ({}))) as {
      data?: unknown;
      message?: string;
    };
    if (!response.ok) {
      throw new Error(payload.message || "Inventory management request failed");
    }
    return payload.data;
  });
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

export interface OutLogVerificationQueueItem {
  id: string;
  quantity: number;
  reason: string | null;
  note: string | null;
  person: string | null;
  createdAt: string;
  verificationState: OutLogVerificationState;
  product: {
    id: string;
    name: string;
    sku: string;
    unit: string;
    stock: number;
    imageUrl: string | null;
    category: { name: string; icon: string | null };
  };
  verification: {
    status: "UNVERIFIED" | "VERIFIED" | "MISMATCH";
    note?: string | null;
  } | null;
  latestCorrection: {
    id: string;
    status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
    correctedProductId: string;
    correctedQuantity: number;
    correctedReason: "USAGE" | "MANUAL_ADJUSTMENT";
    correctedNote: string | null;
    requestedBy: string;
    rejectionReason?: string | null;
    correctedProduct?: {
      id: string;
      name: string;
      sku: string;
      unit: string;
    };
  } | null;
}

export interface OutLogVerificationQueueResponse {
  data: {
    periodKey: string;
    items: OutLogVerificationQueueItem[];
  };
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export async function fetchOutLogVerificationQueue(input: {
  dateKey: string;
  page?: number;
}): Promise<OutLogVerificationQueueResponse> {
  const params = new URLSearchParams({ dateKey: input.dateKey });
  if (input.page) params.set("page", String(input.page));
  const response = await fetch(
    `/api/inventory-management/log-verifications?${params.toString()}`,
  );
  if (!response.ok) throw new Error("Gagal memuat antrean verifikasi Log OUT");
  return response.json() as Promise<OutLogVerificationQueueResponse>;
}

export function setOutLogVerificationStatus(
  inventoryLogId: string,
  status: "VERIFIED" | "MISMATCH",
) {
  return postInventoryManagement(
    "/api/inventory-management/log-verifications",
    { inventoryLogId, status },
  );
}

export function createOutLogCorrection(input: {
  inventoryLogId: string;
  correctedProductId: string;
  correctedQuantity: number;
  correctedReason: "USAGE" | "MANUAL_ADJUSTMENT";
  correctedNote: string;
}) {
  return postInventoryManagement(
    "/api/inventory-management/log-verifications",
    { action: "CREATE_CORRECTION", ...input },
  );
}

export function approveOutLogCorrection(correctionRequestId: string) {
  return postInventoryManagement(
    "/api/inventory-management/log-verifications",
    { action: "APPROVE_CORRECTION", correctionRequestId },
  );
}

export function rejectOutLogCorrection(
  correctionRequestId: string,
  reason: string,
) {
  return postInventoryManagement(
    "/api/inventory-management/log-verifications",
    { action: "REJECT_CORRECTION", correctionRequestId, reason },
  );
}
