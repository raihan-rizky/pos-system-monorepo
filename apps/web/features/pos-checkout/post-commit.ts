/**
 * Pure helpers for the post-commit side effects of a POS checkout:
 *   - inventory log rows for the OUT entries
 *   - customer analytics update arguments
 *
 * Both are executed AFTER the response is sent (via Next's `after()`) so
 * they don't add latency to the cashier's invoice. Keeping the shape
 * builders pure makes them trivially unit-testable.
 */

export interface CheckoutItem {
  productId: string;
  name: string;
  size: string | null;
  material: string | null;
  price: number;
  costPrice: number | null;
  quantity: number;
}

export interface InventoryLogRow {
  productId: string;
  type: "OUT";
  reason: "SALE";
  quantity: number;
  unitCost: number | null;
  note: string;
  createdBy: string;
  person: string | null;
}

export interface BuildInventoryLogRowsInput {
  items: ReadonlyArray<CheckoutItem>;
  invoiceNumber: string;
  userId: string;
  userName: string | null;
}

export function buildInventoryLogRows(
  input: BuildInventoryLogRowsInput,
): InventoryLogRow[] {
  return input.items.map((item) => ({
    productId: item.productId,
    type: "OUT" as const,
    reason: "SALE" as const,
    quantity: item.quantity,
    unitCost: item.costPrice ?? null,
    note: `Penjualan ${input.invoiceNumber}`,
    createdBy: input.userId,
    person: input.userName ?? null,
  }));
}

export interface CustomerUpdateArgs {
  where: { id: string };
  data: {
    totalSpent: { increment: number };
    totalOrders: { increment: number };
    totalDebt?: { increment: number };
    lastVisitAt: Date;
  };
}

export interface BuildCustomerUpdateArgsInput {
  customerId: string | null;
  isDP: boolean;
  total: number;
  amountPaid: number;
}

export function buildCustomerUpdateArgs(
  input: BuildCustomerUpdateArgsInput,
): CustomerUpdateArgs | null {
  if (!input.customerId) return null;

  const debtIncrement = input.isDP
    ? Math.max(0, input.total - input.amountPaid)
    : 0;

  return {
    where: { id: input.customerId },
    data: {
      totalSpent: { increment: input.amountPaid },
      totalOrders: { increment: 1 },
      ...(debtIncrement > 0
        ? { totalDebt: { increment: debtIncrement } }
        : {}),
      lastVisitAt: new Date(),
    },
  };
}
