import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const boundary = vi.hoisted(() => ({
  query: null as null | ((query: { text: string; values: unknown[] }) => Promise<unknown[]>),
}));

vi.mock("@pos/db", async (importOriginal) => {
  const original = await importOriginal<typeof import("@pos/db")>();
  return {
    Prisma: original.Prisma,
    db: {
      $executeRaw: (input: TemplateStringsArray, ...values: unknown[]) => {
        return boundary.query!(original.Prisma.sql(input, ...values));
      },
      $queryRaw: (input: TemplateStringsArray | { text: string; values: unknown[] }, ...values: unknown[]) => {
        const query = Array.isArray(input) ? original.Prisma.sql(input as TemplateStringsArray, ...values) : input;
        return boundary.query!(query as { text: string; values: unknown[] });
      },
    },
  };
});
vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: vi.fn(async () => ({ storeId: "store-1" })),
  handleAuthError: vi.fn(() => null),
}));

import { GET } from "@/app/api/products/stats/route";
import { getMonthlyBalances } from "@/features/financial-report/services/monthly-balances";
import { buildMonthlyPeriod } from "@/features/financial-report/helpers/monthly-report-core";

// Uses an isolated, in-memory PostgreSQL instance. The optional module path keeps
// test tooling outside the application's runtime dependencies, like the existing
// opt-in PostgreSQL migration tests in financial-report.
const modulePath = process.env.INVENTORY_PGLITE_MODULE;
const root = path.resolve(process.cwd(), "../..");
const oldMigration = path.join(root, "packages/db/prisma/migrations/20261031010000_financial_inventory_and_payables/migration.sql");
const costMigration = path.join(root, "packages/db/prisma/migrations/20261102010000_inventory_unit_cost_valuation/migration.sql");
const nameMigration = path.join(root, "packages/db/prisma/migrations/20261102120000_inventory_name_deduplication/migration.sql");

