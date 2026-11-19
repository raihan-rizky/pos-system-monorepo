import { db, type Prisma } from "@pos/db";
import { recognizePurchaseExpenses, type PurchaseExpensePayment, type PurchaseExpenseSchedule } from "../helpers/purchase-expense-recognition";
import { buildKeuanganMonthRange, type ExpenseCategoryKey } from "../helpers/keuangan-core";
import { readCorrectionPaymentSnapshot } from "@/features/suppliers/shopping-requests/repositories/shopping-request-correction-payment-snapshot";

type Money = string | number | { toString(): string };
type PaymentMethod = "TRANSFER" | "GIRO";
type Purchase = {
  id: string; storeId: string; number: string; status: string; statusBeforeCancellation: string | null;
  totalAmount: Money; paymentMethod: PaymentMethod | null; paymentDueDate: Date | null;
  initialTransferAmount: Money | null; initialTransferPaidAt: Date | null; supplierNameSnapshot: string;
  payments: Array<{ id: string; method: PaymentMethod; amount: Money; dueDate: Date | null }>;
  supplierPayable: { storeId: string; giroHistoryVerifiedAt: Date | null; payments: Array<{ id: string; amount: Money; paidAt: Date }> } | null;
  shoppingRequest: { corrections: Array<{ afterSnapshot: unknown; allocations: Array<{
    sourceKind: string; paymentId: string; method: string; amount: Money; sourceAmount: Money; paidAt: Date;
  }> }> };
};
type Expense = {
  id: string; storeId: string; applicantName: string; category: ExpenseCategoryKey; customCategoryId: string | null;
  description: string | null; amount: Money; changeAmount: Money; occurredAt: Date; createdAt: Date;
  transactionId: string | null; attachmentUrl: string | null; hasMissingCostSnapshot: boolean;
  manualPurchasePaymentMethod: string | null; goodsPurchaseId: string | null; shoppingRequestId: string | null;
  recordedBy: { id: string; name: string }; goodsPurchase: Purchase | null;
  shoppingRequest: { id: string; number: string; goodsPurchases: Purchase[] } | null;
};
type BackdatedPurchase = {
  id: string; storeId: string; purchaseDate: Date; dueDate: Date; reference: string; amount: Money;
  paymentMethod: PaymentMethod; createdById: string; createdByName: string | null; createdAt: Date;
  payments: Array<{ id: string; amount: Money; paidAt: Date }>;
};

export type RecognizedExpenseRow = {
  id: string; applicantName: string; category: ExpenseCategoryKey; description: string | null;
  amount: number; changeAmount: number; netAmount: number; occurredAt: string; createdAt: string;
  transactionId: string | null; attachmentUrl: string | null; hasMissingCostSnapshot: boolean;
  recordedBy: { id: string; name: string };
  source: { type: "MANUAL" | "MANUAL_TRANSFER_PURCHASE" } | { type: "GOODS_PURCHASE" | "SHOPPING_REQUEST" | "BACKDATED_PURCHASE"; id: string; number: string };
  recognitionKind: "manual" | "transfer" | "giro_payment" | "giro_due" | "overpayment";
  allocation?: { scheduleId: string; dueDate: string | null; source: "stored" | "automatic" | null };
};

export type RecognizedExpenses = {
  monthlyTotal: number | null; incomplete: boolean; entryCount: number;
  rows: RecognizedExpenseRow[];
  daily: Array<{ date: string; total: number; byCategory: Partial<Record<ExpenseCategoryKey, number>> }>;
  byCategory: Array<{ category: ExpenseCategoryKey; total: number }>;
  components: { manual: number; transfer: number; giroPayment: number; giroDue: number; overpayment: number };
};

function cents(value: Money): number {
  const text = value.toString();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw new Error("Nominal pengeluaran tidak valid.");
  const [whole, decimal = ""] = text.split(".");
  const amount = Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
  if (!Number.isSafeInteger(amount)) throw new Error("Nominal pengeluaran terlalu besar.");
  return amount;
}

function jakartaDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function calendarDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function activePurchase(purchase: Purchase): boolean {
  return purchase.status === "APPROVED" || (purchase.status === "CANCELLED" && purchase.statusBeforeCancellation === "APPROVED");
}

