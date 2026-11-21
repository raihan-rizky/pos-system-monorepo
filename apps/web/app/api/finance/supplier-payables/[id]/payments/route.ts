import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { db } from '@pos/db';
import { apiError } from '@/lib/api/responses';
import { authorizeInTransaction, handleAuthError, requireRole } from '@/lib/rbac/guard';
import { ALL_ROLES } from '@/features/rbac/helpers/rbac-core';
import { getLogger } from '@/lib/logger';
import { jakartaToday, parseAmount, validDate } from '@/features/keuangan/helpers/supplier-payable-input';
import { loadCorrectionPaymentState } from '@/features/suppliers/shopping-requests/repositories/shopping-request-correction-payment-state';
import { ManualPayableReconciliationError, reconcilePayable } from '@/features/keuangan/services/manual-payable-reconciliation';

const log = getLogger('api:finance:supplier-payable-payments');
type LockedPayable = { amount: string; debtDate: string; dueDate: string | null; goodsPurchaseId: string | null; giroHistoryVerifiedAt: Date | null; ledgerVersion: string };
type PaymentAttempt = { storeId: string; userId: string; payableId: string; resource: 'MANUAL' | 'GIRO'; version: string; fingerprint: string; cancelled: boolean };
type SavedRequest = { createdById: string; payableId: string; amount: string; paidAt: string; requestPayableId: string | null; requestAmount: string | null; requestPaidAt: string | null; requestResource: string | null; requestExpectedBalance: string | null; requestLedgerVersion: string | null };
const validRequestKey = (value: string | null): value is string =>
  value !== null && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole(...ALL_ROLES);
    if (!user.storeId) return apiError('Toko pengguna belum tersedia.', 403, { code: 'Forbidden' });
    const storeId = user.storeId;
    const body = await request.json().catch(() => null) as { amount?: unknown; paidAt?: unknown; expectedBalance?: unknown; expectedLedgerVersion?: unknown; resource?: unknown } | null;
    const amount = parseAmount(body?.amount);
    if (!amount || !validDate(body?.paidAt) || body.paidAt > jakartaToday()) return apiError('Periksa nominal dan tanggal pembayaran.', 422, { code: 'ValidationError' });
    const paidAt = body.paidAt;
    const mode = new URL(request.url).searchParams;
    const reserve = mode.get('reserve') === '1';
    const resolve = mode.get('resolve') === '1';
    const replay = mode.get('replay') === '1';
    const expectedUser = request.headers.get('X-Payment-User');
    const expectedStore = request.headers.get('X-Payment-Store');
    if ((reserve || resolve || replay) && (expectedUser !== user.id || expectedStore !== storeId)) return apiError('Sesi pengguna berubah. Muat ulang halaman dan coba lagi.', 403, { code: 'Forbidden' });
    if ((reserve && resolve) || (replay && (reserve || resolve))) return apiError('Permintaan pembayaran tidak valid.', 422, { code: 'ValidationError' });
    if ((expectedUser !== null || expectedStore !== null) && (expectedUser !== user.id || expectedStore !== storeId)) return apiError('Sesi pengguna berubah. Muat ulang halaman dan coba lagi.', 403, { code: 'Forbidden' });
    const requestKey = request.headers.get('Idempotency-Key');
    const { id } = await context.params;
    const expectedBalance = parseAmount(body?.expectedBalance);
    const expectedLedgerVersion = typeof body?.expectedLedgerVersion === 'string' && /^(0|[1-9][0-9]{0,19})$/.test(body.expectedLedgerVersion) ? body.expectedLedgerVersion : null;
    const fingerprint = JSON.stringify([id, amount.toFixed(2), paidAt, expectedBalance?.toFixed(2) ?? null, expectedLedgerVersion]);
    const matchesRequest = (existing: SavedRequest) => {
      const sameBalance = existing.requestExpectedBalance === null
        ? body?.expectedBalance == null
        : expectedBalance !== null && Math.round(Number(existing.requestExpectedBalance) * 100) === Math.round(expectedBalance * 100);
      const sameVersion = existing.requestLedgerVersion == null ? body?.expectedLedgerVersion == null : expectedLedgerVersion === existing.requestLedgerVersion;
      const sameResource = body?.resource == null || body.resource === existing.requestResource;
      return sameVersion && sameResource && (existing.requestPayableId ?? existing.payableId) === id && Math.round(Number(existing.requestAmount ?? existing.amount) * 100) === Math.round(amount * 100) && (existing.requestPaidAt ?? existing.paidAt) === paidAt && sameBalance;
    };
    const result = await db.$transaction(async tx => {
      if (validRequestKey(requestKey)) await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify([storeId, requestKey.toLowerCase()])}, 0))::text`;
      const [debt] = await tx.$queryRaw<LockedPayable[]>`
        WITH payable_hint AS MATERIALIZED (
          SELECT "goodsPurchaseId" FROM "pos_supplier_payables" WHERE "id" = ${id} AND "storeId" = ${user.storeId}
        ), purchase_lock AS MATERIALIZED (
          SELECT g."id" FROM "pos_goods_purchases" g JOIN payable_hint h ON h."goodsPurchaseId" = g."id"
          WHERE g."storeId" = ${user.storeId} FOR UPDATE OF g
        )
        SELECT d."amount"::text, d."debtDate"::text, d."dueDate"::text, d."goodsPurchaseId", d."giroHistoryVerifiedAt", d."ledgerVersion"::text AS "ledgerVersion"
        FROM "pos_supplier_payables" d
        WHERE d."id" = ${id} AND d."storeId" = ${user.storeId}
          AND (d."goodsPurchaseId" IS NULL OR EXISTS (SELECT 1 FROM purchase_lock WHERE "id" = d."goodsPurchaseId"))
        FOR UPDATE OF d
      `;
      const authorize = (manual: boolean) => authorizeInTransaction(tx, user, { resources: [{ resource: manual ? 'expense.payable' : 'expense.giro', action: 'update' }, ...(manual ? [{ resource: 'expense.payable', action: 'read' as const }] : [])], ...(manual ? { page: '/keuangan' } : {}) });
      const findAttempt = async (scope: string) => (await tx.$queryRaw<PaymentAttempt[]>`
        SELECT "storeId", "userId", "payableId", "resource", "version", "fingerprint", "cancelled"
        FROM "pos_payable_payment_attempts" WHERE "scope" = ${scope} AND "storeId" = ${storeId}
      `)[0];
      const matchesAttempt = (attempt: PaymentAttempt) => attempt.userId === user.id && attempt.payableId === id && attempt.fingerprint === fingerprint && attempt.resource === body?.resource;
      const cancelUnknown = async (scope: string, fallbackResource?: 'MANUAL' | 'GIRO') => {
        const resource = body?.resource === 'MANUAL' || body?.resource === 'GIRO' ? body.resource : fallbackResource;
        if (!expectedBalance || expectedLedgerVersion === null || !resource) return 'conflict' as const;
        if (!await authorize(resource === 'MANUAL')) return 'forbidden' as const;
        await tx.$executeRaw`
          INSERT INTO "pos_payable_payment_attempts" ("scope", "storeId", "userId", "payableId", "resource", "version", "fingerprint", "cancelled")
          VALUES (${scope}, ${storeId}, ${user.id}, ${id}, ${resource}, ${expectedLedgerVersion}, ${fingerprint}, true)
        `;
        return 'balance-changed' as const;
      };
      const cancelAttempt = async (scope: string) => {
        const updated = await tx.$executeRaw`UPDATE "pos_payable_payment_attempts" SET "cancelled" = true
          WHERE "scope" = ${scope} AND "storeId" = ${storeId} AND "userId" = ${user.id} AND "cancelled" = false`;
        if (updated > 0) return 'balance-changed' as const;
        const attempt = await findAttempt(scope);
        if (!attempt) return cancelUnknown(scope, debt ? (debt.goodsPurchaseId ? 'GIRO' : 'MANUAL') : undefined);
        return attempt.cancelled && matchesAttempt(attempt) ? 'balance-changed' as const : 'conflict' as const;
      };
      if (!debt) {
        if (!validRequestKey(requestKey)) return await authorize(true) ? 'not-found' as const : 'forbidden' as const;
        const requestScope = JSON.stringify([user.storeId, requestKey.toLowerCase()]);
        const [linked] = await tx.$queryRaw<SavedRequest[]>`
          SELECT p."createdById", p."payableId", p."amount"::text, p."paidAt"::text, p."requestPayableId", p."requestAmount"::text, p."requestPaidAt"::text, p."requestResource", p."requestExpectedBalance"::text, p."requestLedgerVersion"
          FROM "pos_supplier_payable_payments" p JOIN "pos_supplier_payables" d ON d."id" = p."payableId" AND d."storeId" = ${storeId}
          WHERE p."requestScope" = ${requestScope}
            AND (p."payableId" = ${id} OR EXISTS (SELECT 1 FROM "pos_supplier_payable_manual_links" l
              WHERE l."manualPayableId" = ${id} AND l."storeId" = ${storeId} AND l."giroPayableId" = d."id"))
        `;
        if (!linked) {
          if (replay) return 'not-found' as const;
          if (!resolve) return 'not-found' as const;
          const attempt = await findAttempt(requestScope);
          if (!attempt) return cancelUnknown(requestScope);
          if (!matchesAttempt(attempt)) return 'conflict' as const;
          if (!await authorize(attempt.resource === 'MANUAL')) return 'forbidden' as const;
          return cancelAttempt(requestScope);
        }
        if (linked.createdById !== user.id) return resolve ? 'conflict' as const : 'forbidden' as const;
        const manual = linked.requestResource === 'MANUAL' || linked.requestResource == null;
        if (!await authorize(manual)) return 'forbidden' as const;
        return matchesRequest(linked) ? 'created' as const : 'conflict' as const;
      }
      if (!validRequestKey(requestKey)) return await authorize(!debt.goodsPurchaseId) ? 'invalid-key' as const : 'forbidden' as const;
      const requestScope = JSON.stringify([user.storeId, requestKey.toLowerCase()]);
      const [existing] = await tx.$queryRaw<SavedRequest[]>`
        SELECT p."createdById", p."payableId", p."amount"::text, p."paidAt"::text, p."requestPayableId", p."requestAmount"::text, p."requestPaidAt"::text, p."requestResource", p."requestExpectedBalance"::text, p."requestLedgerVersion" FROM "pos_supplier_payable_payments" p
        JOIN "pos_supplier_payables" d ON d."id" = p."payableId"
        WHERE p."requestScope" = ${requestScope} AND d."storeId" = ${user.storeId}
      `;
      if (existing) {
        if (existing.createdById !== user.id) return resolve ? 'conflict' as const : 'forbidden' as const;
        const manual = existing.requestResource === 'MANUAL' || (existing.requestResource == null && !debt.goodsPurchaseId);
        if (!await authorize(manual)) return 'forbidden' as const;
        return matchesRequest(existing) ? 'created' as const : 'conflict' as const;
      }
      if (replay) return await authorize(!debt.goodsPurchaseId) ? 'not-found' as const : 'forbidden' as const;
      const attempt = await findAttempt(requestScope);
      {
        if (attempt) {
          if (!matchesAttempt(attempt)) return 'conflict' as const;
          if (reserve || resolve) {
            if (!await authorize(attempt.resource === 'MANUAL')) return 'forbidden' as const;
          }
          if (attempt.cancelled) return 'balance-changed' as const;
          if (reserve) return 'reserved' as const;
          if (resolve) {
            const today = jakartaToday();
            const due = !debt.goodsPurchaseId && debt.dueDate !== null && debt.dueDate <= today;
            const current = BigInt(debt.ledgerVersion) * 2n + (due ? 1n : 0n);
            return current > BigInt(attempt.version) ? cancelAttempt(requestScope) : 'conflict' as const;
          }
        }
        if (resolve) return cancelUnknown(requestScope);
      }
      if (debt.goodsPurchaseId) {
        await tx.$executeRaw`LOCK TABLE "pos_goods_purchases" IN ROW EXCLUSIVE MODE`;
        await tx.$queryRaw`SELECT "id" FROM "pos_goods_purchase_payments" WHERE "goodsPurchaseId" = ${debt.goodsPurchaseId} ORDER BY "id" FOR UPDATE`;
        await tx.$queryRaw`SELECT "id" FROM "pos_expenses" WHERE "storeId" = ${storeId} AND ("goodsPurchaseId" = ${debt.goodsPurchaseId} OR "shoppingRequestId" = (SELECT "shoppingRequestId" FROM "pos_goods_purchases" WHERE "id" = ${debt.goodsPurchaseId} AND "storeId" = ${storeId})) ORDER BY "id" FOR UPDATE`;
      }
      if (!await authorize(!debt.goodsPurchaseId)) return 'forbidden' as const;
      if (reserve && body?.resource !== (debt.goodsPurchaseId ? 'GIRO' : 'MANUAL')) return 'conflict' as const;
      if (reserve && expectedLedgerVersion === null) return 'conflict' as const;
      if (!reserve && body?.resource !== undefined && !attempt) return 'conflict' as const;
      if (!expectedBalance) return 'invalid-balance' as const;
      if (expectedLedgerVersion === null) return 'invalid-version' as const;
      const today = jakartaToday();
      const due = !debt.goodsPurchaseId && debt.dueDate !== null && debt.dueDate <= today;
      const currentLedgerVersion = (BigInt(debt.ledgerVersion) * 2n + (due ? 1n : 0n)).toString();
      if (expectedLedgerVersion !== currentLedgerVersion) {
        if (reserve && expectedBalance !== null && (body?.resource === 'MANUAL' || body?.resource === 'GIRO')) await tx.$executeRaw`
          INSERT INTO "pos_payable_payment_attempts" ("scope", "storeId", "userId", "payableId", "resource", "version", "fingerprint", "cancelled")
          VALUES (${requestScope}, ${storeId}, ${user.id}, ${id}, ${body?.resource}, ${expectedLedgerVersion}, ${fingerprint}, true)
        `;
        return cancelAttempt(requestScope);
      }
      if (debt.goodsPurchaseId && !debt.giroHistoryVerifiedAt) return 'history-unknown' as const;
      if (paidAt < debt.debtDate) return 'invalid' as const;
      const [total] = await tx.$queryRaw<{ paid: string; credited: string; financeCancelled: boolean; corrected: boolean; purchaseMethod: string | null; scheduleCount: number; giroAmount: string }[]>`
        SELECT COALESCE(SUM(p."amount") FILTER (WHERE ${Boolean(debt.goodsPurchaseId)} OR p."origin" <> 'AUTO'), 0)::text AS paid,
          (SELECT COALESCE(SUM(credit."amount"), 0)::text FROM "pos_expense_supplier_credit_applications" credit
           WHERE credit."storeId" = ${storeId} AND credit."payableId" = ${id} AND credit."releasedAt" IS NULL) AS credited,
          EXISTS (
            SELECT 1 FROM "pos_expense_corrections" finance_cancel
            WHERE finance_cancel."storeId" = ${storeId} AND finance_cancel."action" = 'CANCEL'
              AND finance_cancel."paymentId" IS NULL
              AND finance_cancel."before"->>'purchaseId' = ${debt.goodsPurchaseId}
          ) AS "financeCancelled",
          EXISTS (
            SELECT 1 FROM "pos_shopping_request_corrections" c
            JOIN "pos_goods_purchases" g ON g."shoppingRequestId" = c."shoppingRequestId" AND g."storeId" = c."storeId"
            WHERE g."id" = ${debt.goodsPurchaseId} AND g."storeId" = ${user.storeId}
          ) AS corrected,
          (SELECT g."paymentMethod"::text FROM "pos_goods_purchases" g
           WHERE g."id" = ${debt.goodsPurchaseId} AND g."storeId" = ${user.storeId}) AS "purchaseMethod",
          (SELECT COUNT(*)::int FROM "pos_goods_purchase_payments" s WHERE s."goodsPurchaseId" = ${debt.goodsPurchaseId}) AS "scheduleCount",
          (SELECT COALESCE(SUM(s."amount") FILTER (WHERE s."method"::text = 'GIRO'), 0)::text
           FROM "pos_goods_purchase_payments" s WHERE s."goodsPurchaseId" = ${debt.goodsPurchaseId}) AS "giroAmount"
        FROM "pos_supplier_payable_payments" p WHERE p."payableId" = ${id}
      `;
      if (total.financeCancelled) return cancelAttempt(requestScope);
      if (total.corrected && total.purchaseMethod !== 'GIRO' && (!total.scheduleCount || Number(total.giroAmount) <= 0)) return cancelAttempt(requestScope);
      const paid = total.corrected && debt.goodsPurchaseId
        ? (await loadCorrectionPaymentState(tx, { storeId, purchaseId: debt.goodsPurchaseId })).paid
        : total.paid;
      const amountDue = !total.corrected && debt.goodsPurchaseId && total.scheduleCount > 0 ? total.giroAmount : debt.amount;
      const remainingCents = Math.round(Number(amountDue) * 100) - Math.round(Number(paid) * 100)
        - Math.round(Number(total.credited ?? 0) * 100);
      if (Math.round(expectedBalance * 100) !== remainingCents) return cancelAttempt(requestScope);
      if (Math.round(amount * 100) > remainingCents) return 'invalid' as const;
      if (!debt.goodsPurchaseId && debt.dueDate && debt.dueDate <= today && remainingCents > 0) {
        if (!await authorizeInTransaction(tx, user, { resources: [{ resource: 'expense.payable', action: 'read' }, { resource: 'expense.payable', action: 'update' }, { resource: 'expense.payable.manual.payment', action: 'update' }], page: '/keuangan' })) return 'forbidden' as const;
      }
      if (reserve) {
        const inserted = await tx.$queryRaw<{ scope: string }[]>`
          INSERT INTO "pos_payable_payment_attempts" ("scope", "storeId", "userId", "payableId", "resource", "version", "fingerprint")
          VALUES (${requestScope}, ${storeId}, ${user.id}, ${id}, ${body?.resource}, ${expectedLedgerVersion}, ${fingerprint})
          ON CONFLICT ("scope") DO NOTHING RETURNING "scope"
        `;
        if (inserted.length) return 'reserved' as const;
        const attempt = await findAttempt(requestScope);
        return attempt && matchesAttempt(attempt) ? 'reserved' as const : 'conflict' as const;
      }
      const inserted = await tx.$queryRaw<{ id: string }[]>`
          INSERT INTO "pos_supplier_payable_payments" ("id", "payableId", "amount", "paidAt", "createdById", "requestScope", "requestExpectedBalance", "requestPayableId", "requestAmount", "requestPaidAt", "requestResource", "requestLedgerVersion")
          VALUES (${randomUUID()}, ${id}, ${amount}, ${paidAt}::date, ${user.id}, ${requestScope}, ${expectedBalance}, ${id}, ${amount}, ${paidAt}::date, ${debt.goodsPurchaseId ? 'GIRO' : 'MANUAL'}, ${expectedLedgerVersion})
          ON CONFLICT ("requestScope") DO NOTHING RETURNING "id"
        `;
      if (!inserted.length) {
          const [existing] = await tx.$queryRaw<SavedRequest[]>`
            SELECT p."createdById", p."payableId", p."amount"::text, p."paidAt"::text, p."requestPayableId", p."requestAmount"::text, p."requestPaidAt"::text, p."requestResource", p."requestExpectedBalance"::text, p."requestLedgerVersion" FROM "pos_supplier_payable_payments" p
            JOIN "pos_supplier_payables" d ON d."id" = p."payableId"
            WHERE p."requestScope" = ${requestScope} AND d."storeId" = ${user.storeId}
          `;
          if (!existing) return 'conflict' as const;
          if (existing.createdById !== user.id) return resolve ? 'conflict' as const : 'forbidden' as const;
          const manual = existing.requestResource === 'MANUAL' || (existing.requestResource == null && !debt.goodsPurchaseId);
          if (!await authorize(manual)) return 'forbidden' as const;
          return matchesRequest(existing) ? 'created' as const : 'conflict' as const;
      }
      if (!debt.goodsPurchaseId) await reconcilePayable(tx, { storeId, payableId: id, actorId: user.id, todayWib: today });
      return 'created' as const;
    }, { isolationLevel: 'ReadCommitted' });
    if (result === 'reserved') return NextResponse.json({ reserved: true }, { status: 200 });
    if (result === 'forbidden') return apiError('Sesi pengguna berubah. Muat ulang halaman dan coba lagi.', 403, { code: 'Forbidden' });
    if (result === 'not-found') return apiError('Hutang tidak ditemukan.', 404, { code: 'NotFound' });
    if (result === 'history-unknown') return apiError('Periksa riwayat giro sebelum mencatat pembayaran.', 409, { code: 'Conflict' });
    if (result === 'invalid-key') return apiError('Kunci pembayaran tidak tersedia. Muat ulang halaman dan coba lagi.', 422, { code: 'ValidationError' });
    if (result === 'invalid-balance') return apiError('Saldo hutang tidak tersedia. Muat ulang halaman dan coba lagi.', 422, { code: 'ValidationError' });
    if (result === 'invalid-version') return apiError('Data hutang belum tersedia. Muat ulang halaman dan coba lagi.', 422, { code: 'ValidationError' });
    if (result === 'balance-changed') return NextResponse.json({ message: 'Saldo hutang telah berubah. Periksa kembali sebelum mencatat pembayaran.', code: 'BalanceChanged' }, { status: 409 });
    if (result === 'conflict') return apiError('Permintaan pembayaran sudah digunakan untuk data lain. Hubungi pengelola.', 409, { code: 'Conflict' });
    if (result === 'invalid') return apiError('Tanggal pembayaran atau nominal melebihi sisa hutang.', 422, { code: 'ValidationError' });
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    if (error instanceof ManualPayableReconciliationError) return apiError(error.message, error.status, { code: error.status === 404 ? 'NotFound' : 'Conflict' });
    log.error('Gagal menyimpan pembayaran hutang', error);
    return apiError('Pembayaran belum dapat disimpan. Silakan coba lagi.', 500, { code: 'InternalError' });
  }
}
