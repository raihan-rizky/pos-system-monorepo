import type {
  SuratJalanEligibilityReason,
  SuratJalanProgress,
  SuratJalanRecord,
  SuratJalanRemainingItem,
  SuratJalanStockImpactPreview,
  SuratJalanTransactionItem,
} from "../types/surat-jalan";

const ELIGIBLE_STATUSES = new Set(["COMPLETED", "DP"]);

export function getSuratJalanEligibility(input: {
  status: string;
  items: ReadonlyArray<SuratJalanTransactionItem>;
  remainingItems?: ReadonlyArray<SuratJalanRemainingItem>;
}): { eligible: true; reason: null } | {
  eligible: false;
  reason: SuratJalanEligibilityReason;
} {
  if (!ELIGIBLE_STATUSES.has(input.status)) {
    return { eligible: false, reason: "STATUS_NOT_ELIGIBLE" };
  }
  if (input.items.some((item) => item.printingServiceId)) {
    return { eligible: false, reason: "PRINTING_SERVICE_NOT_ELIGIBLE" };
  }
  if (!input.items.some((item) => item.productId)) {
    return { eligible: false, reason: "NO_PRODUCT_LINES" };
  }
  if (
    input.remainingItems &&
    input.remainingItems.every((item) => item.remainingQuantity <= 0)
  ) {
    return { eligible: false, reason: "FULLY_DELIVERED" };
  }
  return { eligible: true, reason: null };
}

export function getSuratJalanRemainingItems(input: {
  invoiceItems: ReadonlyArray<SuratJalanTransactionItem>;
  suratJalan: ReadonlyArray<SuratJalanRecord>;
}): SuratJalanRemainingItem[] {
  return input.invoiceItems
    .filter((item) => item.productId)
    .map((item) => {
      const quantities = input.suratJalan.flatMap((suratJalan) =>
        suratJalan.items
          .filter((sjItem) => sjItem.transactionItemId === item.id)
          .map((sjItem) => ({
            quantity: sjItem.quantity,
            status: suratJalan.status,
          })),
      );
      const deliveredQuantity = quantities
        .filter((quantity) => quantity.status === "CONFIRMED")
        .reduce((sum, quantity) => sum + quantity.quantity, 0);
      const pendingQuantity = quantities
        .filter((quantity) => quantity.status === "PENDING")
        .reduce((sum, quantity) => sum + quantity.quantity, 0);

      return {
        transactionItemId: item.id,
        productId: item.productId!,
        productName: item.productName,
        unit: item.unit,
        currentStock: item.currentStock,
        invoiceQuantity: item.quantity,
        deliveredQuantity,
        pendingQuantity,
        remainingQuantity: Math.max(0, item.quantity - deliveredQuantity),
      };
    });
}

export function calculateSuratJalanProgress(input: {
  invoiceItems: ReadonlyArray<SuratJalanTransactionItem>;
  suratJalan: ReadonlyArray<SuratJalanRecord>;
}): SuratJalanProgress {
  const remainingItems = getSuratJalanRemainingItems(input);
  const totalQuantity = remainingItems.reduce(
    (sum, item) => sum + item.invoiceQuantity,
    0,
  );
  const deliveredQuantity = remainingItems.reduce(
    (sum, item) => sum + item.deliveredQuantity,
    0,
  );
  const pendingQuantity = remainingItems.reduce(
    (sum, item) => sum + item.pendingQuantity,
    0,
  );
  const remainingQuantity = Math.max(0, totalQuantity - deliveredQuantity);

  return {
    totalQuantity,
    deliveredQuantity,
    pendingQuantity,
    remainingQuantity,
    status: resolveProgressStatus({
      totalQuantity,
      deliveredQuantity,
      pendingQuantity,
    }),
  };
}

export function previewSuratJalanStockImpact(input: {
  items: ReadonlyArray<SuratJalanTransactionItem>;
  quantities: Record<string, number>;
  /** When true, first SJ: API restores invoice qty to stock before deducting delivery qty */
  addInvoiceQtyToFirstSj?: boolean;
}): SuratJalanStockImpactPreview[] {
  return input.items
    .filter((item) => item.productId && item.currentStock !== null)
    .map((item) => {
      const requestedQuantity = input.quantities[item.id] ?? 0;
      const currentStock = item.currentStock ?? 0;
      // First SJ reverses invoice qty to stock first: effective stock = current + invoiceQty
      const effectiveStock = input.addInvoiceQtyToFirstSj
        ? currentStock + item.quantity
        : currentStock;
      const afterStock = effectiveStock - requestedQuantity;
      return {
        transactionItemId: item.id,
        productId: item.productId!,
        productName: item.productName,
        currentStock,
        requestedQuantity,
        afterStock,
        isInsufficientStock: afterStock < 0,
      };
    });
}

export function buildSuratJalanNumber(date: Date, sequence: number): string {
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const year = String(date.getUTCFullYear());
  return `TLD-${day}${month}${year}-${String(sequence).padStart(3, "0")}`;
}

function resolveProgressStatus(input: {
  totalQuantity: number;
  deliveredQuantity: number;
  pendingQuantity: number;
}): SuratJalanProgress["status"] {
  if (input.totalQuantity === 0 || input.deliveredQuantity === 0) {
    return input.pendingQuantity > 0 ? "PENDING_APPROVAL" : "NONE";
  }
  if (input.deliveredQuantity >= input.totalQuantity) {
    return "COMPLETE";
  }
  if (input.pendingQuantity > 0) {
    return "PENDING_APPROVAL";
  }
  return "IN_PROGRESS";
}
