import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { PrismaClient } from '@pos/db';
import { buildMonthlyPeriod } from '../../helpers/monthly-report-core';
import { getMonthlyBalances } from '../monthly-balances';

const connection = process.env.FINANCE_INVENTORY_TEST_DATABASE_URL;
const schema = `balances_closure_${randomUUID().replaceAll('-', '')}`;
const root = path.resolve(process.cwd(), '../..');

describe.skipIf(!connection)('monthly inventory balances and closing markers', () => {
  let admin: PrismaClient;
  let client: PrismaClient;

  beforeAll(async () => {
    const url = new URL(connection!);
    if (url.hostname !== '127.0.0.1' || url.port !== '55443' || url.pathname !== '/postgres') {
      throw new Error('Monthly balance tests require the dedicated isolated PostgreSQL instance.');
    }
    admin = new PrismaClient({ datasourceUrl: connection });
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    url.searchParams.set('schema', schema);
    client = new PrismaClient({ datasourceUrl: url.toString() });
    await client.$executeRawUnsafe('CREATE TABLE "pos_stores" ("id" TEXT PRIMARY KEY)');
    await client.$executeRawUnsafe('CREATE TABLE "pos_product_stock_groups" ("id" TEXT PRIMARY KEY, "storeId" TEXT NOT NULL REFERENCES "pos_stores"("id"), "baseUnit" TEXT NOT NULL, "baseStock" DOUBLE PRECISION NOT NULL)');
    await client.$executeRawUnsafe('CREATE TABLE "pos_products" ("id" TEXT PRIMARY KEY, "storeId" TEXT NOT NULL REFERENCES "pos_stores"("id"), "name" TEXT NOT NULL, "sku" TEXT NOT NULL, "barcode" TEXT, "categoryId" TEXT NOT NULL, "stock" DOUBLE PRECISION NOT NULL, "price" NUMERIC(12,2) NOT NULL, "isActive" BOOLEAN NOT NULL, "stockGroupId" TEXT REFERENCES "pos_product_stock_groups"("id"), "unit" TEXT NOT NULL, "unitMultiplierToBase" DOUBLE PRECISION NOT NULL)');
    await client.$executeRawUnsafe('CREATE TABLE "pos_supplier_payables" ("id" TEXT PRIMARY KEY, "storeId" TEXT NOT NULL, "debtDate" DATE NOT NULL, "dueDate" DATE, "supplierName" TEXT NOT NULL, "note" TEXT, "amount" NUMERIC NOT NULL, "goodsPurchaseId" TEXT, "giroHistoryVerifiedAt" TIMESTAMPTZ)');
    await client.$executeRawUnsafe('CREATE TABLE "pos_supplier_payable_payments" ("payableId" TEXT NOT NULL, "paidAt" DATE NOT NULL, "amount" NUMERIC NOT NULL)');
    const prisma = createRequire(path.join(root, 'packages/db/package.json')).resolve('prisma/build/index.js');
    for (const name of ['20261101140000_inventory_group_valuation_v2', '20261101150000_inventory_month_close']) {
      const file = path.join(root, 'packages/db/prisma/migrations', name, 'migration.sql');
      const sql = readFileSync(file, 'utf8').replace(/^BEGIN;/, `BEGIN; SET LOCAL search_path TO "${schema}";`);
      const result = spawnSync(process.execPath, [prisma, 'db', 'execute', '--stdin', `--url=${connection}`], { input: sql, encoding: 'utf8', timeout: 30_000 });
      if (result.status !== 0) throw new Error(result.error?.message ?? result.stderr);
    }
  }, 60_000);

  afterAll(async () => {
    await client?.$disconnect();
    await admin?.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin?.$disconnect();
  }, 30_000);

  async function addObservedProduct(store: string) {
    await client.$executeRaw`INSERT INTO "pos_stores" VALUES (${store})`;
    await client.$executeRaw`INSERT INTO "pos_products" VALUES (${`product-${store}`}, ${store}, 'Produk', ${`sku-${store}`}, NULL, 'category', 2, 3000, true, NULL, 'pcs', 1)`;
    // Observing all committed writes makes the underlying historical function
    // capable of returning a number. Only the closure marker should gate it.
    await client.$executeRaw`SELECT pos_observe_inventory_valuation_v2(${store})`;
  }

  function reportPeriod(offset: number, current: boolean) {
    const local = new Date(Date.now() + 7 * 60 * 60 * 1000);
    const target = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + offset, 15, 5));
    const now = current ? target : new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 15, 5));
    return { now, period: buildMonthlyPeriod(target.getUTCFullYear(), target.getUTCMonth() + 1, now) };
  }

  async function insertMarker(cutoff: Date) {
    await client.$executeRaw`INSERT INTO "pos_inventory_valuation_v2_closures" ("cutoff", "closedAt") VALUES (${cutoff}::timestamptz, ${cutoff}::timestamptz)`;
  }

  it('returns null for historical opening and closing when neither cutoff has a marker', async () => {
    const store = 'no-marker';
    const { period, now } = reportPeriod(2, false);
    await addObservedProduct(store);
    const [{ opening, closing }] = await client.$queryRaw<{ opening: string | null; closing: string | null }[]>`
      SELECT pos_inventory_valuation_at(${store}, ${period.start}::timestamptz)::text AS opening,
        pos_inventory_valuation_at(${store}, ${period.end}::timestamptz)::text AS closing`;
    expect([opening, closing]).toEqual(['6000.00', '6000.00']);
    const balances = await getMonthlyBalances(store, period, now, client);
    expect(balances.openingInventoryBalance).toBeNull();
    expect(balances.inventoryBalance).toBeNull();
  });

  it('uses only the historical balance whose exact cutoff has a marker', async () => {
    const store = 'exact-marker';
    const { period, now } = reportPeriod(4, false);
    await addObservedProduct(store);
    await insertMarker(period.start);
    const first = await getMonthlyBalances(store, period, now, client);
    expect(first.openingInventoryBalance).toBe(6000);
    expect(first.inventoryBalance).toBeNull();
    await insertMarker(period.end);
    const second = await getMonthlyBalances(store, period, now, client);
    expect(second.openingInventoryBalance).toBe(6000);
    expect(second.inventoryBalance).toBe(6000);
  });

  it('does not accept nearby markers for either historical cutoff', async () => {
    const store = 'wrong-marker';
    const { period, now } = reportPeriod(6, false);
    await addObservedProduct(store);
    await insertMarker(new Date(period.start.getTime() - 1));
    await insertMarker(new Date(period.end.getTime() + 1));
    const balances = await getMonthlyBalances(store, period, now, client);
    expect(balances.openingInventoryBalance).toBeNull();
    expect(balances.inventoryBalance).toBeNull();
  });

  it('uses the live valuation for the current month even without a closing marker', async () => {
    const store = 'current-month';
    const { period, now } = reportPeriod(8, true);
    await addObservedProduct(store);
    await client.$executeRaw`UPDATE "pos_products" SET "stock" = 3 WHERE "id" = ${`product-${store}`}`;
    const balances = await getMonthlyBalances(store, period, now, client);
    expect(balances.openingInventoryBalance).toBeNull();
    expect(balances.inventoryBalance).toBe(9000);
  });
});
