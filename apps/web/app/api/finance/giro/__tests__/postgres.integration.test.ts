import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@pos/db';

const connection = process.env.GIRO_TEST_DATABASE_URL;
const schema = `giro_test_${process.pid}_${Date.now()}`;
const mocks = vi.hoisted(() => ({ db: null as PrismaClient | null, storeId: 'store-1' }));
vi.mock('@pos/db', async importOriginal => ({ ...(await importOriginal()), get db() { return mocks.db; } }));
vi.mock('@/lib/rbac/guard', () => ({
  requireRole: async () => ({ id: 'user-1', storeId: mocks.storeId }),
  requirePermission: async () => ({ id: 'user-1', storeId: mocks.storeId }),
  handleAuthError: () => null,
}));
vi.mock('@/lib/logger', () => ({ getLogger: () => ({ error: vi.fn() }) }));

import { GET } from '../route';
import { POST as reconcile } from '../[goodsPurchaseId]/reconcile/route';
import { POST as pay } from '../../supplier-payables/[id]/payments/route';

const request = (body: unknown, key?: string) => new Request('http://localhost/api/finance/giro', {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) }, body: JSON.stringify(body),
});

describe.skipIf(!connection)('giro endpoints on isolated PostgreSQL', () => {
  let admin: PrismaClient;
  let client: PrismaClient;

  beforeAll(async () => {
    const url = new URL(connection!);
    if (url.hostname !== '127.0.0.1' || url.port !== '55443' || url.pathname !== '/postgres') {
      throw new Error('Giro endpoint tests require the dedicated isolated PostgreSQL instance.');
    }
    admin = new PrismaClient({ datasourceUrl: connection });
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    url.searchParams.set('schema', schema);
    client = new PrismaClient({ datasourceUrl: url.toString() });
    mocks.db = client;
    await client.$executeRawUnsafe(`CREATE TABLE "pos_goods_purchases" (
      "id" text PRIMARY KEY, "storeId" text NOT NULL, "number" text NOT NULL, "supplierNameSnapshot" text NOT NULL,
      "totalAmount" numeric(12,2) NOT NULL, "shoppingRequestId" text NOT NULL, "paymentDueDate" date,
      "status" text NOT NULL, "paymentMethod" text
    )`);
    await client.$executeRawUnsafe(`CREATE TABLE "pos_expenses" (
      "id" text PRIMARY KEY, "storeId" text NOT NULL, "amount" numeric(12,2) NOT NULL,
      "occurredAt" timestamp NOT NULL, "deletedAt" timestamp, "goodsPurchaseId" text, "shoppingRequestId" text
    )`);
    await client.$executeRawUnsafe(`CREATE TABLE "pos_supplier_payables" (
      "id" text PRIMARY KEY, "storeId" text NOT NULL, "goodsPurchaseId" text UNIQUE REFERENCES "pos_goods_purchases"("id"),
      "giroHistoryVerifiedAt" timestamptz, "supplierName" text NOT NULL, "amount" numeric(12,2) NOT NULL,
      "debtDate" date NOT NULL, "dueDate" date, "note" text, "createdById" text NOT NULL,
      "createdAt" timestamp NOT NULL DEFAULT now()
    )`);
    await client.$executeRawUnsafe(`CREATE TABLE "pos_supplier_payable_payments" (
      "id" text PRIMARY KEY, "payableId" text NOT NULL REFERENCES "pos_supplier_payables"("id"),
      "amount" numeric(12,2) NOT NULL, "paidAt" date NOT NULL, "createdById" text NOT NULL,
      "createdAt" timestamp NOT NULL DEFAULT now(), "requestScope" text UNIQUE
    )`);
    await client.$executeRawUnsafe(readFileSync(path.resolve(process.cwd(), '../../packages/db/prisma/migrations/20261101130000_giro_payment_expected_balance/migration.sql'), 'utf8'));
    await client.$executeRawUnsafe(`INSERT INTO "pos_goods_purchases" VALUES
      ('purchase-1','store-1','PB-1','Pemasok',100000,'shopping-1','2026-11-20','APPROVED','GIRO'),
      ('purchase-2','store-2','PB-2','Lain',100000,'shopping-2','2026-11-20','APPROVED','GIRO'),
      ('purchase-3','store-1','PB-3','Pemasok',100000,'shopping-3','2026-11-20','APPROVED','GIRO'),
      ('purchase-4','store-1','PB-4','Pemasok',100000,'shopping-4','2026-11-20','APPROVED','GIRO'),
      ('purchase-5','store-1','PB-5','Pemasok',100000,'shopping-5','2026-11-20','APPROVED','GIRO'),
      ('purchase-6','store-2','PB-6','Pemasok',100000,'shopping-6','2026-11-20','APPROVED','GIRO')`);
    await client.$executeRawUnsafe(`INSERT INTO "pos_expenses" VALUES
      ('expense-1','store-1',100000,'2026-10-09 18:00:00',null,'purchase-1','shopping-1'),
      ('expense-2','store-2',100000,'2026-10-09 18:00:00',null,'purchase-2','shopping-2'),
      ('expense-3','store-1',100000,'2026-10-19 18:00:00',null,'purchase-3','shopping-3')`);
    await client.$executeRawUnsafe(`INSERT INTO "pos_supplier_payables"
      ("id", "storeId", "supplierName", "amount", "debtDate", "createdById") VALUES
      ('manual-early','store-1','Pemasok',100000,'2026-10-01','user-1'),
      ('manual-other-store','store-2','Pemasok',100000,'2026-10-01','user-1')`);
    await client.$executeRawUnsafe(`INSERT INTO "pos_supplier_payable_payments" ("id", "payableId", "amount", "paidAt", "createdById")
      VALUES ('historic', 'manual-early', 10000, '2026-10-05', 'user-1')`);
    await client.$executeRawUnsafe(`INSERT INTO "pos_supplier_payables"
      ("id", "storeId", "goodsPurchaseId", "giroHistoryVerifiedAt", "supplierName", "amount", "debtDate", "createdById") VALUES
      ('other-giro','store-1','purchase-4',NOW(),'Pemasok',100000,'2026-10-01','user-1'),
      ('full-giro','store-1','purchase-5',NOW(),'Pemasok',100000,'2026-10-01','user-1'),
      ('store-two-giro','store-2','purchase-6',NOW(),'Pemasok',100000,'2026-10-01','user-1')`);
  });

  afterAll(async () => {
    await client?.$disconnect();
    await admin?.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin?.$disconnect();
    mocks.db = null;
  });

  it('queries only its store and reconciles a real purchase with dated history', async () => {
    const response = await GET(new Request('http://localhost/api/finance/giro'));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.items.map((item: { goodsPurchaseId: string }) => item.goodsPurchaseId)).toEqual(['purchase-1', 'purchase-3']);
    expect(data.items[0]).toMatchObject({ goodsPurchaseId: 'purchase-1', debtDate: '2026-10-10', status: 'UNKNOWN' });
    const result = await reconcile(request({ historyComplete: true, payments: [{ amount: 30000, paidAt: '2026-10-20' }] }),
      { params: Promise.resolve({ goodsPurchaseId: 'purchase-1' }) });
    expect(result.status).toBe(201);
    const body = await result.json();
    expect(body.payableId).toEqual(expect.any(String));
    const listed = await GET(new Request('http://localhost/api/finance/giro'));
    expect((await listed.json()).items[0]).toMatchObject({ status: 'PARTIAL', paid: 30000, remaining: 70000 });
  });

  it('preserves an earlier manual debt date and rejects linking another store', async () => {
    const context = { params: Promise.resolve({ goodsPurchaseId: 'purchase-3' }) };
    const body = { historyComplete: true, payableId: 'manual-other-store', payments: [] };
    expect((await reconcile(request(body), context)).status).toBe(404);
    const result = await reconcile(request({ historyComplete: true, payableId: 'manual-early', expectedPayments: [{ amount: 10000, paidAt: '2026-10-05' }], payments: [{ amount: 5000, paidAt: '2026-10-06' }] }), context);
    expect(result.status).toBe(201);
    const [row] = await client.$queryRaw<{ debtDate: string; goodsPurchaseId: string }[]>`
      SELECT "debtDate"::text, "goodsPurchaseId" FROM "pos_supplier_payables" WHERE "id" = 'manual-early'
    `;
    expect(row).toEqual({ debtDate: '2026-10-01', goodsPurchaseId: 'purchase-3' });
    const items = (await (await GET(new Request('http://localhost/api/finance/giro'))).json()).items;
    expect(items.find((item: { goodsPurchaseId: string }) => item.goodsPurchaseId === 'purchase-3'))
      .toMatchObject({ debtDate: '2026-10-20', payableDebtDate: '2026-10-01', status: 'PARTIAL', paid: 15000, remaining: 85000 });
  });

  it('rejects a stale reconciliation after a concurrent manual payment commits', async () => {
    await client.$executeRaw`INSERT INTO "pos_goods_purchases" VALUES ('purchase-race','store-1','PB-RACE','Pemasok',100000,'shopping-race','2026-11-20','APPROVED','GIRO')`;
    await client.$executeRaw`INSERT INTO "pos_expenses" VALUES ('expense-race','store-1',100000,'2026-10-09 18:00:00'::timestamp,null,'purchase-race','shopping-race')`;
    await client.$executeRaw`INSERT INTO "pos_supplier_payables" ("id", "storeId", "supplierName", "amount", "debtDate", "createdById") VALUES ('manual-race','store-1','Pemasok',100000,'2026-10-01'::date,'user-1')`;

    let releaseLock!: () => void;
    let lockAcquired!: () => void;
    const locked = new Promise<void>(resolve => { lockAcquired = resolve; });
    const release = new Promise<void>(resolve => { releaseLock = resolve; });
    const blocker = client.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "pos_supplier_payables" WHERE "id" = 'manual-race' FOR UPDATE`;
      lockAcquired();
      await release;
    }, { timeout: 15_000 });
    await locked;
    const payment = pay(request({ amount: 30000, paidAt: '2026-10-20' }), { params: Promise.resolve({ id: 'manual-race' }) });
    let reconciliation!: Promise<Response>;
    try {
      const waitForBlockedRequests = async (count: number) => {
        const deadline = Date.now() + 5000;
        let waiting = 0;
        while (waiting < count && Date.now() < deadline) {
          const [state] = await client.$queryRaw<{ waiting: number }[]>`SELECT COUNT(*)::int AS waiting FROM pg_stat_activity WHERE pid <> pg_backend_pid() AND wait_event_type = 'Lock' AND query LIKE '%pos_supplier_payables%' AND query LIKE '%FOR UPDATE%'`;
          waiting = state.waiting;
          if (waiting < count) await new Promise(resolve => setTimeout(resolve, 25));
        }
        expect(waiting).toBeGreaterThanOrEqual(count);
      };
      await waitForBlockedRequests(1);
      reconciliation = reconcile(request({ historyComplete: true, payableId: 'manual-race', expectedPayments: [], payments: [{ amount: 30000, paidAt: '2026-10-20' }] }),
        { params: Promise.resolve({ goodsPurchaseId: 'purchase-race' }) });
      await waitForBlockedRequests(2);
    } finally {
      releaseLock();
      await blocker;
    }
    expect((await payment).status).toBe(201);
    const result = await reconciliation;
    expect(result.status).toBe(409);
    expect(await result.json()).toMatchObject({ code: 'HistoryChanged' });
    const rows = await client.$queryRaw<{ amount: string }[]>`SELECT "amount"::text FROM "pos_supplier_payable_payments" WHERE "payableId" = 'manual-race'`;
    expect(rows).toEqual([{ amount: '30000.00' }]);
    const [payable] = await client.$queryRaw<{ goodsPurchaseId: string | null }[]>`SELECT "goodsPurchaseId" FROM "pos_supplier_payables" WHERE "id" = 'manual-race'`;
    expect(payable.goodsPurchaseId).toBeNull();
  }, 20_000);

  it('serializes concurrent payments so their total cannot exceed the debt', async () => {
    const [debt] = await client.$queryRaw<{ id: string }[]>`SELECT "id" FROM "pos_supplier_payables" WHERE "goodsPurchaseId" = 'purchase-1'`;
    const context = { params: Promise.resolve({ id: debt.id }) };
    const responses = await Promise.all([
      pay(request({ amount: 30000, paidAt: '2026-10-21', expectedBalance: '70000' }, randomUUID()), context),
      pay(request({ amount: 30000, paidAt: '2026-10-21', expectedBalance: '70000' }, randomUUID()), context),
    ]);
    expect(responses.map(response => response.status).sort()).toEqual([201, 409]);
    const conflict = responses.find(response => response.status === 409)!;
    expect(await conflict.json()).toMatchObject({ code: 'BalanceChanged' });
    const [total] = await client.$queryRaw<{ paid: string }[]>`SELECT SUM("amount")::text AS paid FROM "pos_supplier_payable_payments" WHERE "payableId" = ${debt.id}`;
    expect(total.paid).toBe('60000.00');
  });

  it('records a concurrent retry once and returns success for both requests', async () => {
    const context = { params: Promise.resolve({ id: 'manual-early' }) };
    const key = randomUUID();
    const responses = await Promise.all([
      pay(request({ amount: 20000, paidAt: '2026-10-22', expectedBalance: '85000' }, key), context),
      pay(request({ amount: 20000, paidAt: '2026-10-22', expectedBalance: '85000' }, key), context),
    ]);
    expect(responses.map(response => response.status)).toEqual([201, 201]);
    const rows = await client.$queryRaw<{ amount: string }[]>`SELECT "amount"::text FROM "pos_supplier_payable_payments" WHERE "requestScope" = ${JSON.stringify(['store-1', key])}`;
    expect(rows).toEqual([{ amount: '20000.00' }]);
    expect((await pay(request({ amount: 21000, paidAt: '2026-10-22', expectedBalance: '85000' }, key), context)).status).toBe(409);
    expect((await pay(request({ amount: 20000, paidAt: '2026-10-22', expectedBalance: '100000' }, key), { params: Promise.resolve({ id: 'other-giro' }) })).status).toBe(409);
  });

  it('rejects simultaneous use of one key for different payables', async () => {
    const key = randomUUID();
    const responses = await Promise.all([
      pay(request({ amount: 1000, paidAt: '2026-10-22', expectedBalance: '65000' }, key), { params: Promise.resolve({ id: 'manual-early' }) }),
      pay(request({ amount: 1000, paidAt: '2026-10-22', expectedBalance: '100000' }, key), { params: Promise.resolve({ id: 'other-giro' }) }),
    ]);
    expect(responses.map(response => response.status).sort()).toEqual([201, 409]);
    const rows = await client.$queryRaw<{ id: string }[]>`SELECT "id" FROM "pos_supplier_payable_payments" WHERE "requestScope" = ${JSON.stringify(['store-1', key])}`;
    expect(rows).toHaveLength(1);
  });

  it('accepts a retry even after the payment made the balance zero', async () => {
    const context = { params: Promise.resolve({ id: 'full-giro' }) };
    const key = randomUUID();
    expect((await pay(request({ amount: 100000, paidAt: '2026-10-22', expectedBalance: '100000' }, key), context)).status).toBe(201);
    expect((await pay(request({ amount: 100000, paidAt: '2026-10-22', expectedBalance: '100000' }, key), context)).status).toBe(201);
    expect((await pay(request({ amount: 100000, paidAt: '2026-10-22', expectedBalance: '50000' }, key), context)).status).toBe(409);
    const rows = await client.$queryRaw<{ id: string }[]>`SELECT "id" FROM "pos_supplier_payable_payments" WHERE "payableId" = 'full-giro'`;
    expect(rows).toHaveLength(1);
  });

  it('isolates identical idempotency keys across stores', async () => {
    const key = randomUUID();
    try {
      const [balance] = await client.$queryRaw<{ remaining: string }[]>`SELECT (d."amount" - COALESCE(SUM(p."amount"), 0))::text AS remaining FROM "pos_supplier_payables" d LEFT JOIN "pos_supplier_payable_payments" p ON p."payableId" = d."id" WHERE d."id" = 'other-giro' GROUP BY d."amount"`;
      expect((await pay(request({ amount: 1000, paidAt: '2026-10-22', expectedBalance: balance.remaining }, key), { params: Promise.resolve({ id: 'other-giro' }) })).status).toBe(201);
      mocks.storeId = 'store-2';
      expect((await pay(request({ amount: 1000, paidAt: '2026-10-22', expectedBalance: '100000' }, key), { params: Promise.resolve({ id: 'store-two-giro' }) })).status).toBe(201);
    } finally { mocks.storeId = 'store-1'; }
    const rows = await client.$queryRaw<{ requestScope: string }[]>`SELECT "requestScope" FROM "pos_supplier_payable_payments" WHERE "requestScope" IN (${JSON.stringify(['store-1', key])}, ${JSON.stringify(['store-2', key])})`;
    expect(rows).toHaveLength(2);
  });

  it('replays a legacy request without inventing its missing expected balance', async () => {
    const key = randomUUID();
    await client.$executeRaw`INSERT INTO "pos_supplier_payable_payments" ("id", "payableId", "amount", "paidAt", "createdById", "requestScope") VALUES ('legacy-request', 'other-giro', 1000, '2026-10-22'::date, 'user-1', ${JSON.stringify(['store-1', key])})`;
    const context = { params: Promise.resolve({ id: 'other-giro' }) };
    expect((await pay(request({ amount: 1000, paidAt: '2026-10-22' }, key), context)).status).toBe(201);
    expect((await pay(request({ amount: 1000, paidAt: '2026-10-22', expectedBalance: '100000' }, key), context)).status).toBe(409);
    const rows = await client.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*) AS count FROM "pos_supplier_payable_payments" WHERE "requestScope" = ${JSON.stringify(['store-1', key])}`;
    expect(Number(rows[0].count)).toBe(1);
  });
});
