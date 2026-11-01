import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { PrismaClient } from "@pos/db";

// The migration exists even when no isolated PostgreSQL URL is configured.
// Actual concurrency assertions below run only against an explicitly local DB.
const connection = process.env.FINANCE_INVENTORY_TEST_DATABASE_URL;
const schema = `inventory_close_${randomUUID().replaceAll("-", "")}`;
const root = path.resolve(process.cwd(), "../..");
const migrationDir = path.join(root, "packages/db/prisma/migrations");

describe.skipIf(!connection)("inventory month close on isolated PostgreSQL", () => {
  let admin: PrismaClient;
  let client: PrismaClient;

  beforeAll(async () => {
    const url = new URL(connection!);
    if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
      throw new Error("Inventory close tests require a local isolated PostgreSQL instance.");
    }
    admin = new PrismaClient({ datasourceUrl: connection });
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    url.searchParams.set("schema", schema);
    client = new PrismaClient({ datasourceUrl: url.toString() });
    await client.$executeRawUnsafe('CREATE TABLE "pos_stores" ("id" TEXT PRIMARY KEY)');
    await client.$executeRawUnsafe('CREATE TABLE "pos_product_stock_groups" ("id" TEXT PRIMARY KEY, "storeId" TEXT NOT NULL REFERENCES "pos_stores"("id"), "baseUnit" TEXT NOT NULL, "baseStock" DOUBLE PRECISION NOT NULL)');
    await client.$executeRawUnsafe('CREATE TABLE "pos_products" ("id" TEXT PRIMARY KEY, "storeId" TEXT NOT NULL REFERENCES "pos_stores"("id"), "name" TEXT NOT NULL, "sku" TEXT NOT NULL, "barcode" TEXT, "categoryId" TEXT NOT NULL, "stock" DOUBLE PRECISION NOT NULL, "price" NUMERIC(12,2) NOT NULL, "isActive" BOOLEAN NOT NULL, "stockGroupId" TEXT REFERENCES "pos_product_stock_groups"("id"), "unit" TEXT NOT NULL, "unitMultiplierToBase" DOUBLE PRECISION NOT NULL)');
    const prisma = createRequire(path.join(root, "packages/db/package.json")).resolve("prisma/build/index.js");
    for (const name of ["20261101140000_inventory_group_valuation_v2", "20261101150000_inventory_month_close"]) {
      const file = path.join(migrationDir, name, "migration.sql");
      if (!existsSync(file)) continue;
      const sql = readFileSync(file, "utf8").replace(/^BEGIN;/, `BEGIN; SET LOCAL search_path TO "${schema}";`);
      const result = spawnSync(process.execPath, [prisma, "db", "execute", "--stdin", `--url=${connection}`], {
        input: sql, encoding: "utf8", timeout: 30_000,
      });
      if (result.status !== 0) throw new Error(result.error?.message ?? result.stderr);
    }
  }, 60_000);

  afterAll(async () => {
    await client?.$disconnect();
    await admin?.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin?.$disconnect();
  }, 30_000);

  async function addProduct(id: string, stock = 2) {
    await client.$executeRaw`INSERT INTO "pos_stores" VALUES (${id})`;
    await client.$executeRaw`INSERT INTO "pos_products" VALUES (${`p-${id}`}, ${id}, 'Produk', ${`sku-${id}`}, NULL, 'c', ${stock}, 3000, true, NULL, 'pcs', 1)`;
  }

  async function cutoffIn(seconds: number) {
    return (await client.$queryRaw<{ cutoff: Date }[]>`SELECT clock_timestamp() + (${seconds} * interval '1 second') AS cutoff`)[0].cutoff;
  }

  async function history(id: string, cutoff: Date) {
    return (await client.$queryRaw<{ value: string | null }[]>`SELECT pos_inventory_valuation_at(${id}, ${cutoff}::timestamptz)::text AS value`)[0].value;
  }

  async function pending(id: string) {
    return (await client.$queryRaw<{ count: number }[]>`SELECT count(*)::int AS count FROM "pos_inventory_valuation_v2_transactions" WHERE "storeId" = ${id} AND "observedAt" IS NULL`)[0].count;
  }

  async function closeAt(cutoff: Date) {
    return client.$transaction(async tx => {
      await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '5s'");
      return tx.$queryRaw<{ closed: boolean }[]>`SELECT pos_close_inventory_at(${cutoff}::timestamptz) AS closed`;
    }, { timeout: 8_000 });
  }

  it("installs the bounded cutoff helper and the month scheduler entry point", async () => {
    const [row] = await client.$queryRaw<{ installed: boolean }[]>`SELECT to_regprocedure('pos_close_inventory_at(timestamp with time zone)') IS NOT NULL AND to_regprocedure('pos_wait_for_inventory_month_close()') IS NOT NULL AND to_regprocedure('pos_close_inventory_month()') IS NOT NULL AS installed`;
    expect(row.installed).toBe(true);
  });

  it("classifies normal days, the closing window, and a late start in Jakarta time", async () => {
    const [row] = await client.$queryRaw<{ ordinary: string; due: string; late: string; nextDay: string }[]>`
      SELECT pos_inventory_month_close_mode('2026-11-15T16:59:00Z') AS ordinary,
        pos_inventory_month_close_mode('2026-11-30T16:59:00Z') AS due,
        pos_inventory_month_close_mode('2026-11-30T17:00:01Z') AS late,
        pos_inventory_month_close_mode('2026-12-01T16:59:00Z') AS "nextDay"`;
    expect(row).toEqual({ ordinary: "SKIP", due: "DUE", late: "MISSED", nextDay: "SKIP" });
  });

  it("certifies a complete historical value with no subsequent product page visit", async () => {
    await addProduct("complete");
    expect(await pending("complete")).toBeGreaterThan(0);
    const cutoff = await cutoffIn(2);
    const [result] = await closeAt(cutoff);
    expect(result.closed).toBe(true);
    expect(await history("complete", cutoff)).toBe("6000.00");
    const [marker] = await client.$queryRaw<{ count: number }[]>`SELECT count(*)::int AS count FROM "pos_inventory_valuation_v2_closures" WHERE "cutoff" = ${cutoff}::timestamptz`;
    expect(marker.count).toBe(1);
  }, 15_000);

  it("does not mark any transaction when invoked after cutoff", async () => {
    await addProduct("late");
    const before = await pending("late");
    const cutoff = await cutoffIn(-1);
    const [result] = await closeAt(cutoff);
    expect(result.closed).toBe(false);
    expect(await pending("late")).toBe(before);
    const [marker] = await client.$queryRaw<{ count: number }[]>`SELECT count(*)::int AS count FROM "pos_inventory_valuation_v2_closures" WHERE "cutoff" = ${cutoff}::timestamptz`;
    expect(marker.count).toBe(0);
  });

  it("rejects repeatable-read or an existing assigned transaction before marking observations", async () => {
    await addProduct("isolation");
    const before = await pending("isolation");
    const cutoff = await cutoffIn(2);
    await expect(client.$transaction(async tx => {
      await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '5s'");
      await tx.$queryRaw`SELECT pos_close_inventory_at(${cutoff}::timestamptz)`;
    }, { isolationLevel: "RepeatableRead" })).rejects.toThrow();
    await expect(client.$transaction(async tx => {
      await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '5s'");
      await tx.$queryRaw`SELECT txid_current()`;
      await tx.$queryRaw`SELECT pos_close_inventory_at(${cutoff}::timestamptz)`;
    })).rejects.toThrow();
    expect(await pending("isolation")).toBe(before);
  });

  it("requires a bounded statement timeout before taking table locks", async () => {
    await addProduct("timeout");
    const before = await pending("timeout");
    const cutoff = await cutoffIn(2);
    await expect(client.$transaction(async tx => {
      await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '0'");
      await tx.$queryRaw`SELECT pos_close_inventory_at(${cutoff}::timestamptz)`;
    })).rejects.toThrow();
    expect(await pending("timeout")).toBe(before);
  });

  it("does not certify the caller's earlier uncommitted store creation", async () => {
    const cutoff = await cutoffIn(2);
    await expect(client.$transaction(async tx => {
      await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '5s'");
      await tx.$executeRaw`INSERT INTO "pos_stores" VALUES ('own-store')`;
      await tx.$queryRaw`SELECT pos_close_inventory_at(${cutoff}::timestamptz)`;
    })).rejects.toThrow();
    const [row] = await client.$queryRaw<{ count: number }[]>`SELECT count(*)::int AS count FROM "pos_stores" WHERE "id" = 'own-store'`;
    expect(row.count).toBe(0);
  });

  it("preserves historical uncertainty when an observation row is locked past cutoff", async () => {
    await addProduct("locked-observation");
    let release!: () => void;
    let ready!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const acquired = new Promise<void>(resolve => { ready = resolve; });
    const observer = client.$transaction(async tx => {
      await tx.$executeRaw`UPDATE "pos_inventory_valuation_v2_transactions" SET "observedAt" = clock_timestamp() WHERE "storeId" = 'locked-observation' AND "observedAt" IS NULL`;
      ready();
      await gate;
    }, { timeout: 15_000 });
    await acquired;
    const cutoff = await cutoffIn(1.5);
    try {
      await expect(closeAt(cutoff)).rejects.toThrow();
      await new Promise(resolve => setTimeout(resolve, 1700));
    } finally { release(); }
    await observer;
    expect(await history("locked-observation", cutoff)).toBe("6000.00");
  }, 15_000);

  it("rolls back every observation and releases table locks when the caller aborts", async () => {
    await addProduct("rollback-close");
    const before = await pending("rollback-close");
    const cutoff = await cutoffIn(1.5);
    await expect(client.$transaction(async tx => {
      await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '5s'");
      await tx.$queryRaw`SELECT pos_close_inventory_at(${cutoff}::timestamptz)`;
      throw new Error("rollback close");
    }, { timeout: 8_000 })).rejects.toThrow("rollback close");
    expect(await pending("rollback-close")).toBe(before);
    expect(await history("rollback-close", cutoff)).toBeNull();
    const [marker] = await client.$queryRaw<{ count: number }[]>`SELECT count(*)::int AS count FROM "pos_inventory_valuation_v2_closures" WHERE "cutoff" = ${cutoff}::timestamptz`;
    expect(marker.count).toBe(0);
    await client.$executeRaw`UPDATE "pos_products" SET "stock" = 3 WHERE "id" = 'p-rollback-close'`;
  }, 15_000);

  it("fails safely when an inventory writer remains open across the cutoff", async () => {
    await addProduct("crossing");
    await client.$queryRaw`SELECT pos_observe_inventory_valuation_v2('crossing')::text`;
    let release!: () => void;
    let ready!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const locked = new Promise<void>(resolve => { ready = resolve; });
    const writer = client.$transaction(async tx => {
      await tx.$executeRaw`UPDATE "pos_products" SET "stock" = 3 WHERE "id" = 'p-crossing'`;
      await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
      ready();
      await gate;
    }, { timeout: 15_000 });
    await locked;
    const cutoff = await cutoffIn(1.5);
    try {
      await expect(closeAt(cutoff)).rejects.toThrow();
      await new Promise(resolve => setTimeout(resolve, 1700));
    } finally { release(); }
    await writer;
    expect(await history("crossing", cutoff)).toBeNull();
    const [marker] = await client.$queryRaw<{ count: number }[]>`SELECT count(*)::int AS count FROM "pos_inventory_valuation_v2_closures" WHERE "cutoff" = ${cutoff}::timestamptz`;
    expect(marker.count).toBe(0);
  }, 15_000);

  it("blocks a new writer until after cutoff and keeps the earlier historical value", async () => {
    await addProduct("blocked");
    const cutoff = await cutoffIn(2);
    const close = closeAt(cutoff);
    let lockObserved = false;
    const deadline = Date.now() + 1000;
    while (!lockObserved && Date.now() < deadline) {
      const [row] = await client.$queryRaw<{ count: number }[]>`SELECT count(*)::int AS count FROM pg_locks l JOIN pg_class c ON c.oid = l.relation JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = ${schema} AND c.relname = 'pos_products' AND l.mode = 'ShareLock' AND l.granted`;
      lockObserved = row.count > 0;
      if (!lockObserved) await new Promise(resolve => setTimeout(resolve, 20));
    }
    expect(lockObserved).toBe(true);
    let writerFinished = false;
    const writer = client.$executeRaw`UPDATE "pos_products" SET "stock" = 5 WHERE "id" = 'p-blocked'`.then(() => { writerFinished = true; });
    await new Promise(resolve => setTimeout(resolve, 200));
    expect(writerFinished).toBe(false);
    expect((await close)[0].closed).toBe(true);
    await writer;
    expect(await history("blocked", cutoff)).toBe("6000.00");
    expect((await client.$queryRaw<{ value: string }[]>`SELECT pos_current_inventory_valuation('blocked')::text AS value`)[0].value).toBe("15000.00");
  }, 15_000);
});
