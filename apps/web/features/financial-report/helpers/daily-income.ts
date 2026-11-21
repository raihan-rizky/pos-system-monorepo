import { netInitialPayments } from "@/features/customer-debt/helpers/net-initial-payments";
import { allocateIncomeSubcategories, incomeClassification, type IncomeClassificationInput, type IncomeCategory, type IncomeSubcategoryRow } from "./income-categories";

export const DAILY_INCOME_PERMISSIONS = {
  total: "financial-report.daily-income",
  outstandingDp: "financial-report.daily-outstanding-dp",
  categories: "financial-report.daily-category",
  subcategories: "financial-report.daily-subcategory",
  paymentMethods: "financial-report.daily-payment-method",
} as const;
export type DailyIncomeAccess = Record<keyof typeof DAILY_INCOME_PERMISSIONS, boolean>;
type Payment = { id: string; method: string; amount: unknown; createdAt: Date };
export type DailyIncomeTransaction = IncomeClassificationInput & {
  id: string; createdAt: Date; invoiceDate?: Date; status: string; paymentMethod: string; total: unknown; amountPaid: unknown; change?: unknown;
  payments: Payment[];
  debtPaymentLogs: Array<{ id: string; paymentMethod: string; amount: unknown; createdAt: Date }>;
};
export type DailyManualIncome = { id: string; occurredAt: Date; category: string; amount: unknown; deletedAt?: Date | null; payments?: Array<{ method: string; amount: unknown }> };
type IncomeInputs = {
  transactions: DailyIncomeTransaction[];
  manualIncome: DailyManualIncome[];
  manualReceivables?: Array<{ id: string; amount: unknown; payments: Payment[] }>;
  supplierRefunds?: Array<{ date: string; total: number }>;
};
const emptyComponents = () => ({ sales: 0, manualIncome: 0, manualReceivable: 0, supplierRefund: 0 });
type IncomeSource = keyof ReturnType<typeof emptyComponents>;
export type DailyIncomeReport = {
  date: string; total: number;
  outstandingDp: number;
  categories: Array<{ category: IncomeCategory; amount: number }>;
  subcategories: IncomeSubcategoryRow[];
  paymentMethods: Array<{ method: string; amount: number }>;
};
export type DailyIncomeResponse = Pick<DailyIncomeReport, "date"> & Partial<Omit<DailyIncomeReport, "date">> & { viewMode?: "full" };

export function jakartaToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function buildDailyIncomeRange(date: string, now = new Date()) {
  const start = new Date(`${date}T00:00:00+07:00`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(start.getTime()) || jakartaToday(start) !== date || date > jakartaToday(now)) {
    throw new RangeError("Pilih satu tanggal yang valid, hari ini atau sebelumnya.");
  }
  return { date, start, end: new Date(start.getTime() + 86_400_000) };
}

const money = (value: unknown) => {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? Math.max(0, Math.round(numeric * 100)) / 100 : 0;
};
const unique = <T extends { id: string }>(rows: T[]) => [...new Map(rows.map(row => [row.id, row])).values()];

function emptyIncomeDay() {
  return {
    components: emptyComponents(),
    categories: new Map<IncomeCategory, number>(),
    subcategories: new Map<string, IncomeSubcategoryRow>(),
    methods: new Map<string, number>(),
    transactions: new Set<string>(),
    manualCount: 0,
  };
}

