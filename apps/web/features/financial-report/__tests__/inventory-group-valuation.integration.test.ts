import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { PrismaClient } from '@pos/db';

const connection = process.env.FINANCE_INVENTORY_TEST_DATABASE_URL;
const schema = `inventory_v2_${randomUUID().replaceAll('-', '')}`;
const mocks = vi.hoisted(() => ({ db: null as PrismaClient | null }));
vi.mock('@pos/db', async importOriginal => ({ ...(await importOriginal()), get db() { return mocks.db; } }));
import { getMonthlyBalances } from '../services/monthly-balances';
import { buildMonthlyPeriod } from '../helpers/monthly-report-core';

describe.skipIf(!connection)('group inventory valuation on isolated PostgreSQL', () => {
  let admin: PrismaClient;
  let client: PrismaClient;

  beforeAll(async () => {
    const url = new URL(connection!);
    if (url.hostname !== '127.0.0.1' || url.port !== '55443' || url.pathname !== '/postgres') {
      throw new Error('Inventory valuation tests require the dedicated isolated PostgreSQL instance.');
    }
    admin = new PrismaClient({ datasourceUrl: connection });
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    url.searchParams.set('schema', schema);
    client = new PrismaClient({ datasourceUrl: url.toString() });
    mocks.db = client;
    await client.$executeRawUnsafe('CREATE TABLE "pos_stores" ("id" TEXT PRIMARY KEY)');
    await client.$executeRawUnsafe('CREATE TABLE "pos_product_stock_groups" ("id" TEXT PRIMARY KEY, "storeId" TEXT NOT NULL REFERENCES "pos_stores"("id"), "baseUnit" TEXT NOT NULL, "baseStock" DOUBLE PRECISION NOT NULL)');
    await client.$executeRawUnsafe('CREATE TABLE "pos_products" ("id" TEXT PRIMARY KEY, "storeId" TEXT NOT NULL REFERENCES "pos_stores"("id"), "name" TEXT NOT NULL, "sku" TEXT NOT NULL, "barcode" TEXT, "categoryId" TEXT NOT NULL, "stock" DOUBLE PRECISION NOT NULL, "price" NUMERIC(12,2) NOT NULL, "isActive" BOOLEAN NOT NULL, "stockGroupId" TEXT REFERENCES "pos_product_stock_groups"("id"), "unit" TEXT NOT NULL, "unitMultiplierToBase" DOUBLE PRECISION NOT NULL)');
    await client.$executeRawUnsafe('CREATE TABLE "pos_inventory_valuation_baselines" ("storeId" TEXT PRIMARY KEY, "capturedAt" TIMESTAMPTZ NOT NULL, "value" NUMERIC NOT NULL)');
    await client.$executeRawUnsafe('CREATE TABLE "pos_inventory_valuation_changes" ("id" BIGSERIAL PRIMARY KEY, "storeId" TEXT NOT NULL, "occurredAt" TIMESTAMPTZ NOT NULL, "delta" NUMERIC NOT NULL)');
    await client.$executeRawUnsafe('CREATE TABLE "pos_supplier_payables" ("id" TEXT PRIMARY KEY, "storeId" TEXT NOT NULL, "debtDate" DATE NOT NULL, "dueDate" DATE, "supplierName" TEXT NOT NULL, "note" TEXT, "amount" NUMERIC NOT NULL, "goodsPurchaseId" TEXT, "giroHistoryVerifiedAt" TIMESTAMPTZ)');
    await client.$executeRawUnsafe('CREATE TABLE "pos_supplier_payable_payments" ("payableId" TEXT NOT NULL, "paidAt" DATE NOT NULL, "amount" NUMERIC NOT NULL)');
    await client.$executeRaw`INSERT INTO "pos_stores" VALUES ('s1')`;
    await client.$executeRaw`INSERT INTO "pos_inventory_valuation_baselines" VALUES ('s1','2026-01-01'::timestamptz,555)`;
    await client.$executeRaw`INSERT INTO "pos_inventory_valuation_changes" ("storeId", "occurredAt", "delta") VALUES ('s1','2026-02-01'::timestamptz,123)`;
    await client.$executeRaw`INSERT INTO "pos_product_stock_groups" VALUES ('g1','s1','pcs',24)`;
    await client.$executeRaw`INSERT INTO "pos_products" VALUES
      ('pcs','s1','Kopi pcs','PCS',NULL,'c1',24,3000,true,'g1','pcs',1),
      ('dus','s1','Kopi dus','DUS',NULL,'c1',1,60000,true,'g1','dus',24)`;
    await client.$executeRawUnsafe(`CREATE FUNCTION initialize_inventory_valuation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN INSERT INTO "pos_inventory_valuation_baselines" VALUES (NEW."id", clock_timestamp(), 0); RETURN NEW; END $$`);
    await client.$executeRawUnsafe(`CREATE TRIGGER "pos_stores_inventory_valuation" AFTER INSERT ON "pos_stores" FOR EACH ROW EXECUTE FUNCTION initialize_inventory_valuation()`);
    await client.$executeRawUnsafe(`CREATE FUNCTION record_inventory_valuation_change() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE old_value NUMERIC := 0; new_value NUMERIC := 0;
      BEGIN
        IF TG_OP <> 'INSERT' AND OLD."isActive" THEN old_value := GREATEST(OLD."stock"::numeric, 0) * OLD."price"; END IF;
        IF TG_OP <> 'DELETE' AND NEW."isActive" THEN new_value := GREATEST(NEW."stock"::numeric, 0) * NEW."price"; END IF;
        IF TG_OP <> 'INSERT' AND old_value <> 0 THEN INSERT INTO "pos_inventory_valuation_changes" ("storeId", "occurredAt", "delta") VALUES (OLD."storeId", clock_timestamp(), -old_value); END IF;
        IF TG_OP <> 'DELETE' AND new_value <> 0 THEN INSERT INTO "pos_inventory_valuation_changes" ("storeId", "occurredAt", "delta") VALUES (NEW."storeId", clock_timestamp(), new_value); END IF;
        RETURN NULL;
      END $$`);
    await client.$executeRawUnsafe(`CREATE TRIGGER "pos_products_inventory_valuation" AFTER INSERT OR UPDATE OR DELETE ON "pos_products" FOR EACH ROW EXECUTE FUNCTION record_inventory_valuation_change()`);
    const root = path.resolve(process.cwd(), '../..');
    const prisma = createRequire(path.join(root, 'packages/db/package.json')).resolve('prisma/build/index.js');
    for (const name of ['20261101140000_inventory_group_valuation_v2', '20261101150000_inventory_month_close']) {
      const migration = readFileSync(path.join(root, 'packages/db/prisma/migrations', name, 'migration.sql'), 'utf8');
      const result = spawnSync(process.execPath, [prisma, 'db', 'execute', '--stdin', `--url=${connection}`], {
        input: migration.replace(/^BEGIN;/, `BEGIN; SET LOCAL search_path TO "${schema}";`), encoding: 'utf8', timeout: 30_000,
      });
      if (result.status !== 0) throw new Error(result.error?.message ?? result.stderr);
    }
  }, 60_000);

  afterAll(async () => {
    await client?.$disconnect();
    await admin?.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin?.$disconnect();
    mocks.db = null;
  }, 30_000);

  it('counts 24 pieces once using the base-unit selling price', async () => {
    const now = new Date('2026-11-01T12:00:00Z');
    const result = await getMonthlyBalances('s1', buildMonthlyPeriod(2026, 11, now), now);
    expect(result.inventoryBalance).toBe(72000);
    expect(result.openingInventoryBalance).toBeNull();
  });

  it('preserves the old ledger but does not invent a valuation before the new baseline', async () => {
    const [old] = await client.$queryRaw<{ value: string; delta: string }[]>`SELECT b."value"::text, c."delta"::text FROM "pos_inventory_valuation_baselines" b JOIN "pos_inventory_valuation_changes" c USING ("storeId") WHERE b."storeId" = 's1'`;
    expect(old).toEqual({ value: '555', delta: '123' });
    const [before] = await client.$queryRaw<{ value: string | null }[]>`SELECT pos_inventory_valuation_at('s1', "capturedAt" - interval '1 second')::text AS value FROM "pos_inventory_valuation_v2_baselines" WHERE "storeId" = 's1'`;
    expect(before.value).toBeNull();
  });

  it('keeps the previous ledger current during the deployment interval and rollback', async () => {
    await client.$executeRaw`INSERT INTO "pos_stores" VALUES ('s-legacy')`;
    await client.$executeRaw`INSERT INTO "pos_products" VALUES ('p-legacy','s-legacy','Produk','L',NULL,'c',3,100,true,NULL,'pcs',1)`;
    await client.$executeRaw`UPDATE "pos_products" SET "stock" = 5 WHERE "id" = 'p-legacy'`;
    const [row] = await client.$queryRaw<{ legacy: string; current: string }[]>`
      SELECT (b."value" + COALESCE(SUM(c."delta"), 0))::text AS legacy,
        pos_current_inventory_valuation('s-legacy')::text AS current
      FROM "pos_inventory_valuation_baselines" b LEFT JOIN "pos_inventory_valuation_changes" c USING ("storeId")
      WHERE b."storeId" = 's-legacy' GROUP BY b."value"`;
    expect(row).toBeDefined();
    expect(Number(row.legacy)).toBe(500);
    expect(row.current).toBe('500.00');
  });

  it('uses all active variants to find the base price while filtering groups only once', async () => {
    await client.$executeRaw`UPDATE "pos_products" SET "categoryId" = 'c2' WHERE "id" = 'dus'`;
    const [row] = await client.$queryRaw<{ category: string; search: string; wildcard: string; none: string }[]>`
      SELECT pos_current_inventory_valuation('s1', NULL, 'c2')::text AS category,
        pos_current_inventory_valuation('s1', 'DU_', NULL)::text AS search,
        pos_current_inventory_valuation('s1', '%', NULL)::text AS wildcard,
        pos_current_inventory_valuation('s1', 'tidak cocok', NULL)::text AS none`;
    expect(row).toEqual({ category: '72000.00', search: '72000.00', wildcard: '72000.00', none: '0.00' });
  });

  it('returns unavailable for missing or duplicate base units and recovers after correction', async () => {
    await client.$executeRaw`INSERT INTO "pos_stores" VALUES ('s-invalid')`;
    await client.$executeRaw`INSERT INTO "pos_product_stock_groups" VALUES ('g-invalid','s-invalid','pcs',10)`;
    await client.$executeRaw`INSERT INTO "pos_products" VALUES ('variant-invalid','s-invalid','Dus','V-INV',NULL,'c',1,5000,true,'g-invalid','dus',10)`;
    const value = async () => (await client.$queryRaw<{ value: string | null }[]>`SELECT pos_current_inventory_valuation('s-invalid')::text AS value`)[0].value;
    expect(await value()).toBeNull();
    await client.$executeRaw`INSERT INTO "pos_products" VALUES ('base-invalid','s-invalid','Pcs','B-INV',NULL,'c',10,1000,true,'g-invalid',' PCS ',1)`;
    expect(await value()).toBe('10000.00');
    await client.$executeRaw`INSERT INTO "pos_products" VALUES ('base-duplicate','s-invalid','Pcs','D-INV',NULL,'c',10,2000,true,'g-invalid','pcs',1)`;
    expect(await value()).toBeNull();
    await client.$executeRaw`UPDATE "pos_products" SET "isActive" = false WHERE "id" = 'base-duplicate'`;
    expect(await value()).toBe('10000.00');
    await client.$executeRaw`UPDATE "pos_products" SET "isActive" = false WHERE "stockGroupId" = 'g-invalid'`;
    expect(await value()).toBe('0.00');
  });

  it('counts known nonpositive group stock as zero even with missing or duplicate bases, including history and filters', async () => {
    await client.$executeRaw`INSERT INTO "pos_stores" VALUES ('s-nonpositive')`;
    await client.$transaction(async tx => {
      await tx.$executeRaw`INSERT INTO "pos_product_stock_groups" VALUES ('g-zero','s-nonpositive','pcs',0), ('g-negative','s-nonpositive','pcs',-5)`;
      await tx.$executeRaw`INSERT INTO "pos_products" VALUES
        ('zero-a','s-nonpositive','Nol satu','ZERO-A',NULL,'zero',0,100,true,'g-zero','pcs',1),
        ('zero-b','s-nonpositive','Nol dua','ZERO-B',NULL,'zero',0,200,true,'g-zero','pcs',1),
        ('negative-box','s-nonpositive','Negatif dus','NEG',NULL,'negative',-1,500,true,'g-negative','dus',10),
        ('positive-single','s-nonpositive','Lepas','SINGLE',NULL,'single',5,100,true,NULL,'pcs',1)`;
    });
    await client.$queryRaw`SELECT pos_observe_inventory_valuation_v2('s-nonpositive')::text`;
    await client.$executeRaw`SELECT pg_sleep(0.02)`;
    const [row] = await client.$queryRaw<{ all: string | null; zero: string | null; negative: string | null; single: string | null; history: string | null }[]>`
      SELECT pos_current_inventory_valuation('s-nonpositive')::text AS all,
        pos_current_inventory_valuation('s-nonpositive', NULL, 'zero')::text AS zero,
        pos_current_inventory_valuation('s-nonpositive', 'NEG', NULL)::text AS negative,
        pos_current_inventory_valuation('s-nonpositive', NULL, 'single')::text AS single,
        pos_inventory_valuation_at('s-nonpositive', clock_timestamp())::text AS history`;
    expect(row).toEqual({ all: '500.00', zero: '0.00', negative: '0.00', single: '500.00', history: '500.00' });
    await client.$executeRaw`UPDATE "pos_product_stock_groups" SET "baseStock" = 1 WHERE "id" = 'g-negative'`;
    await client.$queryRaw`SELECT pos_observe_inventory_valuation_v2('s-nonpositive')::text`;
    const [unknown] = await client.$queryRaw<{ all: string | null; excluded: string | null; history: string | null }[]>`
      SELECT pos_current_inventory_valuation('s-nonpositive')::text AS all,
        pos_current_inventory_valuation('s-nonpositive', NULL, 'single')::text AS excluded,
        pos_inventory_valuation_at('s-nonpositive', clock_timestamp())::text AS history`;
    expect(unknown).toEqual({ all: null, excluded: '500.00', history: null });
  });

  it('keeps a cross-store or missing group reference unavailable even if the product stock is nonpositive', async () => {
    await client.$executeRaw`INSERT INTO "pos_stores" VALUES ('s-missing-group')`;
    await client.$executeRaw`INSERT INTO "pos_products" VALUES ('p-missing-group','s-missing-group','Produk','MISSING',NULL,'c',-3,100,true,'g1','pcs',1)`;
    await client.$queryRaw`SELECT pos_observe_inventory_valuation_v2('s-missing-group')::text`;
    const [row] = await client.$queryRaw<{ current: string | null; history: string | null }[]>`
      SELECT pos_current_inventory_valuation('s-missing-group')::text AS current,
        pos_inventory_valuation_at('s-missing-group', clock_timestamp())::text AS history`;
    expect(row).toEqual({ current: null, history: null });
  });

  it('counts standalone nonpositive stock as zero even when its price is NaN', async () => {
    await client.$executeRaw`INSERT INTO "pos_stores" VALUES ('s-nan-price')`;
    await client.$executeRaw`INSERT INTO "pos_products" VALUES
      ('nan-zero','s-nan-price','Nol','NAN-ZERO',NULL,'zero',0,'NaN'::numeric,true,NULL,'pcs',1),
      ('nan-negative','s-nan-price','Negatif','NAN-NEG',NULL,'negative',-2,'NaN'::numeric,true,NULL,'pcs',1),
      ('nan-positive','s-nan-price','Baik','NAN-POS',NULL,'positive',5,100,true,NULL,'pcs',1)`;
    await client.$queryRaw`SELECT pos_observe_inventory_valuation_v2('s-nan-price')::text`;
    const [row] = await client.$queryRaw<{ all: string | null; zero: string | null; negative: string | null; history: string | null }[]>`
      SELECT pos_current_inventory_valuation('s-nan-price')::text AS all,
        pos_current_inventory_valuation('s-nan-price', NULL, 'zero')::text AS zero,
        pos_current_inventory_valuation('s-nan-price', NULL, 'negative')::text AS negative,
        pos_inventory_valuation_at('s-nan-price', clock_timestamp())::text AS history`;
    expect(row).toEqual({ all: '500.00', zero: '0.00', negative: '0.00', history: '500.00' });
    await client.$executeRaw`UPDATE "pos_products" SET "stock" = 1 WHERE "id" = 'nan-zero'`;
    await client.$queryRaw`SELECT pos_observe_inventory_valuation_v2('s-nan-price')::text`;
    const [unknown] = await client.$queryRaw<{ current: string | null; history: string | null }[]>`
      SELECT pos_current_inventory_valuation('s-nan-price')::text AS current,
        pos_inventory_valuation_at('s-nan-price', clock_timestamp())::text AS history`;
    expect(unknown).toEqual({ current: null, history: null });
  });

  it('excludes negative and inactive standalone stock and rejects cross-store group references', async () => {
    await client.$executeRaw`INSERT INTO "pos_stores" VALUES ('s-standalone')`;
    await client.$executeRaw`INSERT INTO "pos_products" VALUES
      ('positive','s-standalone','Baik','P',NULL,'c',3,1000,true,NULL,'pcs',1),
      ('negative','s-standalone','Negatif','N',NULL,'c',-2,1000,true,NULL,'pcs',1),
      ('inactive','s-standalone','Nonaktif','I',NULL,'c',9,1000,false,NULL,'pcs',1)`;
    const value = async () => (await client.$queryRaw<{ value: string | null }[]>`SELECT pos_current_inventory_valuation('s-standalone')::text AS value`)[0].value;
    expect(await value()).toBe('3000.00');
    await client.$executeRaw`UPDATE "pos_products" SET "stockGroupId" = 'g1' WHERE "id" = 'positive'`;
    expect(await value()).toBeNull();
    expect((await client.$queryRaw<{ value: string }[]>`SELECT pos_current_inventory_valuation('s1')::text AS value`)[0].value).toBe('72000.00');
  });

  it('records stock, price, active state and membership changes without rewriting prior states', async () => {
    await client.$executeRaw`INSERT INTO "pos_stores" VALUES ('s-history')`;
    await client.$transaction(async tx => {
      await tx.$executeRaw`INSERT INTO "pos_product_stock_groups" VALUES ('g-history','s-history','pcs',24)`;
      await tx.$executeRaw`INSERT INTO "pos_products" VALUES ('p-history','s-history','Produk','H',NULL,'c',24,3000,true,'g-history','pcs',1)`;
    });
    await client.$queryRaw`SELECT pos_observe_inventory_valuation_v2('s-history')::text`;
    await client.$executeRaw`SELECT pg_sleep(0.02)`;
    const [first] = await client.$queryRaw<{ at: Date }[]>`SELECT clock_timestamp() AS at`;
    await client.$transaction(async tx => {
      await tx.$executeRaw`UPDATE "pos_product_stock_groups" SET "baseStock" = 30 WHERE "id" = 'g-history'`;
      await tx.$executeRaw`UPDATE "pos_products" SET "price" = 4000 WHERE "id" = 'p-history'`;
    });
    await client.$queryRaw`SELECT pos_observe_inventory_valuation_v2('s-history')::text`;
    await client.$executeRaw`SELECT pg_sleep(0.02)`;
    const [second] = await client.$queryRaw<{ at: Date }[]>`SELECT clock_timestamp() AS at`;
    await client.$executeRaw`UPDATE "pos_products" SET "stockGroupId" = NULL, "stock" = -4 WHERE "id" = 'p-history'`;
    await client.$queryRaw`SELECT pos_observe_inventory_valuation_v2('s-history')::text`;
    await client.$executeRaw`SELECT pg_sleep(0.02)`;
    const [third] = await client.$queryRaw<{ at: Date }[]>`SELECT clock_timestamp() AS at`;
    await client.$executeRaw`UPDATE "pos_products" SET "stock" = 5, "isActive" = false WHERE "id" = 'p-history'`;
    const [row] = await client.$queryRaw<{ first: string; second: string; third: string; current: string }[]>`
      SELECT pos_inventory_valuation_at('s-history', ${first.at}::timestamptz)::text AS first,
        pos_inventory_valuation_at('s-history', ${second.at}::timestamptz)::text AS second,
        pos_inventory_valuation_at('s-history', ${third.at}::timestamptz)::text AS third,
        pos_current_inventory_valuation('s-history')::text AS current`;
    expect(row).toEqual({ first: '72000.00', second: '120000.00', third: '0.00', current: '0.00' });
  });

  it('records concurrent group stock and base price changes without losing either', async () => {
    await client.$executeRaw`INSERT INTO "pos_stores" VALUES ('s-race')`;
    await client.$transaction(async tx => {
      await tx.$executeRaw`INSERT INTO "pos_product_stock_groups" VALUES ('g-race','s-race','pcs',24)`;
      await tx.$executeRaw`INSERT INTO "pos_products" VALUES ('p-race','s-race','Produk','R',NULL,'c',24,3000,true,'g-race','pcs',1)`;
    });
    await Promise.all([
      client.$transaction(async tx => { await tx.$executeRaw`UPDATE "pos_product_stock_groups" SET "baseStock" = 48 WHERE "id" = 'g-race'`; }),
      client.$transaction(async tx => { await tx.$executeRaw`UPDATE "pos_products" SET "price" = 3500 WHERE "id" = 'p-race'`; }),
    ]);
    await client.$queryRaw`SELECT pos_observe_inventory_valuation_v2('s-race')::text`;
    await client.$executeRaw`SELECT pg_sleep(0.02)`;
    const [row] = await client.$queryRaw<{ live: string; history: string }[]>`SELECT pos_current_inventory_valuation('s-race')::text AS live, pos_inventory_valuation_at('s-race', clock_timestamp())::text AS history`;
    expect(row).toEqual({ live: '168000.00', history: '168000.00' });
  }, 30_000);

  it('orders competing writes to the same product by their actual serialized state', async () => {
    await client.$executeRaw`INSERT INTO "pos_stores" VALUES ('s-serial')`;
    await client.$executeRaw`INSERT INTO "pos_products" VALUES ('p-serial','s-serial','Produk','S',NULL,'c',1,100,true,NULL,'pcs',1)`;
    let release!: () => void;
    let locked!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const acquired = new Promise<void>(resolve => { locked = resolve; });
    const first = client.$transaction(async tx => {
      await tx.$executeRaw`UPDATE "pos_products" SET "price" = 200 WHERE "id" = 'p-serial'`;
      locked();
      await gate;
    }, { timeout: 15_000 });
    await acquired;
    const second = client.$transaction(async tx => {
      await tx.$executeRaw`UPDATE "pos_products" SET "price" = 300 WHERE "id" = 'p-serial'`;
    }, { timeout: 15_000 });
    try {
      const deadline = Date.now() + 5000;
      let waiting = false;
      while (!waiting && Date.now() < deadline) {
        const [state] = await client.$queryRaw<{ count: number }[]>`SELECT COUNT(*)::int AS count FROM pg_stat_activity WHERE pid <> pg_backend_pid() AND wait_event_type = 'Lock' AND query LIKE '%pos_products%' AND query LIKE '%p-serial%'`;
        waiting = state.count > 0;
        if (!waiting) await new Promise(resolve => setTimeout(resolve, 25));
      }
      expect(waiting).toBe(true);
    } finally { release(); }
    await Promise.all([first, second]);
    await client.$queryRaw`SELECT pos_observe_inventory_valuation_v2('s-serial')::text`;
    const [row] = await client.$queryRaw<{ live: string; history: string }[]>`SELECT pos_current_inventory_valuation('s-serial')::text AS live, pos_inventory_valuation_at('s-serial', clock_timestamp())::text AS history`;
    expect(row).toEqual({ live: '300.00', history: '300.00' });
  }, 30_000);

  it('does not assert a historical value when an event was recorded before a cutoff but committed afterwards', async () => {
    await client.$executeRaw`INSERT INTO "pos_stores" VALUES ('s-boundary')`;
    await client.$transaction(async tx => {
      await tx.$executeRaw`INSERT INTO "pos_product_stock_groups" VALUES ('g-boundary','s-boundary','pcs',24)`;
      await tx.$executeRaw`INSERT INTO "pos_products" VALUES ('p-boundary','s-boundary','Produk','B',NULL,'c',24,3000,true,'g-boundary','pcs',1)`;
    });
    await client.$queryRaw`SELECT pos_observe_inventory_valuation_v2('s-boundary')::text`;
    let release!: () => void;
    let recorded!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const eventRecorded = new Promise<void>(resolve => { recorded = resolve; });
    const pending = client.$transaction(async tx => {
      await tx.$executeRaw`UPDATE "pos_products" SET "price" = 3500 WHERE "id" = 'p-boundary'`;
      await tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE');
      recorded();
      await gate;
    }, { timeout: 15_000 });
    await eventRecorded;
    await client.$executeRaw`SELECT pg_sleep(0.02)`;
    const [cutoff] = await client.$queryRaw<{ at: Date }[]>`SELECT clock_timestamp() AS at`;
    try {
      const [before] = await client.$queryRaw<{ value: string | null }[]>`SELECT pos_inventory_valuation_at('s-boundary', ${cutoff.at}::timestamptz)::text AS value`;
      expect(before.value).toBe('72000.00');
    } finally {
      release();
    }
    await pending;
    const [after] = await client.$queryRaw<{ value: string | null }[]>`SELECT pos_inventory_valuation_at('s-boundary', ${cutoff.at}::timestamptz)::text AS value`;
    expect(after.value).toBeNull();
  }, 30_000);

  it('does not reuse an old observation when a restored transaction ID collides', async () => {
    await client.$executeRaw`INSERT INTO "pos_stores" VALUES ('s-restored')`;
    await client.$executeRaw`INSERT INTO "pos_products" VALUES ('p-restored','s-restored','Produk','RESTORED',NULL,'c',1,100,true,NULL,'pcs',1)`;
    await client.$queryRaw`SELECT pos_observe_inventory_valuation_v2('s-restored')::text`;
    let release!: () => void;
    let recorded!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const eventRecorded = new Promise<void>(resolve => { recorded = resolve; });
    const pending = client.$transaction(async tx => {
      // Simulate a restored, already observed row whose original cluster reused
      // this new transaction's ID. Preserve its old observation timestamp.
      await tx.$executeRaw`UPDATE "pos_inventory_valuation_v2_transactions" SET "transactionId" = txid_current()
        WHERE "storeId" = 's-restored' AND "transactionId" = (
          SELECT MAX("transactionId") FROM "pos_inventory_valuation_v2_transactions" WHERE "storeId" = 's-restored')`;
      await tx.$executeRaw`UPDATE "pos_products" SET "price" = 200 WHERE "id" = 'p-restored'`;
      await tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE');
      recorded();
      await gate;
    }, { timeout: 15_000 });
    await eventRecorded;
    await client.$executeRaw`SELECT pg_sleep(0.02)`;
    const [cutoff] = await client.$queryRaw<{ at: Date }[]>`SELECT clock_timestamp() AS at`;
    release();
    await pending;
    const [result] = await client.$queryRaw<{ value: string | null }[]>`SELECT pos_inventory_valuation_at('s-restored', ${cutoff.at}::timestamptz)::text AS value`;
    expect(result.value).toBeNull();
  }, 30_000);

  it('invalidates a prior observation even if the transaction token itself collides', async () => {
    await client.$executeRaw`INSERT INTO "pos_stores" VALUES ('s-token-collision')`;
    await client.$executeRaw`INSERT INTO "pos_products" VALUES ('p-token-collision','s-token-collision','Produk','TOKEN',NULL,'c',1,100,true,NULL,'pcs',1)`;
    await client.$queryRaw`SELECT pos_observe_inventory_valuation_v2('s-token-collision')::text`;
    const [old] = await client.$queryRaw<{ key: string }[]>`SELECT "transactionKey"::text AS key FROM "pos_inventory_valuation_v2_transactions" WHERE "storeId" = 's-token-collision' ORDER BY "transactionId" DESC LIMIT 1`;
    let release!: () => void;
    let recorded!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const eventRecorded = new Promise<void>(resolve => { recorded = resolve; });
    const pending = client.$transaction(async tx => {
      await tx.$queryRaw`SELECT set_config('pos.inventory_valuation_xid', txid_current()::text, true), set_config('pos.inventory_valuation_key', ${old.key}, true)`;
      await tx.$executeRaw`UPDATE "pos_products" SET "price" = 200 WHERE "id" = 'p-token-collision'`;
      await tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE');
      recorded();
      await gate;
    }, { timeout: 15_000 });
    await eventRecorded;
    await client.$executeRaw`SELECT pg_sleep(0.02)`;
    const [cutoff] = await client.$queryRaw<{ at: Date }[]>`SELECT clock_timestamp() AS at`;
    release();
    await pending;
    const [result] = await client.$queryRaw<{ value: string | null }[]>`SELECT pos_inventory_valuation_at('s-token-collision', ${cutoff.at}::timestamptz)::text AS value`;
    expect(result.value).toBeNull();
  }, 30_000);

  it('reuses a token only within one transaction and records multiple writes once', async () => {
    const url = new URL(connection!);
    url.searchParams.set('schema', schema);
    url.searchParams.set('connection_limit', '1');
    const single = new PrismaClient({ datasourceUrl: url.toString() });
    try {
      await single.$executeRaw`INSERT INTO "pos_stores" VALUES ('s-token-lifetime')`;
      const first = await single.$transaction(async tx => {
        const [a] = await tx.$queryRaw<{ pid: number; key: string }[]>`SELECT pg_backend_pid() AS pid, pos_inventory_valuation_v2_tx_key()::text AS key`;
        await tx.$executeRaw`INSERT INTO "pos_products" VALUES
          ('p-token-a','s-token-lifetime','Produk A','TOKEN-A',NULL,'c',1,100,true,NULL,'pcs',1),
          ('p-token-b','s-token-lifetime','Produk B','TOKEN-B',NULL,'c',1,200,true,NULL,'pcs',1)`;
        await tx.$executeRaw`UPDATE "pos_products" SET "price" = 150 WHERE "id" = 'p-token-a'`;
        const [b] = await tx.$queryRaw<{ pid: number; key: string }[]>`SELECT pg_backend_pid() AS pid, pos_inventory_valuation_v2_tx_key()::text AS key`;
        expect(b).toEqual(a);
        return a;
      });
      const [second] = await single.$transaction(tx => tx.$queryRaw<{ pid: number; key: string }[]>`SELECT pg_backend_pid() AS pid, pos_inventory_valuation_v2_tx_key()::text AS key`);
      expect(second.pid).toBe(first.pid);
      expect(second.key).not.toBe(first.key);
      const [row] = await single.$queryRaw<{ transactions: number; events: number; observed: boolean }[]>`
        SELECT COUNT(*)::int AS transactions,
          (SELECT COUNT(*)::int FROM "pos_inventory_valuation_v2_events" WHERE "storeId" = 's-token-lifetime') AS events,
          BOOL_OR("observedAt" IS NOT NULL) AS observed
        FROM "pos_inventory_valuation_v2_transactions"
        WHERE "storeId" = 's-token-lifetime' AND "transactionKey" = ${first.key}::uuid`;
      expect(row).toEqual({ transactions: 1, events: 3, observed: false });
    } finally {
      await single.$disconnect();
    }
  });

  it('observes prior commits on a later write but leaves the current transaction unconfirmed', async () => {
    await client.$executeRaw`INSERT INTO "pos_stores" VALUES ('s-observe')`;
    await client.$executeRaw`INSERT INTO "pos_products" VALUES ('p-observe','s-observe','Produk','O',NULL,'c',1,100,true,NULL,'pcs',1)`;
    const transactions = await client.$queryRaw<{ observed: boolean }[]>`SELECT "observedAt" IS NOT NULL AS observed FROM "pos_inventory_valuation_v2_transactions" WHERE "storeId" = 's-observe' ORDER BY "transactionId"`;
    expect(transactions).toEqual([{ observed: true }, { observed: false }]);
  });

  it('certifies an ordinary completed month after a separate observation before cutoff', async () => {
    await client.$executeRaw`INSERT INTO "pos_stores" VALUES ('s-complete')`;
    await client.$executeRaw`INSERT INTO "pos_products" VALUES ('p-complete','s-complete','Produk','C',NULL,'c',5,3000,true,NULL,'pcs',1)`;
    await client.$queryRaw`SELECT pos_observe_inventory_valuation_v2('s-complete')::text`;
    await client.$executeRaw`SELECT pg_sleep(0.02)`;
    const [row] = await client.$queryRaw<{ value: string | null }[]>`SELECT pos_inventory_valuation_at('s-complete', clock_timestamp())::text AS value`;
    expect(row.value).toBe('15000.00');
  });

  it('observes only the requested store and is idempotent when called concurrently', async () => {
    await client.$executeRaw`INSERT INTO "pos_stores" VALUES ('s-tenant-a'), ('s-tenant-b')`;
    await client.$executeRaw`INSERT INTO "pos_products" VALUES
      ('p-tenant-a','s-tenant-a','A','TA',NULL,'c',1,100,true,NULL,'pcs',1),
      ('p-tenant-b','s-tenant-b','B','TB',NULL,'c',1,200,true,NULL,'pcs',1)`;
    await Promise.all(Array.from({ length: 8 }, () => client.$queryRaw`SELECT pos_observe_inventory_valuation_v2('s-tenant-a')::text`));
    const rows = await client.$queryRaw<{ storeId: string; pending: number }[]>`SELECT "storeId", COUNT(*) FILTER (WHERE "observedAt" IS NULL)::int AS pending FROM "pos_inventory_valuation_v2_transactions" WHERE "storeId" IN ('s-tenant-a','s-tenant-b') GROUP BY "storeId" ORDER BY "storeId"`;
    expect(rows).toEqual([{ storeId: 's-tenant-a', pending: 0 }, { storeId: 's-tenant-b', pending: 1 }]);
    const [observed] = await client.$queryRaw<{ observedAt: Date }[]>`SELECT "observedAt" FROM "pos_inventory_valuation_v2_transactions" WHERE "storeId" = 's-tenant-a' ORDER BY "transactionId" DESC LIMIT 1`;
    await client.$queryRaw`SELECT pos_observe_inventory_valuation_v2('s-tenant-a')::text`;
    const [after] = await client.$queryRaw<{ observedAt: Date }[]>`SELECT "observedAt" FROM "pos_inventory_valuation_v2_transactions" WHERE "storeId" = 's-tenant-a' ORDER BY "transactionId" DESC LIMIT 1`;
    expect(after.observedAt).toEqual(observed.observedAt);
  }, 30_000);

  it('does not let an inventory-writing observer certify its own uncommitted change', async () => {
    await client.$executeRaw`INSERT INTO "pos_stores" VALUES ('s-writing-observer')`;
    await client.$executeRaw`INSERT INTO "pos_products" VALUES ('p-writing-observer','s-writing-observer','Produk','WO',NULL,'c',2,3000,true,NULL,'pcs',1)`;
    let release!: () => void;
    let observed!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const observing = new Promise<void>(resolve => { observed = resolve; });
    const pending = client.$transaction(async tx => {
      await tx.$executeRaw`UPDATE "pos_products" SET "price" = 4000 WHERE "id" = 'p-writing-observer'`;
      await tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE');
      observed();
      await gate;
    }, { timeout: 15_000 });
    await observing;
    await client.$executeRaw`SELECT pg_sleep(0.02)`;
    const [cutoff] = await client.$queryRaw<{ at: Date }[]>`SELECT clock_timestamp() AS at`;
    release();
    await pending;
    const [value] = await client.$queryRaw<{ value: string | null }[]>`SELECT pos_inventory_valuation_at('s-writing-observer', ${cutoff.at}::timestamptz)::text AS value`;
    expect(value.value).toBeNull();
  }, 30_000);

  it('accepts a pre-cutoff observation even if the independent observer commits afterwards', async () => {
    await client.$executeRaw`INSERT INTO "pos_stores" VALUES ('s-observer-boundary')`;
    await client.$transaction(async tx => {
      await tx.$executeRaw`INSERT INTO "pos_product_stock_groups" VALUES ('g-observer-boundary','s-observer-boundary','pcs',24)`;
      await tx.$executeRaw`INSERT INTO "pos_products" VALUES ('p-observer-boundary','s-observer-boundary','Produk','OB',NULL,'c',24,3000,true,'g-observer-boundary','pcs',1)`;
    });
    let release!: () => void;
    let observed!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const observing = new Promise<void>(resolve => { observed = resolve; });
    const pending = client.$transaction(async tx => {
      await tx.$queryRaw`SELECT pos_observe_inventory_valuation_v2('s-observer-boundary')::text`;
      observed();
      await gate;
    }, { timeout: 15_000 });
    await observing;
    await client.$executeRaw`SELECT pg_sleep(0.02)`;
    const [cutoff] = await client.$queryRaw<{ at: Date }[]>`SELECT clock_timestamp() AS at`;
    release();
    await pending;
    const [value] = await client.$queryRaw<{ value: string | null }[]>`SELECT pos_inventory_valuation_at('s-observer-boundary', ${cutoff.at}::timestamptz)::text AS value`;
    expect(value.value).toBe('72000.00');
  }, 30_000);

  it('discards valuation events when a product change rolls back', async () => {
    const [before] = await client.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*) AS count FROM "pos_inventory_valuation_v2_events" WHERE "storeId" = 's1'`;
    await expect(client.$transaction(async tx => {
      await tx.$executeRaw`UPDATE "pos_products" SET "price" = 1 WHERE "id" = 'pcs'`;
      throw new Error('rollback');
    })).rejects.toThrow('rollback');
    const [after] = await client.$queryRaw<{ count: bigint; value: string }[]>`SELECT (SELECT COUNT(*) FROM "pos_inventory_valuation_v2_events" WHERE "storeId" = 's1') AS count, pos_current_inventory_valuation('s1')::text AS value`;
    expect(after).toEqual({ count: before.count, value: '72000.00' });
  });
});
