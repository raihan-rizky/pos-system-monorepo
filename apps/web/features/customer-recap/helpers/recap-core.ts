import {
  bucketKeyForDate,
  pickGranularity,
  type TrendBucketGranularity,
} from "@/features/financial-report/helpers/report-core";

type DecimalLike = { toString: () => string };
type NullableNumber = number | string | DecimalLike | null | undefined;

export type CustomerRecapCustomerType = "UMUM" | "AGEN" | "INDUSTRI" | "PEMERINTAH";
export type CustomerRecapPreset = "month" | "30d" | "90d" | "year";

export interface CustomerRecapCustomer {
  id: string;
  name: string;
  type: CustomerRecapCustomerType;
  totalDebt: NullableNumber;
  createdAt: Date;
  lastVisitAt: Date | null;
}

export interface CustomerRecapTransactionItem {
  productId?: string | null;
  productName: string;
  quantity: NullableNumber;
  subtotal: NullableNumber;
}

export interface CustomerRecapTransaction {
  id: string;
  customerId: string | null;
  createdAt: Date;
  status: string;
  total: NullableNumber;
  items: CustomerRecapTransactionItem[];
}

export interface CustomerRecapDebtPaymentLog {
  customerId: string;
  amount: NullableNumber;
  createdAt: Date;
}

export interface BuildCustomerRecapInput {
  dateFrom: string;
  dateTo: string;
  customers: CustomerRecapCustomer[];
  transactions: CustomerRecapTransaction[];
  debtPaymentLogs: CustomerRecapDebtPaymentLog[];
}

export interface BuildCustomerDetailRecapInput {
  customer: CustomerRecapCustomer;
  dateFrom: string;
  dateTo: string;
  transactions: CustomerRecapTransaction[];
  debtPaymentLogs: CustomerRecapDebtPaymentLog[];
}

const CONFIRMED_STATUSES = new Set(["COMPLETED", "DP"]);

function toNumber(value: NullableNumber): number {
  const parsed =
    typeof value === "object" && value !== null
      ? Number(value.toString())
      : typeof value === "string"
        ? Number(value)
        : value;
  return Number.isFinite(parsed) ? Number(parsed) : 0;
}