function correctedPurchasePayments(purchase: Purchase, expense: Expense): PurchaseExpensePayment[] {
  const correction = purchase.shoppingRequest.corrections[0];
  const snapshot = readCorrectionPaymentSnapshot(correction.afterSnapshot);
  const key = (source: { sourceKind: string; paymentId: string }) => JSON.stringify([source.sourceKind, source.paymentId]);
  const sources = new Map(snapshot.sources.map(source => [key(source), source]));
  const allocations = new Map(snapshot.allocations.map(row => [JSON.stringify([key(row), row.method]), row]));
  const stored = new Set<string>();
  if (correction.allocations.length !== snapshot.allocations.length) throw new Error("Alokasi pembayaran koreksi tidak lengkap.");
  for (const row of correction.allocations) {
    const pair = JSON.stringify([key(row), row.method]);
    const source = sources.get(key(row));
    const allocation = allocations.get(pair);
    if (stored.has(pair) || !source || !allocation || cents(row.amount) !== cents(allocation.amount) ||
      cents(row.sourceAmount) !== cents(source.amount) || calendarDate(row.paidAt) !== source.paidAt) throw new Error("Alokasi pembayaran koreksi tidak sesuai.");
    stored.add(pair);
  }
  const payablePayments = new Map((purchase.supplierPayable?.payments ?? []).map(payment => [payment.id, payment]));
  const hasExplicitCorrection = (source: { sourceKind: string; paymentId: string; amount: string; paidAt: string }) => {
    for (const entry of purchase.shoppingRequest.corrections) {
      const snapshot = entry.afterSnapshot;
      if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) continue;
      const data = "data" in snapshot ? snapshot.data : null;
      const payment = data && typeof data === "object" && !Array.isArray(data) && "payment" in data ? data.payment : null;
      const corrections = payment && typeof payment === "object" && !Array.isArray(payment) && "corrections" in payment ? payment.corrections : null;
      if (!Array.isArray(corrections)) continue;
      const match = corrections.find((row: unknown) => row && typeof row === "object" &&
        "sourceKind" in row && "paymentId" in row && row.sourceKind === source.sourceKind && row.paymentId === source.paymentId);
      if (match) return "amount" in match && "paidAt" in match &&
        (typeof match.amount === "string" || typeof match.amount === "number") && typeof match.paidAt === "string" &&
        cents(match.amount) === cents(source.amount) && match.paidAt === source.paidAt;
    }
    return false;
  };
  for (const source of snapshot.sources) {
    const actual = payablePayments.get(source.paymentId);
    if ((source.sourceKind === "TRANSFER_EXPENSE" && (source.paymentId !== expense.id ||
      (purchase.initialTransferAmount !== null && (cents(purchase.initialTransferAmount) !== cents(source.amount) ||
        !purchase.initialTransferPaidAt || calendarDate(purchase.initialTransferPaidAt) !== source.paidAt) && !hasExplicitCorrection(source)))) ||
      (source.sourceKind === "PAYABLE_PAYMENT" && (!actual || ((cents(actual.amount) !== cents(source.amount) || calendarDate(actual.paidAt) !== source.paidAt) && !hasExplicitCorrection(source))))) {
      throw new Error("Sumber pembayaran koreksi tidak sesuai.");
    }
  }
  const result: PurchaseExpensePayment[] = snapshot.allocations.map(allocation => ({
    id: JSON.stringify([allocation.sourceKind, allocation.paymentId, allocation.method]), method: allocation.method,
    sourceMethod: allocation.sourceKind === "TRANSFER_EXPENSE" ? "TRANSFER" : "GIRO",
    amountCents: cents(allocation.amount), paidAt: sources.get(key(allocation))!.paidAt,
  }));
  if (purchase.initialTransferAmount !== null && cents(purchase.initialTransferAmount) > 0 &&
    !sources.has(key({ sourceKind: "TRANSFER_EXPENSE", paymentId: expense.id }))) {
    if (!purchase.initialTransferPaidAt) throw new Error("Tanggal transfer belum tersedia.");
    result.push({ id: `transfer:${expense.id}`, method: "TRANSFER", amountCents: cents(purchase.initialTransferAmount), paidAt: calendarDate(purchase.initialTransferPaidAt) });
  }
  for (const payment of payablePayments.values()) {
    if (!sources.has(key({ sourceKind: "PAYABLE_PAYMENT", paymentId: payment.id }))) {
      result.push({ id: payment.id, method: "GIRO", amountCents: cents(payment.amount), paidAt: calendarDate(payment.paidAt) });
    }
  }
  return result.filter(payment => payment.amountCents > 0);
}

