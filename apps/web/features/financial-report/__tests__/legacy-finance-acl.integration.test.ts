import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { PrismaClient } from '@pos/db';

const connection = process.env.FINANCE_INVENTORY_TEST_DATABASE_URL;
const schema = `legacy_finance_acl_${randomUUID().replaceAll('-', '')}`;
const root = path.resolve(process.cwd(), '../..');
const roles = ['anon', 'authenticated', 'service_role'] as const;
const tables = ['pos_inventory_valuation_baselines', 'pos_inventory_valuation_changes', 'pos_supplier_payables', 'pos_supplier_payable_payments'];
const triggerFunctions = ['initialize_inventory_valuation', 'record_inventory_valuation_change'];

describe.skipIf(!connection)('legacy finance privileges on isolated PostgreSQL', () => {
  let admin: PrismaClient;
  let client: PrismaClient;
  const createdRoles: string[] = [];

  beforeAll(async () => {
    const url = new URL(connection!);
    if (url.hostname !== '127.0.0.1' || url.port !== '55443' || url.pathname !== '/postgres') {
      throw new Error('Legacy finance ACL tests require the dedicated isolated PostgreSQL instance.');
    }
    admin = new PrismaClient({ datasourceUrl: connection });
    for (const role of roles) {
      const [{ exists }] = await admin.$queryRaw<{ exists: boolean }[]>`SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${role}) AS exists`;
      if (!exists) {
        await admin.$executeRawUnsafe(`CREATE ROLE "${role}" NOLOGIN ${role === 'service_role' ? 'BYPASSRLS' : 'NOBYPASSRLS'}`);
        createdRoles.push(role);
      }
    }
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    await admin.$executeRawUnsafe(`GRANT USAGE ON SCHEMA "${schema}" TO anon, authenticated, service_role`);
    for (const kind of ['TABLES', 'SEQUENCES', 'FUNCTIONS']) {
      await admin.$executeRawUnsafe(`ALTER DEFAULT PRIVILEGES IN SCHEMA "${schema}" GRANT ALL ON ${kind} TO anon, authenticated, service_role`);
    }
    url.searchParams.set('schema', schema);
    client = new PrismaClient({ datasourceUrl: url.toString() });
    await client.$executeRawUnsafe('CREATE TABLE "pos_stores" ("id" TEXT PRIMARY KEY)');
    await client.$executeRawUnsafe('CREATE TABLE "pos_products" ("id" TEXT PRIMARY KEY, "storeId" TEXT NOT NULL REFERENCES "pos_stores"("id"), "stock" DOUBLE PRECISION NOT NULL, "price" NUMERIC(12,2) NOT NULL, "isActive" BOOLEAN NOT NULL)');
    const prisma = createRequire(path.join(root, 'packages/db/package.json')).resolve('prisma/build/index.js');
    const executeMigration = (name: string) => {
      const file = path.join(root, 'packages/db/prisma/migrations', name, 'migration.sql');
      const sql = readFileSync(file, 'utf8').replace(/^BEGIN;/, `BEGIN; SET LOCAL search_path TO "${schema}";`);
      const result = spawnSync(process.execPath, [prisma, 'db', 'execute', '--stdin', `--url=${connection}`], { input: sql, encoding: 'utf8', timeout: 30_000 });
      if (result.status !== 0) throw new Error(result.error?.message ?? result.stderr);
    };
    executeMigration('20261031010000_financial_inventory_and_payables');
    await client.$executeRaw`INSERT INTO "pos_stores" VALUES ('store')`;
    await client.$executeRaw`INSERT INTO "pos_products" VALUES ('product', 'store', 2, 1500, true)`;
    await client.$executeRaw`INSERT INTO "pos_supplier_payables" ("id", "storeId", "supplierName", "amount", "debtDate", "createdById") VALUES ('debt', 'store', 'Pemasok', 100, '2026-10-01'::date, 'user')`;
    await client.$executeRaw`INSERT INTO "pos_supplier_payable_payments" ("id", "payableId", "amount", "paidAt", "createdById") VALUES ('payment', 'debt', 30, '2026-10-02'::date, 'user')`;
    // Production may already have RLS and policies; enabling it again must be safe.
    await client.$executeRawUnsafe('ALTER TABLE "pos_supplier_payables" ENABLE ROW LEVEL SECURITY');
    await client.$executeRawUnsafe('CREATE POLICY existing_policy ON "pos_supplier_payables" FOR SELECT TO authenticated USING (true)');
    const hardening = '20261101160000_secure_legacy_finance';
    if (existsSync(path.join(root, 'packages/db/prisma/migrations', hardening, 'migration.sql'))) executeMigration(hardening);
  }, 60_000);

  afterAll(async () => {
    await client?.$disconnect();
    if (admin) {
      await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      for (const role of createdRoles) await admin.$executeRawUnsafe(`DROP ROLE "${role}"`);
      await admin.$disconnect();
    }
  }, 30_000);

  it('enables RLS and removes API grants from each table and the ledger sequence', async () => {
    const rows = await client.$queryRaw<{ rls: boolean; allowed: boolean }[]>`
      SELECT c.relrowsecurity AS rls, bool_or(has_table_privilege(r.oid, c.oid, p.privilege)) AS allowed
      FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p(privilege)
      WHERE r.rolname = ANY(${[...roles]}::text[]) AND n.nspname = ${schema} AND c.relname = ANY(${tables}::text[])
      GROUP BY r.rolname, c.relname, c.relrowsecurity`;
    expect(rows).toHaveLength(12);
    expect(rows.every(row => row.rls && !row.allowed)).toBe(true);
    const sequence = await client.$queryRaw<{ allowed: boolean }[]>`
      SELECT bool_or(has_sequence_privilege(r.oid, c.oid, p.privilege)) AS allowed
      FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      CROSS JOIN unnest(ARRAY['USAGE','SELECT','UPDATE']) p(privilege)
      WHERE r.rolname = ANY(${[...roles]}::text[]) AND n.nspname = ${schema}
        AND c.relname = 'pos_inventory_valuation_changes_id_seq' GROUP BY r.rolname`;
    expect(sequence).toHaveLength(3);
    expect(sequence.every(row => !row.allowed)).toBe(true);
    for (const role of roles) {
      for (const table of tables) {
        await expect(client.$transaction(async tx => {
          await tx.$executeRawUnsafe(`SET LOCAL ROLE "${role}"`);
          await tx.$queryRawUnsafe(`SELECT * FROM "${table}"`);
        })).rejects.toThrow(/permission denied/i);
      }
    }
  });

  it('removes direct and PUBLIC execution grants from legacy trigger functions', async () => {
    const functions = await client.$queryRaw<{ allowed: boolean }[]>`
      SELECT has_function_privilege(r.oid, f.oid, 'EXECUTE') AS allowed
      FROM pg_roles r CROSS JOIN pg_proc f JOIN pg_namespace n ON n.oid = f.pronamespace
      WHERE r.rolname = ANY(${[...roles]}::text[]) AND n.nspname = ${schema} AND f.proname = ANY(${triggerFunctions}::text[])`;
    expect(functions).toHaveLength(6);
    expect(functions.every(row => !row.allowed)).toBe(true);
    for (const role of roles) {
      for (const name of triggerFunctions) {
        await expect(client.$transaction(async tx => {
          await tx.$executeRawUnsafe(`SET LOCAL ROLE "${role}"`);
          await tx.$queryRawUnsafe(`SELECT ${name}()`);
        })).rejects.toThrow(/permission denied/i);
      }
    }
  });

  it('keeps existing data and policies and preserves owner writes and legacy triggers', async () => {
    const policy = await client.$queryRaw<{ count: bigint }[]>`SELECT count(*) AS count FROM pg_policies WHERE schemaname = ${schema} AND policyname = 'existing_policy'`;
    expect(policy[0].count).toBe(1n);
    await client.$executeRaw`INSERT INTO "pos_stores" VALUES ('second-store')`;
    await client.$executeRaw`UPDATE "pos_products" SET "stock" = 3 WHERE "id" = 'product'`;
    await client.$executeRaw`INSERT INTO "pos_supplier_payable_payments" ("id", "payableId", "amount", "paidAt", "createdById") VALUES ('payment-2', 'debt', 20, '2026-10-03'::date, 'user')`;
    const [{ baselines, inventory, paid }] = await client.$queryRaw<{ baselines: bigint; inventory: string; paid: string }[]>`
      SELECT (SELECT count(*) FROM "pos_inventory_valuation_baselines") AS baselines,
        (SELECT sum("delta")::text FROM "pos_inventory_valuation_changes" WHERE "storeId" = 'store') AS inventory,
        (SELECT sum("amount")::text FROM "pos_supplier_payable_payments" WHERE "payableId" = 'debt') AS paid`;
    expect(baselines).toBe(2n);
    expect(Number(inventory)).toBe(4500);
    expect(Number(paid)).toBe(50);
  });
});
