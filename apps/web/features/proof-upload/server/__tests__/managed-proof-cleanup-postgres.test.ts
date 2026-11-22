import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { PrismaClient } from "@pos/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runManagedProofCleanupOnce } from "../managed-proof-cleanup";
import { createManagedProofCleanupStore } from "../managed-proof-cleanup-postgres";

const acceptsPrismaClient = (client: PrismaClient) => createManagedProofCleanupStore(client);
void acceptsPrismaClient;

const modulePath = process.env.PROOF_CLEANUP_PGLITE_MODULE;
const migrationPath = path.resolve(process.cwd(), "../../packages/db/prisma/migrations/20261117060000_managed_proof_registry_disabled/migration.sql");

type EmbeddedDb = {
  exec(sql: string): Promise<unknown>;
  query(sql: string, values?: unknown[]): Promise<{ rows: unknown[]; affectedRows?: number }>;
  close(): Promise<void>;
};

describe.skipIf(!modulePath)("managed proof cleanup with isolated PostgreSQL", () => {
  let db: EmbeddedDb;
  let store: ReturnType<typeof createManagedProofCleanupStore>;

  beforeAll(async () => {
    const { PGlite } = await import(/* @vite-ignore */ pathToFileURL(modulePath!).href);
    db = new PGlite();
    await db.exec('CREATE TABLE "pos_stores" ("id" TEXT PRIMARY KEY); INSERT INTO "pos_stores" VALUES (\'store-1\');');
    await db.exec(readFileSync(migrationPath, "utf8"));
    const query = (parts: TemplateStringsArray) =>
      parts.reduce((sql, part, index) => sql + (index ? `$${index}` : "") + part, "");
    store = createManagedProofCleanupStore({
      async $queryRaw<T>(parts: TemplateStringsArray, ...values: unknown[]) {
        return (await db.query(query(parts), values)).rows as T;
      },
      async $executeRaw(parts: TemplateStringsArray, ...values: unknown[]) {
        return (await db.query(query(parts), values)).affectedRows ?? 0;
      },
    });
  }, 30_000);
  beforeEach(async () => {
    await db.exec('TRUNCATE "pos_managed_proof_references", "pos_managed_proof_objects"; UPDATE "pos_managed_proof_cleanup_control" SET "enabled" = false;');
  });
  afterAll(async () => { await db?.close(); });

  const insertDeleting = () => db.exec(`INSERT INTO "pos_managed_proof_objects"
    ("id", "storeId", "accountId", "bucket", "objectKey", "state")
    VALUES ('proof-1', 'store-1', 'account-1', 'private-proofs', 'managed-proofs/v1/0123456789abcdef0123456789abcdef.webp', 'deleting')`);
  const enableForFutureProtocolTest = async () => {
    await db.exec('ALTER TABLE "pos_managed_proof_cleanup_control" DROP CONSTRAINT IF EXISTS "managed_proof_cleanup_disabled"; UPDATE "pos_managed_proof_cleanup_control" SET "enabled" = true;');
  };
  const state = async () => (await db.query('SELECT "state", "attempts" FROM "pos_managed_proof_objects" WHERE "id" = \'proof-1\'')).rows[0];

  it("enforces disabled cleanup in the database and never claims an object", async () => {
    await insertDeleting();
    let deleted = false;
    expect(await runManagedProofCleanupOnce(store, async () => { deleted = true; })).toBe("idle");
    expect(deleted).toBe(false);
    await expect(db.exec('UPDATE "pos_managed_proof_cleanup_control" SET "enabled" = true')).rejects.toThrow();
    expect(await state()).toMatchObject({ state: "deleting", attempts: 0 });
  });

  it("rejects a legacy key from the managed registry", async () => {
    await expect(db.exec(`INSERT INTO "pos_managed_proof_objects"
      ("id", "storeId", "accountId", "bucket", "objectKey", "state")
      VALUES ('legacy', 'store-1', 'account-1', 'private-proofs', 'expenses/0123456789abcdef.pdf', 'deleting')`)).rejects.toThrow();
  });

  it("preserves tombstones and their identity against later reuse", async () => {
    await insertDeleting();
    await expect(db.exec('UPDATE "pos_managed_proof_objects" SET "state" = \'active\' WHERE "id" = \'proof-1\'')).rejects.toThrow();
    await expect(db.exec('DELETE FROM "pos_managed_proof_objects" WHERE "id" = \'proof-1\'')).rejects.toThrow();
    await expect(db.exec('UPDATE "pos_managed_proof_objects" SET "objectKey" = \'managed-proofs/v1/ffffffffffffffffffffffffffffffff.webp\' WHERE "id" = \'proof-1\'')).rejects.toThrow();
  });

  it("does not transition a referenced object to deleting or attach to a tombstone", async () => {
    await db.exec(`INSERT INTO "pos_managed_proof_objects" ("id", "storeId", "accountId", "bucket", "objectKey", "state")
      VALUES ('proof-1', 'store-1', 'account-1', 'private-proofs', 'managed-proofs/v1/0123456789abcdef0123456789abcdef.webp', 'active');
      INSERT INTO "pos_managed_proof_references" ("objectId", "sourceType", "sourceId", "slot") VALUES ('proof-1', 'expense', 'expense-1', 'attachment')`);
    await expect(db.exec('UPDATE "pos_managed_proof_objects" SET "state" = \'deleting\' WHERE "id" = \'proof-1\'')).rejects.toThrow();
    await db.exec('DELETE FROM "pos_managed_proof_references" WHERE "objectId" = \'proof-1\'; UPDATE "pos_managed_proof_objects" SET "state" = \'deleting\' WHERE "id" = \'proof-1\'');
    await expect(db.exec(`INSERT INTO "pos_managed_proof_references" ("objectId", "sourceType", "sourceId", "slot") VALUES ('proof-1', 'expense', 'expense-2', 'attachment')`)).rejects.toThrow();
  });

  it("keeps the tombstone after a lost response and retries with persisted state", async () => {
    await enableForFutureProtocolTest();
    await insertDeleting();
    const objects = new Set(["managed-proofs/v1/0123456789abcdef0123456789abcdef.webp"]);
    expect(await runManagedProofCleanupOnce(store, async claim => {
      objects.delete(claim.key);
      throw new Error("response lost");
    })).toBe("retry");
    expect(await state()).toMatchObject({ state: "deleting", attempts: 1 });
    expect(await runManagedProofCleanupOnce(store, async claim => { objects.delete(claim.key); })).toBe("idle");
    await db.exec('UPDATE "pos_managed_proof_objects" SET "nextAttemptAt" = now() - interval \'1 second\' WHERE "id" = \'proof-1\'');
    expect(await runManagedProofCleanupOnce(store, async claim => { objects.delete(claim.key); })).toBe("deleted");
    expect(await state()).toMatchObject({ state: "deleted", attempts: 2 });
    expect(objects.size).toBe(0);
  });

  it("fences a stale lease after another worker completes deletion", async () => {
    await enableForFutureProtocolTest();
    await insertDeleting();
    const oldClaim = await store.claim();
    expect(oldClaim).not.toBeNull();
    expect(await store.claim()).toBeNull();
    await db.exec('UPDATE "pos_managed_proof_objects" SET "leaseUntil" = now() - interval \'1 second\' WHERE "id" = \'proof-1\'');
    const newClaim = await store.claim();
    expect(newClaim).not.toBeNull();
    expect(await store.confirmDeleted(newClaim!)).toBe(true);
    expect(await store.retry(oldClaim!)).toBe(false);
    expect(await store.confirmDeleted(oldClaim!)).toBe(false);
    expect(await state()).toMatchObject({ state: "deleted", attempts: 2 });
  });

  it("does not claim an object while a managed reference remains", async () => {
    await enableForFutureProtocolTest();
    await insertDeleting();
    await db.exec(`ALTER TABLE "pos_managed_proof_references" DISABLE TRIGGER "managed_proof_reference_active";
      INSERT INTO "pos_managed_proof_references" ("objectId", "sourceType", "sourceId", "slot") VALUES ('proof-1', 'expense', 'expense-1', 'attachment');
      ALTER TABLE "pos_managed_proof_references" ENABLE TRIGGER "managed_proof_reference_active";`);
    expect(await runManagedProofCleanupOnce(store, async () => { throw new Error("must not delete"); })).toBe("idle");
    expect(await state()).toMatchObject({ state: "deleting", attempts: 0 });
  });

  it("recovers a lease after the process dies before confirming deletion", async () => {
    await enableForFutureProtocolTest();
    await insertDeleting();
    const objects = new Set(["managed-proofs/v1/0123456789abcdef0123456789abcdef.webp"]);
    const crashedStore = { ...store, async confirmDeleted() { throw new Error("connection lost"); } };
    await expect(runManagedProofCleanupOnce(crashedStore, async claim => { objects.delete(claim.key); })).rejects.toThrow("connection lost");
    expect(await state()).toMatchObject({ state: "deleting", attempts: 1 });
    await db.exec('UPDATE "pos_managed_proof_objects" SET "leaseUntil" = now() - interval \'1 second\' WHERE "id" = \'proof-1\'');
    expect(await runManagedProofCleanupOnce(store, async claim => { objects.delete(claim.key); })).toBe("deleted");
    expect(await state()).toMatchObject({ state: "deleted", attempts: 2 });
  });
});