export function buildRecognizedExpenses(input: {
  storeId: string; month: string; now: Date; expenses: Expense[]; backdatedPurchases: BackdatedPurchase[];
}): RecognizedExpenses {
  if (!input.storeId || !/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month)) throw new Error("Toko atau bulan tidak valid.");
  const asOf = jakartaDate(input.now);
  const rows: RecognizedExpenseRow[] = [];
  let incomplete = false;

  for (const expense of input.expenses) {
    if (expense.storeId !== input.storeId) continue;
    try {
    const category: ExpenseCategoryKey = expense.customCategoryId ? `custom:${expense.customCategoryId}` : expense.category;
    const base = {
      applicantName: expense.applicantName, category, description: expense.description,
      createdAt: expense.createdAt.toISOString(), transactionId: expense.transactionId, attachmentUrl: expense.attachmentUrl,
      hasMissingCostSnapshot: expense.hasMissingCostSnapshot, recordedBy: expense.recordedBy,
    };
    const originalDate = jakartaDate(expense.occurredAt);
    if (!expense.goodsPurchaseId && !expense.shoppingRequestId) {
      if (!originalDate.startsWith(input.month) || originalDate > asOf) continue;
      const amount = cents(expense.amount);
      const change = cents(expense.changeAmount);
      if (change > amount) { incomplete = true; continue; }
      const transfer = expense.manualPurchasePaymentMethod === "TRANSFER";
      rows.push({ ...base, id: expense.id, amount: amount / 100, changeAmount: change / 100, netAmount: (amount - change) / 100,
        occurredAt: expense.occurredAt.toISOString(), source: { type: transfer ? "MANUAL_TRANSFER_PURCHASE" : "MANUAL" },
        recognitionKind: transfer ? "transfer" : "manual" });
      continue;
    }

    const candidates = expense.shoppingRequest?.goodsPurchases?.filter(item => item.storeId === input.storeId && activePurchase(item)) ?? [];
    const candidate = candidates.length === 1 && cents(candidates[0].totalAmount) === cents(expense.amount) - cents(expense.changeAmount) ? candidates[0] : null;
    const purchase = expense.goodsPurchaseId ? expense.goodsPurchase : candidate;
    if (!purchase || purchase.storeId !== input.storeId || !activePurchase(purchase) ||
      (purchase.supplierPayable && purchase.supplierPayable.storeId !== input.storeId) ||
      cents(purchase.totalAmount) !== cents(expense.amount) - cents(expense.changeAmount)) {
      incomplete = true;
      continue;
    }
    const schedule: PurchaseExpenseSchedule[] = purchase.payments.length
      ? purchase.payments.map(row => ({ id: row.id, method: row.method, amountCents: cents(row.amount), dueDate: row.dueDate ? calendarDate(row.dueDate) : null }))
      : purchase.paymentMethod ? [{ id: "legacy", method: purchase.paymentMethod, amountCents: cents(purchase.totalAmount), dueDate: purchase.paymentDueDate ? calendarDate(purchase.paymentDueDate) : null }] : [];
    if (!schedule.length || schedule.reduce((sum, item) => sum + item.amountCents, 0) !== cents(purchase.totalAmount)) {
      incomplete = true;
      continue;
    }
    const transferCents = purchase.initialTransferAmount === null
      ? schedule.filter(row => row.method === "TRANSFER").reduce((sum, row) => sum + row.amountCents, 0)
      : cents(purchase.initialTransferAmount);
    let payments: PurchaseExpensePayment[] = [];
    try {
      if (purchase.shoppingRequest.corrections.length) {
        payments = correctedPurchasePayments(purchase, expense);
      } else {
        if (transferCents > 0) payments.push({ id: `transfer:${expense.id}`, method: "TRANSFER", amountCents: transferCents,
          paidAt: purchase.initialTransferPaidAt ? calendarDate(purchase.initialTransferPaidAt) : originalDate });
        if (purchase.supplierPayable?.storeId === input.storeId) {
          payments.push(...purchase.supplierPayable.payments.map(row => ({ id: row.id, method: "GIRO" as const, amountCents: cents(row.amount), paidAt: calendarDate(row.paidAt) })));
        }
      }
    } catch {
      incomplete = true;
      continue;
    }
    const projected = recognizePurchaseExpenses({ asOf, schedule, payments,
      historyVerified: (!purchase.supplierPayable || Boolean(purchase.supplierPayable.giroHistoryVerifiedAt)) &&
        (!schedule.some(row => row.method === "GIRO") || Boolean(purchase.supplierPayable?.storeId === input.storeId)) });
    if (projected.incomplete) {
      incomplete = true;
      continue;
    }
    for (const entry of projected.rows) {
      if (!entry.date.startsWith(input.month)) continue;
      rows.push({ ...base, id: JSON.stringify([expense.id, entry.kind, entry.scheduleId ?? null, entry.paymentId ?? null]),
        amount: entry.amountCents / 100, changeAmount: 0, netAmount: entry.amountCents / 100,
        occurredAt: new Date(`${entry.date}T00:00:00+07:00`).toISOString(),
        source: { type: "GOODS_PURCHASE", id: purchase.id, number: purchase.number }, recognitionKind: entry.kind,
        ...(entry.scheduleId ? { allocation: { scheduleId: entry.scheduleId,
          dueDate: schedule.find(item => item.id === entry.scheduleId)?.dueDate ?? null, source: entry.allocationSource ?? null } } : {}) });
    }
    } catch { incomplete = true; }
  }

  for (const purchase of input.backdatedPurchases) {
    if (purchase.storeId !== input.storeId) continue;
    try {
    if (calendarDate(purchase.purchaseDate) > asOf) continue;
    const projected = recognizePurchaseExpenses({ asOf, schedule: [{ id: purchase.id, method: purchase.paymentMethod,
      amountCents: cents(purchase.amount), dueDate: purchase.paymentMethod === "GIRO" ? calendarDate(purchase.dueDate) : null }],
      payments: purchase.payments.map(row => ({ id: row.id, method: purchase.paymentMethod, amountCents: cents(row.amount), paidAt: calendarDate(row.paidAt) })) });
    if (projected.incomplete) {
      incomplete = true;
      continue;
    }
    for (const entry of projected.rows) {
      if (!entry.date.startsWith(input.month)) continue;
      rows.push({ id: JSON.stringify([purchase.id, entry.kind, entry.scheduleId ?? null, entry.paymentId ?? null]),
        applicantName: "Belanja Terdahulu", category: "SUPPLIES", description: `Belanja terdahulu ${purchase.reference}`,
        amount: entry.amountCents / 100, changeAmount: 0, netAmount: entry.amountCents / 100,
        occurredAt: new Date(`${entry.date}T00:00:00+07:00`).toISOString(), createdAt: purchase.createdAt.toISOString(),
        transactionId: null, attachmentUrl: null, hasMissingCostSnapshot: false,
        recordedBy: { id: purchase.createdById, name: purchase.createdByName ?? "Tidak dicatat" },
        source: { type: "BACKDATED_PURCHASE", id: purchase.id, number: purchase.reference }, recognitionKind: entry.kind,
        ...(entry.scheduleId ? { allocation: { scheduleId: entry.scheduleId,
          dueDate: purchase.paymentMethod === "GIRO" ? calendarDate(purchase.dueDate) : null, source: entry.allocationSource ?? null } } : {}) });
    }
    } catch { incomplete = true; }
  }

  rows.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || a.id.localeCompare(b.id));
  const days = new Map<string, { total: number; categories: Map<ExpenseCategoryKey, number> }>();
  const categories = new Map<ExpenseCategoryKey, number>();
  const componentCents = { manual: 0, transfer: 0, giroPayment: 0, giroDue: 0, overpayment: 0 };
  for (const row of rows) {
    const amount = Math.round(row.netAmount * 100);
    const date = jakartaDate(new Date(row.occurredAt));
    const day = days.get(date) ?? { total: 0, categories: new Map<ExpenseCategoryKey, number>() };
    day.total += amount;
    day.categories.set(row.category, (day.categories.get(row.category) ?? 0) + amount);
    days.set(date, day);
    categories.set(row.category, (categories.get(row.category) ?? 0) + amount);
    const component = row.recognitionKind === "giro_payment" ? "giroPayment" : row.recognitionKind === "giro_due" ? "giroDue" : row.recognitionKind;
    componentCents[component] += amount;
  }
  const totalCents = rows.reduce((sum, row) => sum + Math.round(row.netAmount * 100), 0);
  return {
    monthlyTotal: incomplete ? null : totalCents / 100, incomplete, entryCount: rows.length, rows,
    daily: [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, day]) => ({
      date, total: day.total / 100, byCategory: Object.fromEntries([...day.categories].map(([key, value]) => [key, value / 100])),
    })),
    byCategory: [...categories.entries()].map(([category, amount]) => ({ category, total: amount / 100 })).sort((a, b) => b.total - a.total),
    components: { manual: componentCents.manual / 100, transfer: componentCents.transfer / 100,
      giroPayment: componentCents.giroPayment / 100, giroDue: componentCents.giroDue / 100, overpayment: componentCents.overpayment / 100 },
  };
}

