/**
 * Revenue/profit bucketing for the dashboard.
 *
 * This used to run inline in app/api/dashboard/route.ts over every transaction
 * in the month *with every line item attached* — roughly 30k item rows fetched
 * every 30 s just to produce a dozen numbers. The per-transaction profit sum is
 * now done in SQL; everything that decides which bucket a transaction lands in
 * stays here, in one place, under test.
 *
 * Known quirk, preserved deliberately: the today/month boundaries come from the
 * server's local timezone while the chart buckets by Asia/Jakarta business date.
 * On a UTC host those disagree for late-evening Jakarta transactions. Changing
 * it would move reported revenue, so it is left as-is and called out rather than
 * fixed in passing.
 */

const jakartaDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jakarta",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const jakartaWeekdayFormatter = new Intl.DateTimeFormat("id-ID", {
  weekday: "short",
  timeZone: "Asia/Jakarta",
});

export function jakartaDateKey(date: Date) {
  return jakartaDateFormatter.format(date);
}

/** A Decimal, a number, or anything else the driver hands back for numerics. */
type Numeric = unknown;

export type DashboardRevenueRow = {
  invoiceDate: Date;
  status: string;
  total: Numeric;
  amountPaid: Numeric;
  paymentMethod: string;
  /** Sum of (subtotal - unitCost * quantity) over items with a known unitCost. */
  profit: Numeric;
};

export type DashboardRevenueChartPoint = {
  name: string;
  date: string;
  revenue: number;
  profit: number;
};

export type DashboardPaymentMixEntry = {
  method: string;
  revenue: number;
  transactionCount: number;
};

export type DashboardRevenueBuckets = {
  todayRevenue: number;
  todayProfit: number;
  monthlyRevenue: number;
  monthlyProfit: number;
  revenueChart: DashboardRevenueChartPoint[];
  paymentMixToday: DashboardPaymentMixEntry[];
};

export type DashboardRevenueBounds = {
  now: Date;
  todayStart: Date;
  monthStart: Date;
};

/** Prisma returns Decimal instances; the raw driver may return strings. */
function toNumber(value: Numeric): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  const parsed = Number(
    typeof value === "string" ? value : (value as { toString(): string }).toString(),
  );
  return Number.isFinite(parsed) ? parsed : 0;
}

export const REVENUE_CHART_DAYS = 7;

export function buildDashboardRevenueBuckets(
  rows: DashboardRevenueRow[],
  { now, todayStart, monthStart }: DashboardRevenueBounds,
): DashboardRevenueBuckets {
  let todayRevenue = 0;
  let todayProfit = 0;
  let monthlyRevenue = 0;
  let monthlyProfit = 0;

  // Seed the window so days with no sales still render as zero.
  const dailyData: Record<string, { revenue: number; profit: number }> = {};
  for (let i = 0; i < REVENUE_CHART_DAYS; i++) {
    const day = new Date(now);
    day.setDate(day.getDate() - i);
    dailyData[jakartaDateKey(day)] = { revenue: 0, profit: 0 };
  }

  const paymentMix = new Map<string, { revenue: number; txCount: number }>();

  const todayStartTime = todayStart.getTime();
  const monthStartTime = monthStart.getTime();

  for (const transaction of rows) {
    const revenue =
      transaction.status === "DP"
        ? toNumber(transaction.amountPaid)
        : toNumber(transaction.total);
    const profit = toNumber(transaction.profit);
    const invoiceTime = transaction.invoiceDate.getTime();

    if (invoiceTime >= monthStartTime) {
      monthlyRevenue += revenue;
      monthlyProfit += profit;
    }

    if (invoiceTime >= todayStartTime) {
      todayRevenue += revenue;
      todayProfit += profit;

      const entry = paymentMix.get(transaction.paymentMethod) ?? {
        revenue: 0,
        txCount: 0,
      };
      entry.revenue += revenue;
      entry.txCount += 1;
      paymentMix.set(transaction.paymentMethod, entry);
    }

    const bucket = dailyData[jakartaDateKey(transaction.invoiceDate)];
    if (bucket) {
      bucket.revenue += revenue;
      bucket.profit += profit;
    }
  }

  const revenueChart = Object.entries(dailyData)
    .map(([date, data]) => ({
      name: jakartaWeekdayFormatter.format(new Date(`${date}T00:00:00+07:00`)),
      date,
      ...data,
    }))
    .reverse();

  const paymentMixToday = Array.from(paymentMix.entries()).map(([method, data]) => ({
    method,
    revenue: data.revenue,
    transactionCount: data.txCount,
  }));

  return {
    todayRevenue,
    todayProfit,
    monthlyRevenue,
    monthlyProfit,
    revenueChart,
    paymentMixToday,
  };
}
