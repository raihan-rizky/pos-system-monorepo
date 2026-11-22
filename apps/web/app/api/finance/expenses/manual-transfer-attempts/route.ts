import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { apiError } from "@/lib/api/responses";
import { authorizeInTransaction, canAuthenticatedUserAccessPage, canAuthenticatedUserPerform, handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";
import { validateManualTransferExpense } from "@/features/keuangan/helpers/manual-transfer-expense";
import { isAllowedManualTransferProof } from "@/features/keuangan/helpers/manual-transfer-proof";

const log = getLogger("api:finance:manual-transfer-attempts");
const validKey = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
type Attempt = { id: string; body: string; createdAt: Date; completedAt: Date | null };

async function actor() {
  const user = await requirePermission("expense.manual_transfer", "create");
  if (!user.storeId) return { ok: false, response: apiError("Toko pengguna belum tersedia.", 403, { code: "Forbidden" }) } as const;
  if (!await canAuthenticatedUserAccessPage(user, "/keuangan")) return { ok: false, response: apiError("Akses halaman Keuangan diperlukan.", 403, { code: "Forbidden" }) } as const;
  return { ok: true, user: { ...user, storeId: user.storeId } } as const;
}

async function visibleAttempts(user: { role: Parameters<typeof canAuthenticatedUserPerform>[0]["role"] }, rows: Attempt[]) {
  const grants = await Promise.all([
    canAuthenticatedUserPerform(user, "expense", "read"),
    canAuthenticatedUserPerform(user, "expense.payable", "read"),
    canAuthenticatedUserPerform(user, "expense.manual_transfer.allocation", "update"),
  ]);
  const canReadAllocations = grants.every(Boolean);
  return rows.map(row => {
    let allocations: unknown[] = [];
    try { const parsed = JSON.parse(row.body) as { allocations?: unknown }; if (Array.isArray(parsed.allocations)) allocations = parsed.allocations; } catch { /* Invalid data remains unavailable. */ return { key: row.id, body: null, createdAt: row.createdAt, completedAt: row.completedAt }; }
    return { key: row.id, body: allocations.length && !canReadAllocations ? null : row.body, createdAt: row.createdAt, completedAt: row.completedAt };
  });
}

export async function GET(_request?: Request) {
  try {
    const access = await actor(); if (!access.ok) return access.response;
    const rows = await db.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify([access.user.storeId, access.user.id, "manual-transfer-attempt"])}, 0))`;
      if (!await authorizeInTransaction(tx, access.user, { resources: [{ resource: "expense.manual_transfer", action: "create" }], page: "/keuangan" })) return null;
      return tx.manualTransferAttempt.findMany({ where: { storeId: access.user.storeId, userId: access.user.id }, orderBy: { createdAt: "asc" }, take: 100 });
    }, { isolationLevel: "ReadCommitted" });
    if (!rows) return apiError("Sesi atau izin pengguna berubah. Muat ulang dan coba lagi.", 403, { code: "Forbidden" });
    return NextResponse.json({ attempts: await visibleAttempts(access.user, rows) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { const auth = handleAuthError(error); if (auth) return auth; log.error("Gagal memuat percobaan transfer", error); return apiError("Percobaan transfer belum dapat dimuat.", 500, { code: "InternalError" }); }
}

export async function POST(request: Request) {
  try {
    const access = await actor(); if (!access.ok) return access.response;
    const input = await request.json().catch(() => null) as { key?: unknown; body?: unknown; forceNew?: unknown; acknowledgedAttempts?: Array<{ key?: unknown; completedAt?: unknown }> } | null;
    if (!validKey(input?.key) || typeof input.body !== "string" || input.body.length > 50_000 || typeof input.forceNew !== "boolean") return apiError("Data percobaan transfer tidak valid.", 422, { code: "ValidationError" });
    let payload: Record<string, unknown>;
    try { payload = JSON.parse(input.body) as Record<string, unknown>; } catch { return apiError("Data transfer tidak valid.", 422, { code: "ValidationError" }); }
    if (!payload || typeof payload !== "object" || Array.isArray(payload) || payload.manualPurchasePaymentMethod !== "TRANSFER" || !validateManualTransferExpense(payload).success
      || (payload.allocations !== undefined && (!Array.isArray(payload.allocations) || payload.allocations.length > 100))) return apiError("Data transfer tidak valid.", 422, { code: "ValidationError" });
    if (!isAllowedManualTransferProof(payload.attachmentUrl, access.user.storeId)) return apiError("Bukti transfer tidak sesuai dengan toko ini.", 422, { code: "ValidationError" });
    const allocations = (payload.allocations ?? []) as Array<{ paymentId?: unknown }>;
    if (allocations.length) {
      const permissions = [["expense", "read"], ["expense.payable", "read"], ["expense.manual_transfer.allocation", "update"],
        ...(allocations.some(row => row?.paymentId === null) ? [["expense.payable", "update"] as const] : [])] as const;
      for (const [target, action] of permissions) {
        const authorized = await requirePermission(target, action);
        if (authorized.id !== access.user.id || authorized.storeId !== access.user.storeId || authorized.role !== access.user.role) return apiError("Sesi pengguna berubah. Muat ulang dan coba lagi.", 403, { code: "Forbidden" });
      }
    }
    const key = input.key.toLowerCase(), body = input.body, forceNew = input.forceNew;
    const acknowledged = Array.isArray(input.acknowledgedAttempts) ? input.acknowledgedAttempts : [];
    const result = await db.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify([access.user.storeId, access.user.id, "manual-transfer-attempt"])}, 0))`;
      const resources = [
        { resource: "expense.manual_transfer", action: "create" as const },
        ...(allocations.length ? [
          { resource: "expense", action: "read" as const },
          { resource: "expense.payable", action: "read" as const },
          { resource: "expense.manual_transfer.allocation", action: "update" as const },
          ...(allocations.some(row => row?.paymentId === null) ? [{ resource: "expense.payable", action: "update" as const }] : []),
        ] : []),
      ];
      if (!await authorizeInTransaction(tx, access.user, { resources, page: "/keuangan" })) return { kind: "forbidden" as const };
      const existing = await tx.manualTransferAttempt.findUnique({ where: { id: key } });
      if (existing) return existing.storeId === access.user.storeId && existing.userId === access.user.id && existing.body === body ? { kind: "existing" as const, row: existing } : { kind: "conflict" as const };
      const pending = await tx.manualTransferAttempt.findMany({ where: { storeId: access.user.storeId, userId: access.user.id }, orderBy: { createdAt: "asc" }, take: 100 });
      const expected = acknowledged.map(row => `${row.key}:${row.completedAt ?? ""}`).sort();
      const actual = pending.map(row => `${row.id}:${row.completedAt?.toISOString() ?? ""}`).sort();
      if (pending.length >= 100) return { kind: "limit" as const, pending };
      if (pending.length && (!forceNew || actual.length !== expected.length || actual.some((row, index) => row !== expected[index]))) return { kind: "pending" as const, pending };
      const created = await tx.manualTransferAttempt.create({ data: { id: key, storeId: access.user.storeId, userId: access.user.id, body } });
      return { kind: "created" as const, row: created };
    }, { isolationLevel: "ReadCommitted" });
    if (result.kind === "forbidden") return apiError("Sesi atau izin pengguna berubah. Muat ulang dan coba lagi.", 403, { code: "Forbidden" });
    if (result.kind === "conflict") return apiError("Kunci percobaan sudah digunakan.", 409, { code: "Conflict" });
    if (result.kind === "limit") return NextResponse.json({ message: "Selesaikan atau lupakan percobaan sebelumnya sebelum menambah transfer.", attempts: await visibleAttempts(access.user, result.pending) }, { status: 409 });
    if (result.kind === "pending") return NextResponse.json({ message: "Periksa transfer sebelumnya.", attempts: await visibleAttempts(access.user, result.pending) }, { status: 409 });
    return NextResponse.json({ attempt: (await visibleAttempts(access.user, [result.row]))[0] }, { status: result.kind === "created" ? 201 : 200 });
  } catch (error) { const auth = handleAuthError(error); if (auth) return auth; log.error("Gagal menyimpan percobaan transfer", error); return apiError("Percobaan transfer belum dapat disimpan.", 500, { code: "InternalError" }); }
}

