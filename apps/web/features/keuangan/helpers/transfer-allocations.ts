import { isManualExpenseReportCategory, type ManualExpenseReportCategory } from "./manual-report-categories";
import { validDate } from "./supplier-payable-input";

export type TransferAllocationInput = {
  storeId: string;
  transfer: {
    id: string;
    storeId: string;
    date: string;
    amountCents: number;
    category: ManualExpenseReportCategory | null;
  };
  allocations: Array<{
    paymentId: string;
    payableId: string;
    storeId: string;
    paidAt: string;
    amountCents: number;
    paymentAmountCents: number;
    category: ManualExpenseReportCategory | null;
  }>;
};

export type TransferAllocationResult = {
  totalCents: number;
  allocatedCents: number;
  unallocatedCents: number;
  segments: Array<{ paymentId: string | null; category: ManualExpenseReportCategory | null; amountCents: number }>;
};

function validCents(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0 && value <= 999_999_999_999;
}

export function allocateTransfer(input: TransferAllocationInput): TransferAllocationResult {
  const { storeId, transfer, allocations } = input;
  if (!storeId || !transfer.id || transfer.storeId !== storeId || !validDate(transfer.date)
    || !validCents(transfer.amountCents)
    || (transfer.category !== null && !isManualExpenseReportCategory(transfer.category))) {
    throw new Error("Data transfer tidak valid.");
  }

  const seen = new Set<string>();
  let allocatedCents = 0;
  const segments: TransferAllocationResult["segments"] = allocations.map((allocation) => {
    if (!allocation.paymentId || !allocation.payableId || allocation.storeId !== storeId
      || seen.has(allocation.paymentId) || allocation.paidAt !== transfer.date
      || !validCents(allocation.amountCents) || !validCents(allocation.paymentAmountCents)
      || allocation.amountCents > allocation.paymentAmountCents
      || (allocation.category !== null && !isManualExpenseReportCategory(allocation.category))) {
      throw new Error("Alokasi transfer tidak valid.");
    }
    seen.add(allocation.paymentId);
    allocatedCents += allocation.amountCents;
    if (!Number.isSafeInteger(allocatedCents) || allocatedCents > transfer.amountCents) {
      throw new Error("Jumlah alokasi melebihi transfer.");
    }
    return { paymentId: allocation.paymentId, category: allocation.category, amountCents: allocation.amountCents };
  });

  const unallocatedCents = transfer.amountCents - allocatedCents;
  if (unallocatedCents > 0) {
    segments.push({ paymentId: null, category: transfer.category, amountCents: unallocatedCents });
  }
  return { totalCents: transfer.amountCents, allocatedCents, unallocatedCents, segments };
}
