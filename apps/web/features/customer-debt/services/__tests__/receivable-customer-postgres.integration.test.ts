import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@pos/db";
import { correctReceivable } from "../manual-receivable-correction";
import { payReceivable } from "../../helpers/manual-receivables";

const connection = process.env.GIRO_TEST_DATABASE_URL;
const schema = `receivable_customer_${randomUUID().replaceAll("-", "")}`;
const actor = { id: "owner", storeId: "store-1" };

describe.skipIf(!connection)("koreksi pelanggan piutang pada PostgreSQL terisolasi", () => {
  let admin: PrismaClient;
  let client: PrismaClient;
  beforeAll(async () => {
    const url = new URL(connection!);
    if (url.hostname !== "127.0.0.1" || !["55443", "15443"].includes(url.port) || url.pathname !== "/postgres" || url.searchParams.has("schema")) throw new Error("Gunakan database uji terisolasi.");
    admin = new PrismaClient({ datasourceUrl: connection });
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    url.searchParams.set("schema", schema);
    client = new PrismaClient({ datasourceUrl: url.toString() });
    for (const sql of [
      `CREATE TYPE "ManualReceiptReportCategory" AS ENUM ('CETAK', 'PLAT', 'STEMPEL', 'SPANDUK', 'ATK', 'PRINT')`,
      `CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'TRANSFER', 'QRIS', 'DEBIT', 'CREDIT', 'TEMPO')`,
      `CREATE TABLE "pos_customers" ("id" text PRIMARY KEY, "storeId" text NOT NULL, "name" text NOT NULL, "totalDebt" numeric(12,2) NOT NULL, "updatedAt" timestamp NOT NULL DEFAULT now())`,
      `CREATE TABLE "pos_customer_receivables" ("id" text PRIMARY KEY, "storeId" text NOT NULL, "customerId" text NOT NULL REFERENCES "pos_customers"("id"), "amount" numeric(12,2) NOT NULL, "amountPaid" numeric(12,2) NOT NULL DEFAULT 0, "debtDate" date NOT NULL, "dueDate" date NOT NULL, "reportCategory" "ManualReceiptReportCategory", "note" text, "createdById" text NOT NULL, "clientMutationId" text UNIQUE NOT NULL, "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now())`,
      `CREATE TABLE "pos_customer_receivable_payments" ("id" text PRIMARY KEY, "receivableId" text NOT NULL REFERENCES "pos_customer_receivables"("id"), "amount" numeric(12,2) NOT NULL, "method" "PaymentMethod" NOT NULL, "note" text, "createdById" text NOT NULL, "clientMutationId" text UNIQUE NOT NULL, "createdAt" timestamp NOT NULL DEFAULT now(), "paidAt" date)`,
    ]) await client.$executeRawUnsafe(sql);
  }, 30_000);
  afterAll(async () => {
    await client?.$disconnect();
    if (admin) await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin?.$disconnect();
  }, 30_000);

  it("memindahkan saldo tanpa kehilangan pembayaran saat koreksi dan pembayaran bersamaan", async () => {
    await client.$executeRaw`INSERT INTO "pos_customers" ("id", "storeId", "name", "totalDebt") VALUES ('customer-a','store-1','A',1000), ('customer-b','store-1','B',0)`;
    await client.$executeRaw`INSERT INTO "pos_customer_receivables" ("id","storeId","customerId","amount","debtDate","dueDate","reportCategory","createdById","clientMutationId") VALUES ('debt','store-1','customer-a',1000,'2026-10-01','2026-11-01','ATK','owner','create-key')`;
    const initial = await client.customerReceivable.findUniqueOrThrow({ where: { id: "debt" }, select: { updatedAt: true } });
    const results = await Promise.allSettled([
      client.$transaction(tx => correctReceivable(tx, "debt", { customerId: "customer-b", amount: 1200, debtDate: "2026-10-01", dueDate: "2026-11-01", reportCategory: "ATK", expectedUpdatedAt: initial.updatedAt.toISOString() }, actor, async () => {})),
      client.$transaction(tx => payReceivable(tx, "debt", { amount: 400, method: "CASH", clientMutationId: randomUUID() }, actor)),
    ]);
    if (results[0].status === "rejected") expect(results[0].reason).toMatchObject({ status: 409 });
    if (results[1].status === "rejected") expect(results[1].reason).toMatchObject({ status: 409 });
    const rows = await client.$queryRaw<Array<{ id: string; totalDebt: string }>>`SELECT "id", "totalDebt"::text FROM "pos_customers" ORDER BY "id"`;
    const [debt] = await client.$queryRaw<Array<{ customerId: string; amount: string; amountPaid: string }>>`SELECT "customerId", "amount"::text, "amountPaid"::text FROM "pos_customer_receivables" WHERE "id" = 'debt'`;
    expect(debt.customerId).toBe(results[0].status === "fulfilled" ? "customer-b" : "customer-a");
    expect(Number(rows[0].totalDebt)).toBe(debt.customerId === "customer-a" ? Number(debt.amount) - Number(debt.amountPaid) : 0);
    expect(Number(rows[1].totalDebt)).toBe(debt.customerId === "customer-b" ? Number(debt.amount) - Number(debt.amountPaid) : 0);
    expect(Number(debt.amountPaid)).toBe(results[1].status === "fulfilled" ? 400 : 0);
  }, 30_000);
});
