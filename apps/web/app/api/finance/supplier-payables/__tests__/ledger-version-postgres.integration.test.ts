import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@pos/db';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({ db: null as PrismaClient | null, storeId: 'store-1', userId: 'user-1', correction: vi.fn(), authorize: vi.fn(async () => true), dbAuthorize: false, holdAuthorize: null as null | (() => Promise<void>) }));
vi.mock('@pos/db', async original => ({ ...await original<object>(), get db() { return runtime.db; } }));
vi.mock('@/lib/rbac/guard', () => ({ requireRole: async () => ({ id: runtime.userId, storeId: runtime.storeId }), requirePermission: async () => ({ id: runtime.userId, storeId: runtime.storeId }), authorizeInTransaction: async (tx: PrismaClient, ...args: unknown[]) => { if (runtime.dbAuthorize) await tx.$executeRaw`LOCK TABLE "test_role_permissions" IN SHARE MODE`; if (runtime.holdAuthorize) await runtime.holdAuthorize(); void args; return runtime.authorize(); }, canAuthenticatedUserAccessPage: async () => true, handleAuthError: () => null }));
vi.mock('@/lib/logger', () => ({ getLogger: () => ({ error: vi.fn() }) }));
vi.mock('@/features/suppliers/shopping-requests/repositories/shopping-request-correction-payment-state', () => ({ loadCorrectionPaymentState: runtime.correction }));
import { GET as getManual } from '@/app/api/finance/supplier-payables/route';
import { GET as getGiro } from '@/app/api/finance/giro/route';
import { POST as pay } from '@/app/api/finance/supplier-payables/[id]/payments/route';
import { postGiroPayment, readPendingGiroPayment } from '@/features/keuangan/helpers/giro-payment-request';

const connection = process.env.GIRO_TEST_DATABASE_URL;
const schema = `ledger_api_${randomUUID().replaceAll('-', '')}`;
const request = (body: unknown, key: string) => new Request('http://localhost/api', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify(body) });

