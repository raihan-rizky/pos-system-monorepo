import { NextResponse } from "next/server";
import { db, Prisma } from "@pos/db";
import { apiError } from "@/lib/api/responses";
import { getLogger } from "@/lib/logger";
import { getCurrentUser, handleAuthError } from "@/lib/rbac/guard";
import { canRoleAccessPage, canRolePerformAction } from "@/features/rbac/helpers/rbac-core";
import { getGlobalRolePermissions } from "@/features/rbac/helpers/rbac-server";
import { resolveReceiptHistoryAccess } from "@/features/financial-report/helpers/income-access";
import { buildDailyIncomeRange } from "@/features/financial-report/helpers/daily-income";
import { parseComparisonAmounts, snapshotPaymentMethods } from "@/features/financial-report/helpers/daily-comparison";
import { loadIncomePeriod } from "@/features/financial-report/services/daily-income";

export const dynamic = "force-dynamic";
const log = getLogger("api:finance:daily-comparison");
const headers = { "Cache-Control": "private, no-store" };
const conflict = () => apiError("Pemeriksaan sudah berubah. Muat ulang dan periksa kembali sebelum menyimpan.", 409, { code: "Conflict" });

type SavedComparison = Prisma.DailyIncomeComparisonGetPayload<{ include: { amounts: true } }>;
function serialize(row: SavedComparison) {
  return {
    date: row.date.toISOString().slice(0, 10), revision: row.revision,
    amounts: row.amounts.map(item => ({ method: item.method, amount: item.amount.toFixed(2) })).sort((a, b) => a.method.localeCompare(b.method)),
    posAtSave: row.posSnapshot, savedAt: row.savedAt.toISOString(), savedBy: row.savedByName,
  };
}

async function authorize(request: Request, write: boolean) {
  const user = await getCurrentUser();
  if (!user) return { error: apiError("Silakan masuk untuk melihat pemeriksaan penerimaan.", 401, { code: "Unauthorized" }) };
  if (!user.storeId) return { error: apiError("Toko pengguna belum tersedia.", 403, { code: "Forbidden" }) };
  const params = new URL(request.url).searchParams;
  const view = params.get("view");
  if (write && view !== null) return { error: apiError("Pemeriksaan tidak dapat disimpan dari pratinjau.", 403, { code: "Forbidden" }) };
  if ([...params.keys()].some(key => !(write ? [] : ["date", "view"]).includes(key) || params.getAll(key).length > 1) || (view !== null && view !== "sales")) {
    return { error: apiError("Permintaan pemeriksaan tidak valid.", 422, { code: "ValidationError" }) };
  }
  if (view === "sales" && user.role !== "OWNER") return { error: apiError("Pratinjau hanya tersedia untuk Owner.", 403, { code: "Forbidden" }) };
  let permissions;
  try { permissions = await getGlobalRolePermissions(); }
  catch { return { error: apiError("Hak akses belum dapat diperiksa.", 503, { code: "ServiceUnavailable" }) }; }
  const role = view === "sales" ? "SALES" : user.role;
  const access = resolveReceiptHistoryAccess(role, permissions);
  if (!canRoleAccessPage(user.role, "/financial-report", permissions) || !access.total || !access.method || !canRolePerformAction(role, "financial-report.daily-comparison", "read", permissions)) {
    return { error: apiError("Akses pemeriksaan penerimaan belum diizinkan.", 403, { code: "Forbidden" }) };
  }
  return { user: { ...user, storeId: user.storeId }, permissions, role, params };
}

export async function GET(request: Request) {
  try {
    const auth = await authorize(request, false);
    if (auth.error) return auth.error;
    const date = auth.params.get("date") ?? "";
    try { buildDailyIncomeRange(date); } catch { return apiError("Pilih tanggal pemasukan yang valid.", 422, { code: "ValidationError" }); }
    const row = await db.dailyIncomeComparison.findUnique({ where: { storeId_date: { storeId: auth.user.storeId, date: new Date(`${date}T00:00:00.000Z`) } }, include: { amounts: true } });
    return NextResponse.json({ comparison: row ? serialize(row) : null }, { headers });
  } catch (error) {
    const auth = handleAuthError(error); if (auth) return auth;
    log.error("Gagal memuat pemeriksaan penerimaan", error);
    return apiError("Pemeriksaan penerimaan belum dapat dimuat.", 500, { code: "InternalError" });
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await authorize(request, true);
    if (auth.error) return auth.error;
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => !["date", "revision", "amounts"].includes(key))) {
      return apiError("Periksa tanggal dan nominal penerimaan.", 422, { code: "ValidationError" });
    }
    const input = body as { date?: unknown; revision?: unknown; amounts?: unknown };
    if (typeof input.date !== "string" || !(input.revision === null || (typeof input.revision === "number" && Number.isSafeInteger(input.revision) && input.revision > 0))) {
      return apiError("Periksa tanggal dan versi pemeriksaan.", 422, { code: "ValidationError" });
    }
    try { buildDailyIncomeRange(input.date); } catch { return apiError("Pilih tanggal pemasukan yang valid.", 422, { code: "ValidationError" }); }
    const amounts = parseComparisonAmounts(input.amounts);
    if (!amounts) return apiError("Periksa nominal dan metode pembayaran.", 422, { code: "ValidationError" });
    const date = input.date;
    const dbDate = new Date(`${date}T00:00:00.000Z`);
    const existing = await db.dailyIncomeComparison.findUnique({ where: { storeId_date: { storeId: auth.user.storeId, date: dbDate } } });
    const action = existing ? "update" : "create";
    if (!canRolePerformAction(auth.role, "financial-report.daily-comparison", action, auth.permissions)) return apiError("Akses menyimpan pemeriksaan belum diizinkan.", 403, { code: "Forbidden" });
    if (existing ? input.revision !== existing.revision : input.revision !== null) return conflict();
    const period = await loadIncomePeriod(auth.user.storeId, date, date);
    const summary = period.days[0];
    if (!summary) throw new Error("Ringkasan hari tidak tersedia");
    const posSnapshot = snapshotPaymentMethods(summary.paymentMethods);
    const saved = await db.$transaction(async tx => {
      if (!existing) return tx.dailyIncomeComparison.create({ data: { storeId: auth.user.storeId, date: dbDate, savedById: auth.user.id, savedByName: auth.user.name, posSnapshot, amounts: { create: amounts } }, include: { amounts: true } });
      const updated = await tx.dailyIncomeComparison.updateMany({ where: { id: existing.id, storeId: auth.user.storeId, revision: input.revision as number }, data: { revision: { increment: 1 }, savedById: auth.user.id, savedByName: auth.user.name, savedAt: new Date(), posSnapshot } });
      if (updated.count !== 1) return null;
      await tx.dailyIncomeComparisonAmount.deleteMany({ where: { comparisonId: existing.id } });
      if (amounts.length) await tx.dailyIncomeComparisonAmount.createMany({ data: amounts.map(item => ({ ...item, comparisonId: existing.id })) });
      return tx.dailyIncomeComparison.findUniqueOrThrow({ where: { id: existing.id }, include: { amounts: true } });
    });
    return saved ? NextResponse.json({ comparison: serialize(saved), summary: { total: summary.total, paymentMethods: summary.paymentMethods } }, { headers }) : conflict();
  } catch (error) {
    const auth = handleAuthError(error); if (auth) return auth;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return conflict();
    log.error("Gagal menyimpan pemeriksaan penerimaan", error);
    return apiError("Pemeriksaan penerimaan belum dapat disimpan.", 500, { code: "InternalError" });
  }
}
