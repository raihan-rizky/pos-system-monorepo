import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { getCurrentUser, handleAuthError } from "@/lib/rbac/guard";
import { apiError } from "@/lib/api/responses";
import { getLogger } from "@/lib/logger";
import { getGlobalRolePermissions } from "@/features/rbac/helpers/rbac-server";
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
      || (category !== null && category !== "ATK" && category !== "Percetakan")
      || (subcategory !== null && (!category || !subcategory.trim() || subcategory.length > 150))
      || (method !== null && !methods.has(method))
      || (mode === "outstanding-dp" && (category || subcategory || method))) {
      return apiError("Filter penerimaan tidak valid.", 422, { code: "ValidationError" });
    }
    if (view === "sales" && user.role !== "OWNER") return apiError("Pratinjau hanya tersedia untuk Owner.", 403, { code: "Forbidden" });
    let permissions;
    try { permissions = await getGlobalRolePermissions(); }
    catch { return apiError("Hak akses belum dapat diperiksa.", 503, { code: "ServiceUnavailable" }); }
    const access = resolveReceiptHistoryAccess(view === "sales" ? "SALES" : user.role, permissions);
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
    const groups = new Map<string, { transactionId: string; date: string; cents: number; methods: Set<string> }>();
    const manualGroups = new Map<string, { id: string; date: string; cents: number; methods: Set<string> }>();
    if (mode === "outstanding-dp") {
      for (const row of period.outstandingDp) {
        if (row.remaining <= 0) continue;
        groups.set(row.transactionId, { transactionId: row.transactionId, date: toDate, cents: Math.round(row.remaining * 100), methods: new Set() });
      }
    } else {
      for (const row of period.contributions) {
        if (method && row.method !== method) continue;
        const allocations = row.allocations.filter(part => (!category || part.category === category) && (!subcategory || part.subcategory === subcategory));
        const cents = (category || subcategory) ? allocations.reduce((sum, part) => sum + Math.round(part.amount * 100), 0) : Math.round(row.amount * 100);
        if (cents <= 0) continue;
        if (row.source === "transaction" && row.transactionId) {
          const key = `${row.transactionId}:${row.date}`;
          const group = groups.get(key) ?? { transactionId: row.transactionId, date: row.date, cents: 0, methods: new Set<string>() };
          group.cents += cents; group.methods.add(row.method); groups.set(key, group);
        } else if (access.manualDetails && row.manualIncomeId) {
          const group = manualGroups.get(row.manualIncomeId) ?? { id: row.manualIncomeId, date: row.date, cents: 0, methods: new Set<string>() };
          group.cents += cents; group.methods.add(row.method); manualGroups.set(row.manualIncomeId, group);
        }
      }
    }

    const transactionIds = [...new Set([...groups.values()].map(row => row.transactionId))];
    const manualIds = [...manualGroups.keys()];
    const [transactions, manual] = await Promise.all([
      transactionIds.length ? db.transaction.findMany({ where: { storeId: user.storeId, id: { in: transactionIds } }, select: { id: true, invoiceNumber: true } }) : [],
      manualIds.length && access.manualDetails ? db.manualIncome.findMany({ where: { storeId: user.storeId, id: { in: manualIds }, deletedAt: null }, select: { id: true, description: true } }) : [],
    ]);
    const invoiceNumbers = new Map(transactions.map(row => [row.id, row.invoiceNumber]));
    const descriptions = new Map(manual.map(row => [row.id, row.description]));
    const items = [...groups.values()].filter(row => invoiceNumbers.has(row.transactionId)).map(row => ({
      transactionId: row.transactionId, invoiceNumber: invoiceNumbers.get(row.transactionId), date: row.date, amount: row.cents / 100, methods: access.method ? [...row.methods] : [],
    })).sort((a, b) => b.date.localeCompare(a.date) || a.transactionId.localeCompare(b.transactionId));
    const manualEntries = [...manualGroups.values()].filter(row => descriptions.has(row.id)).map(row => ({
      id: row.id, description: descriptions.get(row.id), date: row.date, amount: row.cents / 100, methods: access.method ? [...row.methods] : [],
    })).sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
    return NextResponse.json({ mode, dateFrom: fromDate, dateTo: toDate, items, manualDetailsAvailable: access.manualDetails,
      ...(access.manualDetails && mode === "receipt" ? { manualEntries } : {}) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const auth = handleAuthError(error);
    if (auth) return auth;
    log.error("Gagal memuat penerimaan Riwayat", error);
    return apiError("Penerimaan belum dapat dimuat. Silakan coba lagi.", 500, { code: "InternalError" });
  }
}
