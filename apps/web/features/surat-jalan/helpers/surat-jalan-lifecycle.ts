import { getSuratJalanEligibility, getSuratJalanRemainingItems } from "./surat-jalan-core";
import type {
  SuratJalanItemRecord,
  SuratJalanRecord,
  SuratJalanStatus,
  SuratJalanTransactionItem,
} from "../types/surat-jalan";

export interface SuratJalanActor {
  id: string;
  name: string | null;
  role: string;
}

export interface SuratJalanCreationTransaction {
  id: string;
  status: string;
  stockManagedBySuratJalan: boolean;
  customerName: string | null;
  items: SuratJalanTransactionItem[];
}

export interface StockMovementPlan {
  productId: string;
  quantity: number;
  type: "IN" | "OUT";
  reason: "SALE" | "SALE_RETURN";
  note: string;
}

export interface SuratJalanCreationPlan {
  number: string;
  status: SuratJalanStatus;
  sequence: number;
  recipientName: string;
  requestedById: string;
  requestedByName: string | null;
  approvedById: string | null;
  approvedByName: string | null;
  confirmedAt: Date | null;
  shouldMarkTransactionManaged: boolean;
  invoiceReversalMovements: StockMovementPlan[];
  deliveryStockMovements: StockMovementPlan[];
  items: Omit<SuratJalanItemRecord, "id">[];
}

export function planSuratJalanCreation(input: {
  transaction: SuratJalanCreationTransaction;
  existingSuratJalan: SuratJalanRecord[];
  quantities: Record<string, number>;
  keterangan: Record<string, string>;
  recipientName: string;
  actor: SuratJalanActor;
  number: string;
  now: Date;
}): SuratJalanCreationPlan {
  const remainingItems = getSuratJalanRemainingItems({
    invoiceItems: input.transaction.items,
    suratJalan: input.existingSuratJalan,
  });
  const eligibility = getSuratJalanEligibility({
    status: input.transaction.status,
    items: input.transaction.items,
    remainingItems,
  });
  if (!eligibility.eligible) {
    throw new Error(eligibility.reason);
  }

  const sequence = input.existingSuratJalan.length + 1;
  const isFirstSuratJalan = sequence === 1;
  const status: SuratJalanStatus = isFirstSuratJalan ? "CONFIRMED" : "PENDING";
  const shouldReverseInvoice =
    isFirstSuratJalan && !input.transaction.stockManagedBySuratJalan;
  const remainingByTransactionItemId = new Map(
    remainingItems.map((item) => [item.transactionItemId, item]),
  );

  const selectedItems = input.transaction.items
    .filter((item) => item.productId)
    .map((item) => {
      const quantity = input.quantities[item.id] ?? 0;
      if (quantity <= 0) return null;
      const remaining = remainingByTransactionItemId.get(item.id);
      if (!remaining || quantity > remaining.remainingQuantity) {
        throw new Error("QUANTITY_EXCEEDS_REMAINING");
      }

      const stockBefore =
        status === "CONFIRMED"
          ? (item.currentStock ?? 0) +
            (shouldReverseInvoice ? item.quantity : 0)
          : null;
      const stockAfter =
        stockBefore === null ? null : stockBefore - quantity;
      if (stockAfter !== null && stockAfter < 0) {
        throw new Error("INSUFFICIENT_STOCK");
      }

      return {
        transactionItemId: item.id,
        productId: item.productId!,
        productName: item.productName,
        quantity,
        unit: item.unit,
        keterangan: input.keterangan[item.id] ?? "",
        stockBefore,
        stockAfter,
      };
    })
    .filter((item): item is Omit<SuratJalanItemRecord, "id"> =>
      Boolean(item),
    );

  if (selectedItems.length === 0) {
    throw new Error("QUANTITY_REQUIRED");
  }

  return {
    number: input.number,
    status,
    sequence,
    recipientName: input.recipientName || input.transaction.customerName || "",
    requestedById: input.actor.id,
    requestedByName: input.actor.name,
    approvedById: status === "CONFIRMED" ? input.actor.id : null,
    approvedByName: status === "CONFIRMED" ? input.actor.name : null,
    confirmedAt: status === "CONFIRMED" ? input.now : null,
    shouldMarkTransactionManaged: shouldReverseInvoice,
    invoiceReversalMovements: shouldReverseInvoice
      ? buildInvoiceReversalMovements(input)
      : [],
    deliveryStockMovements:
      status === "CONFIRMED"
        ? selectedItems.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            type: "OUT" as const,
            reason: "SALE" as const,
            note: `Surat Jalan ${input.number} untuk invoice ${input.transaction.id}`,
          }))
        : [],
    items: selectedItems,
  };
}

function buildInvoiceReversalMovements(input: {
  transaction: SuratJalanCreationTransaction;
  number: string;
}): StockMovementPlan[] {
  return input.transaction.items
    .filter((item) => item.productId)
    .map((item) => ({
      productId: item.productId!,
      quantity: item.quantity,
      type: "IN" as const,
      reason: "SALE_RETURN" as const,
      note: `Reversal invoice ${input.transaction.id} untuk Surat Jalan ${input.number}`,
    }));
}
