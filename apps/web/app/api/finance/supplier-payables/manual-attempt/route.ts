import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { apiError } from "@/lib/api/responses";
import { canAuthenticatedUserAccessPage, canAuthenticatedUserPerform, handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";
import { parsePayable } from "@/features/keuangan/helpers/supplier-payable-input";
import { isPayableRequestKey, lockPayableAttempt, payableRequestScope, reauthorizePayableActor, type PayableAttempt } from "@/features/keuangan/services/manual-payable-attempt";

const log = getLogger("api:finance:manual-payable-attempt");

async function actor() {
  const user = await requirePermission("expense.payable", "create");
  if (!user.storeId) return { ok: false, response: apiError("Toko pengguna belum tersedia.", 403, { code: "Forbidden" }) } as const;
  if (!await canAuthenticatedUserAccessPage(user, "/keuangan")) return { ok: false, response: apiError("Akses halaman Keuangan diperlukan.", 403, { code: "Forbidden" }) } as const;
  return { ok: true, user: { ...user, storeId: user.storeId } } as const;
}

async function visible(user: Awaited<ReturnType<typeof actor>> & { ok: true }, row: PayableAttempt | null) {
  if (!row?.key || !row.body) return { version: row?.version ?? "0", attempt: null };
  let input: ReturnType<typeof parsePayable> = null;
  try { input = parsePayable(JSON.parse(row.body)); } catch { /* Keep unreadable data hidden. */ }
  const permitted = input?.initialPayment === null || (input && (await Promise.all([
    canAuthenticatedUserPerform(user.user, "expense.payable", "read"),
    canAuthenticatedUserPerform(user.user, "expense.payable", "update"),
  ])).every(Boolean));
  return { version: row.version, attempt: { key: row.key, body: permitted ? row.body : null, completedAt: row.completedAt } };
}

export async function GET() {
  try {
    const access = await actor(); if (!access.ok) return access.response;
    const result = await db.$transaction(async tx => {
      const row = await lockPayableAttempt(tx, access.user);
      return await reauthorizePayableActor(tx, access.user, false) ? { row } : null;
    }, { isolationLevel: "ReadCommitted" });
    if (!result) return apiError("Sesi atau izin pengguna berubah. Muat ulang dan coba lagi.", 403, { code: "Forbidden" });
    return NextResponse.json(await visible(access, result.row), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { const auth = handleAuthError(error); if (auth) return auth; log.error("Gagal memuat percobaan hutang", error); return apiError("Percobaan hutang belum dapat dimuat.", 500, { code: "InternalError" }); }
}

export async function POST(request: Request) {
  try {
    const access = await actor(); if (!access.ok) return access.response;
    const requestBody = await request.json().catch(() => null) as { key?: unknown; version?: unknown; body?: unknown } | null;
    const input = parsePayable(requestBody?.body);
    if (!isPayableRequestKey(requestBody?.key) || typeof requestBody.version !== "string" || (requestBody.version !== "0" && !isPayableRequestKey(requestBody.version)) || !input) return apiError("Data percobaan hutang tidak valid.", 422, { code: "ValidationError" });
    if (input.initialPayment !== null) {
      for (const action of ["read", "update"] as const) {
        const authorized = await requirePermission("expense.payable", action);
        if (authorized.id !== access.user.id || authorized.storeId !== access.user.storeId || authorized.role !== access.user.role) return apiError("Sesi pengguna berubah. Muat ulang dan coba lagi.", 403, { code: "Forbidden" });
      }
    }
    const key = requestBody.key.toLowerCase(), body = JSON.stringify(input), version = requestBody.version;
    const result = await db.$transaction(async tx => {
      const current = await lockPayableAttempt(tx, access.user);
      if (!await reauthorizePayableActor(tx, access.user, input.initialPayment !== null)) return { kind: "forbidden" as const };
      if (current?.key) return current.key === key && current.body === body ? { kind: "existing" as const, row: current } : { kind: "conflict" as const, row: current };
      if ((current?.version ?? "0") !== version) return { kind: "conflict" as const, row: current };
      const [used] = await tx.$queryRaw<{ scope: string }[]>`SELECT "scope" FROM "pos_manual_payable_requests" WHERE "scope" = ${payableRequestScope(access.user, key)}`;
      if (used) return { kind: "conflict" as const, row: current };
      const next: PayableAttempt = { version: randomUUID(), key, body, completedAt: null };
      await tx.$executeRaw`
        INSERT INTO "pos_manual_payable_attempts" ("storeId", "userId", "version", "key", "body", "completedAt")
        VALUES (${access.user.storeId}, ${access.user.id}, ${next.version}, ${key}, ${body}, NULL)
        ON CONFLICT ("storeId", "userId") DO UPDATE SET "version" = EXCLUDED."version", "key" = EXCLUDED."key", "body" = EXCLUDED."body", "completedAt" = NULL
      `;
      return { kind: "created" as const, row: next };
    }, { isolationLevel: "ReadCommitted" });
    if (result.kind === "forbidden") return apiError("Sesi atau izin pengguna berubah. Muat ulang dan coba lagi.", 403, { code: "Forbidden" });
    const state = await visible(access, result.row);
    if (result.kind === "conflict") return NextResponse.json({ message: "Status hutang sebelumnya berubah. Periksa kembali sebelum melanjutkan.", ...state }, { status: 409, headers: { "Cache-Control": "private, no-store" } });
    return NextResponse.json(state, { status: result.kind === "created" ? 201 : 200, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { const auth = handleAuthError(error); if (auth) return auth; log.error("Gagal menyimpan percobaan hutang", error); return apiError("Percobaan hutang belum dapat disimpan.", 500, { code: "InternalError" }); }
}

export async function DELETE(request: Request) {
  try {
    const access = await actor(); if (!access.ok) return access.response;
    const input = await request.json().catch(() => null) as { key?: unknown; expectedCompleted?: unknown } | null;
    if (!isPayableRequestKey(input?.key) || typeof input.expectedCompleted !== "boolean") return apiError("Data percobaan tidak valid.", 422, { code: "ValidationError" });
    const key = input.key.toLowerCase();
    const result = await db.$transaction(async tx => {
      const current = await lockPayableAttempt(tx, access.user);
      if (!await reauthorizePayableActor(tx, access.user, false)) return { kind: "forbidden" as const };
      if (!current?.key) return { kind: "cleared" as const, row: current };
      if (current.key !== key || Boolean(current.completedAt) !== input.expectedCompleted) return { kind: "conflict" as const, row: current };
      const row: PayableAttempt = { version: randomUUID(), key: null, body: null, completedAt: null };
      await tx.$executeRaw`UPDATE "pos_manual_payable_attempts" SET "version" = ${row.version}, "key" = NULL, "body" = NULL, "completedAt" = NULL WHERE "storeId" = ${access.user.storeId} AND "userId" = ${access.user.id}`;
      return { kind: "cleared" as const, row };
    }, { isolationLevel: "ReadCommitted" });
    if (result.kind === "forbidden") return apiError("Sesi atau izin pengguna berubah. Muat ulang dan coba lagi.", 403, { code: "Forbidden" });
    const state = await visible(access, result.row);
    if (result.kind === "conflict") return NextResponse.json({ message: "Status hutang berubah. Periksa kembali sebelum melanjutkan.", ...state }, { status: 409, headers: { "Cache-Control": "private, no-store" } });
    return NextResponse.json(state, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { const auth = handleAuthError(error); if (auth) return auth; log.error("Gagal menyelesaikan percobaan hutang", error); return apiError("Percobaan hutang belum dapat diselesaikan.", 500, { code: "InternalError" }); }
}
