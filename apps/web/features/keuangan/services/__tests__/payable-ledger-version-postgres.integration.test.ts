import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@pos/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const connection = process.env.GIRO_TEST_DATABASE_URL;
const schema = `ledger_version_${randomUUID().replaceAll('-', '')}`;
const migrationPath = path.resolve(process.cwd(), '../../packages/db/prisma/migrations/20261117050000_payable_ledger_version/migration.sql');

describe.skipIf(!connection)('versi ledger pada PostgreSQL terisolasi', () => {
  let admin: PrismaClient;
  let db: PrismaClient;
  beforeAll(async () => {
    const url = new URL(connection!);
    if (url.hostname !== '127.0.0.1' || !['55443', '15443'].includes(url.port) || url.pathname !== '/postgres' || url.searchParams.has('schema')) throw new Error('Database uji terisolasi diperlukan.');
    admin = new PrismaClient({ datasourceUrl: connection });
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    url.searchParams.set('schema', schema);
    db = new PrismaClient({ datasourceUrl: url.toString() });
    await db.$executeRawUnsafe('CREATE TABLE "pos_supplier_payables" ("id" TEXT PRIMARY KEY, "storeId" TEXT NOT NULL, "amount" NUMERIC(12,2) NOT NULL)');
    await db.$executeRawUnsafe('CREATE TABLE "pos_supplier_payable_payments" ("id" TEXT PRIMARY KEY, "payableId" TEXT NOT NULL REFERENCES "pos_supplier_payables"("id"), "amount" NUMERIC(12,2) NOT NULL, "paidAt" DATE NOT NULL, "requestScope" TEXT, "createdById" TEXT)');
    await db.$executeRawUnsafe('CREATE TABLE "pos_manual_transfer_allocations" ("id" TEXT PRIMARY KEY, "payableId" TEXT NOT NULL REFERENCES "pos_supplier_payables"("id"), "amount" NUMERIC(12,2) NOT NULL)');
    await db.$executeRawUnsafe(`INSERT INTO "pos_supplier_payables" VALUES ('manual', 'store-1', 1000.00), ('giro', 'store-1', 1000.00), ('other', 'store-2', 1000.00)`);
    if (existsSync(migrationPath)) {
      for (const statement of readFileSync(migrationPath, 'utf8').split('-- statement-break').map(value => value.trim()).filter(Boolean)) await db.$executeRawUnsafe(statement);
    } else {
      // Baseline only: the failing test exercises the absence of version maintenance.
      await db.$executeRawUnsafe('ALTER TABLE "pos_supplier_payables" ADD COLUMN "ledgerVersion" BIGINT NOT NULL DEFAULT 0');
      await db.$executeRawUnsafe('ALTER TABLE "pos_supplier_payable_payments" ADD COLUMN "requestLedgerVersion" TEXT');
    }
  }, 30_000);
  afterAll(async () => {
    await db?.$disconnect();
    if (admin) await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin?.$disconnect();
  });
  const versions = async () => Object.fromEntries((await db.$queryRaw<{ id: string; version: string }[]>`SELECT "id", "ledgerVersion"::text AS version FROM "pos_supplier_payables" ORDER BY "id"`).map(row => [row.id, row.version]));

  it('increments after payments and corrections even if the balance returns to its old value', async () => {
    expect(await versions()).toEqual({ giro: '0', manual: '0', other: '0' });
    await db.$transaction(async tx => { await tx.$executeRaw`SELECT set_config('pos.payable_system_payment', '1', true)`; await tx.$executeRaw`INSERT INTO "pos_supplier_payable_payments" ("id", "payableId", "amount", "paidAt") VALUES ('p1', 'manual', 300.00, '2026-10-10'::date)`; });
    const afterPayment = await versions();
    expect(afterPayment.manual).not.toBe('0');
    await db.$executeRaw`UPDATE "pos_supplier_payables" SET "amount" = 1300.00 WHERE "id" = 'manual'`;
    const afterCorrection = await versions();
    expect(afterCorrection.manual).not.toBe(afterPayment.manual);
    expect(afterCorrection.other).toBe('0');
    const [snapshot] = await db.$queryRaw<{ remaining: string }[]>`SELECT (d."amount" - SUM(p."amount"))::text AS remaining FROM "pos_supplier_payables" d JOIN "pos_supplier_payable_payments" p ON p."payableId" = d."id" WHERE d."id" = 'manual' GROUP BY d."id"`;
    expect(snapshot.remaining).toBe('1000.00');
  });

  it('tracks automatic payment changes, transfer links, moves, and transaction rollback', async () => {
    const first = await versions();
    await db.$executeRaw`UPDATE "pos_supplier_payable_payments" SET "payableId" = 'giro' WHERE "id" = 'p1'`;
    const moved = await versions();
    expect(moved.manual).not.toBe(first.manual);
    expect(moved.giro).not.toBe(first.giro);
    await db.$transaction(async tx => { await tx.$executeRaw`SELECT set_config('pos.payable_system_payment', '1', true)`; await tx.$executeRaw`INSERT INTO "pos_supplier_payable_payments" ("id", "payableId", "amount", "paidAt") VALUES ('auto', 'manual', 700.50, '2026-10-11'::date)`; });
    await db.$executeRaw`UPDATE "pos_supplier_payable_payments" SET "amount" = 600.25 WHERE "id" = 'auto'`;
    await db.$executeRaw`DELETE FROM "pos_supplier_payable_payments" WHERE "id" = 'auto'`;
    const reconciled = await versions();
    expect(BigInt(reconciled.manual) - BigInt(moved.manual)).toBe(3n);
    await db.$executeRaw`INSERT INTO "pos_manual_transfer_allocations" VALUES ('a1', 'giro', 300.00)`;
    const linked = await versions();
    expect(linked.giro).not.toBe(reconciled.giro);
    await db.$executeRaw`DELETE FROM "pos_manual_transfer_allocations" WHERE "id" = 'a1'`;
    const unlinked = await versions();
    expect(unlinked.giro).not.toBe(linked.giro);
    await expect(db.$transaction(async tx => { await tx.$executeRaw`UPDATE "pos_supplier_payables" SET "amount" = 500 WHERE "id" = 'giro'`; throw new Error('rollback'); })).rejects.toThrow('rollback');
    expect(await versions()).toEqual(unlinked);
    expect(unlinked.other).toBe('0');
  });

  it('rejects an unkeyed manual payment from an old server during deployment', async () => {
    const before = await versions();
    await expect(db.$executeRaw`INSERT INTO "pos_supplier_payable_payments" ("id", "payableId", "amount", "paidAt") VALUES ('old-manual', 'manual', 10.00, '2026-10-11'::date)`).rejects.toThrow();
    expect(await versions()).toEqual(before);
  });

  it('rejects new keyed payments from an old server without a version during deployment', async () => {
    const before = await versions();
    await expect(db.$executeRaw`INSERT INTO "pos_supplier_payable_payments" ("id", "payableId", "amount", "paidAt", "requestScope") VALUES ('old-server', 'manual', 10.00, '2026-10-11'::date, 'store-1:old-server')`).rejects.toThrow();
    expect(await versions()).toEqual(before);
    const [count] = await db.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*) AS count FROM "pos_supplier_payable_payments" WHERE "id" = 'old-server'`;
    expect(Number(count.count)).toBe(0);
  });

  it('permits internal unkeyed events only inside the marked transaction', async () => {
    await db.$transaction(async tx => {
      await tx.$executeRaw`SELECT set_config('pos.payable_system_payment', '1', true)`;
      await tx.$executeRaw`INSERT INTO "pos_supplier_payable_payments" ("id", "payableId", "amount", "paidAt") VALUES ('system-event', 'manual', 1.00, '2026-10-11'::date)`;
    });
    await expect(db.$executeRaw`INSERT INTO "pos_supplier_payable_payments" ("id", "payableId", "amount", "paidAt") VALUES ('unmarked-after-commit', 'manual', 1.00, '2026-10-11'::date)`).rejects.toThrow();
  });

  it('serializes an old writer with cancellation of the same idempotency scope', async () => {
    const scope = JSON.stringify(['store-1', randomUUID()]);
    let release!: () => void, acquired!: () => void;
    const hold = new Promise<void>(resolve => { release = resolve; });
    const locked = new Promise<void>(resolve => { acquired = resolve; });
    const cancel = db.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${scope}, 0))::text`;
      await tx.$executeRaw`INSERT INTO "pos_payable_payment_attempts" ("scope","storeId","userId","payableId","resource","version","fingerprint","cancelled") VALUES (${scope},'store-1','user','manual','MANUAL','0','test',true)`;
      acquired(); await hold;
    });
    await locked;
    const writer = db.$executeRaw`INSERT INTO "pos_supplier_payable_payments" ("id","payableId","amount","paidAt","createdById","requestScope","requestLedgerVersion") VALUES ('old-writer','manual',1.00,'2026-10-11'::date,'user',${scope},'0')`;
    try { expect(await Promise.race([writer.then(() => true, () => true), new Promise<boolean>(resolve => setTimeout(() => resolve(false), 150))])).toBe(false); }
    finally { release(); await cancel; }
    await expect(writer).rejects.toThrow();
  });

  it('rolls back one contender rather than committing when an old writer holds the debt before scope lock', async () => {
    const scope = JSON.stringify(['store-1', randomUUID()]);
    let oldLocked!: () => void, allowOld!: () => void, cancelLocked!: () => void;
    const hasDebt = new Promise<void>(resolve => { oldLocked = resolve; });
    const proceed = new Promise<void>(resolve => { allowOld = resolve; });
    const hasScope = new Promise<void>(resolve => { cancelLocked = resolve; });
    const writer = db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "pos_supplier_payables" WHERE "id" = 'manual' FOR UPDATE`;
      oldLocked(); await proceed;
      await tx.$executeRaw`INSERT INTO "pos_supplier_payable_payments" ("id","payableId","amount","paidAt","createdById","requestScope","requestLedgerVersion") VALUES ('deadlock-writer','manual',1.00,'2026-10-11'::date,'user',${scope},'0')`;
    }).then(() => 'committed', () => 'aborted');
    await hasDebt;
    const cancel = db.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${scope}, 0))::text`;
      cancelLocked();
      await tx.$queryRaw`SELECT "id" FROM "pos_supplier_payables" WHERE "id" = 'manual' FOR UPDATE`;
      await tx.$executeRaw`INSERT INTO "pos_payable_payment_attempts" ("scope","storeId","userId","payableId","resource","version","fingerprint","cancelled") VALUES (${scope},'store-1','user','manual','MANUAL','0','test',true)`;
    }).then(() => 'committed', () => 'aborted');
    await hasScope;
    allowOld();
    const results = await Promise.all([writer, cancel]);
    expect(results.sort()).toEqual(['aborted', 'committed']);
    const [row] = await db.$queryRaw<{ payments: bigint; cancellations: bigint }[]>`SELECT (SELECT COUNT(*) FROM "pos_supplier_payable_payments" WHERE "requestScope" = ${scope}) AS payments, (SELECT COUNT(*) FROM "pos_payable_payment_attempts" WHERE "scope" = ${scope} AND "cancelled") AS cancellations`;
    expect(Number(row.payments) + Number(row.cancellations)).toBe(1);
  }, 15_000);
});
