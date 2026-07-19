type NullableNumber = number | string | null | undefined;

export type FinancialReportPreset = "today" | "7d" | "30d" | "month";

export type FinancialReportTransaction = {
  id: string;
  invoiceNumber: string | null;
  createdAt: Date;
  status: string;
  paymentMethod: string;
  total: NullableNumber;
  amountPaid: NullableNumber;
  discount: NullableNumber;
  salesName?: string | null;
  salesperson?: { name?: string | null } | null;
  items: Array<{
    productId?: string | null;
    productName: string;
    quantity: NullableNumber;
    subtotal: NullableNumber;
    unitCost: NullableNumber;
    product?: { category?: { name?: string | null } | null } | null;
  }>;
};

export type FinancialReportShift = {
  id: string;
  cashier?: { name?: string | null } | null;
  openedAt: Date;
  closedAt?: Date | null;
  openingBalance: NullableNumber;
  expectedBalance?: NullableNumber;
  closingBalance?: NullableNumber;
  discrepancy?: NullableNumber;
  status: string;
};

export type FinancialReport = ReturnType<typeof buildFinancialReport>;

export type FinancialReportInventoryLog = {
  type: "IN" | "OUT" | "ADJUSTMENT";
  reason:
    | "WASTE"
    | "USAGE"
    | "OPNAME"
    | "MANUAL_ADJUSTMENT"
    | "SALE"
    | "SALE_RETURN"
    | "RESTOCK"
    | "SUPPLIER_RETURN"
    | null;
  quantity: NullableNumber;
  unitCost: NullableNumber;
  createdAt?: Date | null;
};

export type FinancialReportExpense = {
  amount: NullableNumber;
  changeAmount: NullableNumber;
  hasMissingCostSnapshot?: boolean;
};

export type FinancialReportExpenseSummary = {
  amount: NullableNumber;
  changeAmount: NullableNumber;
  entryCount: number;
  incompleteCount: number;
};

export type LossReason =
  | "WASTE"
  | "USAGE"
  | "OPNAME"
  | "MANUAL_ADJUSTMENT"
  | "UNCLASSIFIED";

export type LossBucket = {
  reason: LossReason;
  netValue: number;
  netQuantity: number;
  entryCount: number;
};

export type TrendBucketGranularity = "daily" | "weekly" | "monthly";

export type TrendPoint = {
  bucketKey: string;
  label: string;
  omzet: number;
  cost: number;
  labaKotor: number;
};

export type TrendSeries = {
  granularity: TrendBucketGranularity;
  points: TrendPoint[];
};

const CONFIRMED_STATUSES = new Set(["COMPLETED", "DP"]);

function toNumber(value: NullableNumber): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(parsed) ? Number(parsed) : 0;
}

function dateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function addDays(dateKeyValue: string, days: number) {
  const date = new Date(`${dateKeyValue}T00:00:00+07:00`);
  date.setUTCDate(date.getUTCDate() + days);
  return dateKey(date);
}

export function buildFinancialReportRange(
  preset: FinancialReportPreset = "today",
  now = new Date(),
) {
  const today = dateKey(now);

  if (preset === "7d") {
    return { dateFrom: addDays(today, -6), dateTo: today };
  }

  if (preset === "30d") {
    return { dateFrom: addDays(today, -29), dateTo: today };
  }

  if (preset === "month") {
    return { dateFrom: `${today.slice(0, 8)}01`, dateTo: today };
  }

  return { dateFrom: today, dateTo: today };
}

const ISO_WEEKDAY_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Jakarta",
  weekday: "short",
});

const ISO_WEEKDAY_INDEX: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

function jakartaDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  return { year: get("year"), month: get("month"), day: get("day") };
}

