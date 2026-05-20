import {
  CATEGORY_LABELS_ID,
} from "@/features/keuangan/helpers/category-meta";
import type { ExpenseCategory } from "@/features/keuangan/helpers/keuangan-core";

export type JournalPeriod = "daily" | "weekly" | "monthly";

export const PAYMENT_METHODS = [
  "CASH",
  "TRANSFER",
  "QRIS",
  "DEBIT",
  "CREDIT",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

const JAKARTA_TZ = "Asia/Jakarta";

function jakartaDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: JAKARTA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function shiftJakartaDateKey(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00+07:00`);
  date.setUTCDate(date.getUTCDate() + days);
  return jakartaDateKey(date);
}

export function buildJournalPeriodRange(
  period: JournalPeriod,
  now: Date = new Date(),
): { from: string; to: string } {
  const today = jakartaDateKey(now);
  if (period === "daily") return { from: today, to: today };
  if (period === "weekly") {
    return { from: shiftJakartaDateKey(today, -6), to: today };
  }
  // monthly: first of month → today
  return { from: `${today.slice(0, 8)}01`, to: today };
}

type Decimalish = number | string | { toString(): string };

function toNumber(value: Decimalish | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "number" ? value : Number(value.toString());
  return Number.isFinite(n) ? n : 0;
}

export type JournalSaleInput = {
  id: string;
  invoiceNumber: string | null;
  createdAt: Date;
  salesName: string | null;
  salesperson: { name?: string | null } | null;
  customerName: string | null;
  paymentMethod: string;
  total: Decimalish;
  items: Array<{
    productName: string;
    product?: { category?: { name?: string | null } | null } | null;
  }>;
};

export type JournalExpenseInput = {
  id: string;
  occurredAt: Date;
  applicantName: string;
  category: ExpenseCategory;
  description: string | null;
  amount: Decimalish;
  changeAmount: Decimalish;
};

export type JournalRow = {
  tanggal: string; // YYYY-MM-DD
  invoice: string;
  person: string;
  products: string;
  categories: string;
  status: "Pemasukan" | "Pengeluaran";
  amount: number;
  method: string;
};

function joinUnique(values: Array<string | null | undefined>): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out.join(", ");
}

function saleToRow(sale: JournalSaleInput): JournalRow {
  const products = joinUnique(sale.items.map((i) => i.productName));
  const categories = joinUnique(
    sale.items.map((i) => i.product?.category?.name ?? null),
  );
  const person =
    sale.salesName?.trim() ||
    sale.salesperson?.name?.trim() ||
    sale.customerName?.trim() ||
    "";
  return {
    tanggal: jakartaDateKey(sale.createdAt),
    invoice: sale.invoiceNumber ?? "",
    person,
    products,
    categories,
    status: "Pemasukan",
    amount: toNumber(sale.total),
    method: sale.paymentMethod,
  };
}

function expenseToRow(expense: JournalExpenseInput): JournalRow {
  const categoryLabel = CATEGORY_LABELS_ID[expense.category];
  const products = expense.description?.trim() || categoryLabel;
  const net = toNumber(expense.amount) - toNumber(expense.changeAmount);
  return {
    tanggal: jakartaDateKey(expense.occurredAt),
    invoice: `EXP-${expense.id}`,
    person: expense.applicantName,
    products,
    categories: categoryLabel,
    status: "Pengeluaran",
    amount: -net,
    method: "",
  };
}

export function buildJournalRows(
  sales: JournalSaleInput[],
  expenses: JournalExpenseInput[],
): JournalRow[] {
  const rows: JournalRow[] = [
    ...sales.map(saleToRow),
    ...expenses.map(expenseToRow),
  ];
  rows.sort((a, b) => {
    if (a.tanggal !== b.tanggal) return a.tanggal.localeCompare(b.tanggal);
    if (a.status !== b.status) return a.status === "Pemasukan" ? -1 : 1;
    return 0;
  });
  return rows;
}

export type JournalFooter = {
  totalPemasukan: number;
  totalPengeluaran: number;
  grandTotal: number;
  byMethod: Record<PaymentMethod, number>;
};

export function buildJournalFooter(rows: JournalRow[]): JournalFooter {
  const byMethod: Record<PaymentMethod, number> = {
    CASH: 0,
    TRANSFER: 0,
    QRIS: 0,
    DEBIT: 0,
    CREDIT: 0,
  };
  let totalPemasukan = 0;
  let totalPengeluaran = 0;
  for (const row of rows) {
    if (row.status === "Pemasukan") {
      totalPemasukan += row.amount;
      if ((PAYMENT_METHODS as readonly string[]).includes(row.method)) {
        byMethod[row.method as PaymentMethod] += row.amount;
      }
    } else {
      totalPengeluaran += row.amount;
    }
  }
  return {
    totalPemasukan,
    totalPengeluaran,
    grandTotal: totalPemasukan + totalPengeluaran,
    byMethod,
  };
}

export const JOURNAL_HEADER = [
  "Tanggal",
  "No. Invoice",
  "Pemohon/Sales",
  "Produk",
  "Kategori",
  "Status",
  "Jumlah",
  "Metode",
] as const;

export type SheetCell = string | number;
export type SheetRow = SheetCell[];

function rowToCells(row: JournalRow): SheetRow {
  return [
    row.tanggal,
    row.invoice,
    row.person,
    row.products,
    row.categories,
    row.status,
    row.amount,
    row.method,
  ];
}

function pad(label: string, amount: number): SheetRow {
  return [label, "", "", "", "", "", amount, ""];
}

export function buildJournalSheetData(
  rows: JournalRow[],
  footer: JournalFooter,
): SheetRow[] {
  const out: SheetRow[] = [];
  out.push([...JOURNAL_HEADER]);
  for (const r of rows) out.push(rowToCells(r));
  out.push([]);
  out.push(pad("Total Pemasukan", footer.totalPemasukan));
  out.push(pad("Total Pengeluaran", footer.totalPengeluaran));
  out.push(pad("Grand Total", footer.grandTotal));
  out.push(pad("", 0).map(() => "")); // visual separator before per-method rows
  for (const method of PAYMENT_METHODS) {
    out.push(pad(method, footer.byMethod[method]));
  }
  return out;
}
