import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@pos/db";
import { describe, expect, it } from "vitest";

const url = process.env.FINANCE_GIRO_TEST_DATABASE_URL;
describe.skipIf(!url)("isolated PostgreSQL giro migration", () => {
  it("preserves legacy debts, enforces links and dates, and serializes concurrent payments", async () => {
    const scoped = new URL(url!);
    if (scoped.hostname !== "127.0.0.1" || scoped.port !== "55443" || scoped.pathname !== "/postgres") {
      throw new Error("Giro migration tests require the dedicated isolated PostgreSQL instance.");
    }
    const schema = `giro_test_${randomUUID().replaceAll("-", "")}`;
    const base = new PrismaClient({ datasources: { db: { url } } });
    await base.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    scoped.searchParams.set("schema", schema);
    const db = new PrismaClient({ datasources: { db: { url: scoped.toString() } } });
    try {
      await db.$executeRawUnsafe('CREATE TABLE "pos_goods_purchases" ("id" TEXT PRIMARY KEY)');
      await db.$executeRawUnsafe('CREATE TABLE "pos_supplier_payables" ("id" TEXT PRIMARY KEY, "storeId" TEXT NOT NULL, "amount" NUMERIC(12,2) NOT NULL, "debtDate" DATE NOT NULL, "dueDate" DATE, CONSTRAINT "pos_supplier_payables_due_date_check" CHECK ("dueDate" IS NULL OR "dueDate" >= "debtDate"))');
      await db.$executeRawUnsafe('CREATE TABLE "pos_supplier_payable_payments" ("id" TEXT PRIMARY KEY, "payableId" TEXT NOT NULL REFERENCES "pos_supplier_payables"("id"), "amount" NUMERIC(12,2) NOT NULL)');
      await db.$executeRawUnsafe(`INSERT INTO "pos_supplier_payables" VALUES ('old', 'store', 100, '2026-10-01', NULL)`);
      await db.$executeRawUnsafe(`INSERT INTO "pos_supplier_payable_payments" VALUES ('old-payment', 'old', 25)`);
      await db.$executeRawUnsafe(`INSERT INTO "pos_goods_purchases" VALUES ('purchase')`);
      const migration = readFileSync(path.resolve(process.cwd(), "../../packages/db/prisma/migrations/20261101110000_link_giro_payables/migration.sql"), "utf8");
      for (const statement of migration.replace(/^--.*$/gm, "").split(";").map(part => part.trim()).filter(Boolean)) await db.$executeRawUnsafe(statement);
      const old = await db.$queryRawUnsafe<{ goodsPurchaseId: string | null; giroHistoryVerifiedAt: Date | null }[]>(`SELECT "goodsPurchaseId", "giroHistoryVerifiedAt" FROM "pos_supplier_payables" WHERE "id" = 'old'`);
      expect(old).toEqual([{ goodsPurchaseId: null, giroHistoryVerifiedAt: null }]);
      const oldPayment = await db.$queryRawUnsafe<{ requestScope: string | null; amount: string }[]>(`SELECT "requestScope", "amount"::text FROM "pos_supplier_payable_payments" WHERE "id" = 'old-payment'`);
      expect(oldPayment).toEqual([{ requestScope: null, amount: '25.00' }]);
      await db.$executeRawUnsafe(`INSERT INTO "pos_supplier_payables" ("id","storeId","amount","debtDate","dueDate","goodsPurchaseId","giroHistoryVerifiedAt") VALUES ('giro','store',100,'2026-11-01','2026-10-31','purchase',NOW())`);
      await expect(db.$executeRawUnsafe(`INSERT INTO "pos_supplier_payables" ("id","storeId","amount","debtDate","goodsPurchaseId") VALUES ('duplicate','store',100,'2026-11-01','purchase')`)).rejects.toThrow();
      await expect(db.$executeRawUnsafe(`INSERT INTO "pos_supplier_payables" ("id","storeId","amount","debtDate","goodsPurchaseId") VALUES ('missing','store',100,'2026-11-01','no-purchase')`)).rejects.toThrow();
      await expect(db.$executeRawUnsafe(`INSERT INTO "pos_supplier_payables" ("id","storeId","amount","debtDate","dueDate") VALUES ('manual','store',100,'2026-11-01','2026-10-31')`)).rejects.toThrow();
      const pay = (id: string) => db.$transaction(async tx => {
        const [debt] = await tx.$queryRaw<{ amount: string }[]>`SELECT "amount"::text FROM "pos_supplier_payables" WHERE "id" = 'giro' FOR UPDATE`;
        const [total] = await tx.$queryRaw<{ paid: string }[]>`SELECT COALESCE(SUM("amount"),0)::text AS paid FROM "pos_supplier_payable_payments" WHERE "payableId" = 'giro'`;
        if (Math.round(Number(debt.amount) * 100) - Math.round(Number(total.paid) * 100) < 7000) return false;
        await tx.$executeRaw`INSERT INTO "pos_supplier_payable_payments" ("id", "payableId", "amount") VALUES (${id}, 'giro', 70)`;
        return true;
      });
      const results = await Promise.all([pay("payment-a"), pay("payment-b")]);
      expect(results.sort()).toEqual([false, true]);
      const [total] = await db.$queryRaw<{ paid: string }[]>`SELECT SUM("amount")::text AS paid FROM "pos_supplier_payable_payments" WHERE "payableId" = 'giro'`;
      expect(Number(total.paid)).toBe(70);
    } finally {
      await db.$disconnect();
      await base.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
      await base.$disconnect();
    }
  }, 30_000);
});
