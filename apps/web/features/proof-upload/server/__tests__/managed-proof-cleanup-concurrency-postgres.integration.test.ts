import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@pos/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const connection = process.env.PROOF_CLEANUP_TEST_DATABASE_URL;
const schema = `proof_cleanup_${randomUUID().replaceAll("-", "")}`;
const migrationPath = path.resolve(process.cwd(), "../../packages/db/prisma/migrations/20261117060000_managed_proof_registry_disabled/migration.sql");

function signal() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

describe.skipIf(!connection)("managed proof reference races on isolated PostgreSQL", () => {
  let admin: PrismaClient;
  let db: PrismaClient;

  beforeAll(async () => {
    const url = new URL(connection!);
    if (url.hostname !== "127.0.0.1" || url.port !== "57432" || url.pathname !== "/postgres" ||
        url.username !== "proof_test" || url.searchParams.has("schema")) {
      throw new Error("A dedicated local proof-cleanup test database is required.");
    }
    admin = new PrismaClient({ datasourceUrl: connection });
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    url.searchParams.set("schema", schema);
    db = new PrismaClient({ datasourceUrl: url.toString() });
    await db.$executeRawUnsafe('CREATE TABLE "pos_stores" ("id" TEXT PRIMARY KEY)');
    await db.$executeRawUnsafe('INSERT INTO "pos_stores" VALUES (\'store-1\')');
    const statements = readFileSync(migrationPath, "utf8").split("-- statement-break").map(part => part.trim()).filter(part => part && part !== "BEGIN;" && part !== "COMMIT;");
    await db.$transaction(async tx => {
      for (const statement of statements) await tx.$executeRawUnsafe(statement);
    });
  }, 30_000);
  beforeEach(async () => {
    await db.$executeRawUnsafe('TRUNCATE "pos_managed_proof_references", "pos_managed_proof_objects"');
    await db.$executeRawUnsafe(`INSERT INTO "pos_managed_proof_objects" ("id", "storeId", "accountId", "bucket", "objectKey", "state")
      VALUES ('proof-1', 'store-1', 'account-1', 'private-proofs', 'managed-proofs/v1/0123456789abcdef0123456789abcdef.webp', 'active')`);
  });
  afterAll(async () => {
    await db?.$disconnect();
    if (admin) await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin?.$disconnect();
  });

  const waitForLock = async (application: string) => {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const rows = await admin.$queryRaw<{ waiting: boolean }[]>`
        SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE application_name = ${application} AND wait_event_type = 'Lock') AS waiting
      `;
      if (rows[0]?.waiting) return;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    throw new Error(`Expected ${application} to wait on a database lock`);
  };

  it("observes a reference committed while deletion waits for its lock", async () => {
    const inserted = signal(), release = signal(), started = signal();
    const writer = db.$transaction(async tx => {
      await tx.$executeRaw`INSERT INTO "pos_managed_proof_references" ("objectId", "sourceType", "sourceId", "slot") VALUES ('proof-1', 'expense', 'expense-1', 'attachment')`;
      inserted.resolve();
      await release.promise;
    }, { timeout: 10_000 });
    await inserted.promise;
    const deleting = db.$transaction(async tx => {
      await tx.$executeRaw`SET LOCAL application_name = 'proof_gc_waiting'`;
      started.resolve();
      await tx.$executeRaw`UPDATE "pos_managed_proof_objects" SET "state" = 'deleting' WHERE "id" = 'proof-1'`;
    }, { timeout: 10_000 }).then(() => null, (error: unknown) => error);
    await started.promise;
    try { await waitForLock("proof_gc_waiting"); } finally { release.resolve(); }
    await writer;
    expect(String(await deleting)).toContain("Managed proof still has references");
    const rows = await db.$queryRaw<{ state: string }[]>`SELECT "state" FROM "pos_managed_proof_objects" WHERE "id" = 'proof-1'`;
    expect(rows[0].state).toBe("active");
  }, 20_000);

  it("rejects a new reference that waited for a deletion tombstone", async () => {
    const marked = signal(), release = signal(), started = signal();
    const deleting = db.$transaction(async tx => {
      await tx.$executeRaw`UPDATE "pos_managed_proof_objects" SET "state" = 'deleting' WHERE "id" = 'proof-1'`;
      marked.resolve();
      await release.promise;
    }, { timeout: 10_000 });
    await marked.promise;
    const writer = db.$transaction(async tx => {
      await tx.$executeRaw`SET LOCAL application_name = 'proof_writer_waiting'`;
      started.resolve();
      await tx.$executeRaw`INSERT INTO "pos_managed_proof_references" ("objectId", "sourceType", "sourceId", "slot") VALUES ('proof-1', 'expense', 'expense-1', 'attachment')`;
    }, { timeout: 10_000 }).then(() => null, (error: unknown) => error);
    await started.promise;
    try { await waitForLock("proof_writer_waiting"); } finally { release.resolve(); }
    await deleting;
    expect(String(await writer)).toContain("Managed proof is not active");
    const rows = await db.$queryRaw<{ count: bigint }[]>`SELECT count(*) AS count FROM "pos_managed_proof_references"`;
    expect(rows[0].count).toBe(0n);
  }, 20_000);

  it("requires read committed isolation before marking an object for deletion", async () => {
    await expect(db.$transaction(async tx => {
      await tx.$executeRaw`UPDATE "pos_managed_proof_objects" SET "state" = 'deleting' WHERE "id" = 'proof-1'`;
    }, { isolationLevel: "RepeatableRead" })).rejects.toThrow("Managed proof deletion requires read committed isolation");
  });
});
