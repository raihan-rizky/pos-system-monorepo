import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { PrismaClient } from '@pos/db';

const connection = process.env.FINANCE_INVENTORY_TEST_DATABASE_URL;
const schema = `inventory_lock_${randomUUID().replaceAll('-', '')}`;

describe.skipIf(!connection)('inventory migration lock on isolated PostgreSQL', () => {
  let admin: PrismaClient;
  let client: PrismaClient;
  let migration: string;
  let prisma: string;

  beforeAll(async () => {
    const url = new URL(connection!);
    if (url.hostname !== '127.0.0.1' || url.port !== '55443' || url.pathname !== '/postgres') {
      throw new Error('Inventory migration lock tests require the dedicated isolated PostgreSQL instance.');
    }
    admin = new PrismaClient({ datasourceUrl: connection });
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    url.searchParams.set('schema', schema);
    client = new PrismaClient({ datasourceUrl: url.toString() });
    await client.$executeRawUnsafe('CREATE TABLE "pos_stores" ("id" TEXT PRIMARY KEY)');
    await client.$executeRawUnsafe('CREATE TABLE "pos_product_stock_groups" ("id" TEXT PRIMARY KEY, "storeId" TEXT NOT NULL REFERENCES "pos_stores"("id"), "baseUnit" TEXT NOT NULL, "baseStock" DOUBLE PRECISION NOT NULL)');
    await client.$executeRawUnsafe('CREATE TABLE "pos_products" ("id" TEXT PRIMARY KEY, "storeId" TEXT NOT NULL REFERENCES "pos_stores"("id"), "name" TEXT NOT NULL, "sku" TEXT NOT NULL, "barcode" TEXT, "categoryId" TEXT NOT NULL, "stock" DOUBLE PRECISION NOT NULL, "price" NUMERIC(12,2) NOT NULL, "isActive" BOOLEAN NOT NULL, "stockGroupId" TEXT REFERENCES "pos_product_stock_groups"("id"), "unit" TEXT NOT NULL, "unitMultiplierToBase" DOUBLE PRECISION NOT NULL)');
    await client.$executeRaw`INSERT INTO "pos_stores" VALUES ('s1')`;
    await client.$executeRaw`INSERT INTO "pos_product_stock_groups" VALUES ('g1','s1','pcs',24)`;
    await client.$executeRaw`INSERT INTO "pos_products" VALUES ('p1','s1','Produk','P',NULL,'c',24,100,true,'g1','pcs',1)`;
    const root = path.resolve(process.cwd(), '../..');
    migration = readFileSync(path.join(root, 'packages/db/prisma/migrations/20261101140000_inventory_group_valuation_v2/migration.sql'), 'utf8');
    prisma = createRequire(path.join(root, 'packages/db/package.json')).resolve('prisma/build/index.js');
  }, 30_000);

  afterAll(async () => {
    await client?.$disconnect();
    await admin?.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin?.$disconnect();
  }, 30_000);

  it('times out safely behind a writer, then succeeds after the writer commits', async () => {
    let releaseWriter!: () => void;
    let writerLocked!: () => void;
    const release = new Promise<void>(resolve => { releaseWriter = resolve; });
    const locked = new Promise<void>(resolve => { writerLocked = resolve; });
    const writer = client.$transaction(async tx => {
      await tx.$executeRaw`UPDATE "pos_products" SET "stock" = 9 WHERE "id" = 'p1'`;
      writerLocked();
      await release;
    }, { timeout: 45_000 });
    await locked;

    const executeMigration = (sql: string) => {
      const child = spawn(process.execPath, [prisma, 'db', 'execute', '--stdin', `--url=${connection}`], { stdio: ['pipe', 'pipe', 'pipe'] });
      let stderr = '';
      child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
      child.stdout.resume();
      child.stdin.end(sql);
      const done = new Promise<{ status: number | null; stderr: string }>((resolve, reject) => {
        child.once('error', reject);
        child.once('close', status => resolve({ status, stderr }));
      });
      return { child, done };
    };

    const sql = migration.replace(/^BEGIN;/, `BEGIN; SET LOCAL search_path TO "${schema}"; SET LOCAL lock_timeout = '0';`);
    const first = executeMigration(sql);
    let result: { status: number | null; stderr: string } | undefined;
    const finished = first.done.then(value => { result = value; return value; });
    try {
      const deadline = Date.now() + 30_000;
      let waiting = false;
      while (!waiting && !result && Date.now() < deadline) {
        const [row] = await admin.$queryRaw<{ waiting: boolean }[]>`
          SELECT EXISTS (
            SELECT 1 FROM pg_locks l
            JOIN pg_class c ON c.oid = l.relation
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = ${schema} AND c.relname = 'pos_products'
              AND l.mode = 'ShareRowExclusiveLock' AND NOT l.granted
          ) AS waiting`;
        waiting = row.waiting;
        if (!waiting && !result) await new Promise(resolve => setTimeout(resolve, 25));
      }
      expect(waiting || result?.stderr.includes('lock timeout')).toBe(true);

      // If the migration has no timeout, release the writer so RED ends cleanly.
      await Promise.race([finished, new Promise(resolve => setTimeout(resolve, 2_500))]);
      releaseWriter();
      await writer;
      result = await finished;
      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/lock timeout/i);

      const [product] = await client.$queryRaw<{ stock: number }[]>`SELECT "stock" FROM "pos_products" WHERE "id" = 'p1'`;
      expect(product.stock).toBe(9);
      const [objects] = await admin.$queryRaw<{ tables: bigint; functions: bigint; triggers: bigint }[]>`
        SELECT
          (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = ${schema} AND c.relname LIKE 'pos_inventory_valuation_v2_%') AS tables,
          (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = ${schema} AND p.proname LIKE 'pos_%inventory%valuation%') AS functions,
          (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
             JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = ${schema} AND NOT t.tgisinternal AND t.tgname LIKE '%inventory_valuation_v2%') AS triggers`;
      expect(objects).toEqual({ tables: 0n, functions: 0n, triggers: 0n });

      const checkTimeout = `DO $$ BEGIN IF current_setting('lock_timeout') <> '0' THEN RAISE EXCEPTION 'lock_timeout was not restored'; END IF; END $$;\nCOMMIT;`;
      const second = executeMigration(sql.replace(/COMMIT;\s*$/, () => checkTimeout));
      const retry = await second.done;
      expect(retry.status, retry.stderr).toBe(0);
      const [baseline] = await client.$queryRaw<{ count: bigint }[]>`SELECT count(*) FROM "pos_inventory_valuation_v2_baselines" WHERE "storeId" = 's1'`;
      expect(baseline.count).toBe(1n);
    } finally {
      releaseWriter();
      await writer.catch(() => undefined);
      if (first.child.exitCode === null) first.child.kill();
      await first.done.catch(() => undefined);
    }
  }, 60_000);
});
