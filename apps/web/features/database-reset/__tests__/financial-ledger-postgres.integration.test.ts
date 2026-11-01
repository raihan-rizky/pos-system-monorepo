import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@pos/db";
import { createDatabaseResetPlan } from "../helpers/database-reset-plan";

const connection = process.env.FINANCE_INVENTORY_TEST_DATABASE_URL;
const schema = `reset_guard_${randomUUID().replaceAll("-", "")}`;
const mocks = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("@pos/db", async importOriginal => ({ ...(await importOriginal()), get db() { return mocks.db; } }));
vi.mock("@/lib/rbac/guard", () => ({ requireRole: async () => ({ id: "owner", role: "OWNER", storeId: "store-a" }), handleAuthError: () => null }));
vi.mock("@/lib/logger", () => ({ getLogger: () => ({ error: vi.fn() }) }));

import { POST } from "@/app/api/settings/database-reset/execute/route";

describe.skipIf(!connection)("financial ledger reset guard on isolated PostgreSQL", () => {
  let admin: PrismaClient;
  let client: PrismaClient;

  beforeAll(async () => {
    const url = new URL(connection!);
    if (url.hostname !== "127.0.0.1" || url.port !== "55443" || url.pathname !== "/postgres") throw new Error("Test requires the dedicated isolated PostgreSQL instance.");
    admin = new PrismaClient({ datasourceUrl: connection });
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    url.searchParams.set("schema", schema);
    client = new PrismaClient({ datasourceUrl: url.toString() });
    await client.$executeRawUnsafe(`CREATE TYPE "PurchasePaymentMethod" AS ENUM ('TRANSFER', 'GIRO')`);
    await client.$executeRawUnsafe(`CREATE TABLE "pos_shopping_requests" ("id" TEXT PRIMARY KEY, "storeId" TEXT NOT NULL)`);
    await client.$executeRawUnsafe(`CREATE TABLE "pos_goods_purchases" ("id" TEXT PRIMARY KEY, "storeId" TEXT NOT NULL, "shoppingRequestId" TEXT NOT NULL REFERENCES "pos_shopping_requests"("id"), "paymentMethod" "PurchasePaymentMethod")`);
    await client.$executeRawUnsafe(`CREATE TABLE "pos_expenses" ("id" TEXT PRIMARY KEY, "storeId" TEXT NOT NULL, "deletedAt" TIMESTAMP, "goodsPurchaseId" TEXT REFERENCES "pos_goods_purchases"("id"), "shoppingRequestId" TEXT REFERENCES "pos_shopping_requests"("id"), "backdatedPurchaseDueId" TEXT, "backdatedPurchasePaymentId" TEXT)`);
    await client.$executeRawUnsafe(`CREATE TABLE "pos_supplier_payables" ("id" TEXT PRIMARY KEY, "storeId" TEXT NOT NULL, "goodsPurchaseId" TEXT UNIQUE REFERENCES "pos_goods_purchases"("id"))`);
    mocks.db = new Proxy(client, { get(target, key) {
      if (key === "cashierShift" || key === "productImportJob" || key === "batchOperation") return { count: async () => 0 };
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    } });
  }, 30_000);

  beforeEach(async () => {
    await client.$executeRawUnsafe(`TRUNCATE "pos_supplier_payables", "pos_expenses", "pos_goods_purchases", "pos_shopping_requests"`);
  });

  afterAll(async () => {
    mocks.db = null;
    await client?.$disconnect();
    await admin?.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin?.$disconnect();
  }, 30_000);

  it("protects a legacy shopping-request giro without a payable and ignores other stores", async () => {
    await client.$executeRawUnsafe(`INSERT INTO "pos_shopping_requests" VALUES ('r1','store-a'),('r2','store-b')`);
    await client.$executeRawUnsafe(`INSERT INTO "pos_goods_purchases" VALUES ('p2','store-b','r2','GIRO')`);
    await client.$executeRawUnsafe(`INSERT INTO "pos_expenses" ("id","storeId","shoppingRequestId") VALUES ('e2','store-b','r2')`);
    await client.$executeRawUnsafe(`INSERT INTO "pos_supplier_payables" VALUES ('d2','store-b','p2')`);
    expect((await createDatabaseResetPlan({ db: client, storeId: "store-a", models: ["Expense"] })).canExecute).toBe(true);
    await client.$executeRawUnsafe(`INSERT INTO "pos_goods_purchases" VALUES ('p1','store-a','r1','GIRO')`);
    await client.$executeRawUnsafe(`INSERT INTO "pos_expenses" ("id","storeId","shoppingRequestId") VALUES ('e1','store-a','r1')`);
    const unknown = await createDatabaseResetPlan({ db: client, storeId: "store-a", models: ["Expense"] });
    expect(unknown.canExecute).toBe(false);
    expect(unknown.requiredDependencies.some(dependency => /giro/i.test(dependency.reason))).toBe(true);
    await client.$executeRawUnsafe(`INSERT INTO "pos_supplier_payables" VALUES ('d1','store-a','p1')`);
    const blocked = await createDatabaseResetPlan({ db: client, storeId: "store-a", models: ["Expense"] });
    expect(blocked.canExecute).toBe(false);
    expect(blocked.requiredDependencies.some(dependency => /giro/i.test(dependency.reason))).toBe(true);
  });

  it("protects a directly linked giro expense without a payable", async () => {
    await client.$executeRawUnsafe(`INSERT INTO "pos_shopping_requests" VALUES ('r1','store-a')`);
    await client.$executeRawUnsafe(`INSERT INTO "pos_goods_purchases" VALUES ('p1','store-a','r1','GIRO')`);
    await client.$executeRawUnsafe(`INSERT INTO "pos_expenses" ("id","storeId","goodsPurchaseId") VALUES ('e1','store-a','p1')`);
    const plan = await createDatabaseResetPlan({ db: client, storeId: "store-a", models: ["Expense"] });
    expect(plan.canExecute).toBe(false);
    expect(plan.requiredDependencies.some(dependency => /giro/i.test(dependency.reason))).toBe(true);
  });

  it.each(["backdatedPurchaseDueId", "backdatedPurchasePaymentId"])("protects active %s expenses", async column => {
    await client.$executeRawUnsafe(`INSERT INTO "pos_expenses" ("id","storeId","${column}") VALUES ('e1','store-a','historical')`);
    const plan = await createDatabaseResetPlan({ db: client, storeId: "store-a", models: ["Expense"] });
    expect(plan.canExecute).toBe(false);
    expect(plan.requiredDependencies.some(dependency => /belanja terdahulu/i.test(dependency.reason))).toBe(true);
  });

  it("does not block a transfer expense because a different purchase on the same request uses giro", async () => {
    await client.$executeRawUnsafe(`INSERT INTO "pos_shopping_requests" VALUES ('r1','store-a')`);
    await client.$executeRawUnsafe(`INSERT INTO "pos_goods_purchases" VALUES ('p-giro','store-a','r1','GIRO'),('p-transfer','store-a','r1','TRANSFER')`);
    await client.$executeRawUnsafe(`INSERT INTO "pos_expenses" ("id","storeId","goodsPurchaseId","shoppingRequestId") VALUES ('e1','store-a','p-transfer','r1')`);
    await client.$executeRawUnsafe(`INSERT INTO "pos_supplier_payables" VALUES ('d1','store-a','p-giro')`);
    const plan = await createDatabaseResetPlan({ db: client, storeId: "store-a", models: ["Expense"] });
    expect(plan.canExecute).toBe(true);
  });

  it.each([false, true])("waits for a concurrent giro change with payable=%s, then refuses deletion", async withPayable => {
    await client.$executeRawUnsafe(`INSERT INTO "pos_shopping_requests" VALUES ('r1','store-a')`);
    await client.$executeRawUnsafe(`INSERT INTO "pos_goods_purchases" VALUES ('p1','store-a','r1',NULL)`);
    await client.$executeRawUnsafe(`INSERT INTO "pos_expenses" ("id","storeId","goodsPurchaseId") VALUES ('e1','store-a','p1')`);
    let releaseWriter!: () => void;
    let signalLocked!: () => void;
    const release = new Promise<void>(resolve => { releaseWriter = resolve; });
    const locked = new Promise<void>(resolve => { signalLocked = resolve; });
    const writer = client.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "pos_goods_purchases" WHERE "id" = 'p1' FOR UPDATE`;
      signalLocked();
      await release;
      await tx.$executeRaw`UPDATE "pos_goods_purchases" SET "paymentMethod" = 'GIRO' WHERE "id" = 'p1'`;
      if (withPayable) await tx.$executeRaw`INSERT INTO "pos_supplier_payables" VALUES ('d1','store-a','p1')`;
    }, { timeout: 30_000 });
    await locked;
    const response = POST(new Request("http://localhost/api/settings/database-reset/execute", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ models: ["Expense"], confirmation: "RESET DATABASE" }) }));
    try {
      const deadline = Date.now() + 15_000;
      let waiting = false;
      while (!waiting && Date.now() < deadline) {
        const [row] = await admin.$queryRaw<{ waiting: boolean }[]>`
          SELECT EXISTS (SELECT 1 FROM pg_locks l JOIN pg_class c ON c.oid = l.relation JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = ${schema} AND c.relname = 'pos_goods_purchases' AND l.mode = 'ExclusiveLock' AND NOT l.granted) AS waiting`;
        waiting = row.waiting;
        if (!waiting) await new Promise(resolve => setTimeout(resolve, 25));
      }
      expect(waiting).toBe(true);
      releaseWriter();
      await writer;
      const result = await response;
      expect(result.status).toBe(409);
      expect((await result.json()).requiredDependencies.some((dependency: { reason: string }) => /giro/i.test(dependency.reason))).toBe(true);
      expect(await client.expense.count({ where: { storeId: "store-a" } })).toBe(1);
      expect(await client.supplierPayable.count({ where: { storeId: "store-a" } })).toBe(withPayable ? 1 : 0);
    } finally {
      releaseWriter();
      await writer.catch(() => undefined);
      await response.catch(() => undefined);
    }
  }, 45_000);

  it("rolls back with a clear conflict when another purchase lock lasts too long", async () => {
    await client.$executeRawUnsafe(`INSERT INTO "pos_shopping_requests" VALUES ('r1','store-a')`);
    await client.$executeRawUnsafe(`INSERT INTO "pos_goods_purchases" VALUES ('p1','store-a','r1','TRANSFER')`);
    await client.$executeRawUnsafe(`INSERT INTO "pos_expenses" ("id","storeId","goodsPurchaseId") VALUES ('e1','store-a','p1')`);
    let releaseWriter!: () => void;
    let signalLocked!: () => void;
    const release = new Promise<void>(resolve => { releaseWriter = resolve; });
    const locked = new Promise<void>(resolve => { signalLocked = resolve; });
    const writer = client.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "pos_goods_purchases" WHERE "id" = 'p1' FOR UPDATE`;
      signalLocked();
      await release;
    }, { timeout: 30_000 });
    await locked;
    try {
      const result = await POST(new Request("http://localhost/api/settings/database-reset/execute", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ models: ["Expense"], confirmation: "RESET DATABASE" }) }));
      expect(result.status).toBe(409);
      expect((await result.json()).message).toMatch(/sedang digunakan/i);
      expect(await client.expense.count({ where: { storeId: "store-a" } })).toBe(1);
    } finally {
      releaseWriter();
      await writer.catch(() => undefined);
    }
  }, 20_000);
});
