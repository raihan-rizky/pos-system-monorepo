import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaClient, type Prisma } from '@pos/db';
import * as XLSX from 'xlsx-js-style';
import { serializeMonthlyWorkbook } from '../../helpers/monthly-workbook';

const connection = process.env.GIRO_TEST_DATABASE_URL;
const schema = `report_snapshot_${randomUUID().replaceAll('-', '')}`;
const runtime = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('@pos/db', async importOriginal => ({ ...(await importOriginal()), get db() { return runtime.db; } }));
import { getMonthlyFinancialReport } from '../monthly-report';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

describe.skipIf(!connection)('snapshot laporan pada PostgreSQL terisolasi', () => {
  let admin: PrismaClient;
  let reader: PrismaClient;
  let writer: PrismaClient;
  let gate: { expenseRead: ReturnType<typeof deferred>; resumeDebt: ReturnType<typeof deferred> } | null = null;

  beforeAll(async () => {
    const url = new URL(connection!);
    if (url.hostname !== '127.0.0.1' || url.port !== '55443' || url.pathname !== '/postgres') {
      throw new Error('Monthly report snapshot tests require the dedicated isolated PostgreSQL instance.');
    }
    admin = new PrismaClient({ datasourceUrl: connection });
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    url.searchParams.set('schema', schema);
    const root = path.resolve(process.cwd(), '../..');
    const prisma = createRequire(path.join(root, 'packages/db/package.json')).resolve('prisma/build/index.js');
    const temporary = mkdtempSync(path.join(tmpdir(), 'financial-report-schema-'));
    const schemaFile = path.join(temporary, 'schema.prisma');
    // The disposable database need not install pgvector or pg_trgm for unrelated models.
    const schemaText = readFileSync(path.join(root, 'packages/db/prisma/schema.prisma'), 'utf8')
      .replaceAll('Unsupported("vector")', 'Unsupported("text")')
      .split('\n').filter(line => !line.includes('gin_trgm_ops')).join('\n');
    writeFileSync(schemaFile, schemaText);
    let setup;
    try {
      setup = spawnSync(process.execPath, [prisma, 'db', 'push', '--skip-generate', '--schema', schemaFile], {
        encoding: 'utf8', timeout: 90_000, env: { ...process.env, DATABASE_URL: url.toString(), DIRECT_URL: url.toString() },
      });
    } finally {
      unlinkSync(schemaFile);
      rmdirSync(temporary);
    }
    if (setup.status !== 0) throw new Error(setup.error?.message || setup.stderr || setup.stdout);
    reader = new PrismaClient({ datasourceUrl: url.toString() });
    writer = new PrismaClient({ datasourceUrl: url.toString() });
    await reader.$executeRawUnsafe('CREATE FUNCTION pos_current_inventory_valuation(text) RETURNS numeric LANGUAGE sql AS $$ SELECT 0::numeric $$');
    await reader.$executeRawUnsafe('CREATE FUNCTION pos_inventory_valuation_at(text, timestamptz) RETURNS numeric LANGUAGE sql AS $$ SELECT 0::numeric $$');

    await writer.store.create({ data: { id: 'store-test', name: 'Toko uji' } });
    await writer.user.create({ data: { id: 'user-test', username: 'uji', name: 'Pengguna', storeId: 'store-test' } });
    await writer.shoppingRequest.create({ data: { id: 'shopping-test', storeId: 'store-test', number: 'DB-1', name: 'Belanja', normalizedName: 'belanja', sequence: 1, status: 'APPROVED' } });
    await writer.goodsPurchase.create({ data: { id: 'purchase-test', storeId: 'store-test', number: 'PB-1', sequence: 1, shoppingRequestId: 'shopping-test', supplierNameSnapshot: 'Pemasok', status: 'APPROVED', totalAmount: 100000, paymentMethod: 'GIRO', paymentDueDate: new Date('2026-11-20T00:00:00Z'), createdById: 'user-test' } });
    await writer.supplierPayable.create({ data: { id: 'payable-test', storeId: 'store-test', goodsPurchaseId: 'purchase-test', giroHistoryVerifiedAt: new Date('2026-10-10T00:00:00Z'), supplierName: 'Pemasok', amount: 100000, debtDate: new Date('2026-10-10T00:00:00Z'), dueDate: new Date('2026-11-20T00:00:00Z'), createdById: 'user-test' } });
    await writer.expense.create({ data: { id: 'expense-test', storeId: 'store-test', recordedById: 'user-test', applicantName: 'Pengguna', category: 'SUPPLIES', amount: 100000, occurredAt: new Date('2026-10-10T03:00:00Z'), shoppingRequestId: 'shopping-test', goodsPurchaseId: 'purchase-test' } });

    runtime.db = {
      $transaction: (callback: (tx: Prisma.TransactionClient) => Promise<unknown>, options: Parameters<PrismaClient['$transaction']>[1]) => reader.$transaction(async tx => {
        const intercepted = new Proxy(tx, {
          get(target, property, receiver) {
            if (property === 'expense') return new Proxy(target.expense, {
              get(model, name, modelReceiver) {
                if (name !== 'findMany') return Reflect.get(model, name, modelReceiver);
                return async (...args: Parameters<typeof model.findMany>) => {
                  const result = await model.findMany(...args);
                  gate?.expenseRead.resolve();
                  return result;
                };
              },
            });
            if (property === '$queryRaw') return async (strings: TemplateStringsArray, ...values: unknown[]) => {
              if (gate && strings.join('').includes('FROM "pos_supplier_payables"')) await gate.resumeDebt.promise;
              return target.$queryRaw(strings, ...values);
            };
            return Reflect.get(target, property, receiver);
          },
        });
        return callback(intercepted);
      }, options),
    };
  }, 120_000);

  afterAll(async () => {
    gate?.resumeDebt.resolve();
    await reader?.$disconnect();
    await writer?.$disconnect();
    await admin?.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin?.$disconnect();
    runtime.db = null;
  }, 30_000);

  it('tidak mencampur pembayaran giro dan sisa hutang dari dua waktu berbeda', async () => {
    gate = { expenseRead: deferred(), resumeDebt: deferred() };
    const active = gate;
    const now = new Date('2026-11-25T05:00:00Z');
    const reading = getMonthlyFinancialReport('store-test', 2026, 11, now);
    try {
      await Promise.race([active.expenseRead.promise, reading.then(() => { throw new Error('Laporan selesai sebelum pengujian race.'); })]);
      await writer.supplierPayablePayment.create({ data: { id: 'payment-test', payableId: 'payable-test', amount: 30000, paidAt: new Date('2026-11-15T00:00:00Z'), createdById: 'user-test' } });
    } finally {
      active.resumeDebt.resolve();
    }
    const before = await reading;
    expect(before.giroPayments).toEqual([]);
    expect(before.supplierDebtBalance).toBe(100000);
    gate = null;
    const after = await getMonthlyFinancialReport('store-test', 2026, 11, now);
    expect(after.giroPayments).toEqual([expect.objectContaining({ amount: 30000, date: '2026-11-15' })]);
    expect(after.supplierDebtBalance).toBe(70000);
  }, 30_000);

  it('membaca ledger giro dan transfer terdahulu per tanggal tanpa menghitung expense turunan dua kali', async () => {
    await writer.store.create({ data: { id: 'other-store', name: 'Toko lain' } });
    const base = {
      purchaseDate: new Date('2026-10-05T00:00:00Z'), dueDate: new Date('2026-11-20T00:00:00Z'),
      amount: 100000, requestFingerprint: 'snapshot-test', createdById: 'user-test',
    };
    await writer.backdatedPurchase.create({ data: {
      ...base, id: 'old-giro', storeId: 'store-test', requestId: 'old-giro', reference: 'G-OLD', paymentMethod: 'GIRO',
      payments: { create: [
        { id: 'g-oct', requestId: 'g-oct', amount: 30000, paidAt: new Date('2026-10-31T00:00:00Z'), createdById: 'user-test' },
        { id: 'g-nov', requestId: 'g-nov', amount: 20000, paidAt: new Date('2026-11-01T00:00:00Z'), createdById: 'user-test' },
        { id: 'g-dec', requestId: 'g-dec', amount: 50000, paidAt: new Date('2026-12-01T00:00:00Z'), createdById: 'user-test' },
      ] },
    } });
    await writer.backdatedPurchase.create({ data: {
      ...base, id: 'old-transfer', storeId: 'store-test', requestId: 'old-transfer', reference: 'T-OLD', paymentMethod: 'TRANSFER',
      payments: { create: [
        { id: 't-oct', requestId: 't-oct', amount: 30000, paidAt: new Date('2026-10-31T00:00:00Z'), createdById: 'user-test' },
        { id: 't-nov', requestId: 't-nov', amount: 20000, paidAt: new Date('2026-11-01T00:00:00Z'), createdById: 'user-test' },
      ] },
    } });
    await writer.backdatedPurchase.create({ data: { ...base, id: 'other-old', storeId: 'other-store', requestId: 'other-old', reference: 'OTHER', paymentMethod: 'GIRO' } });
    await writer.expense.create({ data: { id: 'old-derived', storeId: 'store-test', recordedById: 'user-test', applicantName: 'Pengguna', category: 'SUPPLIES', amount: 20000, occurredAt: new Date('2026-11-01T03:00:00Z'), backdatedPurchasePaymentId: 'g-nov' } });
    await writer.expense.create({ data: { id: 'old-due', storeId: 'store-test', recordedById: 'user-test', applicantName: 'Pengguna', category: 'SUPPLIES', amount: 50000, occurredAt: new Date('2026-11-20T03:00:00Z'), backdatedPurchaseDueId: 'old-giro' } });
    const now = new Date('2027-01-02T00:00:00Z');
    const october = await getMonthlyFinancialReport('store-test', 2026, 10, now);
    const november = await getMonthlyFinancialReport('store-test', 2026, 11, now);
    const december = await getMonthlyFinancialReport('store-test', 2026, 12, now);
    const withReference = (row: { purchase?: { reference: string } }) => ['G-OLD', 'T-OLD'].includes(row.purchase?.reference ?? '');

    expect(october.purchaseExpenses?.filter(withReference)).toEqual([expect.objectContaining({ amount: 30000, date: '2026-10-31', purchase: expect.objectContaining({ reference: 'T-OLD' }) })]);
    expect(october.giroPayments?.filter(row => row.reference === 'G-OLD')).toEqual([expect.objectContaining({ amount: 30000, date: '2026-10-31' })]);
    expect(october.supplierDebts?.filter(row => row.id.startsWith('backdated:')).map(row => row.amount)).toEqual([70000, 70000]);
    expect(november.purchaseExpenses?.filter(withReference)).toEqual([
      expect.objectContaining({ amount: 20000, date: '2026-11-01', purchase: expect.objectContaining({ reference: 'T-OLD' }) }),
      expect.objectContaining({ amount: 100000, date: '2026-11-20', purchase: expect.objectContaining({ reference: 'G-OLD' }) }),
    ]);
    expect(november.giroPayments?.filter(row => row.reference === 'G-OLD')).toEqual([expect.objectContaining({ amount: 20000, date: '2026-11-01' })]);
    expect(november.supplierDebts?.filter(row => row.id.startsWith('backdated:')).map(row => row.amount)).toEqual([50000, 50000]);
    expect(november.expenses.some(row => row.id === 'old-derived' || row.id === 'old-due')).toBe(false);
    expect(november.purchaseExpenses?.some(row => row.purchase?.reference === 'OTHER')).toBe(false);
    const workbook = XLSX.read(serializeMonthlyWorkbook(november), { type: 'array', cellFormula: true });
    const values = (sheet: XLSX.WorkSheet) => Object.entries(sheet).filter(([key]) => !key.startsWith('!')).map(([, cell]) => cell.v);
    expect(values(workbook.Sheets['RP NOVEMBER']).join(' ')).not.toContain('Belanja terdahulu');
    expect(values(workbook.Sheets['PENGELUARAN BELANJA']).join(' ')).toContain('G-OLD');
    expect(values(workbook.Sheets['PENGELUARAN BELANJA']).join(' ')).toContain('T-OLD');
    expect(workbook.Sheets.BERSIH.F25.v).toBe(70000);
    expect(workbook.Sheets['LAP KEU'].D13.v).toBe(170000);
    expect(december.giroPayments?.filter(row => row.reference === 'G-OLD')).toEqual([expect.objectContaining({ amount: 50000, date: '2026-12-01' })]);
    expect(december.supplierDebts?.filter(row => row.id === 'backdated:old-giro')).toEqual([]);
  }, 30_000);
});