function addDays(dateKeyValue: string, days: number): string {
  const date = new Date(`${dateKeyValue}T00:00:00+07:00`);
  date.setUTCDate(date.getUTCDate() + days);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function jakartaDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function buildCustomerRecapRange(
  preset: CustomerRecapPreset = "month",
  now = new Date(),
) {
  const today = jakartaDateKey(now);

  if (preset === "30d") {
    return { dateFrom: addDays(today, -29), dateTo: today };
  }

  if (preset === "90d") {
    return { dateFrom: addDays(today, -89), dateTo: today };
  }

  if (preset === "year") {
    return { dateFrom: `${today.slice(0, 4)}-01-01`, dateTo: today };
  }

  return { dateFrom: `${today.slice(0, 8)}01`, dateTo: today };
}

function rangeDays(dateFrom: string, dateTo: string): number {
  const from = new Date(`${dateFrom}T00:00:00+07:00`);
  const to = new Date(`${dateTo}T00:00:00+07:00`);
  return Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
}

function isInPeriod(date: Date | null, dateFrom: string, dateTo: string): boolean {
  if (!date) return false;
  const key = bucketKeyForDate(date, "daily");
  return key >= dateFrom && key <= dateTo;
}

function bucketLabel(bucketKey: string, granularity: TrendBucketGranularity): string {
  if (granularity === "monthly") return bucketKey;
  return bucketKey;
}

function generateTrendPoints(dateFrom: string, dateTo: string) {
  const granularity = pickGranularity(rangeDays(dateFrom, dateTo));
  const seen = new Set<string>();
  const points: Array<{
    bucketKey: string;
    label: string;
    revenue: number;
    orderCount: number;
  }> = [];
  let cursor = dateFrom;
  while (cursor <= dateTo) {
    const key = bucketKeyForDate(new Date(`${cursor}T12:00:00+07:00`), granularity);
    if (!seen.has(key)) {
      seen.add(key);
      points.push({
        bucketKey: key,
        label: bucketLabel(key, granularity),
        revenue: 0,
        orderCount: 0,
      });
    }
    cursor = addDays(cursor, 1);
  }
  return { granularity, points };
}

export function buildCustomerRecap(input: BuildCustomerRecapInput) {
  const customerById = new Map(input.customers.map((customer) => [customer.id, customer]));
  const confirmedTransactions = input.transactions.filter((transaction) =>
    CONFIRMED_STATUSES.has(transaction.status),
  );
  const activeCustomerIds = new Set<string>();
  const orderCountByCustomer = new Map<string, number>();
  const revenueByCustomer = new Map<string, number>();
  const { granularity, points } = generateTrendPoints(input.dateFrom, input.dateTo);
  const trendByKey = new Map(points.map((point) => [point.bucketKey, point]));

  let totalRevenue = 0;
  for (const transaction of confirmedTransactions) {
    if (!transaction.customerId || !customerById.has(transaction.customerId)) continue;
    const total = toNumber(transaction.total);
    totalRevenue += total;
    activeCustomerIds.add(transaction.customerId);
    orderCountByCustomer.set(
      transaction.customerId,
      (orderCountByCustomer.get(transaction.customerId) ?? 0) + 1,
    );
    revenueByCustomer.set(
      transaction.customerId,
      (revenueByCustomer.get(transaction.customerId) ?? 0) + total,
    );

    const trendPoint = trendByKey.get(bucketKeyForDate(transaction.createdAt, granularity));
    if (trendPoint) {
      trendPoint.revenue += total;
      trendPoint.orderCount += 1;
    }
  }

  const churnCutoff = addDays(input.dateTo, -60);
  const returningCustomers = input.customers.filter(
    (customer) =>
      isInPeriod(customer.lastVisitAt, input.dateFrom, input.dateTo) &&
      bucketKeyForDate(customer.createdAt, "daily") < input.dateFrom,
  ).length;
  const churnedCustomers = input.customers.filter(
    (customer) =>
      bucketKeyForDate(customer.createdAt, "daily") < input.dateFrom &&
      (!customer.lastVisitAt || bucketKeyForDate(customer.lastVisitAt, "daily") < churnCutoff),
  ).length;
  const repeatCustomerCount = [...orderCountByCustomer.values()].filter(
    (orderCount) => orderCount >= 2,
  ).length;

  const byType = input.customers
    .map((customer) => customer.type)
    .filter((type, index, all) => all.indexOf(type) === index)
    .sort()
    .map((type) => {
      const customers = input.customers.filter((customer) => customer.type === type);
      return {
        type,
        customerCount: customers.length,
        revenue: customers.reduce(
          (sum, customer) => sum + (revenueByCustomer.get(customer.id) ?? 0),
          0,
        ),
        debtAmount: customers.reduce(
          (sum, customer) => sum + Math.max(0, toNumber(customer.totalDebt)),
          0,
        ),
      };
    });

  const topSpenders = [...revenueByCustomer.entries()]
    .map(([customerId, spentInPeriod]) => {
      const customer = customerById.get(customerId)!;
      return {
        id: customer.id,
        name: customer.name,
        type: customer.type,
        spentInPeriod,
        orderCount: orderCountByCustomer.get(customer.id) ?? 0,
        lastVisitAt: customer.lastVisitAt?.toISOString() ?? null,
      };
    })
    .sort((a, b) => b.spentInPeriod - a.spentInPeriod)
    .slice(0, 5);

  return {
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    summary: {
      newCustomers: input.customers.filter((customer) =>
        isInPeriod(customer.createdAt, input.dateFrom, input.dateTo),
      ).length,
      returningCustomers,
      churnedCustomers,
      totalDebtOutstanding: input.customers.reduce(
        (sum, customer) => sum + Math.max(0, toNumber(customer.totalDebt)),
        0,
      ),
      debtCollectedInPeriod: input.debtPaymentLogs.reduce(
        (sum, log) =>
          isInPeriod(log.createdAt, input.dateFrom, input.dateTo)
            ? sum + toNumber(log.amount)
            : sum,
        0,
      ),
      avgOrderValue:
        confirmedTransactions.length > 0 ? totalRevenue / confirmedTransactions.length : 0,
      orderFrequency:
        activeCustomerIds.size > 0 ? confirmedTransactions.length / activeCustomerIds.size : 0,
      repeatPurchaseRate:
        activeCustomerIds.size > 0 ? repeatCustomerCount / activeCustomerIds.size : 0,
    },
    byType,
    topSpenders,
    trend: {
      granularity,
      points,
    },
  };
}

export function buildCustomerDetailRecap(input: BuildCustomerDetailRecapInput) {
  const confirmedTransactions = input.transactions.filter(
    (transaction) =>
      transaction.customerId === input.customer.id &&
      CONFIRMED_STATUSES.has(transaction.status),
  );
  const { granularity, points } = generateTrendPoints(input.dateFrom, input.dateTo);
  const detailPoints = points.map((point) => ({
    bucketKey: point.bucketKey,
    label: point.label,
    spent: 0,
    orderCount: 0,
  }));
  const trendByKey = new Map(detailPoints.map((point) => [point.bucketKey, point]));
  const productByKey = new Map<
    string,
    {
      productId: string | null;
      productName: string;
      quantity: number;
      subtotal: number;
    }
  >();

  let totalSpent = 0;
  for (const transaction of confirmedTransactions) {
    const total = toNumber(transaction.total);
    totalSpent += total;

    const trendPoint = trendByKey.get(bucketKeyForDate(transaction.createdAt, granularity));
    if (trendPoint) {
      trendPoint.spent += total;
      trendPoint.orderCount += 1;
    }

    for (const item of transaction.items) {
      const key = item.productId || item.productName;
      const product = productByKey.get(key) ?? {
        productId: item.productId ?? null,
        productName: item.productName,
        quantity: 0,
        subtotal: 0,
      };
      product.quantity += toNumber(item.quantity);
      product.subtotal += toNumber(item.subtotal);
      productByKey.set(key, product);
    }
  }

  const debtPaidInPeriod = input.debtPaymentLogs.reduce(
    (sum, log) =>
      log.customerId === input.customer.id &&
      isInPeriod(log.createdAt, input.dateFrom, input.dateTo)
        ? sum + toNumber(log.amount)
        : sum,
    0,
  );

  return {
    id: input.customer.id,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    summary: {
      totalSpent,
      totalOrders: confirmedTransactions.length,
      avgOrderValue:
        confirmedTransactions.length > 0
          ? totalSpent / confirmedTransactions.length
          : 0,
      debtRemaining: Math.max(0, toNumber(input.customer.totalDebt)),
      debtPaidInPeriod,
    },
    trend: {
      granularity,
      points: detailPoints,
    },
    topProducts: [...productByKey.values()]
      .sort((a, b) => b.subtotal - a.subtotal)
      .slice(0, 5),
  };
}