function collectIncomeDays(input: IncomeInputs, start: Date, end: Date) {
  const inPeriod = (value: Date) => value >= start && value < end;
  const days = new Map<string, ReturnType<typeof emptyIncomeDay>>();
  const add = (at: Date, source: IncomeSource, amount: number, method: string | null, breakdown: IncomeSubcategoryRow[]) => {
    const cents = Math.round(amount * 100);
    if (cents <= 0 || !inPeriod(at)) return;
    const date = jakartaToday(at);
    const day = days.get(date) ?? emptyIncomeDay();
    days.set(date, day);
    day.components[source] += cents;
    const { categories, subcategories, methods } = day;
    if (method !== null) methods.set(method, (methods.get(method) ?? 0) + cents);
    for (const row of breakdown) {
      const rowCents = Math.round(row.amount * 100);
      categories.set(row.category, (categories.get(row.category) ?? 0) + rowCents);
      const key = JSON.stringify([row.category, row.subcategory]);
      const previous = subcategories.get(key);
      subcategories.set(key, { ...row, amount: (Math.round((previous?.amount ?? 0) * 100) + rowCents) / 100 });
    }
    return day;
  };
  for (const tx of unique(input.transactions)) {
    if (tx.status !== "COMPLETED" && tx.status !== "DP") continue;
    const retained = Math.min(money(tx.total), Math.max(0, money(tx.amountPaid) - money(tx.change)));
    const debts = unique(tx.debtPaymentLogs).map(row => ({ ...row, method: row.paymentMethod }));
    const debtTotal = debts.reduce((sum, row) => sum + (row.method === "TEMPO" ? 0 : money(row.amount)), 0);
    const initialLimit = Math.max(0, retained - debtTotal);
    const initial = unique(tx.payments);
    const ledger = initial.length ? initial : tx.paymentMethod === "TEMPO" ? [] : [{ id: `legacy-${tx.id}`, method: tx.paymentMethod, amount: initialLimit, createdAt: tx.createdAt }];
    const events = [
      ...netInitialPayments(ledger, { total: initialLimit, amountPaid: initialLimit }).map(event => ({
        ...event, createdAt: tx.invoiceDate ?? event.createdAt,
      })),
      ...netInitialPayments(debts, { total: Math.min(debtTotal, retained), amountPaid: Math.min(debtTotal, retained) }),
    ];
    for (const event of events) {
      if (event.method === "TEMPO" || event.amount <= 0 || !inPeriod(event.createdAt)) continue;
      add(event.createdAt, "sales", event.amount, event.method, allocateIncomeSubcategories(event.amount, tx))?.transactions.add(tx.id);
    }
  }
  for (const row of unique(input.manualIncome)) {
    if (row.deletedAt || !inPeriod(row.occurredAt)) continue;
    const amount = money(row.amount);
    const classification = row.category === "ATK"
      ? { category: "ATK" as const, subcategory: "Pemasukan manual" }
      : incomeClassification({ transactionCategory: "PERCETAKAN", printingSubcategory: row.category, items: [] });
    const payments = row.payments ?? [];
    const paymentCents = payments.reduce((sum, payment) => sum + Math.round(money(payment.amount) * 100), 0);
    const hasBalancedPayments = payments.length > 0 && paymentCents === Math.round(amount * 100);
    const day = add(row.occurredAt, "manualIncome", amount, hasBalancedPayments ? null : "Belum dicatat", [{ ...classification, amount }]);
    if (!day) continue;
    day.manualCount++;
    if (hasBalancedPayments) {
      for (const payment of payments) {
        const cents = Math.round(money(payment.amount) * 100);
        if (cents > 0) day.methods.set(payment.method, (day.methods.get(payment.method) ?? 0) + cents);
      }
    }
  }
  for (const receivable of unique(input.manualReceivables ?? [])) {
    const events = netInitialPayments(unique(receivable.payments), { total: receivable.amount, amountPaid: receivable.amount });
    for (const event of events) {
      add(event.createdAt, "manualReceivable", event.amount, event.method, [
        { category: "Lainnya", subcategory: "Pelunasan piutang manual", amount: event.amount },
      ]);
    }
  }
  for (const { date, total } of input.supplierRefunds ?? []) {
    add(new Date(`${date}T00:00:00+07:00`), "supplierRefund", total, "Belum dicatat", [
      { category: "Lainnya", subcategory: "Pengembalian dana pemasok", amount: total },
    ]);
  }
  return days;
}

function sumComponents(components: ReturnType<typeof emptyComponents>) {
  return Object.values(components).reduce((sum, amount) => sum + amount, 0);
}

export function buildIncomePeriod(input: IncomeInputs, start: Date, end: Date) {
  const cents = emptyComponents();
  const transactionIds = new Set<string>();
  let manualEntryCount = 0;
  const daily = [...collectIncomeDays(input, start, end)].sort(([a], [b]) => a.localeCompare(b)).map(([date, day]) => {
    for (const key of Object.keys(cents) as IncomeSource[]) cents[key] += day.components[key];
    for (const id of day.transactions) transactionIds.add(id);
    manualEntryCount += day.manualCount;
    return { date, total: sumComponents(day.components) / 100, count: day.transactions.size, manualCount: day.manualCount,
      manualReceivable: day.components.manualReceivable / 100, supplierRefund: day.components.supplierRefund / 100 };
  });
  return {
    total: sumComponents(cents) / 100, daily, transactionCount: transactionIds.size, manualEntryCount,
    components: { sales: cents.sales / 100, manualIncome: cents.manualIncome / 100, manualReceivable: cents.manualReceivable / 100 },
    supplierRefund: cents.supplierRefund / 100,
  };
}

export function buildDailyIncome(input: IncomeInputs & { date: string }): DailyIncomeReport {
  const start = new Date(`${input.date}T00:00:00+07:00`);
  const end = new Date(start.getTime() + 86_400_000);
  const { categories, subcategories, methods, components } = collectIncomeDays(input, start, end).get(input.date) ?? emptyIncomeDay();
  let outstandingDpCents = 0;
  for (const tx of unique(input.transactions)) {
    if (tx.status === "DP" && tx.paymentMethod !== "TEMPO" && (tx.invoiceDate ?? tx.createdAt) < end) {
      outstandingDpCents += Math.max(0, Math.round(money(tx.total) * 100) - Math.round(money(tx.amountPaid) * 100));
    }
  }
  return {
    date: input.date, total: sumComponents(components) / 100, outstandingDp: outstandingDpCents / 100,
    categories: [...categories].map(([category, cents]) => ({ category, amount: cents / 100 })).sort((a, b) => a.category.localeCompare(b.category)),
    subcategories: [...subcategories.values()].sort((a, b) => a.category.localeCompare(b.category) || a.subcategory.localeCompare(b.subcategory)),
    paymentMethods: [...methods].map(([method, cents]) => ({ method, amount: cents / 100 })).sort((a, b) => a.method.localeCompare(b.method)),
  };
}