describe.skipIf(!modulePath)("automatic inventory valuation in PostgreSQL", () => {
  let pg: {
    exec(sql: string): Promise<unknown>;
    query<T = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<{ rows: T[] }>;
    close(): Promise<void>;
  };

  beforeAll(async () => {
    const require = createRequire(import.meta.url);
    const { PGlite } = require(modulePath!);
    pg = new PGlite();
    boundary.query = async (query) => (await pg.query(query.text, query.values)).rows;
    await pg.query("SELECT 1");
    await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;`);
  }, 30_000);

  afterAll(async () => { await pg?.close(); });

  async function resetDatabase(withNameDeduplication = true) {
    await pg.exec(`
      DROP SCHEMA public CASCADE;
      CREATE SCHEMA public;
      GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
      CREATE TABLE pos_stores (id text PRIMARY KEY);
      CREATE TABLE pos_product_stock_groups (
        id text PRIMARY KEY, "storeId" text NOT NULL REFERENCES pos_stores(id),
        "baseUnit" text NOT NULL, "baseStock" double precision NOT NULL,
        "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now()
      );
      CREATE TABLE pos_products (
        id text PRIMARY KEY, "storeId" text NOT NULL REFERENCES pos_stores(id),
        name text NOT NULL, sku text NOT NULL, barcode text, "categoryId" text NOT NULL,
        stock double precision NOT NULL, "minStock" integer NOT NULL DEFAULT 1,
        price numeric(12,2) NOT NULL, "costPrice" numeric(12,2), "isActive" boolean NOT NULL,
        unit text NOT NULL, "stockGroupId" text REFERENCES pos_product_stock_groups(id),
        "unitMultiplierToBase" double precision NOT NULL DEFAULT 1,
        "conversionNeedsReview" boolean NOT NULL DEFAULT false,
        "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now()
      );
      INSERT INTO pos_stores VALUES ('store-1'), ('store-2');
      INSERT INTO pos_product_stock_groups VALUES ('group-1', 'store-1', 'pcs', 25);
      INSERT INTO pos_products (id,"storeId",name,sku,"categoryId",stock,price,"costPrice","isActive",unit,"stockGroupId","unitMultiplierToBase") VALUES
        ('pcs','store-1','Pensil','P-PCS','cat-1',25,2000,1000,true,'pcs','group-1',1),
        ('dus','store-1','Pensil','P-DUS','cat-1',2.5,18000,9000,true,'dus','group-1',10);
    `);
    await pg.exec(readFileSync(oldMigration, "utf8"));
    await pg.exec(`ALTER TABLE pos_supplier_payables ADD COLUMN "goodsPurchaseId" text, ADD COLUMN "giroHistoryVerifiedAt" timestamptz`);
    for (const migration of ["20261101140000_inventory_group_valuation_v2", "20261101150000_inventory_month_close", "20261101160000_secure_legacy_finance"]) {
      await pg.exec(readFileSync(path.join(root, "packages/db/prisma/migrations", migration, "migration.sql"), "utf8"));
    }
    if (existsSync(costMigration)) await pg.exec(readFileSync(costMigration, "utf8"));
    if (withNameDeduplication && existsSync(nameMigration)) await pg.exec(readFileSync(nameMigration, "utf8"));
  }

  beforeEach(async () => { await resetDatabase(); }, 15_000);

  async function stats(query = "") {
    const response = await GET(new Request(`http://localhost/api/products/stats${query}`));
    expect(response.status).toBe(200);
    return response.json();
  }

  async function recorded() {
    const result = await pg.query<{ value: string; unvalued: number }>(`
      SELECT (b.value + COALESCE(SUM(c.delta), 0))::text AS value,
        (b."unvaluedCount" + COALESCE(SUM(c."unvaluedDelta"), 0))::int AS unvalued
      FROM pos_inventory_valuation_baselines b
      LEFT JOIN pos_inventory_valuation_changes c ON c."storeId" = b."storeId" AND c.method = b.method
      WHERE b."storeId" = 'store-1' AND b.method = 'unit_hpp'
      GROUP BY b.value, b."unvaluedCount"
    `);
    return { value: Number(result.rows[0].value), unvalued: result.rows[0].unvalued };
  }

  it("values 25 shared pcs as two dus at their own HPP plus five pcs", async () => {
    expect(await stats()).toMatchObject({ totalProducts: 2, inventoryValue: 23_000, inventoryUnvaluedCount: 0 });
  });

  it("derives a missing dus HPP from ten times the pcs HPP", async () => {
    await pg.exec(`UPDATE pos_products SET "costPrice" = NULL WHERE id = 'dus'`);
    expect((await stats()).inventoryValue).toBe(25_000);
  });

  it("converts down from the smallest available HPP when pcs has no HPP", async () => {
    await pg.exec(`UPDATE pos_products SET "costPrice" = NULL WHERE id = 'pcs'`);
    expect((await stats()).inventoryValue).toBe(22_500);
  });

  it("reports a whole shared group with no HPP as one unvalued product", async () => {
    await pg.exec(`UPDATE pos_products SET "costPrice" = NULL`);
    expect(await stats()).toMatchObject({ inventoryValue: 0, inventoryUnvaluedCount: 1 });
  });

  it("treats an explicit zero HPP as a known cost", async () => {
    await pg.exec(`UPDATE pos_products SET "costPrice" = CASE WHEN id = 'pcs' THEN 0 ELSE NULL END`);
    expect(await stats()).toMatchObject({ inventoryValue: 0, inventoryUnvaluedCount: 0 });
  });

  it("does not multiply shared inventory by the number or cached stock of its members", async () => {
    await pg.exec(`UPDATE pos_products SET stock = 999`);
    expect((await stats()).inventoryValue).toBe(23_000);
  });

  it("keeps the same group valuation when search matches only the dus", async () => {
    expect(await stats("?search=P-DUS")).toMatchObject({ totalProducts: 1, inventoryValue: 23_000 });
    expect(await stats("?categoryId=other")).toMatchObject({ totalProducts: 0, inventoryValue: 0 });
  });

  it("does not depend on a base-unit member or the old review flag", async () => {
    await pg.exec(`UPDATE pos_product_stock_groups SET "baseUnit" = 'satuan-lama'; UPDATE pos_products SET "conversionNeedsReview" = true`);
    expect((await stats()).inventoryValue).toBe(23_000);
  });

  it("handles a stored base unit larger than the smallest unit", async () => {
    await pg.exec(`UPDATE pos_product_stock_groups SET "baseUnit" = 'dus', "baseStock" = 2.5;
      UPDATE pos_products SET "unitMultiplierToBase" = CASE WHEN id = 'pcs' THEN 0.1 ELSE 1 END`);
    expect((await stats()).inventoryValue).toBe(23_000);
  });

  it("excludes inactive members and other stores from the cost calculation", async () => {
    await pg.exec(`UPDATE pos_products SET "isActive" = false WHERE id = 'dus';
      INSERT INTO pos_products (id,"storeId",name,sku,"categoryId",stock,price,"costPrice","isActive",unit)
      VALUES ('other','store-2','Pensil','OTHER','cat-1',1000,9999,5000,true,'pcs')`);
    expect(await stats()).toMatchObject({ totalProducts: 1, inventoryValue: 25_000 });
  });

  it("keeps nonpositive stock out of the value and missing-HPP count", async () => {
    await pg.exec(`UPDATE pos_product_stock_groups SET "baseStock" = -25; UPDATE pos_products SET "costPrice" = NULL`);
    expect(await stats()).toMatchObject({ inventoryValue: 0, inventoryUnvaluedCount: 0 });
  });

  it("uses each standalone product's own HPP", async () => {
    await pg.exec(`INSERT INTO pos_products (id,"storeId",name,sku,"categoryId",stock,price,"costPrice","isActive",unit)
      VALUES ('single','store-1','Penghapus','SINGLE','cat-2',3,5000,1250,true,'pcs')`);
    expect((await stats()).inventoryValue).toBe(26_750);
  });

  it("uses the same HPP valuation for the current monthly balance", async () => {
    const now = new Date("2026-11-02T12:00:00+07:00");
    const balance = await getMonthlyBalances("store-1", buildMonthlyPeriod(2026, 11, now), now);
    expect(balance).toMatchObject({ inventoryBalance: 23_000, inventoryUnvaluedCount: 0 });
  });

  it("captures a separate HPP baseline while retaining the selling-price history", async () => {
    expect(await recorded()).toEqual({ value: 23_000, unvalued: 0 });
    const legacy = await pg.query<{ value: string }>(`SELECT value::text FROM pos_inventory_valuation_baselines WHERE "storeId" = 'store-1' AND method = 'selling_price'`);
    expect(Number(legacy.rows[0].value)).toBe(95_000);
  });

  it("records shared stock changes once and ignores replicated member-stock updates", async () => {
    await pg.exec(`UPDATE pos_product_stock_groups SET "baseStock" = 35; UPDATE pos_products SET stock = stock + 10`);
    expect(await recorded()).toEqual({ value: 32_000, unvalued: 0 });
    const changes = await pg.query(`SELECT delta::text FROM pos_inventory_valuation_changes WHERE method = 'unit_hpp'`);
    expect(changes.rows).toEqual([{ delta: "9000.00000000000000000000" }]);
  });

  it("records HPP changes but not selling-price changes", async () => {
    await pg.exec(`UPDATE pos_products SET price = 1; UPDATE pos_products SET "costPrice" = 8000 WHERE id = 'dus'`);
    expect(await recorded()).toEqual({ value: 21_000, unvalued: 0 });
  });

  it("tracks an incomplete group becoming fully valued", async () => {
    await pg.exec(`UPDATE pos_products SET "costPrice" = NULL`);
    expect(await recorded()).toEqual({ value: 0, unvalued: 1 });
    await pg.exec(`UPDATE pos_products SET "costPrice" = 1000 WHERE id = 'pcs'`);
    expect(await recorded()).toEqual({ value: 25_000, unvalued: 0 });
  });

  it("decomposes three sizes and derives missing HPP from the smallest size", async () => {
    await pg.exec(`UPDATE pos_product_stock_groups SET "baseStock" = 105;
      INSERT INTO pos_products (id,"storeId",name,sku,"categoryId",stock,price,"costPrice","isActive",unit,"stockGroupId","unitMultiplierToBase")
      VALUES ('ball','store-1','Pensil','P-BALL','cat-1',1.05,200000,80000,true,'ball','group-1',100)`);
    expect((await stats()).inventoryValue).toBe(85_000);
    await pg.exec(`UPDATE pos_products SET "costPrice" = NULL WHERE id = 'ball'`);
    expect((await stats()).inventoryValue).toBe(105_000);
  });

  it("counts equivalent unit aliases once", async () => {
    await pg.exec(`INSERT INTO pos_products (id,"storeId",name,sku,"categoryId",stock,price,"costPrice","isActive",unit,"stockGroupId","unitMultiplierToBase")
      VALUES ('alias','store-1','Pensil','P-ALIAS','cat-1',2.5,20000,NULL,true,'box','group-1',10)`);
    expect((await stats()).inventoryValue).toBe(23_000);
    expect(await recorded()).toEqual({ value: 23_000, unvalued: 0 });
  });

  async function addPaperDuplicates() {
    await pg.exec(`INSERT INTO pos_products (id,"storeId",name,sku,"categoryId",stock,price,"costPrice","isActive",unit) VALUES
      ('paper-original','store-1','Kertas-14','K-14','cat-1',10,2000,1000,true,'pcs');
      INSERT INTO pos_products (id,"storeId",name,sku,"categoryId",stock,price,"costPrice","isActive",unit) VALUES
      ('paper-new','store-1','  kertas-14-NEW-new  ','K-14-NEW','cat-2',10,2000,1000,true,'pcs');`);
  }

  it("counts equal normalized names and repeated NEW name suffixes once across product IDs", async () => {
    await addPaperDuplicates();
    expect((await stats()).inventoryValue).toBe(33_000);
    expect(await recorded()).toEqual({ value: 33_000, unvalued: 0 });
  });

  it("resolves a searched or categorized duplicate to the same whole family", async () => {
    await addPaperDuplicates();
    expect(await stats('?search=K-14-NEW')).toMatchObject({ totalProducts: 1, inventoryValue: 10_000 });
    expect(await stats('?categoryId=cat-1')).toMatchObject({ totalProducts: 3, inventoryValue: 33_000 });
    expect(await stats('?categoryId=cat-2')).toMatchObject({ totalProducts: 1, inventoryValue: 10_000 });
  });

  it("preserves zero after the selected duplicate sells out instead of reviving old stock", async () => {
    await addPaperDuplicates();
    await pg.exec(`UPDATE pos_products SET stock=0 WHERE id='paper-new'`);
    expect((await stats()).inventoryValue).toBe(23_000);
    expect(await recorded()).toEqual({ value: 23_000, unvalued: 0 });
    await pg.exec(`UPDATE pos_products SET "costPrice"=5000, "updatedAt"=now() WHERE id='paper-original'`);
    expect((await stats()).inventoryValue).toBe(23_000);
  });

  it("automatically follows a later real stock change with that source's own HPP", async () => {
    await addPaperDuplicates();
    await pg.exec(`UPDATE pos_products SET stock=4,"costPrice"=1500 WHERE id='paper-original'`);
    expect((await stats()).inventoryValue).toBe(29_000);
    expect(await recorded()).toEqual({ value: 29_000, unvalued: 0 });
    await pg.exec(`UPDATE pos_products SET price=9000,"costPrice"=7000 WHERE id='paper-new'`);
    expect((await stats()).inventoryValue).toBe(29_000);
  });

  it("reads pending stock sources inside a transaction and rolls back all derived state", async () => {
    await addPaperDuplicates();
    await pg.exec("BEGIN");
    try {
      await pg.exec(`UPDATE pos_products SET stock=4,"costPrice"=1500 WHERE id='paper-original'`);
      expect((await stats()).inventoryValue).toBe(29_000);
      await pg.exec(`UPDATE pos_products SET stock=0 WHERE id='paper-original'`);
      expect((await stats()).inventoryValue).toBe(23_000);
    } finally {
      await pg.exec("ROLLBACK");
    }
    expect((await stats()).inventoryValue).toBe(33_000);
    expect(await recorded()).toEqual({ value: 33_000, unvalued: 0 });
    const queue = await pg.query<{ count: number }>("SELECT count(*)::int AS count FROM pos_inventory_cost_refresh_queue");
    expect(queue.rows[0].count).toBe(0);
  });

  it("revalues both old and new name families on rename", async () => {
    await addPaperDuplicates();
    await pg.exec(`UPDATE pos_products SET name='Kertas-15' WHERE id='paper-new'`);
    expect((await stats()).inventoryValue).toBe(43_000);
    expect(await recorded()).toEqual({ value: 43_000, unvalued: 0 });
    await pg.exec(`UPDATE pos_products SET name='Kertas-14-new' WHERE id='paper-new'`);
    expect((await stats()).inventoryValue).toBe(33_000);
    expect(await recorded()).toEqual({ value: 33_000, unvalued: 0 });
  });

  it("automatically falls back when the selected duplicate is disabled or deleted", async () => {
    await addPaperDuplicates();
    await pg.exec(`UPDATE pos_products SET "isActive"=false WHERE id='paper-new'`);
    expect((await stats()).inventoryValue).toBe(33_000);
    expect(await recorded()).toEqual({ value: 33_000, unvalued: 0 });
    await pg.exec(`DELETE FROM pos_products WHERE id='paper-original'`);
    expect((await stats()).inventoryValue).toBe(23_000);
    expect(await recorded()).toEqual({ value: 23_000, unvalued: 0 });
  });

  it("keeps different sizes and different products with NEW SKUs separate", async () => {
    await pg.exec(`INSERT INTO pos_products (id,"storeId",name,sku,"categoryId",stock,price,"costPrice","isActive",unit) VALUES
      ('thermal-57','store-1','Thermal 57 x 48','THERMAL','cat-1',2,2000,1000,true,'roll'),
      ('thermal-58','store-1','Thermal 58 x 48','THERMAL-NEW','cat-1',3,2000,1000,true,'roll');`);
    expect((await stats()).inventoryValue).toBe(28_000);
  });

  it("never merges equal names between stores", async () => {
    await addPaperDuplicates();
    await pg.exec(`INSERT INTO pos_products (id,"storeId",name,sku,"categoryId",stock,price,"costPrice","isActive",unit)
      VALUES ('other-paper','store-2','Kertas-14','K-14','cat-1',20,2000,1000,true,'pcs')`);
    expect((await stats()).inventoryValue).toBe(33_000);
    expect(await recorded()).toEqual({ value: 33_000, unvalued: 0 });
  });

  async function addDuplicatePencilGroup() {
    await pg.exec(`INSERT INTO pos_product_stock_groups (id,"storeId","baseUnit","baseStock") VALUES ('group-copy','store-1','pcs',25);
      INSERT INTO pos_products (id,"storeId",name,sku,"categoryId",stock,price,"costPrice","isActive",unit,"stockGroupId","unitMultiplierToBase") VALUES
      ('copy-pcs','store-1','Pensil-new','COPY-PCS','cat-1',25,4000,2000,true,'pcs','group-copy',1),
      ('copy-dus','store-1','Pensil-new','COPY-DUS','cat-1',2.5,36000,18000,true,'dus','group-copy',10);`);
  }

  it("deduplicates separate shared pools while preserving each unit's own HPP", async () => {
    await addDuplicatePencilGroup();
    expect((await stats()).inventoryValue).toBe(46_000);
    expect((await stats('?search=P-DUS')).inventoryValue).toBe(46_000);
    expect(await recorded()).toEqual({ value: 46_000, unvalued: 0 });
    await pg.exec(`UPDATE pos_products SET "costPrice"=NULL WHERE id='copy-dus'`);
    expect((await stats()).inventoryValue).toBe(50_000);
    await pg.exec(`UPDATE pos_products SET stock=999 WHERE "stockGroupId"='group-1'`);
    expect((await stats()).inventoryValue).toBe(50_000);
  });

  it("keeps a depleted shared source selected until another real stock change", async () => {
    await addDuplicatePencilGroup();
    await pg.exec(`UPDATE pos_product_stock_groups SET "baseStock"=0 WHERE id='group-copy'`);
    expect((await stats()).inventoryValue).toBe(0);
    expect(await recorded()).toEqual({ value: 0, unvalued: 0 });
    await pg.exec(`UPDATE pos_product_stock_groups SET "baseStock"=35 WHERE id='group-1'`);
    expect((await stats()).inventoryValue).toBe(32_000);
    expect(await recorded()).toEqual({ value: 32_000, unvalued: 0 });
  });

  it("reports missing HPP once without borrowing prices from an older duplicate", async () => {
    await addDuplicatePencilGroup();
    await pg.exec(`UPDATE pos_products SET "costPrice"=NULL WHERE "stockGroupId"='group-copy'`);
    expect(await stats()).toMatchObject({ inventoryValue: 0, inventoryUnvaluedCount: 1 });
    expect(await recorded()).toEqual({ value: 0, unvalued: 1 });
  });

  it("does not merge names that normalize to an empty string", async () => {
    await pg.exec(`INSERT INTO pos_products (id,"storeId",name,sku,"categoryId",stock,price,"costPrice","isActive",unit) VALUES
      ('empty-a','store-1','-new','EMPTY-A','cat-1',1,2000,1000,true,'pcs'),
      ('empty-b','store-1','-NEW','EMPTY-B','cat-1',1,2000,1000,true,'pcs');`);
    expect((await stats()).inventoryValue).toBe(25_000);
  });

  it("reconciles existing duplicate stock automatically when the migration runs", async () => {
    await resetDatabase(false);
    await addPaperDuplicates();
    expect((await stats()).inventoryValue).toBe(43_000);
    if (existsSync(nameMigration)) await pg.exec(readFileSync(nameMigration, 'utf8'));
    expect((await stats()).inventoryValue).toBe(33_000);
    expect(await recorded()).toEqual({ value: 33_000, unvalued: 0 });
  });

  it("initializes HPP history for newly created stores", async () => {
    await pg.exec(`INSERT INTO pos_stores VALUES ('new-store');
      INSERT INTO pos_products (id,"storeId",name,sku,"categoryId",stock,price,"costPrice","isActive",unit)
      VALUES ('new-product','new-store','Produk','NEW','cat-1',2,5000,1250,true,'pcs')`);
    const result = await pg.query<{ value: string }>(`SELECT (b.value + COALESCE(SUM(c.delta),0))::text AS value
      FROM pos_inventory_valuation_baselines b LEFT JOIN pos_inventory_valuation_changes c
      ON c."storeId" = b."storeId" AND c.method = b.method
      WHERE b."storeId" = 'new-store' AND b.method = 'unit_hpp' GROUP BY b.value`);
    expect(Number(result.rows[0].value)).toBe(2500);
  });

  it("records both stores when a standalone product moves stores", async () => {
    await pg.exec(`INSERT INTO pos_products (id,"storeId",name,sku,"categoryId",stock,price,"costPrice","isActive",unit)
      VALUES ('moving','store-2','Produk','MOVING','cat-1',2,5000,250,true,'pcs');
      UPDATE pos_products SET "storeId" = 'store-1' WHERE id = 'moving'`);
    expect(await recorded()).toEqual({ value: 23_500, unvalued: 0 });
    const result = await pg.query<{ value: string }>(`SELECT COALESCE(SUM(delta),0)::text AS value
      FROM pos_inventory_valuation_changes WHERE "storeId" = 'store-2' AND method = 'unit_hpp'`);
    expect(Number(result.rows[0].value)).toBe(0);
  });

  it("revalues a group after member deletion and removes an empty pool", async () => {
    await pg.exec(`DELETE FROM pos_products WHERE id = 'dus'`);
    expect(await recorded()).toEqual({ value: 25_000, unvalued: 0 });
    await pg.exec(`DELETE FROM pos_products; DELETE FROM pos_product_stock_groups`);
    expect(await recorded()).toEqual({ value: 0, unvalued: 0 });
  });

  it("keeps historical month boundaries in WIB and excludes legacy prices", async () => {
    await pg.exec(`INSERT INTO pos_inventory_valuation_v2_closures VALUES
      ('2026-09-30T17:00:00Z', clock_timestamp()), ('2026-10-31T17:00:00Z', clock_timestamp()), ('2026-11-30T17:00:00Z', clock_timestamp());
      UPDATE pos_inventory_valuation_baselines SET "capturedAt" = '2026-09-30T17:00:00Z' WHERE method = 'unit_hpp';
      UPDATE pos_product_stock_groups SET "baseStock" = 35`);
    // Each historical balance is a committed stock event. Deferred journals are
    // backdated only after that event has committed.
    await pg.exec(`UPDATE pos_inventory_valuation_changes SET "occurredAt" = '2026-10-15T00:00:00Z' WHERE method = 'unit_hpp';
      UPDATE pos_product_stock_groups SET "baseStock" = 45`);
    await pg.exec(`UPDATE pos_inventory_valuation_changes SET "occurredAt" = '2026-10-31T17:00:00Z'
        WHERE id = (SELECT max(id) FROM pos_inventory_valuation_changes WHERE method = 'unit_hpp')`);
    const now = new Date("2026-12-02T12:00:00+07:00");
    expect(await getMonthlyBalances("store-1", buildMonthlyPeriod(2026, 10, now), now))
      .toMatchObject({ openingInventoryBalance: 23_000, inventoryBalance: 32_000, inventoryUnvaluedCount: 0 });
    expect(await getMonthlyBalances("store-1", buildMonthlyPeriod(2026, 11, now), now))
      .toMatchObject({ openingInventoryBalance: 32_000, inventoryBalance: 41_000, inventoryUnvaluedCount: 0 });
  });

  it("does not substitute selling-price history for missing HPP history", async () => {
    const now = new Date("2026-12-02T12:00:00+07:00");
    expect(await getMonthlyBalances("store-1", buildMonthlyPeriod(2026, 9, now), now))
      .toMatchObject({ openingInventoryBalance: null, inventoryBalance: null });
  });

  it("keeps historical HPP unknown when the month-close barrier was missed", async () => {
    await pg.exec(`UPDATE pos_inventory_valuation_baselines SET "capturedAt" = '2026-09-01' WHERE method = 'unit_hpp'`);
    const now = new Date("2026-12-02T12:00:00+07:00");
    expect(await getMonthlyBalances("store-1", buildMonthlyPeriod(2026, 10, now), now))
      .toMatchObject({ openingInventoryBalance: null, inventoryBalance: null });
  });

  it("preserves the existing price ledger during the application rollout", async () => {
    const result = await pg.query<{ present: boolean }>(`SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'pos_products_inventory_valuation') AS present`);
    expect(result.rows[0].present).toBe(true);
  });

  it("keeps HPP valuation tables and entry points private despite Supabase default grants", async () => {
    for (const role of ["anon", "authenticated", "service_role"]) {
      const result = await pg.query<{ table_access: boolean; function_access: boolean; rls: boolean }>(`
        SELECT has_table_privilege($1, 'pos_inventory_cost_entity_values', 'SELECT') AS table_access,
          has_function_privilege($1, 'pos_inventory_cost_entities(text,text[])', 'EXECUTE') AS function_access,
          (SELECT relrowsecurity FROM pg_class WHERE oid = 'pos_inventory_cost_entity_values'::regclass) AS rls`, [role]);
      expect(result.rows[0]).toEqual({ table_access: false, function_access: false, rls: true });
    }
  });

  it("revalues one product without scanning the whole catalog", async () => {
    await pg.exec(`ALTER TABLE pos_products DISABLE TRIGGER USER;
      CREATE INDEX products_store_active ON pos_products ("storeId", "isActive");
      CREATE INDEX products_stock_group ON pos_products ("stockGroupId");
      INSERT INTO pos_products (id,"storeId",name,sku,"categoryId",stock,price,"costPrice","isActive",unit)
      SELECT 'perf-' || i, 'store-1', 'Produk ' || i, 'PERF-' || i, 'cat-1', 1, 2, 1, true, 'pcs'
      FROM generate_series(1, 2000) i;
      ALTER TABLE pos_products ENABLE TRIGGER USER; ANALYZE pos_products;`);
    type Plan = { "Relation Name"?: string; "Actual Rows"?: number; "Rows Removed by Filter"?: number; Plans?: Plan[] };
    const result = await pg.query<{ "QUERY PLAN": { Plan: Plan }[] }>(`
      EXPLAIN (ANALYZE, FORMAT JSON) SELECT * FROM pos_inventory_cost_entities('store-1', ARRAY['product:perf-1'])
    `);
    const pending = [result.rows[0]["QUERY PLAN"][0].Plan];
    let scanned = 0;
    while (pending.length) {
      const plan = pending.pop()!;
      if (plan["Relation Name"] === "pos_products") scanned += (plan["Actual Rows"] ?? 0) + (plan["Rows Removed by Filter"] ?? 0);
      pending.push(...(plan.Plans ?? []));
    }
    expect(scanned).toBeGreaterThan(0);
    expect(scanned).toBeLessThanOrEqual(4);
  });
});