function isoWeekKey(date: Date): string {
  const weekdayShort = ISO_WEEKDAY_FORMATTER.format(date);
  const weekdayIndex = ISO_WEEKDAY_INDEX[weekdayShort] ?? 1;
  const { year, month, day } = jakartaDateParts(date);
  // Anchor at the Thursday of the same ISO week (UTC arithmetic — values from Jakarta calendar).
  const anchor = new Date(Date.UTC(year, month - 1, day));
  anchor.setUTCDate(anchor.getUTCDate() + (4 - weekdayIndex));
  const isoYear = anchor.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil(
    ((anchor.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

export function pickGranularity(rangeDays: number): TrendBucketGranularity {
  if (rangeDays <= 60) return "daily";
  if (rangeDays <= 180) return "weekly";
  return "monthly";
}

export function bucketKeyForDate(
  date: Date,
  granularity: TrendBucketGranularity,
): string {
  if (granularity === "daily") return dateKey(date);
  if (granularity === "weekly") return isoWeekKey(date);
  return dateKey(date).slice(0, 7);
}

const DAILY_LABEL_FORMATTER = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  day: "2-digit",
  month: "short",
});

const MONTHLY_LABEL_FORMATTER = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  month: "long",
  year: "numeric",
});

function labelForBucket(
  bucketKey: string,
  granularity: TrendBucketGranularity,
): string {
  if (granularity === "daily") {
    return DAILY_LABEL_FORMATTER.format(new Date(`${bucketKey}T00:00:00+07:00`));
  }
  if (granularity === "monthly") {
    return MONTHLY_LABEL_FORMATTER.format(new Date(`${bucketKey}-01T00:00:00+07:00`));
  }
  // weekly: "W21 · 18 Mei" — week number + the Monday's date for context
  const [yearStr, weekStr] = bucketKey.split("-W");
  const isoYear = Number(yearStr);
  const week = Number(weekStr);
  // Find Jan 4th of the ISO year (always in W1), then walk to that week's Monday.
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const jan4Weekday =
    ISO_WEEKDAY_INDEX[ISO_WEEKDAY_FORMATTER.format(jan4)] ?? 1;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - (jan4Weekday - 1));
  const targetMonday = new Date(week1Monday);
  targetMonday.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  return `W${String(week).padStart(2, "0")} · ${DAILY_LABEL_FORMATTER.format(targetMonday)}`;
}

function generateTrendBuckets(
  dateFrom: string,
  dateTo: string,
  granularity: TrendBucketGranularity,
): TrendPoint[] {
  const seen = new Set<string>();
  const points: TrendPoint[] = [];
  let cursor = dateFrom;
  while (cursor <= dateTo) {
    const cursorDate = new Date(`${cursor}T12:00:00+07:00`);
    const key = bucketKeyForDate(cursorDate, granularity);
    if (!seen.has(key)) {
      seen.add(key);
      points.push({
        bucketKey: key,
        label: labelForBucket(key, granularity),
        omzet: 0,
        cost: 0,
        labaKotor: 0,
      });
    }
    cursor = addDays(cursor, 1);
  }
  return points;
}

function rangeDays(dateFrom: string, dateTo: string): number {
  const from = new Date(`${dateFrom}T00:00:00+07:00`);
  const to = new Date(`${dateTo}T00:00:00+07:00`);
  return (
    Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1
  );
}

