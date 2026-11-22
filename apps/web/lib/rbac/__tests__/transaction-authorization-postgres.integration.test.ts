import { randomUUID } from "node:crypto";
import { PrismaClient } from "@pos/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authorizeInTransaction } from "../guard";

const connection = process.env.GIRO_TEST_DATABASE_URL;
const schema = `rbac_tx_${randomUUID().replaceAll("-", "")}`;
describe.skipIf(!connection)("otorisasi dalam transaksi PostgreSQL satu koneksi", () => {
  let admin: PrismaClient;
  let client: PrismaClient;
  let other: PrismaClient;
  beforeAll(async () => {
    const url = new URL(connection!);
    if (url.hostname !== "127.0.0.1" || url.port !== "15443" || url.pathname !== "/postgres" || url.searchParams.has("schema")) throw new Error("Database uji tidak terisolasi.");
    admin = new PrismaClient({ datasourceUrl: connection });
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    url.searchParams.set("schema", schema); url.searchParams.set("connection_limit", "1");
    client = new PrismaClient({ datasourceUrl: url.toString() });
    other = new PrismaClient({ datasourceUrl: url.toString() });
    await client.$executeRawUnsafe(`CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'CASHIER', 'SALES', 'INVENTORY')`);
    await client.$executeRawUnsafe(`CREATE TABLE "pos_users" ("id" TEXT PRIMARY KEY, "storeId" TEXT, "role" "Role" NOT NULL, "isActive" BOOLEAN NOT NULL)`);
    await client.$executeRawUnsafe(`CREATE TABLE "pos_role_permissions" ("id" TEXT PRIMARY KEY, "role" "Role" NOT NULL, "scope" TEXT NOT NULL, "target" TEXT NOT NULL, "action" TEXT NOT NULL, "allowed" BOOLEAN NOT NULL)`);
    await client.$executeRawUnsafe(`INSERT INTO "pos_users" VALUES ('admin', 'store-1', 'ADMIN', true)`);
  }, 30_000);
  afterAll(async () => {
    await client?.$disconnect();
    await other?.$disconnect();
    if (admin) await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin?.$disconnect();
  });
  it("membaca identitas dan izin dalam koneksi yang sudah memegang lock", async () => {
    const actor = { id: "admin", storeId: "store-1", role: "ADMIN" as const };
    const requirements = { resources: [{ resource: "expense.payable", action: "create" as const }], page: "/keuangan" };
    const outcome = await client.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('rbac-test', 0))`;
      const allowed = await authorizeInTransaction(tx, actor, requirements);
      await tx.$executeRaw`INSERT INTO "pos_role_permissions" VALUES ('deny', 'ADMIN', 'resource', 'expense.payable', 'create', false)`;
      const revoked = await authorizeInTransaction(tx, actor, requirements);
      await tx.$executeRaw`UPDATE "pos_users" SET "isActive" = false WHERE "id" = 'admin'`;
      const inactive = await authorizeInTransaction(tx, actor, { resources: [] });
      return { allowed, revoked, inactive };
    }, { isolationLevel: "ReadCommitted", timeout: 5000 });
    expect(outcome).toEqual({ allowed: true, revoked: false, inactive: false });
  }, 15_000);

  it.each(["akun", "izin"])("menyelesaikan tindakan sebelum perubahan %s yang bersamaan", async kind => {
    await client.$executeRaw`UPDATE "pos_users" SET "isActive" = true WHERE "id" = 'admin'`;
    await client.$executeRaw`DELETE FROM "pos_role_permissions"`;
    await client.$executeRaw`INSERT INTO "pos_role_permissions" VALUES ('grant', 'ADMIN', 'resource', 'expense.payable', 'create', true)`;
    const actor = { id: "admin", storeId: "store-1", role: "ADMIN" as const };
    const requirements = { resources: [{ resource: "expense.payable", action: "create" as const }] };
    let release!: () => void, ready!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const authorized = new Promise<void>(resolve => { ready = resolve; });
    let updateCompleted = false;
    const action = client.$transaction(async tx => {
      const allowed = await authorizeInTransaction(tx, actor, requirements);
      ready();
      await gate;
      return allowed;
    }, { isolationLevel: "ReadCommitted", timeout: 5000 });
    await authorized;
    const update = (kind === "akun"
      ? other.$executeRaw`UPDATE "pos_users" SET "isActive" = false WHERE "id" = 'admin'`
      : other.$executeRaw`UPDATE "pos_role_permissions" SET "allowed" = false WHERE "id" = 'grant'`)
      .then(() => { updateCompleted = true; });
    try {
      await new Promise(resolve => setTimeout(resolve, 250));
      expect(updateCompleted).toBe(false);
    } finally {
      release();
      await action;
      await update;
    }
    expect(await client.$transaction(tx => authorizeInTransaction(tx, actor, requirements))).toBe(false);
  }, 15_000);
});
