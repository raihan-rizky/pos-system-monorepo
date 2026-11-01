import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { PrismaClient } from '@pos/db';

const connection = process.env.FINANCE_INVENTORY_TEST_DATABASE_URL;
const schema = `inventory_acl_${randomUUID().replaceAll('-', '')}`;
const root = path.resolve(process.cwd(), '../..');
const apiRoles = ['anon', 'authenticated', 'service_role'] as const;
const protectedTables = [
  'pos_inventory_valuation_v2_baselines',
  'pos_inventory_valuation_v2_transactions',
  'pos_inventory_valuation_v2_events',
  'pos_inventory_valuation_v2_closures',
];
const protectedFunctions = [
  'pos_inventory_valuation_v2_tx_key',
  'pos_initialize_inventory_valuation_v2',
  'pos_observe_inventory_valuation_v2',
  'pos_record_inventory_valuation_v2',
  'pos_inventory_valuation_state',
  'pos_current_inventory_valuation',
  'pos_inventory_valuation_at',
  'pos_close_inventory_at',
  'pos_wait_for_inventory_month_close',
  'pos_inventory_month_close_mode',
  'pos_close_inventory_month',
];

describe.skipIf(!connection)('inventory valuation privileges on isolated PostgreSQL', () => {
  let admin: PrismaClient;
  let client: PrismaClient;
  const createdRoles: string[] = [];

  beforeAll(async () => {
    const url = new URL(connection!);
    if (url.hostname !== '127.0.0.1' || url.port !== '55443' || url.pathname !== '/postgres') {
      throw new Error('Inventory ACL tests require the dedicated isolated PostgreSQL instance.');
    }
    admin = new PrismaClient({ datasourceUrl: connection });
    for (const role of apiRoles) {
      const existing = await admin.$queryRaw<{ exists: boolean }[]>`SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${role}) AS exists`;
      if (!existing[0].exists) {
        await admin.$executeRawUnsafe(`CREATE ROLE "${role}" NOLOGIN ${role === 'service_role' ? 'BYPASSRLS' : 'NOBYPASSRLS'}`);
        createdRoles.push(role);
      }
    }
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    await admin.$executeRawUnsafe(`GRANT USAGE ON SCHEMA "${schema}" TO anon, authenticated, service_role`);
    // Emulate Supabase's explicit default grants to each API role, in addition
    // to PostgreSQL's default PUBLIC EXECUTE on newly created functions.
    for (const kind of ['TABLES', 'SEQUENCES', 'FUNCTIONS']) {
      await admin.$executeRawUnsafe(`ALTER DEFAULT PRIVILEGES IN SCHEMA "${schema}" GRANT ALL ON ${kind} TO anon, authenticated, service_role`);
    }
    url.searchParams.set('schema', schema);
    client = new PrismaClient({ datasourceUrl: url.toString() });
    await client.$executeRawUnsafe('CREATE TABLE "pos_stores" ("id" TEXT PRIMARY KEY)');
    await client.$executeRawUnsafe('CREATE TABLE "pos_product_stock_groups" ("id" TEXT PRIMARY KEY, "storeId" TEXT NOT NULL REFERENCES "pos_stores"("id"), "baseUnit" TEXT NOT NULL, "baseStock" DOUBLE PRECISION NOT NULL)');
    await client.$executeRawUnsafe('CREATE TABLE "pos_products" ("id" TEXT PRIMARY KEY, "storeId" TEXT NOT NULL REFERENCES "pos_stores"("id"), "name" TEXT NOT NULL, "sku" TEXT NOT NULL, "barcode" TEXT, "categoryId" TEXT NOT NULL, "stock" DOUBLE PRECISION NOT NULL, "price" NUMERIC(12,2) NOT NULL, "isActive" BOOLEAN NOT NULL, "stockGroupId" TEXT REFERENCES "pos_product_stock_groups"("id"), "unit" TEXT NOT NULL, "unitMultiplierToBase" DOUBLE PRECISION NOT NULL)');
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
    if (admin) {
      await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      for (const role of createdRoles) await admin.$executeRawUnsafe(`DROP ROLE "${role}"`);
      await admin.$disconnect();
    }
  }, 30_000);

  it('denies every API role table and sequence privileges while enabling RLS', async () => {
    const tables = await client.$queryRaw<{ role: string; name: string; rls: boolean; allowed: boolean }[]>`
      SELECT r.rolname AS role, c.relname AS name, c.relrowsecurity AS rls,
        bool_or(has_table_privilege(r.oid, c.oid, p.privilege)) AS allowed
      FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p(privilege)
      WHERE r.rolname = ANY(${[...apiRoles]}::text[]) AND n.nspname = ${schema} AND c.relname = ANY(${protectedTables}::text[])
      GROUP BY r.rolname, c.relname, c.relrowsecurity`;
    expect(tables).toHaveLength(12);
    expect(tables.every(row => row.rls && !row.allowed)).toBe(true);
    const sequences = await client.$queryRaw<{ allowed: boolean }[]>`
      SELECT bool_or(has_sequence_privilege(r.oid, c.oid, p.privilege)) AS allowed
      FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      CROSS JOIN unnest(ARRAY['USAGE','SELECT','UPDATE']) p(privilege)
      WHERE r.rolname = ANY(${[...apiRoles]}::text[]) AND n.nspname = ${schema}
        AND c.relname = 'pos_inventory_valuation_v2_events_id_seq'
      GROUP BY r.rolname`;
    expect(sequences).toHaveLength(3);
    expect(sequences.every(row => !row.allowed)).toBe(true);
    for (const role of apiRoles) {
      await expect(client.$transaction(async tx => {
        await tx.$executeRawUnsafe(`SET LOCAL ROLE "${role}"`);
        await tx.$queryRawUnsafe('SELECT * FROM "pos_inventory_valuation_v2_events"');
      })).rejects.toThrow(/permission denied/i);
    }
  });

  it('denies each API role execution of every valuation and closing function', async () => {
    const functions = await client.$queryRaw<{ allowed: boolean }[]>`
      SELECT has_function_privilege(r.oid, f.oid, 'EXECUTE') AS allowed
      FROM pg_roles r CROSS JOIN pg_proc f JOIN pg_namespace n ON n.oid = f.pronamespace
      WHERE r.rolname = ANY(${[...apiRoles]}::text[]) AND n.nspname = ${schema} AND f.proname = ANY(${protectedFunctions}::text[])`;
    expect(functions).toHaveLength(33);
    expect(functions.every(row => !row.allowed)).toBe(true);
    for (const role of apiRoles) {
      for (const statement of ["SELECT pos_observe_inventory_valuation_v2('store')", "SELECT pos_inventory_valuation_state('store', NULL, NULL, NULL)", 'SELECT pos_close_inventory_month()']) {
        await expect(client.$transaction(async tx => {
          await tx.$executeRawUnsafe(`SET LOCAL ROLE "${role}"`);
          await tx.$queryRawUnsafe(statement);
        })).rejects.toThrow(/permission denied/i);
      }
    }
  });

  it('preserves the application owner, deferred triggers, observer and closing job', async () => {
    await client.$executeRaw`INSERT INTO "pos_stores" VALUES ('store')`;
    await client.$executeRaw`INSERT INTO "pos_products" VALUES ('product', 'store', 'Produk', 'SKU', NULL, 'c', 2, 1500, true, NULL, 'pcs', 1)`;
    await client.$executeRaw`SELECT pos_observe_inventory_valuation_v2('store')`;
    const current = await client.$queryRaw<{ value: string }[]>`SELECT pos_current_inventory_valuation('store')::text AS value`;
    expect(current[0].value).toBe('3000.00');
    const result = await client.$transaction(async tx => {
      await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '5s'");
      const [{ cutoff }] = await tx.$queryRaw<{ cutoff: Date }[]>`SELECT clock_timestamp() + interval '2 seconds' AS cutoff`;
      const [{ closed }] = await tx.$queryRaw<{ closed: boolean }[]>`SELECT pos_close_inventory_at(${cutoff}::timestamptz) AS closed`;
      return { cutoff, closed };
    }, { timeout: 10_000 });
    expect(result.closed).toBe(true);
    const historical = await client.$queryRaw<{ value: string }[]>`SELECT pos_inventory_valuation_at('store', ${result.cutoff}::timestamptz)::text AS value`;
    expect(historical[0].value).toBe('3000.00');
  }, 15_000);
});