export function buildFinancialReport({
  dateFrom,
  dateTo,
  transactions,
  shifts,
  inventoryLogs = [],
  expenses = [],
  expenseSummary,
}: {
  dateFrom: string;
  dateTo: string;
  transactions: FinancialReportTransaction[];
  shifts: FinancialReportShift[];
  inventoryLogs?: FinancialReportInventoryLog[];
  expenses?: FinancialReportExpense[];
  expenseSummary?: FinancialReportExpenseSummary;
}) {
  const paymentMap = new Map<
    string,
    { method: string; transactionCount: number; revenue: number; collected: number }
  >();
  const productMap = new Map<
    string,
    {
      productId: string | null;
      productName: string;
      quantity: number;
      revenue: number;
      grossProfit: number;
    }
  >();
  const categoryMap = new Map<
    string,
    {
      categoryName: string;
      transactionIds: Set<string>;
      quantity: number;
      revenue: number;
      grossProfit: number;
    }
  >();
  const salespersonMap = new Map<
    string,
    {
      name: string;
      transactionCount: number;
      revenue: number;
      collected: number;
      grossProfit: number;
    }
  >();

  let revenue = 0;
  let collected = 0;
  let grossProfit = 0;
  let discount = 0;
  let outstandingDp = 0;
  let missingCostLineCount = 0;
  let transactionCount = 0;

  const confirmedTransactions = transactions.filter((transaction) =>
    CONFIRMED_STATUSES.has(transaction.status),
  );

  for (const transaction of confirmedTransactions) {
    const total = toNumber(transaction.total);
    const amountPaid = Math.min(toNumber(transaction.amountPaid), total);
    const collectedForTransaction =
      transaction.status === "DP" ? amountPaid : total;
    const salespersonName =
      transaction.salesName || transaction.salesperson?.name || "Tanpa sales";
    let transactionGrossProfit = 0;

    revenue += total;
    collected += collectedForTransaction;
    discount += toNumber(transaction.discount);
    outstandingDp +=
      transaction.status === "DP" ? Math.max(0, total - amountPaid) : 0;
    transactionCount += 1;

    const payment = paymentMap.get(transaction.paymentMethod) ?? {
      method: transaction.paymentMethod,
      transactionCount: 0,
      revenue: 0,
      collected: 0,
    };
    payment.transactionCount += 1;
    payment.revenue += total;
    payment.collected += collectedForTransaction;
    paymentMap.set(payment.method, payment);

    for (const item of transaction.items) {
      const quantity = toNumber(item.quantity);
      const itemRevenue = toNumber(item.subtotal);
      const itemCost =
        item.unitCost === null || item.unitCost === undefined
          ? null
          : toNumber(item.unitCost) * quantity;
      const itemGrossProfit = itemCost === null ? 0 : itemRevenue - itemCost;
      const productKey = item.productId || item.productName;
      const categoryName = item.product?.category?.name || "Tanpa kategori";

      if (itemCost === null) missingCostLineCount += 1;
      grossProfit += itemGrossProfit;
      transactionGrossProfit += itemGrossProfit;

      const product = productMap.get(productKey) ?? {
        productId: item.productId || null,
        productName: item.productName,
        quantity: 0,
        revenue: 0,
        grossProfit: 0,
      };
      product.quantity += quantity;
      product.revenue += itemRevenue;
      product.grossProfit += itemGrossProfit;
      productMap.set(productKey, product);

      const category = categoryMap.get(categoryName) ?? {
        categoryName,
        transactionIds: new Set<string>(),
        quantity: 0,
        revenue: 0,
        grossProfit: 0,
      };
      category.transactionIds.add(transaction.id);
      category.quantity += quantity;
      category.revenue += itemRevenue;
      category.grossProfit += itemGrossProfit;
      categoryMap.set(categoryName, category);
    }

    const salesperson = salespersonMap.get(salespersonName) ?? {
      name: salespersonName,
      transactionCount: 0,
      revenue: 0,
      collected: 0,
      grossProfit: 0,
    };
    salesperson.transactionCount += 1;
    salesperson.revenue += total;
    salesperson.collected += collectedForTransaction;
    salesperson.grossProfit += transactionGrossProfit;
    salespersonMap.set(salespersonName, salesperson);
  }

  const lossBucketMap = new Map<LossReason, LossBucket>();
  let lossStokNet = 0;
  let lossStokUnclassifiedCount = 0;

  const granularity = pickGranularity(rangeDays(dateFrom, dateTo));
  const trendPoints = generateTrendBuckets(dateFrom, dateTo, granularity);
  const trendIndex = new Map(trendPoints.map((p) => [p.bucketKey, p]));

  for (const transaction of confirmedTransactions) {
    const txKey = bucketKeyForDate(transaction.createdAt, granularity);
    const txPoint = trendIndex.get(txKey);
    if (!txPoint) continue;
    const txTotal = toNumber(transaction.total);
    txPoint.omzet += txTotal;
    for (const item of transaction.items) {
      if (item.unitCost === null || item.unitCost === undefined) continue;
      txPoint.cost += toNumber(item.unitCost) * toNumber(item.quantity);
    }
  }

  for (const log of inventoryLogs) {
    const quantity = toNumber(log.quantity);
    const signedQty =
      log.type === "OUT" ? quantity : log.type === "IN" ? -quantity : quantity;
    const unitCost =
      log.unitCost === null || log.unitCost === undefined
        ? null
        : toNumber(log.unitCost);
    const value = unitCost === null ? 0 : signedQty * unitCost;

    const reasonKey: LossReason | null =
      log.reason === "WASTE" ||
      log.reason === "USAGE" ||
      log.reason === "OPNAME" ||
      log.reason === "MANUAL_ADJUSTMENT"
        ? log.reason
        : log.reason === null
          ? "UNCLASSIFIED"
          : null;

    if (reasonKey === null) continue;

    if (reasonKey === "UNCLASSIFIED") lossStokUnclassifiedCount += 1;

    lossStokNet += value;

    const bucket = lossBucketMap.get(reasonKey) ?? {
      reason: reasonKey,
      netValue: 0,
      netQuantity: 0,
      entryCount: 0,
    };
    bucket.netValue += value;
    bucket.netQuantity += signedQty;
    bucket.entryCount += 1;
    lossBucketMap.set(reasonKey, bucket);

    if (log.createdAt) {
      const logKey = bucketKeyForDate(log.createdAt, granularity);
      const logPoint = trendIndex.get(logKey);
      if (logPoint) logPoint.cost += value;
    }
  }

  for (const point of trendPoints) {
    point.labaKotor = point.omzet - point.cost;
  }

  const reportShifts = shifts.map((shift) => ({
    id: shift.id,
    cashierName: shift.cashier?.name || "Kasir",
    openedAt: shift.openedAt.toISOString(),
    closedAt: shift.closedAt ? shift.closedAt.toISOString() : null,
    openingBalance: toNumber(shift.openingBalance),
    expectedBalance: toNumber(shift.expectedBalance),
    closingBalance: toNumber(shift.closingBalance),
    discrepancy: toNumber(shift.discrepancy),
    status: shift.status,
  }));

  const grossProfitNet = grossProfit - lossStokNet;
  const expenseTotal = expenseSummary
    ? Math.max(
        0,
        toNumber(expenseSummary.amount) - toNumber(expenseSummary.changeAmount),
      )
    : expenses.reduce(
        (sum, expense) =>
          sum +
          Math.max(0, toNumber(expense.amount) - toNumber(expense.changeAmount)),
        0,
      );
  const expenseEntryCount = expenseSummary?.entryCount ?? expenses.length;
  const incompleteExpenseCount =
    expenseSummary?.incompleteCount ??
    expenses.filter((expense) => expense.hasMissingCostSnapshot).length;

  return {
    dateFrom,
    dateTo,
    summary: {
      transactionCount,
      revenue,
      collected,
      grossProfit: grossProfitNet,
      grossMargin: revenue > 0 ? grossProfitNet / revenue : 0,
      discount,
      outstandingDp,
      shiftDiscrepancy: reportShifts.reduce(
        (sum, shift) => sum + shift.discrepancy,
        0,
      ),
      missingCostLineCount,
      lossStokNet,
      lossStokUnclassifiedCount,
      expenseTotal,
      expenseEntryCount,
      incompleteExpenseCount,
      estimatedNetProfit: grossProfitNet - expenseTotal,
    },
    paymentMethods: [...paymentMap.values()].sort((a, b) =>
      a.method.localeCompare(b.method),
    ),
    topProducts: [...productMap.values()].sort((a, b) => b.revenue - a.revenue),
    categories: [...categoryMap.values()]
      .map(({ transactionIds, ...category }) => ({
        ...category,
        transactionCount: transactionIds.size,
      }))
      .sort((a, b) => a.categoryName.localeCompare(b.categoryName)),
    salespersons: [...salespersonMap.values()].sort(
      (a, b) => b.revenue - a.revenue,
    ),
    shifts: reportShifts,
    lossStok: [...lossBucketMap.values()],
    trend: {
      granularity,
      points: trendPoints,
    } satisfies TrendSeries,
  };
}