export async function loadRecognizedExpenses(storeId: string, month: string, now = new Date()): Promise<RecognizedExpenses> {
  if (!storeId) throw new Error("Toko pengguna belum tersedia.");
  const range = buildKeuanganMonthRange(month);
  // Backdated purchase dates are PostgreSQL DATE values, represented at UTC midnight.
  const calendarRange = { gte: new Date(range.start.getTime() + 7 * 60 * 60 * 1000), lt: new Date(range.end.getTime() + 7 * 60 * 60 * 1000) };
  // Keep ambiguous legacy/corrected records for validation; ordinary linked purchases
  // only need their full history when a schedule or payment intersects this month.
  const relevantPurchase: Prisma.GoodsPurchaseWhereInput = { OR: [
    { initialTransferPaidAt: calendarRange },
    { paymentDueDate: calendarRange },
    { payments: { some: { dueDate: calendarRange } } },
    { supplierPayable: { is: { payments: { some: { paidAt: calendarRange } } } } },
    { supplierPayable: { is: { giroHistoryVerifiedAt: null } } },
    { supplierPayable: { is: { storeId: { not: storeId } } } },
    { supplierPayable: { is: null }, OR: [{ paymentMethod: "GIRO" }, { payments: { some: { method: "GIRO" } } }] },
    { paymentMethod: null, payments: { none: {} } },
    { payments: { some: { OR: [{ amount: { lt: 0 } }, { method: "GIRO", dueDate: null }, { method: "TRANSFER", dueDate: { not: null } }] } } },
    { totalAmount: { lt: 0 } }, { initialTransferAmount: { lt: 0 } },
    { shoppingRequest: { is: { corrections: { some: {} } } } },
    { storeId: { not: storeId } },
  ] };
  const purchaseSelect = {
    id: true, storeId: true, number: true, status: true, statusBeforeCancellation: true, totalAmount: true,
    paymentMethod: true, paymentDueDate: true, initialTransferAmount: true, initialTransferPaidAt: true, supplierNameSnapshot: true,
    payments: { select: { id: true, method: true, amount: true, dueDate: true } },
    supplierPayable: { select: { storeId: true, giroHistoryVerifiedAt: true, payments: { select: { id: true, amount: true, paidAt: true } } } },
    shoppingRequest: { select: { corrections: { where: { storeId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { afterSnapshot: true, allocations: { select: { sourceKind: true, paymentId: true, method: true, amount: true, sourceAmount: true, paidAt: true } } } } } },
  } satisfies Prisma.GoodsPurchaseSelect;
  const [expenses, backdatedPurchases] = await db.$transaction(async tx => Promise.all([
    tx.expense.findMany({
      where: { storeId, deletedAt: null, backdatedPurchaseDueId: null, backdatedPurchasePaymentId: null,
        OR: [{ occurredAt: { gte: range.start, lt: range.end } },
          { goodsPurchase: { is: relevantPurchase } },
          { goodsPurchaseId: null, shoppingRequestId: { not: null } }] },
      select: { id: true, storeId: true, applicantName: true, category: true, customCategoryId: true, description: true,
        amount: true, changeAmount: true, occurredAt: true, createdAt: true, transactionId: true, attachmentUrl: true,
        hasMissingCostSnapshot: true, manualPurchasePaymentMethod: true, goodsPurchaseId: true, shoppingRequestId: true,
        recordedBy: { select: { id: true, name: true } }, goodsPurchase: { select: purchaseSelect },
        shoppingRequest: { select: { id: true, number: true, goodsPurchases: { where: { storeId }, select: purchaseSelect } } },
      },
    }),
    tx.backdatedPurchase.findMany({ where: { storeId, OR: [
      { dueDate: calendarRange }, { payments: { some: { paidAt: calendarRange } } },
    ] }, select: { id: true, storeId: true, purchaseDate: true, dueDate: true,
      reference: true, amount: true, paymentMethod: true, createdById: true, createdByName: true, createdAt: true,
      payments: { select: { id: true, amount: true, paidAt: true } } } }),
  ]), { isolationLevel: "RepeatableRead", timeout: 30_000 });
  return buildRecognizedExpenses({ storeId, month, now, expenses, backdatedPurchases });
}
