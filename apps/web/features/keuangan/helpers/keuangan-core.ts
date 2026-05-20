export const EXPENSE_CATEGORIES = [
  "SUPPLIES",
  "UTILITIES",
  "RENT",
  "SALARY",
  "TRANSPORT",
  "MAINTENANCE",
  "CASH_BOND",
  "BEVERAGES",
  "OTHER",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

type DecimalLike = number | string;

function toNumber(value: DecimalLike): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid numeric value: ${String(value)}`);
  }
  return parsed;
}

export function computeNetExpense(
  amount: DecimalLike,
  changeAmount: DecimalLike,
): number {
  const a = toNumber(amount);
  const c = toNumber(changeAmount);
  if (a < 0) throw new Error("amount must be >= 0");
  if (c < 0) throw new Error("changeAmount must be >= 0");
  if (c > a) throw new Error("changeAmount must not exceed amount");
  return a - c;
}

const JAKARTA_TZ = "Asia/Jakarta";

function jakartaDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: JAKARTA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export type ExpenseRow = {
  occurredAt: Date;
  amount: DecimalLike;
  changeAmount: DecimalLike;
  category: ExpenseCategory;
};

export type DailyBucket = {
  date: string;
  total: number;
  byCategory: Partial<Record<ExpenseCategory, number>>;
};

export function bucketExpensesByDay(rows: ExpenseRow[]): DailyBucket[] {
  const map = new Map<string, DailyBucket>();
  for (const row of rows) {
    const date = jakartaDateKey(row.occurredAt);
    const net = computeNetExpense(row.amount, row.changeAmount);
    const bucket = map.get(date) ?? {
      date,
      total: 0,
      byCategory: {},
    };
    bucket.total += net;
    bucket.byCategory[row.category] =
      (bucket.byCategory[row.category] ?? 0) + net;
    map.set(date, bucket);
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export type CategoryBucket = { category: ExpenseCategory; total: number };

export function bucketExpensesByCategory(
  rows: Pick<ExpenseRow, "amount" | "changeAmount" | "category">[],
): CategoryBucket[] {
  const totals = new Map<ExpenseCategory, number>();
  for (const row of rows) {
    const net = computeNetExpense(row.amount, row.changeAmount);
    totals.set(row.category, (totals.get(row.category) ?? 0) + net);
  }
  return [...totals.entries()]
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);
}

export type TransactionRow = {
  createdAt: Date;
  total: DecimalLike;
};

export type TransactionDailyBucket = {
  date: string;
  total: number;
  count: number;
};

export function bucketTransactionsByDay(
  rows: TransactionRow[],
): TransactionDailyBucket[] {
  const map = new Map<string, TransactionDailyBucket>();
  for (const row of rows) {
    const date = jakartaDateKey(row.createdAt);
    const total = toNumber(row.total);
    const bucket = map.get(date) ?? { date, total: 0, count: 0 };
    bucket.total += total;
    bucket.count += 1;
    map.set(date, bucket);
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

const MONTH_PATTERN = /^(\d{4})-(\d{2})$/;

export function buildKeuanganMonthRange(month: string): {
  start: Date;
  end: Date;
} {
  const match = MONTH_PATTERN.exec(month);
  if (!match) {
    throw new Error(`Invalid month format: ${month}`);
  }
  const year = Number(match[1]);
  const m = Number(match[2]);
  if (m < 1 || m > 12) {
    throw new Error(`Invalid month: ${month}`);
  }
  // 00:00 Asia/Jakarta == 17:00 UTC the previous day (WIB = UTC+7, no DST)
  const start = new Date(Date.UTC(year, m - 1, 1, -7, 0, 0));
  const nextMonthYear = m === 12 ? year + 1 : year;
  const nextMonth = m === 12 ? 1 : m + 1;
  const end = new Date(Date.UTC(nextMonthYear, nextMonth - 1, 1, -7, 0, 0));
  return { start, end };
}

export type ExpensePayload = {
  applicantName: string;
  category: ExpenseCategory;
  description?: string;
  amount: number;
  changeAmount?: number;
  occurredAt: string;
  transactionId?: string;
  attachmentUrl?: string;
};

export type ValidationResult =
  | { success: true; data: Required<Pick<ExpensePayload, "applicantName" | "category" | "amount" | "changeAmount" | "occurredAt">> & ExpensePayload }
  | { success: false; errors: { path: string; message: string }[] };

const FIVE_YEARS_DAYS = 365 * 5 + 1; // approximate; refined via Jakarta calendar math below
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function diffDaysJakarta(fromKey: string, toKey: string): number {
  const from = new Date(`${fromKey}T00:00:00+07:00`);
  const to = new Date(`${toKey}T00:00:00+07:00`);
  return Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

export function validateExpensePayload(
  input: ExpensePayload,
  options: { now: Date },
): ValidationResult {
  const errors: { path: string; message: string }[] = [];
  const todayKey = jakartaDateKey(options.now);

  if (!input.applicantName || input.applicantName.trim().length === 0) {
    errors.push({ path: "applicantName", message: "Nama pemohon wajib diisi" });
  } else if (input.applicantName.length > 100) {
    errors.push({ path: "applicantName", message: "Maksimal 100 karakter" });
  }

  if (!EXPENSE_CATEGORIES.includes(input.category as ExpenseCategory)) {
    errors.push({ path: "category", message: "Kategori tidak valid" });
  }

  if (typeof input.amount !== "number" || !Number.isFinite(input.amount) || input.amount <= 0) {
    errors.push({ path: "amount", message: "Jumlah harus lebih dari 0" });
  }

  const changeAmount = input.changeAmount ?? 0;
  if (changeAmount < 0) {
    errors.push({ path: "changeAmount", message: "Kembalian tidak boleh negatif" });
  } else if (typeof input.amount === "number" && changeAmount > input.amount) {
    errors.push({
      path: "changeAmount",
      message: "Kembalian tidak boleh melebihi jumlah",
    });
  }

  if (!ISO_DATE_PATTERN.test(input.occurredAt)) {
    errors.push({ path: "occurredAt", message: "Format tanggal tidak valid" });
  } else {
    if (input.occurredAt > todayKey) {
      errors.push({
        path: "occurredAt",
        message: "Tanggal tidak boleh di masa depan",
      });
    } else {
      const diff = diffDaysJakarta(input.occurredAt, todayKey);
      // 5 years: compute the same calendar day 5y back as the lower bound
      const [ty, tm, td] = todayKey.split("-").map(Number) as [number, number, number];
      const minDate = new Date(Date.UTC(ty - 5, tm - 1, td));
      const minKey = jakartaDateKey(minDate);
      if (input.occurredAt < minKey) {
        errors.push({
          path: "occurredAt",
          message: "Tanggal melewati batas (5 tahun)",
        });
      }
      void diff;
    }
  }

  if (input.description != null && input.description.length > 500) {
    errors.push({ path: "description", message: "Maksimal 500 karakter" });
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return {
    success: true,
    data: {
      applicantName: input.applicantName,
      category: input.category,
      amount: input.amount,
      changeAmount,
      occurredAt: input.occurredAt,
      description: input.description,
      transactionId: input.transactionId,
      attachmentUrl: input.attachmentUrl,
    },
  };
}

export function formatRupiah(value: number | string): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "Rp 0";
  return `Rp ${Math.round(n).toLocaleString("id-ID")}`;
}