export async function DELETE(request: Request) {
  try {
    const access = await actor(); if (!access.ok) return access.response;
    const input = await request.json().catch(() => null) as { key?: unknown; expectedCompleted?: unknown } | null;
    if (!validKey(input?.key) || typeof input.expectedCompleted !== "boolean") return apiError("Data percobaan tidak valid.", 422, { code: "ValidationError" });
    const key = input.key.toLowerCase();
    const result = await db.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify([access.user.storeId, access.user.id, "manual-transfer-attempt"])}, 0))`;
      if (!await authorizeInTransaction(tx, access.user, { resources: [{ resource: "expense.manual_transfer", action: "create" }], page: "/keuangan" })) return { kind: "forbidden" as const };
      const existing = await tx.manualTransferAttempt.findUnique({ where: { id: key } });
      if (!existing || existing.storeId !== access.user.storeId || existing.userId !== access.user.id) return { kind: "cleared" as const };
      if (Boolean(existing.completedAt) !== input.expectedCompleted) return { kind: "conflict" as const, row: existing };
      await tx.manualTransferAttempt.deleteMany({ where: { id: key, storeId: access.user.storeId, userId: access.user.id } });
      return { kind: "cleared" as const };
    }, { isolationLevel: "ReadCommitted" });
    if (result.kind === "forbidden") return apiError("Sesi atau izin pengguna berubah. Muat ulang dan coba lagi.", 403, { code: "Forbidden" });
    if (result.kind === "conflict") return NextResponse.json({ message: "Status transfer berubah. Periksa kembali sebelum melanjutkan.", attempt: (await visibleAttempts(access.user, [result.row]))[0] }, { status: 409 });
    return NextResponse.json({ success: true });
  } catch (error) { const auth = handleAuthError(error); if (auth) return auth; log.error("Gagal menghapus percobaan transfer", error); return apiError("Percobaan transfer belum dapat dihapus.", 500, { code: "InternalError" }); }
}
