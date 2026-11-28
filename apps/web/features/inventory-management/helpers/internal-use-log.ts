import type { Prisma } from "@pos/db";

export const PRODUCT_ONLY_STOCK_NOTE = "Mode: Stok Produk Ini - stok grup tidak diubah";

export const cancelledInternalUseLogWhere = {
  type: "OUT",
  reason: "USAGE",
  correctionRequests: { some: { status: "APPROVED", correctedQuantity: 0 } },
} satisfies Prisma.InventoryLogWhereInput;

export function isIndividualInternalUseLog(log: {
  type: string;
  reason: string | null;
  note: string | null;
  batchItem?: unknown;
  transactionId?: string | null;
  sourceTransactionRef?: string | null;
  suratJalanId?: string | null;
}) {
  return log.type === "OUT" && log.reason === "USAGE" &&
    !log.batchItem && !log.transactionId && !log.sourceTransactionRef && !log.suratJalanId &&
    !log.note?.includes(PRODUCT_ONLY_STOCK_NOTE);
}

export const internalUseCorrectionOrder = [
  { createdAt: "desc" },
  { id: "desc" },
] satisfies Prisma.InventoryLogCorrectionRequestOrderByWithRelationInput[];

export const internalUseCorrectionFields = {
  id: true,
  status: true,
  correctedProductId: true,
  correctedQuantity: true,
  correctedReason: true,
  correctedNote: true,
  movements: {
    where: { kind: "REPLACEMENT" },
    select: { inventoryLog: { select: { unitCost: true } } },
  },
} satisfies Prisma.InventoryLogCorrectionRequestSelect;

export type InternalUseStock = {
  productId: string;
  quantity: number;
  unitCost: Prisma.Decimal | number | string | null;
};

export type InternalUseCorrection = {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  correctedProductId: string;
  correctedQuantity: number;
  correctedReason: string;
  correctedNote: string | null;
  movements: readonly { inventoryLog: { unitCost: InternalUseStock["unitCost"] } }[];
};

/** Corrections are ordered newest first. Only approved changes move stock. */
export function resolveEffectiveInternalUse<T extends InternalUseCorrection>(
  source: InternalUseStock & { note: string | null },
  corrections: readonly T[],
) {
  const approved = corrections.filter((correction) => correction.status === "APPROVED");
  const latest = approved[0] ?? null;
  if (!latest) {
    return {
      productId: source.productId,
      quantity: Math.abs(source.quantity),
      unitCost: source.unitCost,
      note: source.note,
      correction: null,
    };
  }

  let unitCost = latest.correctedProductId === source.productId ? source.unitCost : null;
  for (const correction of approved) {
    if (correction.correctedProductId !== latest.correctedProductId) break;
    const replacement = correction.movements[0];
    if (replacement) {
      unitCost = replacement.inventoryLog.unitCost;
      break;
    }
  }

  return {
    productId: latest.correctedProductId,
    quantity: latest.correctedQuantity,
    note: latest.correctedNote,
    unitCost,
    correction: latest,
  };
}
