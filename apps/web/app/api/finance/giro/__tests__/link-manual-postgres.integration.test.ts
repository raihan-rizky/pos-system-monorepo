import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@pos/db';

const connection = process.env.GIRO_TEST_DATABASE_URL;
const schema = `giro_link_test_${randomUUID().replaceAll('-', '')}`;
const mocks = vi.hoisted(() => ({ db: null as PrismaClient | null, storeId: 'store-1', logError: vi.fn() }));
vi.mock('@pos/db', async importOriginal => ({ ...(await importOriginal()), get db() { return mocks.db; } }));
vi.mock('@/lib/rbac/guard', () => ({ requireRole: async () => ({ id: 'user-1', storeId: mocks.storeId }), requirePermission: async () => ({ id: 'user-1', storeId: mocks.storeId }), handleAuthError: () => null }));
vi.mock('@/lib/logger', () => ({ getLogger: () => ({ error: mocks.logError }) }));
import { POST as link } from '../[goodsPurchaseId]/link-manual/route';
import { GET } from '../route';
import { POST as pay } from '../../supplier-payables/[id]/payments/route';

const request = (body: unknown, key?: string) => new Request('http://localhost/api', {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) }, body: JSON.stringify(body),
});

describe.skipIf(!connection)('manual giro linking on isolated local PostgreSQL', () => {
  let admin: PrismaClient;
  let client: PrismaClient;

  beforeAll(async () => {
    const parsed = new URL(connection!);
    if (parsed.hostname !== '127.0.0.1' || !['55443', '15443'].includes(parsed.port) || parsed.pathname !== '/postgres' || parsed.searchParams.has('schema')) {
      throw new Error('GIRO_TEST_DATABASE_URL must target only the isolated local PostgreSQL ports without a schema');
    }
    admin = new PrismaClient({ datasourceUrl: connection });
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    parsed.searchParams.set('schema', schema);
    client = new PrismaClient({ datasourceUrl: parsed.toString() });
    mocks.db = client;
    await client.$executeRawUnsafe(`CREATE TABLE "pos_goods_purchases" (
      "id" text PRIMARY KEY, "storeId" text NOT NULL, "number" text NOT NULL, "supplierNameSnapshot" text NOT NULL,
      "totalAmount" numeric(12,2) NOT NULL, "shoppingRequestId" text NOT NULL, "paymentDueDate" date, "status" text NOT NULL, "paymentMethod" text, "statusBeforeCancellation" text)`);
    await client.$executeRawUnsafe('ALTER TABLE "pos_goods_purchases" ADD COLUMN "statusBeforeCancellation" text');
    await client.$executeRawUnsafe(`CREATE TABLE "pos_goods_purchase_payments" (
      "id" text PRIMARY KEY, "goodsPurchaseId" text NOT NULL REFERENCES "pos_goods_purchases"("id"),
      "method" text NOT NULL, "amount" numeric(12,2) NOT NULL, "dueDate" date, "note" text
    )`);
    await client.$executeRawUnsafe(`CREATE TABLE "pos_shopping_request_corrections" (
      "id" text PRIMARY KEY, "storeId" text NOT NULL, "shoppingRequestId" text NOT NULL,
      "createdAt" timestamptz NOT NULL DEFAULT now(), "afterSnapshot" jsonb NOT NULL DEFAULT '{}'::jsonb)`);
    await client.$executeRawUnsafe(`CREATE TABLE "pos_shopping_request_correction_allocations" (
      "correctionId" text NOT NULL, "sourceKind" text NOT NULL, "paymentId" text NOT NULL,
      "method" text NOT NULL, "amount" numeric(12,2) NOT NULL, "sourceAmount" numeric(12,2) NOT NULL, "paidAt" date NOT NULL)`);
    await client.$executeRawUnsafe(`CREATE TABLE "pos_expenses" (
      "id" text PRIMARY KEY, "storeId" text NOT NULL, "amount" numeric(12,2) NOT NULL, "occurredAt" timestamp NOT NULL,
      "deletedAt" timestamp, "goodsPurchaseId" text, "shoppingRequestId" text)`);
    await client.$executeRawUnsafe(`CREATE TABLE "pos_supplier_payables" (
      "id" text PRIMARY KEY, "storeId" text NOT NULL, "goodsPurchaseId" text UNIQUE REFERENCES "pos_goods_purchases"("id"),
      "giroHistoryVerifiedAt" timestamptz, "supplierName" text NOT NULL, "amount" numeric(12,2) NOT NULL,
      "debtDate" date NOT NULL, "dueDate" date, "note" text, "createdById" text NOT NULL, "createdAt" timestamp NOT NULL DEFAULT now())`);
    await client.$executeRawUnsafe(`CREATE TABLE "pos_supplier_payable_payments" (
      "id" text PRIMARY KEY, "payableId" text NOT NULL REFERENCES "pos_supplier_payables"("id") ON DELETE RESTRICT,
      "amount" numeric(12,2) NOT NULL, "paidAt" date NOT NULL, "createdById" text NOT NULL,
      "createdAt" timestamp NOT NULL DEFAULT now(), "requestScope" text UNIQUE, "requestExpectedBalance" numeric(12,2))`);
    const migration = readFileSync(path.resolve(process.cwd(), '../../packages/db/prisma/migrations/20261102100000_manual_giro_link_audit/migration.sql'), 'utf8');
    const create = migration.match(/CREATE TABLE[\s\S]*?\n\);/)?.[0];
    const index = migration.match(/CREATE INDEX[^;]+;/)?.[0];
    const revokeRoles = migration.match(/DO \$\$[\s\S]*?\$\$;/)?.[0];
    if (!create || !index || !revokeRoles) throw new Error('Audit migration is incomplete');
    await client.$executeRawUnsafe(create);
    await client.$executeRawUnsafe(index);
    await client.$executeRawUnsafe('ALTER TABLE "pos_supplier_payable_manual_links" ENABLE ROW LEVEL SECURITY');
    await client.$executeRawUnsafe('REVOKE ALL ON TABLE "pos_supplier_payable_manual_links" FROM PUBLIC');
    await client.$executeRawUnsafe(revokeRoles);
  }, 30_000);

  afterAll(async () => {
    await client?.$disconnect();
    if (admin) await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin?.$disconnect();
    mocks.db = null;
  });

  async function fixture(suffix: string) {
    const purchase = `purchase-${suffix}`;
    const giro = `giro-${suffix}`;
    const manual = `manual-${suffix}`;
    const g = `g-payment-${suffix}`;
    const m = `m-payment-${suffix}`;
    const extra = `m-extra-${suffix}`;
    const shopping = `shopping-${suffix}`;
    const giroKey = randomUUID();
    const manualKey = randomUUID();
    await client.$executeRaw`INSERT INTO "pos_goods_purchases" ("id", "storeId", "number", "supplierNameSnapshot", "totalAmount", "shoppingRequestId", "paymentDueDate", "status", "paymentMethod") VALUES (${purchase},'store-1',${purchase},'Pemasok',100000,${shopping},'2026-11-20'::date,'APPROVED','GIRO')`;
    await client.$executeRaw`INSERT INTO "pos_expenses" VALUES (${`expense-${suffix}`},'store-1',100000,'2026-10-09 18:00:00'::timestamp,null,${purchase},${shopping})`;
    await client.$executeRaw`INSERT INTO "pos_supplier_payables" ("id","storeId","goodsPurchaseId","giroHistoryVerifiedAt","supplierName","amount","debtDate","dueDate","createdById")
      VALUES (${giro},'store-1',${purchase},NOW(),'Pemasok',100000,'2026-10-10'::date,'2026-11-20'::date,'creator-giro')`;
    await client.$executeRaw`INSERT INTO "pos_supplier_payables" ("id","storeId","supplierName","amount","debtDate","createdById")
      VALUES (${manual},'store-1','Pemasok',100000,'2026-10-01'::date,'creator-manual')`;
    await client.$executeRaw`INSERT INTO "pos_supplier_payable_payments" ("id","payableId","amount","paidAt","createdById","requestScope","requestExpectedBalance") VALUES
      (${g},${giro},30000,'2026-10-20'::date,'creator-g',${JSON.stringify(['store-1', giroKey])},100000),
      (${m},${manual},30000,'2026-10-20'::date,'creator-m',null,null),
      (${extra},${manual},10000,'2026-10-05'::date,'creator-extra',${JSON.stringify(['store-1', manualKey])},100000)`;
    const body = {
      payableId: manual, expectedGiroPayableId: giro, historiesConfirmed: true,
      expectedGiro: { amount: 100000, debtDate: '2026-10-10', payableDebtDate: '2026-10-10', dueDate: '2026-11-20', supplierName: 'Pemasok', payableNote: null },
      expectedManual: { amount: 100000, debtDate: '2026-10-01', dueDate: null, supplierName: 'Pemasok', note: null },
      expectedGiroPayments: [{ id: g, amount: 30000, paidAt: '2026-10-20' }],
      expectedManualPayments: [{ id: m, amount: 30000, paidAt: '2026-10-20' }, { id: extra, amount: 10000, paidAt: '2026-10-05' }],
      duplicatePayments: [{ giroPaymentId: g, manualPaymentId: m }], matchingPaymentsConfirmedDistinct: false,
    };
    return { purchase, giro, manual, g, m, extra, giroKey, manualKey, body, context: { params: Promise.resolve({ goodsPurchaseId: purchase }) } };
  }

  it('audits the originals, keeps metadata, and safely replays original requests', async () => {
    const f = await fixture('success');
    const response = await link(request(f.body), f.context);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ payableId: f.giro });
    const rows = await client.$queryRaw<{ id: string; payableId: string; createdById: string; requestScope: string | null; requestExpectedBalance: string | null }[]>`
      SELECT "id","payableId","createdById","requestScope","requestExpectedBalance"::text AS "requestExpectedBalance"
      FROM "pos_supplier_payable_payments" WHERE "id" IN (${f.g},${f.m},${f.extra}) ORDER BY "id"`;
    expect(rows).toHaveLength(2);
    expect(rows.find(row => row.id === f.extra)).toMatchObject({ payableId: f.giro, createdById: 'creator-extra', requestExpectedBalance: '100000.00', requestScope: JSON.stringify(['store-1', f.manualKey]) });
    const [debt] = await client.$queryRaw<{ debtDate: string; amount: string }[]>`SELECT "debtDate"::text, "amount"::text FROM "pos_supplier_payables" WHERE "id" = ${f.giro}`;
    expect(debt).toEqual({ debtDate: '2026-10-01', amount: '100000.00' });
    const [audit] = await client.$queryRaw<{ manualPayable: { id: string }; giroPayable: { id: string }; manualPayments: { id: string }[]; giroPayments: { id: string }[]; duplicatePayments: unknown }[]>`
      SELECT "manualPayable","giroPayable","manualPayments","giroPayments","duplicatePayments" FROM "pos_supplier_payable_manual_links" WHERE "manualPayableId" = ${f.manual}`;
    expect(audit.manualPayable.id).toBe(f.manual);
    expect(audit.giroPayable.id).toBe(f.giro);
    expect(audit.manualPayments.map(payment => payment.id).sort()).toEqual([f.extra, f.m].sort());
    expect(audit.giroPayments.map(payment => payment.id)).toEqual([f.g]);
    expect(audit.duplicatePayments).toEqual(f.body.duplicatePayments);
    expect((await link(request(f.body), f.context)).status).toBe(200);
    expect((await link(request({ ...f.body, matchingPaymentsConfirmedDistinct: true }), f.context)).status).toBe(409);
    expect((await pay(request({ amount: 30000, paidAt: '2026-10-20', expectedBalance: '100000' }, f.giroKey), { params: Promise.resolve({ id: f.giro }) })).status).toBe(201);
    expect((await pay(request({ amount: 10000, paidAt: '2026-10-05', expectedBalance: '100000' }, f.manualKey), { params: Promise.resolve({ id: f.manual }) })).status).not.toBe(201);
  });

  it('keeps equal-looking payments when explicitly confirmed distinct', async () => {
    const f = await fixture('distinct');
    const body = { ...f.body, duplicatePayments: [], matchingPaymentsConfirmedDistinct: true };
    expect((await link(request(body), f.context)).status).toBe(201);
    const [sum] = await client.$queryRaw<{ total: string }[]>`SELECT SUM("amount")::text AS total FROM "pos_supplier_payable_payments" WHERE "payableId" = ${f.giro}`;
    expect(sum.total).toBe('70000.00');
  });

  it('serializes multiple links to one giro and accepts refreshed snapshots and exact retries', async () => {
    const f = await fixture('competing-links');
    const second = 'manual-second-competing-links';
    await client.$executeRaw`UPDATE "pos_supplier_payables" SET "note" = 'Catatan pertama' WHERE "id" = ${f.manual}`;
    await client.$executeRaw`INSERT INTO "pos_supplier_payables" ("id","storeId","supplierName","amount","debtDate","note","createdById")
      VALUES (${second},'store-1','Pemasok',100000,'2026-10-01'::date,'Catatan kedua','user-1')`;
    const first = { ...f.body, expectedManual: { ...f.body.expectedManual, note: 'Catatan pertama' } };
    const other = { ...f.body, payableId: second, expectedManual: { ...f.body.expectedManual, note: 'Catatan kedua' }, expectedManualPayments: [], duplicatePayments: [] };
    const bodies = [first, other];
    const responses = await Promise.all(bodies.map(value => link(request(value), f.context)));
    expect(responses.map(response => response.status).sort()).toEqual([201, 409]);
    const retryIndex = responses.findIndex(response => response.status === 409);
    expect(await responses[retryIndex].json()).toMatchObject({ code: 'HistoryChanged' });
    const result = await (await GET(new Request('http://localhost/api/finance/giro'))).json();
    const item = result.items.find((row: { goodsPurchaseId: string }) => row.goodsPurchaseId === f.purchase);
    const refreshed = { ...bodies[retryIndex], expectedGiro: { ...bodies[retryIndex].expectedGiro, payableDebtDate: item.payableDebtDate, payableNote: item.payableNote }, expectedGiroPayments: item.payments };
    expect((await link(request(refreshed), f.context)).status).toBe(201);
    expect((await link(request(bodies[1 - retryIndex]), f.context)).status).toBe(200);
    expect((await link(request(refreshed), f.context)).status).toBe(200);
    const [count] = await client.$queryRaw<{ count: number; note: string }[]>`SELECT COUNT(*)::int AS count, MAX(d."note") AS note
      FROM "pos_supplier_payable_manual_links" l JOIN "pos_supplier_payables" d ON d."id" = l."giroPayableId" WHERE l."giroPayableId" = ${f.giro}`;
    expect(count.count).toBe(2);
    expect(count.note).toContain('Catatan pertama');
    expect(count.note).toContain('Catatan kedua');
  });

  it.each([
    { name: 'both', giroNote: 'Catatan giro', manualNote: 'Catatan manual', expected: 'Catatan giro:\nCatatan giro\n\nCatatan hutang manual:\nCatatan manual' },
    { name: 'manual-only', giroNote: null, manualNote: 'Catatan manual', expected: 'Catatan manual' },
    { name: 'giro-only', giroNote: 'Catatan giro', manualNote: null, expected: 'Catatan giro' },
  ])('preserves notes for $name', async ({ name, giroNote, manualNote, expected }) => {
    const f = await fixture(`notes-${name}`);
    await client.$executeRaw`UPDATE "pos_supplier_payables" SET "note" = ${giroNote} WHERE "id" = ${f.giro}`;
    await client.$executeRaw`UPDATE "pos_supplier_payables" SET "note" = ${manualNote} WHERE "id" = ${f.manual}`;
    const body = { ...f.body, expectedGiro: { ...f.body.expectedGiro, payableNote: giroNote }, expectedManual: { ...f.body.expectedManual, note: manualNote } };
    expect((await link(request(body), f.context)).status).toBe(201);
    const [row] = await client.$queryRaw<{ note: string }[]>`SELECT "note" FROM "pos_supplier_payables" WHERE "id" = ${f.giro}`;
    expect(row.note).toBe(expected);
  });

  it('refuses unknown cascading foreign keys without deleting any child or ledger', async () => {
    const f = await fixture('foreign');
    await client.$executeRawUnsafe('CREATE TABLE "unexpected_reference" ("id" text PRIMARY KEY, "payableId" text REFERENCES "pos_supplier_payables"("id") ON DELETE CASCADE)');
    try {
      await client.$executeRaw`INSERT INTO "unexpected_reference" VALUES ('child', ${f.manual})`;
      const response = await link(request(f.body), f.context);
      expect(response.status).toBe(409);
      const [child] = await client.$queryRaw<{ count: number }[]>`SELECT COUNT(*)::int AS count FROM "unexpected_reference"`;
      const [debt] = await client.$queryRaw<{ count: number }[]>`SELECT COUNT(*)::int AS count FROM "pos_supplier_payables" WHERE "id" = ${f.manual}`;
      expect(child.count).toBe(1);
      expect(debt.count).toBe(1);
    } finally { await client.$executeRawUnsafe('DROP TABLE "unexpected_reference"'); }
  });

  it('rejects an additional cascading FK on a normally allowed payment column', async () => {
    const f = await fixture('additional-fk');
    await client.$executeRawUnsafe('ALTER TABLE "pos_supplier_payable_payments" ADD CONSTRAINT "unexpected_cascade" FOREIGN KEY ("payableId") REFERENCES "pos_supplier_payables"("id") ON DELETE CASCADE');
    try {
      const response = await link(request(f.body), f.context);
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ code: 'Conflict' });
      const [count] = await client.$queryRaw<{ count: number }[]>`SELECT COUNT(*)::int AS count FROM "pos_supplier_payable_payments" WHERE "payableId" = ${f.manual}`;
      expect(count.count).toBe(2);
    } finally { await client.$executeRawUnsafe('ALTER TABLE "pos_supplier_payable_payments" DROP CONSTRAINT "unexpected_cascade"'); }
  });

  it('protects payment children from cascading deletion but allows moving them intact', async () => {
    const f = await fixture('payment-foreign');
    await client.$executeRawUnsafe('CREATE TABLE "unexpected_payment_reference" ("id" text PRIMARY KEY, "paymentId" text REFERENCES "pos_supplier_payable_payments"("id") ON DELETE CASCADE)');
    try {
      await client.$executeRaw`INSERT INTO "unexpected_payment_reference" VALUES ('child', ${f.m})`;
      const rejected = await link(request(f.body), f.context);
      expect(rejected.status).toBe(409);
      const [child] = await client.$queryRaw<{ count: number }[]>`SELECT COUNT(*)::int AS count FROM "unexpected_payment_reference"`;
      expect(child.count).toBe(1);
      const distinct = { ...f.body, duplicatePayments: [], matchingPaymentsConfirmedDistinct: true };
      expect((await link(request(distinct), f.context)).status).toBe(201);
      const [moved] = await client.$queryRaw<{ payableId: string }[]>`SELECT "payableId" FROM "pos_supplier_payable_payments" WHERE "id" = ${f.m}`;
      expect(moved.payableId).toBe(f.giro);
      const [retained] = await client.$queryRaw<{ count: number }[]>`SELECT COUNT(*)::int AS count FROM "unexpected_payment_reference"`;
      expect(retained.count).toBe(1);
    } finally { await client.$executeRawUnsafe('DROP TABLE "unexpected_payment_reference"'); }
  });

  it('isolates stores and rejects changed or invalid payment histories', async () => {
    const f = await fixture('invalid');
    mocks.storeId = 'store-2';
    try { expect((await link(request(f.body), f.context)).status).toBe(404); } finally { mocks.storeId = 'store-1'; }
    const changed = { ...f.body, expectedManualPayments: [], duplicatePayments: [] };
    expect((await link(request(changed), f.context)).status).toBe(409);
    const mismatched = { ...f.body, duplicatePayments: [{ giroPaymentId: f.g, manualPaymentId: f.extra }] };
    expect((await link(request(mismatched), f.context)).status).toBe(409);
    const [count] = await client.$queryRaw<{ count: number }[]>`SELECT COUNT(*)::int AS count FROM "pos_supplier_payables" WHERE "id" IN (${f.manual}, ${f.giro})`;
    expect(count.count).toBe(2);
  });

  it.each(['manual', 'giro'] as const)('rejects a stale snapshot when a %s payment commits while the link waits', async target => {
    const f = await fixture(`concurrent-before-${target}`);
    let release!: () => void;
    let acquired!: () => void;
    const ready = new Promise<void>(resolve => { acquired = resolve; });
    const proceed = new Promise<void>(resolve => { release = resolve; });
    const paymentTransaction = client.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "pos_supplier_payables" WHERE "id" = ${f[target]} FOR UPDATE`;
      acquired();
      await proceed;
      await tx.$executeRaw`INSERT INTO "pos_supplier_payable_payments" ("id","payableId","amount","paidAt","createdById")
        VALUES (${`concurrent-payment-${target}`},${f[target]},1000,'2026-10-21'::date,'user-1')`;
    }, { timeout: 15_000 });
    await ready;
    const pending = link(request(f.body), f.context);
    try {
      await waitForBlocked(1, 'pos_supplier_payables');
    } finally {
      release();
      await paymentTransaction;
    }
    const response = await pending;
    const logged = mocks.logError.mock.calls.at(-1)?.[1] as { code?: string; meta?: unknown } | undefined;
    expect(response.status, JSON.stringify({ code: logged?.code, meta: logged?.meta })).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'HistoryChanged' });
    const [count] = await client.$queryRaw<{ count: number }[]>`SELECT COUNT(*)::int AS count FROM "pos_supplier_payables" WHERE "id" IN (${f.manual}, ${f.giro})`;
    expect(count.count).toBe(2);
  }, 25_000);

  async function waitForBlocked(count: number, queryPart: string) {
    const deadline = Date.now() + 5000;
    let waiting = 0;
    while (waiting < count && Date.now() < deadline) {
      const [state] = await client.$queryRaw<{ waiting: number }[]>`SELECT COUNT(*)::int AS waiting FROM pg_stat_activity
        WHERE pid <> pg_backend_pid() AND wait_event_type = 'Lock' AND query LIKE ${`%${queryPart}%`}`;
      waiting = state.waiting;
      if (waiting < count) await new Promise(resolve => setTimeout(resolve, 25));
    }
    expect(waiting).toBeGreaterThanOrEqual(count);
  }

  it('rejects stale payment requests that wait until the link commits', async () => {
    const f = await fixture('concurrent-after');
    await client.$executeRawUnsafe(`CREATE FUNCTION block_link_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(974321); RETURN NEW; END $$`);
    await client.$executeRawUnsafe(`CREATE TRIGGER block_link_audit BEFORE INSERT ON "pos_supplier_payable_manual_links" FOR EACH ROW EXECUTE FUNCTION block_link_audit()`);
    let release!: () => void;
    let acquired!: () => void;
    const ready = new Promise<void>(resolve => { acquired = resolve; });
    const proceed = new Promise<void>(resolve => { release = resolve; });
    const blocker = client.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(974321)::text`;
      acquired();
      await proceed;
    }, { timeout: 15_000 });
    await ready;
    const pendingLink = link(request(f.body), f.context);
    let oldManual!: Promise<Response>;
    let staleGiro!: Promise<Response>;
    try {
      await waitForBlocked(1, 'pos_supplier_payable_manual_links');
      oldManual = pay(request({ amount: 1000, paidAt: '2026-10-22' }), { params: Promise.resolve({ id: f.manual }) });
      staleGiro = pay(request({ amount: 1000, paidAt: '2026-10-22', expectedBalance: '70000' }, randomUUID()), { params: Promise.resolve({ id: f.giro }) });
      await waitForBlocked(2, 'pos_supplier_payables');
    } finally {
      release();
      await blocker;
    }
    try {
      expect((await pendingLink).status).toBe(201);
      expect((await oldManual).status).toBe(404);
      const stale = await staleGiro;
      expect(stale.status).toBe(409);
      expect(await stale.json()).toMatchObject({ code: 'BalanceChanged' });
    } finally {
      await client.$executeRawUnsafe('DROP TRIGGER block_link_audit ON "pos_supplier_payable_manual_links"');
      await client.$executeRawUnsafe('DROP FUNCTION block_link_audit()');
    }
  }, 25_000);

  it('times out promptly when another writer holds the expense table', async () => {
    const f = await fixture('busy-writer');
    let release!: () => void;
    let acquired!: () => void;
    const ready = new Promise<void>(resolve => { acquired = resolve; });
    const proceed = new Promise<void>(resolve => { release = resolve; });
    const writer = client.$transaction(async tx => {
      await tx.$executeRaw`UPDATE "pos_expenses" SET "amount" = "amount" WHERE "goodsPurchaseId" = ${f.purchase}`;
      acquired();
      await proceed;
    }, { timeout: 15_000 });
    await ready;
    const started = Date.now();
    let response!: Response;
    try { response = await link(request(f.body), f.context); }
    finally { release(); await writer; }
    expect(Date.now() - started).toBeLessThan(5000);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'Conflict' });
  }, 15_000);

  it('releases its table lock promptly if an audit statement stalls', async () => {
    const f = await fixture('stalled-link');
    await client.$executeRawUnsafe('CREATE FUNCTION stall_link_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(10); RETURN NEW; END $$');
    await client.$executeRawUnsafe('CREATE TRIGGER stall_link_audit BEFORE INSERT ON "pos_supplier_payable_manual_links" FOR EACH ROW EXECUTE FUNCTION stall_link_audit()');
    const started = Date.now();
    const pending = link(request(f.body), f.context);
    let writer!: Promise<unknown>;
    try {
      const deadline = Date.now() + 5000;
      let active = false;
      while (!active && Date.now() < deadline) {
        const [state] = await client.$queryRaw<{ count: number }[]>`SELECT COUNT(*)::int AS count FROM pg_stat_activity
          WHERE pid <> pg_backend_pid() AND state = 'active' AND query LIKE '%INSERT INTO "pos_supplier_payable_manual_links"%'`;
        active = state.count > 0;
        if (!active) await new Promise(resolve => setTimeout(resolve, 25));
      }
      expect(active).toBe(true);
      writer = Promise.resolve(client.$executeRaw`UPDATE "pos_expenses" SET "amount" = "amount" WHERE "goodsPurchaseId" = ${f.purchase}`);
      await waitForBlocked(1, 'pos_expenses');
      const response = await pending;
      expect(response.status).toBe(409);
      await writer;
      expect(Date.now() - started).toBeLessThan(6000);
      const [count] = await client.$queryRaw<{ count: number }[]>`SELECT COUNT(*)::int AS count FROM "pos_supplier_payables" WHERE "id" IN (${f.manual}, ${f.giro})`;
      expect(count.count).toBe(2);
    } finally {
      await pending;
      await writer;
      await client.$executeRawUnsafe('DROP TRIGGER stall_link_audit ON "pos_supplier_payable_manual_links"');
      await client.$executeRawUnsafe('DROP FUNCTION stall_link_audit()');
    }
  }, 15_000);

  it.each([60000, 100000])('matches manual debt against the mixed-schedule giro subtotal (%s)', async manualAmount => {
    const f = await fixture(`mixed-${manualAmount}`);
    await client.$executeRaw`UPDATE "pos_goods_purchases" SET "paymentMethod"=null, "paymentDueDate"=null WHERE id=${f.purchase}`;
    await client.$executeRaw`INSERT INTO "pos_goods_purchase_payments" VALUES
      (${`transfer-${manualAmount}`},${f.purchase},'TRANSFER',40000,null,null),
      (${`giro-${manualAmount}`},${f.purchase},'GIRO',60000,'2026-11-20'::date,null)`;
    await client.$executeRaw`UPDATE "pos_supplier_payables" SET amount=60000 WHERE id=${f.giro}`;
    await client.$executeRaw`UPDATE "pos_supplier_payables" SET amount=${manualAmount} WHERE id=${f.manual}`;
    f.body.expectedGiro.amount = 60000;
    f.body.expectedManual.amount = manualAmount;
    const response = await link(request(f.body), f.context);
    expect(response.status).toBe(manualAmount === 60000 ? 201 : 409);
    const [audit] = await client.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*) AS count FROM "pos_supplier_payable_manual_links" WHERE "manualPayableId"=${f.manual}`;
    expect(Number(audit.count)).toBe(manualAmount === 60000 ? 1 : 0);
  });

  it('enables row security and denies API roles direct access to audit snapshots', async () => {
    const [table] = await client.$queryRaw<{ enabled: boolean; publicAccess: boolean }[]>`
      SELECT c.relrowsecurity AS enabled, has_table_privilege('public', c.oid, 'SELECT') AS "publicAccess"
      FROM pg_class c WHERE c.oid = '"pos_supplier_payable_manual_links"'::regclass`;
    expect(table).toEqual({ enabled: true, publicAccess: false });
    const roles = await client.$queryRaw<{ rolname: string; access: boolean }[]>`
      SELECT rolname, has_table_privilege(rolname, '"pos_supplier_payable_manual_links"', 'SELECT') AS access
      FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')`;
    expect(roles.every(role => !role.access)).toBe(true);
  });
});
