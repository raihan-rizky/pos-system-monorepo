import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@pos/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const connection = process.env.PROOF_CLEANUP_TEST_DATABASE_URL;
const schema = `proof_acl_${randomUUID().replaceAll("-", "")}`;
const migrationPath = path.resolve(process.cwd(), "../../packages/db/prisma/migrations/20261117060000_managed_proof_registry_disabled/migration.sql");
const tables = ["pos_managed_proof_cleanup_control", "pos_managed_proof_objects", "pos_managed_proof_references"] as const;
const clientRoles = ["anon", "authenticated", "service_role"] as const;
const privileges = ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"] as const;

describe.skipIf(!connection)("managed proof privileges on isolated PostgreSQL", () => {
  let admin: PrismaClient;
  let db: PrismaClient;
  const createdRoles: string[] = [];

  beforeAll(async () => {
    const url = new URL(connection!);
    if (url.hostname !== "127.0.0.1" || url.port !== "57432" || url.pathname !== "/postgres" ||
        url.username !== "proof_test" || url.searchParams.has("schema")) throw new Error("A dedicated local proof-cleanup test database is required.");
    admin = new PrismaClient({ datasourceUrl: connection });
    const existing = await admin.$queryRaw<{ rolname: string }[]>`SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role', 'proof_app_server')`;
    if (existing.length) throw new Error("The test database must have no pre-existing Supabase or server roles.");
    for (const role of [...clientRoles, "proof_app_server"] as const) {
      await admin.$executeRawUnsafe(`CREATE ROLE "${role}" NOLOGIN ${role === "service_role" || role === "proof_app_server" ? "BYPASSRLS" : "NOBYPASSRLS"}`);
      createdRoles.push(role);
    }
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    await admin.$executeRawUnsafe(`GRANT USAGE ON SCHEMA "${schema}" TO PUBLIC, anon, authenticated, service_role, proof_app_server`);
    await admin.$executeRawUnsafe(`ALTER DEFAULT PRIVILEGES IN SCHEMA "${schema}" GRANT ALL ON TABLES TO PUBLIC, anon, authenticated, service_role, proof_app_server`);
    url.searchParams.set("schema", schema);
    db = new PrismaClient({ datasourceUrl: url.toString() });
    await db.$executeRawUnsafe('CREATE TABLE "pos_stores" ("id" TEXT PRIMARY KEY)');
    await db.$executeRawUnsafe('INSERT INTO "pos_stores" VALUES (\'store-1\')');
    const statements = readFileSync(migrationPath, "utf8").split("-- statement-break").map(part => part.trim()).filter(part => part && part !== "BEGIN;" && part !== "COMMIT;");
    await db.$transaction(async tx => {
      for (const statement of statements) await tx.$executeRawUnsafe(statement);
    });
    await db.$executeRawUnsafe(`INSERT INTO "pos_managed_proof_objects" ("id", "storeId", "accountId", "bucket", "objectKey", "state") VALUES ('proof-1', 'store-1', 'account-1', 'private-proofs', 'managed-proofs/v1/0123456789abcdef0123456789abcdef.webp', 'active')`);
  }, 30_000);

  afterAll(async () => {
    await db?.$disconnect();
    if (admin) {
      await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      for (const role of createdRoles) await admin.$executeRawUnsafe(`DROP ROLE "${role}"`);
      await admin.$disconnect();
    }
  });

  it.each(tables)("enables RLS on %s", async table => {
    const [row] = await db.$queryRaw<{ enabled: boolean }[]>`
      SELECT c.relrowsecurity AS enabled FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = ${schema} AND c.relname = ${table}
    `;
    expect(row?.enabled).toBe(true);
  });

  it.each(clientRoles)("removes inherited public and explicit privileges from %s", async role => {
    for (const table of tables) for (const privilege of privileges) {
      const [row] = await db.$queryRaw<{ allowed: boolean }[]>`
        SELECT has_table_privilege(${role}, format('%I.%I', ${schema}::text, ${table}::text), ${privilege}) AS allowed
      `;
      expect(row.allowed, `${role} ${privilege} ${table}`).toBe(false);
    }
  });

  it.each(clientRoles)("blocks direct reads and writes for %s, including BYPASSRLS service_role", async role => {
    const statements = [
      'SELECT * FROM "pos_managed_proof_cleanup_control"',
      'UPDATE "pos_managed_proof_cleanup_control" SET "enabled" = false',
      'SELECT * FROM "pos_managed_proof_objects"',
      `INSERT INTO "pos_managed_proof_objects" ("id", "storeId", "accountId", "bucket", "objectKey", "state") VALUES ('foreign', 'store-1', 'account-1', 'private-proofs', 'managed-proofs/v1/ffffffffffffffffffffffffffffffff.webp', 'active')`,
      'UPDATE "pos_managed_proof_objects" SET "attempts" = "attempts" + 1',
      'DELETE FROM "pos_managed_proof_objects" WHERE false',
      'SELECT * FROM "pos_managed_proof_references"',
      `INSERT INTO "pos_managed_proof_references" ("objectId", "sourceType", "sourceId", "slot") VALUES ('proof-1', 'expense', 'expense-1', 'attachment')`,
      'UPDATE "pos_managed_proof_references" SET "slot" = \'other\'',
      'DELETE FROM "pos_managed_proof_references" WHERE false',
    ];
    for (const statement of statements) {
      await expect(db.$transaction(async tx => {
        await tx.$executeRawUnsafe(`SET LOCAL ROLE "${role}"`);
        await tx.$executeRawUnsafe(statement);
      })).rejects.toThrow(/permission denied for table/i);
    }
  });

  it("retains access for the owner and a separately granted server role with BYPASSRLS", async () => {
    expect(await db.$executeRawUnsafe('UPDATE "pos_managed_proof_cleanup_control" SET "enabled" = false')).toBe(1);
    await db.$transaction(async tx => {
      await tx.$executeRawUnsafe('SET LOCAL ROLE "proof_app_server"');
      const objects = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "pos_managed_proof_objects"`;
      expect(objects).toEqual([{ id: "proof-1" }]);
      expect(await tx.$executeRaw`UPDATE "pos_managed_proof_objects" SET "attempts" = "attempts" + 1 WHERE "id" = 'proof-1'`).toBe(1);
      expect(await tx.$executeRaw`INSERT INTO "pos_managed_proof_references" ("objectId", "sourceType", "sourceId", "slot") VALUES ('proof-1', 'expense', 'expense-1', 'attachment')`).toBe(1);
      expect(await tx.$executeRaw`UPDATE "pos_managed_proof_cleanup_control" SET "enabled" = false`).toBe(1);
    });
  });
});
