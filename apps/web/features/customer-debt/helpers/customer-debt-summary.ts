import type { PrismaClient } from "@pos/db";

export interface CustomerDebtIdentity {
  id: string;
  name: string;
}

export interface CustomerDebtTransaction {
  customerId: string | null;
  customerName: string | null;
  total: unknown;
  amountPaid: unknown;
}

interface ActiveCustomerDebtTransaction extends CustomerDebtTransaction {
  status: string;
  paymentMethod: string;
}

export function normalizeCustomerDebtName(name: string | null | undefined): string {
  return (name ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value) || 0;
  if (value && typeof value === "object" && "toString" in value) {
    return Number(value.toString()) || 0;
  }
  return 0;
}

export function summarizeDebtByCustomer(
  customers: ReadonlyArray<CustomerDebtIdentity>,
  transactions: ReadonlyArray<CustomerDebtTransaction>,
): Map<string, number> {
  const customerIdByName = new Map<string, string>();
  customers.forEach((customer) => {
    const normalized = normalizeCustomerDebtName(customer.name);
    if (normalized && !customerIdByName.has(normalized)) {
      customerIdByName.set(normalized, customer.id);
    }
  });

  const debtByCustomerId = new Map<string, number>();
  transactions.forEach((transaction) => {
    const remaining = Math.max(
      0,
      toNumber(transaction.total) - toNumber(transaction.amountPaid),
    );
    if (remaining <= 0) return;

    const customerId =
      transaction.customerId ??
      customerIdByName.get(normalizeCustomerDebtName(transaction.customerName));
    if (!customerId) return;

    debtByCustomerId.set(
      customerId,
      (debtByCustomerId.get(customerId) ?? 0) + remaining,
    );
  });

  return debtByCustomerId;
}

export function summarizeActiveCustomerDebtByCustomer(
  customers: ReadonlyArray<CustomerDebtIdentity>,
  transactions: ReadonlyArray<ActiveCustomerDebtTransaction>,
): Map<string, number> {
  const customerIdByName = new Map<string, string>();
  customers.forEach((customer) => {
    const normalized = normalizeCustomerDebtName(customer.name);
    if (normalized && !customerIdByName.has(normalized)) {
      customerIdByName.set(normalized, customer.id);
    }
  });

  const debtByCustomerId = new Map<string, number>();
  transactions.forEach((transaction) => {
    const isActiveDp = transaction.status === "DP";
    const isActiveTempo =
      transaction.status === "COMPLETED" && transaction.paymentMethod === "TEMPO";
    if (!isActiveDp && !isActiveTempo) return;

    const total = toNumber(transaction.total);
    const amountPaid = toNumber(transaction.amountPaid);
    if (!Number.isFinite(total) || !Number.isFinite(amountPaid)) return;
    const remaining = Math.max(0, total - amountPaid);
    if (remaining <= 0) return;

    const customerId =
      transaction.customerId ??
      customerIdByName.get(normalizeCustomerDebtName(transaction.customerName));
    if (!customerId) return;

    debtByCustomerId.set(
      customerId,
      (debtByCustomerId.get(customerId) ?? 0) + remaining,
    );
  });

  return debtByCustomerId;
}

export async function loadCustomerDebtByActiveDp(
  db: PrismaClient,
  input: {
    storeId: string;
    customers: ReadonlyArray<CustomerDebtIdentity>;
  },
): Promise<Map<string, number>> {
  if (input.customers.length === 0) return new Map();

  const ids = input.customers.map((customer) => customer.id);
  const nameFilters = input.customers
    .map((customer) => customer.name.trim())
    .filter((name) => name.length > 0)
    .map((name) => ({
      customerId: null,
      customerName: { equals: name, mode: "insensitive" as const },
    }));

  const transactions = await db.transaction.findMany({
    where: {
      storeId: input.storeId,
      AND: [
        {
          OR: [
            { status: "DP" },
            { status: "COMPLETED", paymentMethod: "TEMPO" },
          ],
        },
        {
          OR: [
            { customerId: { in: ids } },
            ...nameFilters,
          ],
        },
      ],
    },
    select: {
      customerId: true,
      customerName: true,
      total: true,
      amountPaid: true,
      status: true,
      paymentMethod: true,
    },
  });

  const debt = summarizeActiveCustomerDebtByCustomer(input.customers, transactions);
  const receivables = await db.customerReceivable.findMany({
    where: { storeId: input.storeId, customerId: { in: ids } },
    select: { customerId: true, amount: true, amountPaid: true },
  });
  for (const receivable of receivables) {
    const remaining = Math.max(0, toNumber(receivable.amount) - toNumber(receivable.amountPaid));
    debt.set(receivable.customerId, (debt.get(receivable.customerId) ?? 0) + remaining);
  }
  return debt;
}

export function applyComputedCustomerDebt<
  T extends CustomerDebtIdentity & { totalDebt: unknown },
>(customers: ReadonlyArray<T>, debtByCustomerId: Map<string, number>): T[] {
  return customers.map((customer) => ({
    ...customer,
    totalDebt: debtByCustomerId.get(customer.id) ?? 0,
  }));
}
