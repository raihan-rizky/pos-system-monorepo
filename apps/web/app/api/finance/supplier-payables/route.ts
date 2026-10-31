import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { db } from '@pos/db';
import { apiError } from '@/lib/api/responses';
import { handleAuthError, requirePermission } from '@/lib/rbac/guard';
import { getLogger } from '@/lib/logger';
import { parsePayable } from '@/features/keuangan/helpers/supplier-payable-input';

export const dynamic = 'force-dynamic';
const log = getLogger('api:finance:supplier-payables');
type Row = { id: string; supplierName: string; amount: string; paid: string; debtDate: string; dueDate: string | null; note: string | null; total: bigint };

export async function GET(request: Request) {
  try {
    const user = await requirePermission('expense', 'read');
    if (!user.storeId) return apiError('Toko pengguna belum tersedia.', 403, { code: 'Forbidden' });
    const requestedPage = Number(new URL(request.url).searchParams.get('page') || '1');
    const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 100000) : 1;
    const rows = await db.$queryRaw<Row[]>`
      SELECT d."id", d."supplierName", d."amount"::text, d."debtDate"::text, d."dueDate"::text, d."note",
        COALESCE(p.paid, 0)::text AS paid, COUNT(*) OVER() AS total
      FROM "pos_supplier_payables" d
      LEFT JOIN LATERAL (SELECT SUM("amount") AS paid FROM "pos_supplier_payable_payments" WHERE "payableId" = d."id") p ON true
      WHERE d."storeId" = ${user.storeId}
      ORDER BY (d."amount" > COALESCE(p.paid, 0)) DESC, d."debtDate" DESC, d."createdAt" DESC, d."id"
      LIMIT 20 OFFSET ${(page - 1) * 20}
    `;
    return NextResponse.json({ items: rows.map(({ total: _total, amount, paid, ...row }) => ({ ...row, amount: Number(amount), paid: Number(paid) })), page, total: Number(rows[0]?.total ?? 0) }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    log.error('Gagal memuat hutang pemasok', error);
    return apiError('Hutang belum dapat dimuat. Silakan coba lagi.', 500, { code: 'InternalError' });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission('expense', 'create');
    if (!user.storeId) return apiError('Toko pengguna belum tersedia.', 403, { code: 'Forbidden' });
    const input = parsePayable(await request.json().catch(() => null));
    if (!input) return apiError('Periksa pemasok, nominal, tanggal, dan pembayaran hutang.', 422, { code: 'ValidationError' });
    const id = randomUUID();
    await db.$transaction(async tx => {
      await tx.$executeRaw`
        INSERT INTO "pos_supplier_payables" ("id", "storeId", "supplierName", "amount", "debtDate", "dueDate", "note", "createdById")
        VALUES (${id}, ${user.storeId}, ${input.supplierName}, ${input.amount}, ${input.debtDate}::date, ${input.dueDate}::date, ${input.note}, ${user.id})
      `;
      if (input.initialPayment !== null) await tx.$executeRaw`
        INSERT INTO "pos_supplier_payable_payments" ("id", "payableId", "amount", "paidAt", "createdById")
        VALUES (${randomUUID()}, ${id}, ${input.initialPayment}, ${input.initialPaidAt}::date, ${user.id})
      `;
    });
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    log.error('Gagal menyimpan hutang pemasok', error);
    return apiError('Hutang belum dapat disimpan. Silakan coba lagi.', 500, { code: 'InternalError' });
  }
}