describe.skipIf(!connection)('versi ledger di API PostgreSQL terisolasi', () => {
  let admin: PrismaClient;
  let db: PrismaClient;
  const legacyKey = randomUUID();
  beforeAll(async () => {
    const url = new URL(connection!);
    if (url.hostname !== '127.0.0.1' || !['55443', '15443'].includes(url.port) || url.pathname !== '/postgres' || url.searchParams.has('schema')) throw new Error('Database uji terisolasi diperlukan.');
    admin = new PrismaClient({ datasourceUrl: connection });
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    url.searchParams.set('schema', schema);
    db = new PrismaClient({ datasourceUrl: url.toString() }); runtime.db = db;
    const ddl = [
      `CREATE TYPE "ManualPayablePaymentOrigin" AS ENUM ('MANUAL', 'AUTO', 'CORRECTED_AUTO')`,
      `CREATE TABLE "test_role_permissions" ("id" text PRIMARY KEY, "allowed" boolean NOT NULL)`,
      `CREATE TABLE "pos_goods_purchases" ("id" text PRIMARY KEY, "storeId" text NOT NULL, "number" text, "supplierNameSnapshot" text, "totalAmount" numeric(12,2), "shoppingRequestId" text, "paymentDueDate" date, "status" text, "statusBeforeCancellation" text, "paymentMethod" text)`,
      `CREATE TABLE "pos_goods_purchase_payments" ("id" text PRIMARY KEY, "goodsPurchaseId" text, "method" text, "amount" numeric(12,2), "dueDate" date, "note" text)`,
      `CREATE TABLE "pos_shopping_request_corrections" ("id" text PRIMARY KEY, "storeId" text, "shoppingRequestId" text, "createdAt" timestamp DEFAULT now(), "afterSnapshot" jsonb DEFAULT '{}'::jsonb)`,
      `CREATE TABLE "pos_shopping_request_correction_allocations" ("correctionId" text, "sourceKind" text, "paymentId" text, "method" text, "amount" numeric(12,2), "paidAt" date)`,
      `CREATE TABLE "pos_expenses" ("id" text PRIMARY KEY, "storeId" text, "amount" numeric(12,2), "occurredAt" timestamp, "deletedAt" timestamp, "goodsPurchaseId" text, "shoppingRequestId" text)`,
      `CREATE TABLE "pos_supplier_payables" ("id" text PRIMARY KEY, "storeId" text NOT NULL, "goodsPurchaseId" text, "giroHistoryVerifiedAt" timestamp, "supplierName" text NOT NULL, "amount" numeric(12,2) NOT NULL, "debtDate" date NOT NULL, "dueDate" date, "note" text, "reportCategory" text, "createdById" text NOT NULL, "createdAt" timestamp DEFAULT now())`,
      `CREATE TABLE "pos_supplier_payable_payments" ("id" text PRIMARY KEY, "payableId" text NOT NULL REFERENCES "pos_supplier_payables"("id"), "amount" numeric(12,2) NOT NULL, "paidAt" date NOT NULL, "origin" "ManualPayablePaymentOrigin" NOT NULL DEFAULT 'MANUAL', "automaticKey" text, "createdById" text NOT NULL, "createdAt" timestamp DEFAULT now(), "requestScope" text UNIQUE, "requestExpectedBalance" numeric(12,2), "requestPayableId" text, "requestAmount" numeric(12,2), "requestPaidAt" date, "requestResource" text)`,
      `CREATE TABLE "pos_manual_transfer_allocations" ("id" text PRIMARY KEY, "storeId" text, "expenseId" text, "payableId" text, "paymentId" text UNIQUE, "amount" numeric(12,2), "createdById" text, "createdAt" timestamp DEFAULT now(), "updatedAt" timestamp DEFAULT now())`,
      `CREATE TABLE "pos_supplier_payable_manual_links" ("manualPayableId" text PRIMARY KEY, "giroPayableId" text, "storeId" text)`,
    ];
    for (const statement of ddl) await db.$executeRawUnsafe(statement);
    await db.$executeRaw`INSERT INTO "pos_supplier_payables" ("id","storeId","supplierName","amount","debtDate","createdById") VALUES ('legacy-debt','store-1','Pemasok',1000.50,'2026-10-10'::date,'user-1')`;
    await db.$executeRaw`INSERT INTO "pos_supplier_payable_payments" ("id","payableId","amount","paidAt","createdById","requestScope","requestExpectedBalance","requestPayableId","requestAmount","requestPaidAt","requestResource") VALUES ('legacy','legacy-debt',100.00,'2026-10-12'::date,'user-1',${JSON.stringify(['store-1', legacyKey])},1000.50,'legacy-debt',100.00,'2026-10-12'::date,'MANUAL')`;
    const migration = readFileSync(path.resolve(process.cwd(), '../../packages/db/prisma/migrations/20261117050000_payable_ledger_version/migration.sql'), 'utf8');
    for (const statement of migration.split('-- statement-break').map(value => value.trim()).filter(Boolean)) await db.$executeRawUnsafe(statement);
    await db.$executeRaw`INSERT INTO "test_role_permissions" VALUES ('permission', true)`;
    await db.$executeRawUnsafe(`INSERT INTO "pos_goods_purchases" VALUES ('purchase-1','store-1','PB-1','Pemasok',1000.50,'shopping-1','2026-12-01','APPROVED',NULL,'GIRO')`);
    await db.$executeRawUnsafe(`INSERT INTO "pos_expenses" VALUES ('expense-1','store-1',1000.50,'2026-10-10 00:00:00',NULL,'purchase-1','shopping-1')`);
    await db.$executeRawUnsafe(`INSERT INTO "pos_supplier_payables" ("id","storeId","goodsPurchaseId","giroHistoryVerifiedAt","supplierName","amount","debtDate","createdById") VALUES ('giro','store-1','purchase-1',now(),'Pemasok',1000.50,'2026-10-10','user-1'), ('manual','store-1',NULL,NULL,'Pemasok',1000.50,'2026-10-10','user-1'), ('other','store-2',NULL,NULL,'Pemasok',1000.50,'2026-10-10','user-1')`);
  }, 30_000);
  afterAll(async () => { await db?.$disconnect(); if (admin) await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await admin?.$disconnect(); runtime.db = null; });

  it.each(['manual', 'giro'])('rejects a stale %s form after payment and correction restored the same two-decimal balance', async kind => {
    const list = async () => kind === 'manual'
      ? (await (await getManual(new Request('http://localhost/api'))).json()).items.find((row: { id: string }) => row.id === 'manual')
      : (await (await getGiro(new Request('http://localhost/api'))).json()).items.find((row: { payableId: string }) => row.payableId === 'giro');
    const deviceA = await list();
    const deviceB = await list();
    expect(deviceA.ledgerVersion).toBe('0');
    expect(deviceB.ledgerVersion).toBe(deviceA.ledgerVersion);
    const id = kind;
    const context = { params: Promise.resolve({ id }) };
    const body = { amount: '300.25', paidAt: '2026-10-11', expectedBalance: '1000.50', expectedLedgerVersion: deviceA.ledgerVersion };
    const key = randomUUID();
    expect((await pay(request(body, key), context)).status).toBe(201);
    await db.$executeRaw`UPDATE "pos_supplier_payables" SET "amount" = 1300.75 WHERE "id" = ${id} AND "storeId" = 'store-1'`;
    if (kind === 'giro') await db.$executeRaw`UPDATE "pos_goods_purchases" SET "totalAmount" = 1300.75 WHERE "id" = 'purchase-1'`;
    const latest = await list();
    expect(latest.ledgerVersion).not.toBe(deviceB.ledgerVersion);
    const stale = await pay(request({ ...body, expectedLedgerVersion: deviceB.ledgerVersion }, randomUUID()), context);
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ code: 'BalanceChanged' });
    expect((await pay(request(body, key), context)).status).toBe(201);
    const [count] = await db.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*) AS count FROM "pos_supplier_payable_payments" WHERE "payableId" = ${id}`;
    expect(Number(count.count)).toBe(1);
  });

  it('checks the version after waiting for the debt lock held by another device', async () => {
    await db.$executeRaw`INSERT INTO "pos_supplier_payables" ("id","storeId","supplierName","amount","debtDate","createdById") VALUES ('race','store-1','Pemasok',1000.50,'2026-10-10'::date,'user-1')`;
    let locked!: () => void;
    let release!: () => void;
    const hasLock = new Promise<void>(resolve => { locked = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const blocker = db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "pos_supplier_payables" WHERE "id" = 'race' FOR UPDATE`;
      locked();
      await gate;
      await tx.$executeRaw`SELECT set_config('pos.payable_system_payment', '1', true)`;
      await tx.$executeRaw`INSERT INTO "pos_supplier_payable_payments" ("id","payableId","amount","paidAt","createdById") VALUES ('race-first','race',300.25,'2026-10-11'::date,'user-1')`;
      await tx.$executeRaw`UPDATE "pos_supplier_payables" SET "amount" = 1300.75 WHERE "id" = 'race'`;
    });
    await hasLock;
    const pending = pay(request({ amount: '300.25', paidAt: '2026-10-11', expectedBalance: '1000.50', expectedLedgerVersion: '0' }, randomUUID()), { params: Promise.resolve({ id: 'race' }) });
    try {
      const completedEarly = await Promise.race([pending.then(() => true), new Promise<boolean>(resolve => setTimeout(() => resolve(false), 150))]);
      expect(completedEarly).toBe(false);
    } finally { release(); }
    await blocker;
    expect((await pending).status).toBe(409);
    const [count] = await db.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*) AS count FROM "pos_supplier_payable_payments" WHERE "payableId" = 'race'`;
    expect(Number(count.count)).toBe(1);
  });

  it('accepts only the matching legacy replay without a version, including after the balance changes', async () => {
    const body = { amount: '100.00', paidAt: '2026-10-12', expectedBalance: '1000.50' };
    const context = { params: Promise.resolve({ id: 'legacy-debt' }) };
    expect((await pay(request(body, legacyKey), context)).status).toBe(201);
    expect((await pay(request(body, randomUUID()), context)).status).toBe(422);
    expect((await pay(request({ ...body, amount: '100.01' }, legacyKey), context)).status).toBe(409);
  });

  it('rejects a manual payment form captured before its automatic due-date settlement in WIB', async () => {
    await db.$executeRaw`INSERT INTO "pos_supplier_payables" ("id","storeId","supplierName","amount","debtDate","dueDate","createdById") VALUES ('due-transition','store-1','Pemasok',1000.50,'2026-10-10'::date,'2026-11-17'::date,'user-1')`;
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-11-16T16:59:00.000Z'));
      const before = (await (await getManual(new Request('http://localhost/api'))).json()).items.find((row: { id: string }) => row.id === 'due-transition');
      expect(before.paid).toBe(0);
      vi.setSystemTime(new Date('2026-11-16T17:01:00.000Z'));
      const after = (await (await getManual(new Request('http://localhost/api'))).json()).items.find((row: { id: string }) => row.id === 'due-transition');
      expect(after.paid).toBe(1000.5);
      const response = await pay(request({ amount: '300.25', paidAt: '2026-11-16', expectedBalance: '1000.50', expectedLedgerVersion: before.ledgerVersion }, randomUUID()), { params: Promise.resolve({ id: 'due-transition' }) });
      expect(response.status).toBe(409);
      expect(after.ledgerVersion).not.toBe(before.ledgerVersion);
    } finally { vi.useRealTimers(); }
  });

  it('keeps versioned snapshots and payment attempts scoped to the current store', async () => {
    runtime.storeId = 'store-2';
    try {
      const response = await getManual(new Request('http://localhost/api'));
      const items = (await response.json()).items as Array<{ id: string; ledgerVersion: string }>;
      expect(items.map(item => item.id)).toEqual(['other']);
      expect(items[0].ledgerVersion).toBe('0');
      const body = { amount: '1.00', paidAt: '2026-10-11', expectedBalance: '1000.50', expectedLedgerVersion: '0' };
      expect((await pay(request(body, randomUUID()), { params: Promise.resolve({ id: 'manual' }) })).status).toBe(404);
    } finally { runtime.storeId = 'store-1'; }
  });

  it('uses the same GIRO allocations and schedule subtotal as the displayed mixed purchase snapshot', async () => {
    await db.$executeRaw`INSERT INTO "pos_goods_purchases" VALUES ('mixed-purchase','store-1','PB-MIX','Pemasok',10000.00,'mixed-shopping','2026-12-01'::date,'APPROVED',NULL,NULL)`;
    await db.$executeRaw`INSERT INTO "pos_goods_purchase_payments" VALUES ('mixed-transfer','mixed-purchase','TRANSFER',3000.00,NULL,NULL), ('mixed-giro','mixed-purchase','GIRO',7000.00,'2026-12-01'::date,NULL)`;
    await db.$executeRaw`INSERT INTO "pos_expenses" VALUES ('mixed-expense','store-1',10000.00,'2026-10-10 00:00:00'::timestamp,NULL,'mixed-purchase','mixed-shopping')`;
    await db.$executeRaw`INSERT INTO "pos_supplier_payables" ("id","storeId","goodsPurchaseId","giroHistoryVerifiedAt","supplierName","amount","debtDate","createdById") VALUES ('mixed-debt','store-1','mixed-purchase',now(),'Pemasok',10000.00,'2026-10-10'::date,'user-1')`;
    await db.$executeRaw`INSERT INTO "pos_shopping_request_corrections" ("id","storeId","shoppingRequestId","afterSnapshot") VALUES ('mixed-correction','store-1','mixed-shopping','{"paymentSnapshot":{"sources":[]}}'::jsonb)`;
    await db.$executeRaw`INSERT INTO "pos_shopping_request_correction_allocations" VALUES ('mixed-correction','TRANSFER_EXPENSE','mixed-expense','GIRO',1000.00,'2026-10-10'::date), ('mixed-correction','TRANSFER_EXPENSE','mixed-expense','TRANSFER',2000.00,'2026-10-10'::date)`;
    runtime.correction.mockResolvedValue({ paid: '3000.00', byMethod: { TRANSFER: '2000.00', GIRO: '1000.00' } });
    const items = (await (await getGiro(new Request('http://localhost/api'))).json()).items;
    const snapshot = items.find((item: { payableId: string }) => item.payableId === 'mixed-debt');
    expect(snapshot).toMatchObject({ amount: 7000, paid: 1000, remaining: 6000, ledgerVersion: '0' });
    const body = { amount: '6000.00', paidAt: '2026-10-11', expectedBalance: '6000.00', expectedLedgerVersion: snapshot.ledgerVersion };
    expect((await pay(request(body, randomUUID()), { params: Promise.resolve({ id: 'mixed-debt' }) })).status).toBe(201);
  });

  it('resolves a registered manual attempt after its debt becomes giro, and rejects a late payment', async () => {
    await db.$executeRaw`INSERT INTO "pos_goods_purchases" VALUES ('convert-purchase','store-1','PB-CONVERT','Pemasok',1000.50,'convert-shopping','2026-12-01'::date,'APPROVED',NULL,'GIRO')`;
    await db.$executeRaw`INSERT INTO "pos_supplier_payables" ("id","storeId","supplierName","amount","debtDate","createdById") VALUES ('convert-debt','store-1','Pemasok',1000.50,'2026-10-10'::date,'user-1')`;
    const key = randomUUID();
    const body = { amount: '300.25', paidAt: '2026-10-11', expectedBalance: '1000.50', expectedLedgerVersion: '0', resource: 'MANUAL' };
    const context = { params: Promise.resolve({ id: 'convert-debt' }) };
    const call = (mode: string) => pay(new Request(`http://localhost/api?${mode}=1`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key, 'X-Payment-User': 'user-1', 'X-Payment-Store': 'store-1' }, body: JSON.stringify(body) }), context);
    expect((await call('reserve')).status).toBe(200);
    expect((await call('reserve')).status).toBe(200);
    await db.$executeRaw`UPDATE "pos_supplier_payables" SET "goodsPurchaseId" = 'convert-purchase', "giroHistoryVerifiedAt" = now() WHERE "id" = 'convert-debt'`;
    runtime.userId = 'user-2';
    try { expect((await call('resolve')).status).toBe(403); } finally { runtime.userId = 'user-1'; }
    const resolved = await call('resolve');
    expect(resolved.status).toBe(409); expect((await resolved.json()).code).toBe('BalanceChanged');
    expect((await call('late')).status).toBe(409);
    const [count] = await db.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*) AS count FROM "pos_supplier_payable_payments" WHERE "payableId" = 'convert-debt'`;
    expect(Number(count.count)).toBe(0);
  });

  it('does not expose or replay another user’s saved request when resolving a key', async () => {
    await db.$executeRaw`INSERT INTO "pos_supplier_payables" ("id","storeId","supplierName","amount","debtDate","createdById") VALUES ('owner-debt','store-1','Pemasok',1000.50,'2026-10-10'::date,'user-1')`;
    const key = randomUUID();
    const body = { amount: '300.25', paidAt: '2026-10-11', expectedBalance: '1000.50', expectedLedgerVersion: '0', resource: 'MANUAL' };
    const context = { params: Promise.resolve({ id: 'owner-debt' }) };
    const call = (mode: string) => pay(new Request(`http://localhost/api?${mode}=1`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key, 'X-Payment-User': 'user-1', 'X-Payment-Store': 'store-1' }, body: JSON.stringify(body) }), context);
    expect((await call('reserve')).status).toBe(200);
    expect((await call('save')).status).toBe(201);
    runtime.userId = 'user-2';
    try {
      const response = await call('resolve');
      expect(response.status).toBe(403);
      expect((await call('save')).status).toBe(403);
    } finally { runtime.userId = 'user-1'; }
  });

  it('binds a reserved key to its exact user and payment payload on submit', async () => {
    await db.$executeRaw`INSERT INTO "pos_supplier_payables" ("id","storeId","supplierName","amount","debtDate","createdById") VALUES ('reserved-debt','store-1','Pemasok',1000.50,'2026-10-10'::date,'user-1')`;
    const key = randomUUID();
    const body = { amount: '300.25', paidAt: '2026-10-11', expectedBalance: '1000.50', expectedLedgerVersion: '0', resource: 'MANUAL' };
    const context = { params: Promise.resolve({ id: 'reserved-debt' }) };
    const call = (mode: string, payload = body) => pay(new Request(`http://localhost/api?${mode}=1`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key, 'X-Payment-User': 'user-1', 'X-Payment-Store': 'store-1' }, body: JSON.stringify(payload) }), context);
    expect((await call('reserve')).status).toBe(200);
    expect((await call('save', { ...body, amount: '900.00' })).status).toBe(409);
    const noResource = { ...body, amount: '900.00' } as Record<string, unknown>; delete noResource.resource;
    expect((await pay(request(noResource, key), context)).status).toBe(409);
    runtime.userId = 'user-2';
    try { expect((await call('save')).status).toBe(403); } finally { runtime.userId = 'user-1'; }
    expect((await call('save')).status).toBe(201);
    expect((await call('resolve')).status).toBe(201);
    expect((await call('save', { ...body, resource: 'GIRO' })).status).toBe(409);
  });

  it('serializes a reservation and legacy submit using the same key across payables', async () => {
    await db.$executeRaw`INSERT INTO "pos_supplier_payables" ("id","storeId","supplierName","amount","debtDate","createdById") VALUES ('scope-a','store-1','Pemasok',1000.50,'2026-10-10'::date,'user-1'), ('scope-b','store-1','Pemasok',1000.50,'2026-10-10'::date,'user-1')`;
    const key = randomUUID();
    const body = { amount: '300.25', paidAt: '2026-10-11', expectedBalance: '1000.50', expectedLedgerVersion: '0', resource: 'MANUAL' };
    const reserve = pay(new Request('http://localhost/api?reserve=1', { method:'POST', headers:{ 'Content-Type':'application/json', 'Idempotency-Key':key, 'X-Payment-User':'user-1', 'X-Payment-Store':'store-1' }, body:JSON.stringify(body) }), { params:Promise.resolve({ id:'scope-a' }) });
    const legacy = pay(request({ ...body, resource: undefined, amount: '900.00' }, key), { params:Promise.resolve({ id:'scope-b' }) });
    const responses = await Promise.all([reserve, legacy]);
    const statuses = responses.map(response => response.status);
    expect([[200, 409], [409, 201]]).toContainEqual(statuses);
  });

  it('holds the purchase write lock before authorization when correction may update its snapshot', async () => {
    await db.$executeRaw`INSERT INTO "pos_goods_purchases" VALUES ('lock-purchase','store-1','PB-LOCK','Pemasok',1000.50,'lock-shopping','2026-12-01'::date,'APPROVED',NULL,'GIRO')`;
    await db.$executeRaw`INSERT INTO "pos_supplier_payables" ("id","storeId","goodsPurchaseId","giroHistoryVerifiedAt","supplierName","amount","debtDate","createdById") VALUES ('lock-debt','store-1','lock-purchase',now(),'Pemasok',1000.50,'2026-10-10'::date,'user-1')`;
    let entered!: () => void, release!: () => void;
    const atAuthorization = new Promise<void>(resolve => { entered = resolve; });
    const proceed = new Promise<void>(resolve => { release = resolve; });
    runtime.authorize.mockImplementationOnce(async () => { entered(); await proceed; return true; });
    const pending = pay(request({ amount:'300.25', paidAt:'2026-10-11', expectedBalance:'1000.50', expectedLedgerVersion:'0' }, randomUUID()), { params:Promise.resolve({ id:'lock-debt' }) });
    await atAuthorization;
    const blocker = new PrismaClient({ datasourceUrl: new URL(`?schema=${schema}`, connection!).toString() });
    try {
      const locked = await blocker.$transaction(async tx => {
        await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '200ms'");
        await tx.$executeRaw`LOCK TABLE "pos_goods_purchases" IN SHARE MODE`;
      }).then(() => false, () => true);
      expect(locked).toBe(true);
    } finally { release(); await pending; await blocker.$disconnect(); }
  });

  it('prevents a purchase-table, permission-writer and corrected-payment lock cycle', async () => {
    await db.$executeRaw`INSERT INTO "pos_goods_purchases" VALUES ('three-purchase','store-1','PB-THREE','Pemasok',1000.50,'three-shopping','2026-12-01'::date,'APPROVED',NULL,'GIRO')`;
    await db.$executeRaw`INSERT INTO "pos_supplier_payables" ("id","storeId","goodsPurchaseId","giroHistoryVerifiedAt","supplierName","amount","debtDate","createdById") VALUES ('three-debt','store-1','three-purchase',now(),'Pemasok',1000.50,'2026-10-10'::date,'user-1')`;
    await db.$executeRaw`INSERT INTO "pos_shopping_request_corrections" ("id","storeId","shoppingRequestId") VALUES ('three-correction','store-1','three-shopping')`;
    let release!: () => void, entered!: () => void;
    const hold = new Promise<void>(resolve => { release = resolve; });
    const atAuth = new Promise<void>(resolve => { entered = resolve; });
    runtime.dbAuthorize = true;
    runtime.holdAuthorize = async () => { entered(); await hold; };
    runtime.correction.mockImplementationOnce(async (tx: PrismaClient) => { await tx.$executeRaw`UPDATE "pos_goods_purchases" SET "totalAmount" = "totalAmount" WHERE "id" = 'three-purchase'`; return { byMethod:{ GIRO:'0.00' } }; });
    const payment = pay(request({ amount:'300.25', paidAt:'2026-10-11', expectedBalance:'1000.50', expectedLedgerVersion:'0' }, randomUUID()), { params:Promise.resolve({ id:'three-debt' }) });
    await atAuth;
    let linkerReady!: () => void;
    const ready = new Promise<void>(resolve => { linkerReady = resolve; });
    const linker = db.$transaction(async tx => { linkerReady(); await tx.$executeRaw`LOCK TABLE "pos_goods_purchases" IN SHARE MODE`; await tx.$executeRaw`LOCK TABLE "test_role_permissions" IN SHARE MODE`; }, { timeout: 5000 });
    await ready;
    const writer = db.$transaction(async tx => { await tx.$executeRaw`UPDATE "test_role_permissions" SET "allowed" = false WHERE "id" = 'permission'`; }, { timeout: 5000 });
    try {
      const beforeRelease = await Promise.race([linker.then(() => true), new Promise<boolean>(resolve => setTimeout(() => resolve(false), 150))]);
      expect(beforeRelease).toBe(false);
    } finally { runtime.holdAuthorize = null; release(); }
    const statuses = await Promise.all([payment, linker, writer]);
    expect(statuses[0].status).toBe(201);
    runtime.dbAuthorize = false;
  }, 15_000);

  it('resolves an unsaved manual attempt after its payable has been merged into giro', async () => {
    await db.$executeRaw`INSERT INTO "pos_supplier_payables" ("id","storeId","supplierName","amount","debtDate","createdById") VALUES ('merge-manual','store-1','Pemasok',1000.50,'2026-10-10'::date,'user-1'), ('merge-giro','store-1','Pemasok',1000.50,'2026-10-10'::date,'user-1')`;
    const key = randomUUID();
    const body = { amount:'300.25', paidAt:'2026-10-11', expectedBalance:'1000.50', expectedLedgerVersion:'0', resource:'MANUAL' };
    const context = { params:Promise.resolve({ id:'merge-manual' }) };
    const call = (mode: string) => pay(new Request(`http://localhost/api?${mode}=1`, { method:'POST', headers:{ 'Content-Type':'application/json', 'Idempotency-Key':key, 'X-Payment-User':'user-1', 'X-Payment-Store':'store-1' }, body:JSON.stringify(body) }), context);
    expect((await call('reserve')).status).toBe(200);
    await db.$executeRaw`INSERT INTO "pos_supplier_payable_manual_links" VALUES ('merge-manual','merge-giro','store-1')`;
    await db.$executeRaw`DELETE FROM "pos_supplier_payables" WHERE "id" = 'merge-manual'`;
    const response = await call('resolve');
    expect(response.status).toBe(409); expect((await response.json()).code).toBe('BalanceChanged');
  });

  it('never reports a delayed reservation as safely absent after an unregistered payment was committed', async () => {
    await db.$executeRaw`INSERT INTO "pos_supplier_payables" ("id","storeId","supplierName","amount","debtDate","createdById") VALUES ('late-reserve','store-1','Pemasok',1000.50,'2026-10-10'::date,'user-1')`;
    const key = randomUUID();
    const base = { amount:'300.25', paidAt:'2026-10-11', expectedBalance:'1000.50', expectedLedgerVersion:'0' };
    const context = { params:Promise.resolve({ id:'late-reserve' }) };
    expect((await pay(request(base, key), context)).status).toBe(201);
    await db.$executeRaw`UPDATE "pos_supplier_payables" SET "amount" = 1300.75 WHERE "id" = 'late-reserve'`;
    const changed = { ...base, amount:'400.00', resource:'MANUAL' };
    const reserve = await pay(new Request('http://localhost/api?reserve=1', { method:'POST', headers:{ 'Content-Type':'application/json', 'Idempotency-Key':key, 'X-Payment-User':'user-1', 'X-Payment-Store':'store-1' }, body:JSON.stringify(changed) }), context);
    expect(reserve.status).toBe(409);
    expect((await reserve.json()).code).toBe('Conflict');
  });

  it('permanently cancels an unregistered stale form before a delayed payment can arrive', async () => {
    await db.$executeRaw`INSERT INTO "pos_supplier_payables" ("id","storeId","supplierName","amount","debtDate","createdById") VALUES ('cancel-debt','store-1','Pemasok',1000.50,'2026-10-10'::date,'user-1')`;
    const body = { amount:'300.25', paidAt:'2026-10-11', expectedBalance:'1000.50', expectedLedgerVersion:'0', resource:'MANUAL' };
    const key = randomUUID();
    const context = { params:Promise.resolve({ id:'cancel-debt' }) };
    await db.$executeRaw`UPDATE "pos_supplier_payables" SET "amount" = 1300.75 WHERE "id" = 'cancel-debt'`;
    const reserve = await pay(new Request('http://localhost/api?reserve=1', { method:'POST', headers:{ 'Content-Type':'application/json', 'Idempotency-Key':key, 'X-Payment-User':'user-1', 'X-Payment-Store':'store-1' }, body:JSON.stringify(body) }), context);
    expect(reserve.status).toBe(409); expect((await reserve.json()).code).toBe('BalanceChanged');
    expect((await pay(request({ ...body, resource:undefined }, key), context)).status).toBe(409);
    await expect(db.$executeRaw`INSERT INTO "pos_supplier_payable_payments" ("id","payableId","amount","paidAt","createdById","requestScope","requestLedgerVersion") VALUES ('bypass-cancel','cancel-debt',300.25,'2026-10-11'::date,'user-1',${JSON.stringify(['store-1', key])},'0')`).rejects.toThrow();
    const [count] = await db.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*) AS count FROM "pos_supplier_payable_payments" WHERE "payableId" = 'cancel-debt'`;
    expect(Number(count.count)).toBe(0);
  });

  it('cancels a rejected reservation before clearing it and blocks a delayed payment', async () => {
    await db.$executeRaw`INSERT INTO "pos_supplier_payables" ("id","storeId","supplierName","amount","debtDate","createdById") VALUES ('invalid-reserve','store-1','Pemasok',1000.50,'2026-10-10'::date,'user-1')`;
    const key = randomUUID();
    const body = { amount: '1500.00', paidAt: '2026-10-11', expectedBalance: '1000.50', expectedLedgerVersion: '0', resource: 'MANUAL' as const };
    const scope = { storeId: 'store-1', userId: 'user-1', payableId: 'invalid-reserve' };
    const context = { params: Promise.resolve({ id: scope.payableId }) };
    const data = new Map<string, string>();
    const storage = { getItem: (name: string) => data.get(name) ?? null, setItem: (name: string, value: string) => { data.set(name, value); }, removeItem: (name: string) => { data.delete(name); } };
    const fetcher: typeof fetch = (input, init) => pay(new Request(new URL(String(input), 'http://localhost'), init), context);
    await expect(postGiroPayment(storage, scope, body, fetcher, () => key, async (_name, work) => work())).rejects.toThrow('Tanggal pembayaran atau nominal melebihi sisa hutang.');
    expect(readPendingGiroPayment(storage, scope)).toBeNull();
    const delayed = await fetcher('/api/finance/supplier-payables/invalid-reserve/payments?reserve=1', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key, 'X-Payment-User': 'user-1', 'X-Payment-Store': 'store-1' }, body: JSON.stringify(body) });
    expect(delayed.status).toBe(409);
    expect((await delayed.json()).code).toBe('BalanceChanged');
    await expect(db.$executeRaw`INSERT INTO "pos_supplier_payable_payments" ("id","payableId","amount","paidAt","createdById","requestScope","requestLedgerVersion") VALUES ('invalid-delayed','invalid-reserve',1500.00,'2026-10-11'::date,'user-1',${JSON.stringify(['store-1', key])},'0')`).rejects.toThrow();
  });

  it.each(['stale', 'unlockable'])('permanently cancels a reserved %s request before reporting it was not saved', async kind => {
    const id = `resolved-${kind}`;
    const purchaseId = `resolved-purchase-${kind}`;
    if (kind === 'unlockable') {
      await db.$executeRaw`INSERT INTO "pos_goods_purchases" VALUES (${purchaseId},'store-1','PB-RESOLVE','Pemasok',1000.50,'resolve-shopping','2026-12-01'::date,'APPROVED',NULL,'GIRO')`;
    }
    await db.$executeRaw`INSERT INTO "pos_supplier_payables" ("id","storeId","goodsPurchaseId","giroHistoryVerifiedAt","supplierName","amount","debtDate","createdById") VALUES (${id},'store-1',${kind === 'unlockable' ? purchaseId : null},${kind === 'unlockable' ? new Date() : null},'Pemasok',1000.50,'2026-10-10'::date,'user-1')`;
    const key = randomUUID();
    const body = { amount: '300.25', paidAt: '2026-10-11', expectedBalance: '1000.50', expectedLedgerVersion: '0', resource: kind === 'unlockable' ? 'GIRO' : 'MANUAL' };
    const context = { params: Promise.resolve({ id }) };
    const call = (mode: string) => pay(new Request(`http://localhost/api?${mode}=1`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key, 'X-Payment-User': 'user-1', 'X-Payment-Store': 'store-1' }, body: JSON.stringify(body) }), context);
    expect((await call('reserve')).status).toBe(200);
    if (kind === 'stale') await db.$executeRaw`UPDATE "pos_supplier_payables" SET "amount" = 1300.75 WHERE "id" = ${id}`;
    else await db.$executeRaw`UPDATE "pos_goods_purchases" SET "storeId" = 'store-2' WHERE "id" = ${purchaseId}`;
    const resolved = await call('resolve');
    expect(resolved.status).toBe(409);
    expect((await resolved.json()).code).toBe('BalanceChanged');
    const scope = JSON.stringify(['store-1', key]);
    await expect(db.$executeRaw`INSERT INTO "pos_supplier_payable_payments" ("id","payableId","amount","paidAt","createdById","requestScope","requestLedgerVersion") VALUES (${`delayed-${kind}`},${id},300.25,'2026-10-11'::date,'user-1',${scope},'0')`).rejects.toThrow();
    const [count] = await db.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*) AS count FROM "pos_supplier_payable_payments" WHERE "payableId" = ${id}`;
    expect(Number(count.count)).toBe(0);
  });

  it.each(['balance', 'giro'])('persists cancellation when a new reservation is rejected because %s changed', async kind => {
    const id = `first-reject-${kind}`;
    const purchaseId = `first-reject-purchase-${kind}`;
    if (kind === 'giro') {
      await db.$executeRaw`INSERT INTO "pos_goods_purchases" VALUES (${purchaseId},'store-1','PB-REJECT','Pemasok',1000.50,'reject-shopping','2026-12-01'::date,'APPROVED',NULL,'TRANSFER')`;
      await db.$executeRaw`INSERT INTO "pos_shopping_request_corrections" ("id","storeId","shoppingRequestId") VALUES ('reject-correction','store-1','reject-shopping')`;
    }
    await db.$executeRaw`INSERT INTO "pos_supplier_payables" ("id","storeId","goodsPurchaseId","giroHistoryVerifiedAt","supplierName","amount","debtDate","createdById") VALUES (${id},'store-1',${kind === 'giro' ? purchaseId : null},${kind === 'giro' ? new Date() : null},'Pemasok',1000.50,'2026-10-10'::date,'user-1')`;
    const key = randomUUID();
    const body = { amount: '300.25', paidAt: '2026-10-11', expectedBalance: kind === 'balance' ? '900.50' : '1000.50', expectedLedgerVersion: '0', resource: kind === 'giro' ? 'GIRO' : 'MANUAL' };
    const response = await pay(new Request('http://localhost/api?reserve=1', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key, 'X-Payment-User': 'user-1', 'X-Payment-Store': 'store-1' }, body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe('BalanceChanged');
    await expect(db.$executeRaw`INSERT INTO "pos_supplier_payable_payments" ("id","payableId","amount","paidAt","createdById","requestScope","requestLedgerVersion") VALUES (${`first-delayed-${kind}`},${id},300.25,'2026-10-11'::date,'user-1',${JSON.stringify(['store-1', key])},'0')`).rejects.toThrow();
  });

  it('refuses to resolve another store when the session changes between requests', async () => {
    await db.$executeRaw`INSERT INTO "pos_supplier_payables" ("id","storeId","supplierName","amount","debtDate","createdById") VALUES ('identity-debt','store-1','Pemasok',1000.50,'2026-10-10'::date,'user-1')`;
    const key = randomUUID();
    const body = { amount: '300.25', paidAt: '2026-10-11', expectedBalance: '1000.50', expectedLedgerVersion: '0', resource: 'MANUAL' };
    const context = { params: Promise.resolve({ id: 'identity-debt' }) };
    const call = (mode: string) => pay(new Request(`http://localhost/api?${mode}=1`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key, 'X-Payment-User': 'user-1', 'X-Payment-Store': 'store-1' }, body: JSON.stringify(body) }), context);
    expect((await call('reserve')).status).toBe(200);
    runtime.userId = 'user-2'; runtime.storeId = 'store-2';
    try { expect((await call('resolve')).status).toBe(403); }
    finally { runtime.userId = 'user-1'; runtime.storeId = 'store-1'; }
    const rows = await db.$queryRaw<{ storeId: string; cancelled: boolean }[]>`SELECT "storeId", "cancelled" FROM "pos_payable_payment_attempts" WHERE "payableId" = 'identity-debt'`;
    expect(rows).toEqual([{ storeId: 'store-1', cancelled: false }]);
    expect((await call('save')).status).toBe(201);
  });

  it('checks an unscoped legacy request without creating an attempt or payment', async () => {
    await db.$executeRaw`INSERT INTO "pos_supplier_payables" ("id","storeId","supplierName","amount","debtDate","createdById") VALUES ('replay-only','store-1','Pemasok',1000.50,'2026-10-10'::date,'user-1')`;
    const key = randomUUID();
    const body = { amount: '300.25', paidAt: '2026-10-11', expectedBalance: '1000.50', expectedLedgerVersion: '0', resource: 'MANUAL' };
    const response = await pay(new Request('http://localhost/api?replay=1', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key, 'X-Payment-User': 'user-1', 'X-Payment-Store': 'store-1' }, body: JSON.stringify(body) }), { params: Promise.resolve({ id: 'replay-only' }) });
    expect(response.status).toBe(404);
    const [counts] = await db.$queryRaw<{ attempts: bigint; payments: bigint }[]>`SELECT (SELECT COUNT(*) FROM "pos_payable_payment_attempts" WHERE "scope" = ${JSON.stringify(['store-1', key])}) AS attempts, (SELECT COUNT(*) FROM "pos_supplier_payable_payments" WHERE "payableId" = 'replay-only') AS payments`;
    expect(counts).toEqual({ attempts: 0n, payments: 0n });
  });

  it('safely cancels a lost reservation when the debt changes type before registration', async () => {
    await db.$executeRaw`INSERT INTO "pos_goods_purchases" VALUES ('lost-purchase','store-1','PB-LOST','Pemasok',1000.50,'lost-shopping','2026-12-01'::date,'APPROVED',NULL,'GIRO')`;
    await db.$executeRaw`INSERT INTO "pos_supplier_payables" ("id","storeId","goodsPurchaseId","giroHistoryVerifiedAt","supplierName","amount","debtDate","createdById") VALUES ('lost-debt','store-1','lost-purchase',now(),'Pemasok',1000.50,'2026-10-10'::date,'user-1')`;
    const body = { amount:'300.25', paidAt:'2026-10-11', expectedBalance:'1000.50', expectedLedgerVersion:'0', resource:'MANUAL' };
    const key = randomUUID();
    const context = { params:Promise.resolve({ id:'lost-debt' }) };
    const response = await pay(new Request('http://localhost/api?resolve=1', { method:'POST', headers:{ 'Content-Type':'application/json', 'Idempotency-Key':key, 'X-Payment-User':'user-1', 'X-Payment-Store':'store-1' }, body:JSON.stringify(body) }), context);
    expect(response.status).toBe(409); expect((await response.json()).code).toBe('BalanceChanged');
    await expect(db.$executeRaw`INSERT INTO "pos_supplier_payable_payments" ("id","payableId","amount","paidAt","createdById","requestScope","requestLedgerVersion") VALUES ('lost-late','lost-debt',300.25,'2026-10-11'::date,'user-1',${JSON.stringify(['store-1', key])},'0')`).rejects.toThrow();
  });

  it('does not discard a saved payment when its payable cannot currently be locked', async () => {
    await db.$executeRaw`INSERT INTO "pos_goods_purchases" VALUES ('cancelled-purchase','store-1','PB-CANCEL','Pemasok',1000.50,'cancelled-shopping','2026-12-01'::date,'APPROVED',NULL,'GIRO')`;
    await db.$executeRaw`INSERT INTO "pos_supplier_payables" ("id","storeId","goodsPurchaseId","giroHistoryVerifiedAt","supplierName","amount","debtDate","createdById") VALUES ('cancelled-debt','store-1','cancelled-purchase',now(),'Pemasok',1000.50,'2026-10-10'::date,'user-1')`;
    const key = randomUUID();
    const body = { amount:'300.25', paidAt:'2026-10-11', expectedBalance:'1000.50', expectedLedgerVersion:'0', resource:'GIRO' };
    const context = { params:Promise.resolve({ id:'cancelled-debt' }) };
    const call = (mode:string) => pay(new Request(`http://localhost/api?${mode}=1`, { method:'POST', headers:{ 'Content-Type':'application/json', 'Idempotency-Key':key, 'X-Payment-User':'user-1', 'X-Payment-Store':'store-1' }, body:JSON.stringify(body) }), context);
    expect((await call('reserve')).status).toBe(200);
    expect((await call('save')).status).toBe(201);
    await db.$executeRaw`UPDATE "pos_goods_purchases" SET "storeId" = 'store-2' WHERE "id" = 'cancelled-purchase'`;
    const response = await call('resolve');
    expect(response.status).toBe(201);
  });
});
