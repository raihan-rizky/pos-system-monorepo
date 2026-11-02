import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@pos/db";

// Opt in only against a disposable loopback server. Each run owns a fresh schema.
const nativeUrl = process.env.INVENTORY_NATIVE_PG_URL;
const root = path.resolve(process.cwd(), "../..");
const isolated = "inventory_name_concurrency_" + randomUUID().replaceAll("-", "");

function gate() {
  let release!: () => void;
  const ready = new Promise<void>((resolve) => { release = resolve; });
  return { ready, release };
}

describe.skipIf(!nativeUrl)("duplicate inventory transactions in native PostgreSQL", () => {
  let admin: PrismaClient;
  let first: PrismaClient;
  let second: PrismaClient;

  beforeAll(async () => {
    const connection = new URL(nativeUrl!);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(connection.hostname)) {
      throw new Error("Native inventory tests require a disposable loopback PostgreSQL server");
    }
    const requireDb = createRequire(path.join(root, "packages/db/package.json"));
    const { PrismaClient: Client } = requireDb("@prisma/client") as typeof import("@pos/db");
    admin = new Client({ datasources: { db: { url: nativeUrl } } });
    connection.searchParams.set("schema", isolated);
    connection.searchParams.set("connection_limit", "1");
    first = new Client({ datasources: { db: { url: connection.href } } });
    second = new Client({ datasources: { db: { url: connection.href } } });

    const migrations = [
      "20261031010000_financial_inventory_and_payables",
      "20261102010000_inventory_unit_cost_valuation",
      "20261102120000_inventory_name_deduplication",
    ].map((name) => readFileSync(path.join(root, "packages/db/prisma/migrations", name, "migration.sql"), "utf8")
      .replace(/^\s*BEGIN;\s*/i, "").replace(/\s*COMMIT;\s*$/i, ""));
    const sql = `BEGIN;
CREATE SCHEMA "${isolated}";
SET LOCAL search_path TO "${isolated}";
CREATE TABLE pos_stores (id text PRIMARY KEY);
CREATE TABLE pos_product_stock_groups (
 id text PRIMARY KEY, "storeId" text NOT NULL REFERENCES pos_stores(id),
 "baseUnit" text NOT NULL, "baseStock" double precision NOT NULL,
 "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now()
);
CREATE TABLE pos_products (
 id text PRIMARY KEY, "storeId" text NOT NULL REFERENCES pos_stores(id),
 name text NOT NULL, sku text NOT NULL, barcode text, "categoryId" text NOT NULL,
 stock double precision NOT NULL, price numeric(12,2) NOT NULL, "costPrice" numeric(12,2),
 "isActive" boolean NOT NULL, unit text NOT NULL,
 "stockGroupId" text REFERENCES pos_product_stock_groups(id),
 "unitMultiplierToBase" double precision NOT NULL DEFAULT 1,
 "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now()
);
${migrations.join("\n")}
INSERT INTO pos_stores VALUES ('concurrency-store');
INSERT INTO pos_products (id,"storeId",name,sku,"categoryId",stock,price,"costPrice","isActive",unit) VALUES
 ('x1','concurrency-store','Family X','X','cat',1,10,1,true,'pcs'),
 ('x2','concurrency-store','Family X-new','X-NEW','cat',1,10,1,true,'pcs'),
 ('y1','concurrency-store','Family Y','Y','cat',1,10,1,true,'pcs'),
 ('y2','concurrency-store','Family Y-new','Y-NEW','cat',1,10,1,true,'pcs');
COMMIT;`;
    const result = spawnSync(process.execPath, [
      requireDb.resolve("prisma/build/index.js"), "db", "execute", "--stdin",
      "--schema", path.join(root, "packages/db/prisma/schema.prisma"),
    ], {
      input: sql, encoding: "utf8", timeout: 60_000,
      env: { ...process.env, DATABASE_URL: nativeUrl, DIRECT_URL: nativeUrl },
    });
    expect(result.error?.message).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
  }, 75_000);

  afterAll(async () => {
    await Promise.allSettled([first?.$disconnect(), second?.$disconnect()]);
    if (admin) {
      if (!/^inventory_name_concurrency_[a-f0-9]{32}$/.test(isolated)) throw new Error("Invalid test schema");
      await admin.$executeRawUnsafe('DROP SCHEMA IF EXISTS "' + isolated + '" CASCADE');
      await admin.$disconnect();
    }
  });

  it("commits opposite family orders on disjoint physical rows without deadlocking", async () => {
    const firstWritten = gate();
    const secondWritten = gate();
    const options = { timeout: 15_000, maxWait: 15_000 };
    const one = first.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM pos_products WHERE id IN ('x1','y1') ORDER BY id FOR UPDATE`;
      await tx.$executeRaw`UPDATE pos_products SET stock=10,"costPrice"=2 WHERE id='x1'`;
      firstWritten.release();
      await secondWritten.ready;
      await tx.$executeRaw`UPDATE pos_products SET stock=40,"costPrice"=2 WHERE id='y1'`;
    }, options).finally(() => firstWritten.release());
    const two = (async () => {
      await firstWritten.ready;
      return second.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM pos_products WHERE id IN ('x2','y2') ORDER BY id FOR UPDATE`;
        await tx.$executeRaw`UPDATE pos_products SET stock=20,"costPrice"=3 WHERE id='y2'`;
        secondWritten.release();
        await tx.$executeRaw`UPDATE pos_products SET stock=30,"costPrice"=3 WHERE id='x2'`;
      }, options);
    })().finally(() => secondWritten.release());
    const completed = await Promise.allSettled([one, two]);
    expect(completed.filter((item) => item.status === "rejected").map((item) => String(item.reason))).toEqual([]);
    const [balances] = await first.$queryRaw<{ live: string; cached: string; ledger: string; queued: number }[]>`
      SELECT (SELECT SUM(value)::text FROM pos_inventory_cost_entities('concurrency-store')) AS live,
        (SELECT SUM(value)::text FROM pos_inventory_cost_entity_values WHERE "storeId"='concurrency-store') AS cached,
        (SELECT (b.value+COALESCE(SUM(c.delta),0))::text FROM pos_inventory_valuation_baselines b
          LEFT JOIN pos_inventory_valuation_changes c ON c."storeId"=b."storeId" AND c.method=b.method
          WHERE b."storeId"='concurrency-store' AND b.method='unit_hpp' GROUP BY b.value) AS ledger,
        (SELECT count(*)::int FROM pos_inventory_cost_refresh_queue) AS queued`;
    // X2 changed after X1: 30*3=90. Y1 changed after Y2: 40*2=80.
    expect([Number(balances.live), Number(balances.cached), Number(balances.ledger), balances.queued])
      .toEqual([170, 170, 170, 0]);
  }, 30_000);
});
