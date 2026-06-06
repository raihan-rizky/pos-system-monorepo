import type { SupplierType } from "@/features/suppliers/types/supplier";

export type SupplierStockInRecapStatus = "APPROVED" | "REJECTED";

type DecimalLike = number | { toString: () => string } | null;

export type SupplierStockInRecapLog = {
  id: string;
  supplierId: string | null;
  supplier: { id: string; name: string; type: SupplierType } | null;
  productId: string;
  product: {
    id: string;
    name: string;
    sku: string;
    unit: string;
    category: { id: string; name: string } | null;
  };
  quantity: number;
  unitCost: DecimalLike;
  note: string | null;
  person: string | null;
  approverName: string | null;
  status: SupplierStockInRecapStatus;
  rejectionReason: string | null;
  createdAt: Date;
  decidedAt: Date | null;
};

export type SupplierStockInRecapBatchItem = {
  inventoryLogId: string | null;
  batchOperation: {
    id: string;
    createdAt: Date;
    summary: unknown;
  };
};

export type SupplierStockInRecapBundleItem = {
  id: string;
  status: SupplierStockInRecapStatus;
  product: SupplierStockInRecapLog["product"];
  quantity: number;
  unitCost: number | null;
  lineTotalCost: number | null;
  note: string | null;
  requesterName: string | null;
  approverName: string | null;
  rejectionReason: string | null;
  createdAt: string;
  decidedAt: string | null;
};

export type SupplierStockInRecapBundle = {
  id: string;
  kind: "BULK_BATCH" | "MANUAL_RESTOCK";
  batchOperationId: string | null;
  supplier: { id: string; name: string; type: SupplierType } | null;
  createdAt: string;
  decidedAt: string | null;
  requesterName: string | null;
  approverName: string | null;
  note: string | null;
  summary: {
    itemCount: number;
    approvedItemCount: number;
    rejectedItemCount: number;
    approvedQuantity: number;
    approvedTotalCost: number;
    hasPartialCost: boolean;
    missingCostCount: number;
  };
  items: SupplierStockInRecapBundleItem[];
};

type MutableSupplierStockInRecapBundle = Omit<
  SupplierStockInRecapBundle,
  "createdAt" | "decidedAt" | "items"
> & {
  createdAt: Date;
  decidedAt: Date | null;
  items: SupplierStockInRecapBundleItem[];
};

export function buildSupplierStockInRecapBundles(
  logs: SupplierStockInRecapLog[],
  batchItems: SupplierStockInRecapBatchItem[],
): SupplierStockInRecapBundle[] {
  const batchItemByLogId = new Map(
    batchItems
      .filter((item) => item.inventoryLogId)
      .map((item) => [item.inventoryLogId as string, item]),
  );
  const bundles = new Map<string, MutableSupplierStockInRecapBundle>();

  for (const log of logs) {
    const batchItem = batchItemByLogId.get(log.id) ?? null;
    const batch = batchItem?.batchOperation ?? null;
    const id = batch ? batch.id : `manual:${log.id}`;
    const current =
      bundles.get(id) ??
      createBundleShell({
        id,
        batch,
        log,
      });

    const unitCost = toNumberOrNull(log.unitCost);
    const lineTotalCost = unitCost === null ? null : unitCost * log.quantity;

    current.summary.itemCount += 1;
    if (log.status === "APPROVED") {
      current.summary.approvedItemCount += 1;
      current.summary.approvedQuantity += log.quantity;
      if (lineTotalCost === null) {
        current.summary.missingCostCount += 1;
        current.summary.hasPartialCost = true;
      } else {
        current.summary.approvedTotalCost += lineTotalCost;
      }
    } else {
      current.summary.rejectedItemCount += 1;
    }

    current.requesterName ??= log.person;
    current.approverName ??= log.approverName;
    if (isAfter(log.decidedAt, current.decidedAt)) {
      current.decidedAt = log.decidedAt;
    }

    current.items.push({
      id: log.id,
      status: log.status,
      product: log.product,
      quantity: log.quantity,
      unitCost,
      lineTotalCost,
      note: log.note,
      requesterName: log.person,
      approverName: log.approverName,
      rejectionReason: log.rejectionReason,
      createdAt: log.createdAt.toISOString(),
      decidedAt: log.decidedAt?.toISOString() ?? null,
    });

    bundles.set(id, current);
  }

  return Array.from(bundles.values())
    .filter((bundle) => bundle.summary.approvedItemCount > 0)
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .map((bundle) => ({
      ...bundle,
      createdAt: bundle.createdAt.toISOString(),
      decidedAt: bundle.decidedAt?.toISOString() ?? null,
      items: bundle.items.sort(
        (left, right) =>
          new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
      ),
    }));
}

function createBundleShell({
  id,
  batch,
  log,
}: {
  id: string;
  batch: SupplierStockInRecapBatchItem["batchOperation"] | null;
  log: SupplierStockInRecapLog;
}): MutableSupplierStockInRecapBundle {
  return {
    id,
    kind: batch ? "BULK_BATCH" : "MANUAL_RESTOCK",
    batchOperationId: batch?.id ?? null,
    supplier: log.supplier,
    createdAt: batch?.createdAt ?? log.createdAt,
    decidedAt: log.decidedAt,
    requesterName: log.person,
    approverName: log.approverName,
    note: readSummaryNote(batch?.summary) ?? log.note,
    summary: {
      itemCount: 0,
      approvedItemCount: 0,
      rejectedItemCount: 0,
      approvedQuantity: 0,
      approvedTotalCost: 0,
      hasPartialCost: false,
      missingCostCount: 0,
    },
    items: [],
  };
}

function readSummaryNote(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return null;
  const note = (value as { note?: unknown }).note;
  return typeof note === "string" && note.trim() ? note : null;
}

function toNumberOrNull(value: DecimalLike): number | null {
  if (value === null) return null;
  const numberValue =
    typeof value === "number" ? value : Number(value.toString());
  return Number.isFinite(numberValue) ? numberValue : null;
}

function isAfter(next: Date | null, current: Date | null): boolean {
  if (!next) return false;
  if (!current) return true;
  return next.getTime() > current.getTime();
}
