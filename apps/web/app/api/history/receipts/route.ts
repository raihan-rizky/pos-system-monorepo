import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { getCurrentUser, handleAuthError } from "@/lib/rbac/guard";
import { apiError } from "@/lib/api/responses";
import { getLogger } from "@/lib/logger";
import { getGlobalRolePermissions } from "@/features/rbac/helpers/rbac-server";
import { canRolePerformAction } from "@/features/rbac/helpers/rbac-core";
import { resolveReceiptHistoryAccess } from "@/features/financial-report/helpers/income-access";
import { buildDailyIncomeRange } from "@/features/financial-report/helpers/daily-income";
import { loadIncomePeriod } from "@/features/financial-report/services/daily-income";

const log = getLogger("api:history:receipts");
const methods = new Set(["CASH", "DEBIT", "CREDIT", "QRIS", "TRANSFER", "Belum dicatat"]);
const allowedParams = new Set(["mode", "dateFrom", "dateTo", "category", "subcategory", "method", "view"]);
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return apiError("Silakan masuk untuk melihat Riwayat.", 401, { code: "Unauthorized" });
    if (!user.storeId) return apiError("Toko pengguna belum tersedia.", 403, { code: "Forbidden" });
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some(key => !allowedParams.has(key) || params.getAll(key).length > 1)) {
      return apiError("Filter penerimaan tidak valid.", 422, { code: "ValidationError" });
    }
    const mode = params.get("mode");
    const fromDate = params.get("dateFrom") ?? "";
    const toDate = params.get("dateTo") ?? "";
    const category = params.get("category");
    const subcategory = params.get("subcategory");
    const method = params.get("method");
    const view = params.get("view");
    if ((mode !== "receipt" && mode !== "outstanding-dp") || (view !== null && view !== "sales")
      || (category !== null && !["ATK", "Percetakan", "Belum ditentukan", "Piutang Manual", "Lainnya"].includes(category))
      || (subcategory !== null && (!category || !subcategory.trim() || subcategory.length > 150))
      || (method !== null && !methods.has(method))
      || (mode === "outstanding-dp" && (category || subcategory || method))) {
      return apiError("Filter penerimaan tidak valid.", 422, { code: "ValidationError" });
    }
    if (view === "sales" && user.role !== "OWNER") return apiError("Pratinjau hanya tersedia untuk Owner.", 403, { code: "Forbidden" });
    let permissions;
    try { permissions = await getGlobalRolePermissions(); }
    catch { return apiError("Hak akses belum dapat diperiksa.", 503, { code: "ServiceUnavailable" }); }
    const effectiveRole = view === "sales" ? "SALES" : user.role;
    const access = resolveReceiptHistoryAccess(effectiveRole, permissions);
    const permitted = mode === "outstanding-dp" ? access.outstandingDp
      : (subcategory ? access.subcategory : category ? access.category : method ? access.method : access.total)
        && (!method || access.method);
    if (!permitted) return apiError("Akses penerimaan belum diizinkan.", 403, { code: "Forbidden" });

    let start: Date;
    let end: Date;
    try {
      start = buildDailyIncomeRange(fromDate).start;
      end = buildDailyIncomeRange(toDate).end;
      if (end.getTime() <= start.getTime() || end.getTime() - start.getTime() > 31 * 86_400_000) throw new RangeError();
    } catch {
      return apiError("Pilih rentang tanggal yang valid hingga 31 hari.", 422, { code: "ValidationError" });
    }

    const period = await loadIncomePeriod(user.storeId, mode === "outstanding-dp" ? toDate : fromDate, toDate);
    const matchingAllocations = (row: (typeof period.contributions)[number]) => row.allocations.filter(part => {
      if (category === "Piutang Manual") {
        return row.source === "manual-receivable" && (!subcategory || subcategory === "Tanpa kategori" || part.subcategory === subcategory);
      }
      return (!category || part.category === category) && (!subcategory || part.subcategory === subcategory);
    });
    const receiptTotal = mode === "receipt" ? period.contributions.reduce((sum, row) => {
      if (method && row.method !== method) return sum;
      const allocations = matchingAllocations(row);
      const cents = category || subcategory
        ? allocations.reduce((amount, part) => amount + Math.round(part.amount * 100), 0)
        : Math.round(row.amount * 100);
      return sum + cents;
    }, 0) / 100 : undefined;
    type Amounts = { cents: number; methods: Set<string>; payments: Map<string, number>; categories: Map<string, number> };
    const emptyAmounts = (): Amounts => ({ cents: 0, methods: new Set(), payments: new Map(), categories: new Map() });
    const addAmounts = (group: Amounts, paymentMethod: string, cents: number, allocations: Array<{ category: string; amount: number }>) => {
      group.cents += cents;
      group.methods.add(paymentMethod);
      group.payments.set(paymentMethod, (group.payments.get(paymentMethod) ?? 0) + cents);
      for (const allocation of allocations) {
        group.categories.set(allocation.category, (group.categories.get(allocation.category) ?? 0) + Math.round(allocation.amount * 100));
      }
    };
    const breakdown = (group: Amounts) => mode === "receipt" ? {
      ...(access.method && { paymentBreakdown: [...group.payments].sort(([a], [b]) => a.localeCompare(b)).map(([method, cents]) => ({ method, amount: cents / 100 })) }),
      ...(access.category && { categoryBreakdown: [...group.categories].sort(([a], [b]) => a.localeCompare(b)).map(([category, cents]) => ({ category, amount: cents / 100 })) }),
    } : {};
    const groups = new Map<string, Amounts & { transactionId: string; date: string; isReceivableNota: boolean }>();
    const manualGroups = new Map<string, Amounts & { id: string; date: string }>();
    const manualReceivableGroups = new Map<string, Amounts & { id: string; date: string; receivableId: string }>();
    if (mode === "outstanding-dp") {
      for (const row of period.outstandingDp) {
        if (row.remaining <= 0) continue;
        groups.set(row.transactionId, { ...emptyAmounts(), transactionId: row.transactionId, date: toDate, cents: Math.round(row.remaining * 100), isReceivableNota: false });
      }
    } else {
      for (const row of period.contributions) {
        if (method && row.method !== method) continue;
        const allocations = matchingAllocations(row);
        const cents = (category || subcategory) ? allocations.reduce((sum, part) => sum + Math.round(part.amount * 100), 0) : Math.round(row.amount * 100);
        if (cents <= 0) continue;
        if (row.source === "transaction" && row.transactionId) {
          const key = `${row.transactionId}:${row.date}`;
          const group = groups.get(key) ?? { ...emptyAmounts(), transactionId: row.transactionId, date: row.date, isReceivableNota: false };
          group.isReceivableNota ||= row.isReceivableNota === true;
          addAmounts(group, row.method, cents, allocations); groups.set(key, group);
        } else if (access.manualDetails && row.manualIncomeId) {
          const group = manualGroups.get(row.manualIncomeId) ?? { ...emptyAmounts(), id: row.manualIncomeId, date: row.date };
          addAmounts(group, row.method, cents, allocations); manualGroups.set(row.manualIncomeId, group);
        } else if (access.manualReceivableDetails && row.receivablePaymentId) {
          const group = manualReceivableGroups.get(row.receivablePaymentId) ?? { ...emptyAmounts(), id: row.receivablePaymentId, receivableId: row.receivableId ?? "", date: row.date };
          addAmounts(group, row.method, cents, allocations); manualReceivableGroups.set(row.receivablePaymentId, group);
        }
      }
    }

    const transactionIds = [...new Set([...groups.values()].map(row => row.transactionId))];
    const manualIds = [...manualGroups.keys()];
    const receivablePaymentIds = [...manualReceivableGroups.keys()];
    const [transactions, manual, receivablePayments] = await Promise.all([
      transactionIds.length ? db.transaction.findMany({ where: { storeId: user.storeId, id: { in: transactionIds } }, select: { id: true, invoiceNumber: true } }) : [],
      manualIds.length && access.manualDetails ? db.manualIncome.findMany({ where: { storeId: user.storeId, id: { in: manualIds }, deletedAt: null }, select: { id: true, description: true } }) : [],
      receivablePaymentIds.length && access.manualReceivableDetails ? db.customerReceivablePayment.findMany({ where: { id: { in: receivablePaymentIds }, receivable: { storeId: user.storeId } }, select: { id: true, receivableId: true, receivable: { select: { note: true, customer: { select: { name: true } } } } } }) : [],
    ]);
    const invoiceNumbers = new Map(transactions.map(row => [row.id, row.invoiceNumber]));
    const descriptions = new Map(manual.map(row => [row.id, row.description]));
    const receivableDetails = new Map(receivablePayments.map(row => [row.id, row]));
    const items = [...groups.values()].filter(row => invoiceNumbers.has(row.transactionId)).map(row => ({
      transactionId: row.transactionId, invoiceNumber: invoiceNumbers.get(row.transactionId), date: row.date, amount: row.cents / 100, methods: access.method ? [...row.methods] : [], isReceivableNota: row.isReceivableNota, ...breakdown(row),
    })).sort((a, b) => b.date.localeCompare(a.date) || a.transactionId.localeCompare(b.transactionId));
    const manualEntries = [...manualGroups.values()].filter(row => descriptions.has(row.id)).map(row => ({
      id: row.id, description: descriptions.get(row.id), date: row.date, amount: row.cents / 100, methods: access.method ? [...row.methods] : [], ...breakdown(row),
    })).sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
    const manualReceivableEntries = [...manualReceivableGroups.values()].filter(row => receivableDetails.has(row.id)).map(row => {
      const detail = receivableDetails.get(row.id)!;
      return { id: row.id, receivableId: detail.receivableId, customerName: detail.receivable.customer.name, description: detail.receivable.note, date: row.date, amount: row.cents / 100, methods: access.method ? [...row.methods] : [], ...breakdown(row) };
    }).sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
    const supplierRefundEntries = mode === "receipt" && (access.category || access.subcategory)
      ? period.contributions.filter(row => row.source === "supplier-refund" && (!method || row.method === method)
        && matchingAllocations(row).length > 0).map(({ id, date, amount }) => ({ id, date, amount }))
      : [];
    const dailySummary = mode === "receipt" && fromDate === toDate && !category && !subcategory && !method && access.total
      ? period.days[0] : undefined;
    const canCompare = Boolean(dailySummary && access.method && canRolePerformAction(effectiveRole, "financial-report.daily-comparison", "read", permissions));
    return NextResponse.json({ mode, dateFrom: fromDate, dateTo: toDate, items, ...(receiptTotal !== undefined && { receiptTotal }), manualDetailsAvailable: access.manualDetails, manualReceivableDetailsAvailable: access.manualReceivableDetails,
      ...(access.manualDetails && mode === "receipt" ? { manualEntries } : {}),
      ...(access.manualReceivableDetails && mode === "receipt" ? { manualReceivableEntries } : {}),
      ...(supplierRefundEntries.length > 0 && { supplierRefundEntries }),
      ...(dailySummary && { summary: { total: dailySummary.total, ...(access.method && { paymentMethods: dailySummary.paymentMethods }) } }),
      ...(dailySummary && access.method && { comparisonAccess: { read: canCompare, create: canCompare && view !== "sales" && canRolePerformAction(effectiveRole, "financial-report.daily-comparison", "create", permissions), update: canCompare && view !== "sales" && canRolePerformAction(effectiveRole, "financial-report.daily-comparison", "update", permissions) } }),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const auth = handleAuthError(error);
    if (auth) return auth;
    log.error("Gagal memuat penerimaan Riwayat", error);
    return apiError("Penerimaan belum dapat dimuat. Silakan coba lagi.", 500, { code: "InternalError" });
  }
}
