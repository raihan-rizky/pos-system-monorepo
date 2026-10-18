import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

// Production checks use a read-only transaction. Migration rehearsal only runs
// against a temporary table on development, with no application row mutations.
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const require = createRequire(path.join(repo, "package.json"));
const dbRequire = createRequire(path.join(repo, "packages/db/package.json"));
const dotenv = require(require.resolve("dotenv", { paths: [path.dirname(require.resolve("dotenv-cli/package.json"))] }));
const environmentIndex = process.argv.indexOf("--environment");
const environment = environmentIndex >= 0 ? process.argv[environmentIndex + 1] : "development";
assert.ok(["development", "production"].includes(environment), "Pilih environment development atau production.");
const envFile = environment === "production" ? "env.production.env" : ".env.development";
const settings = dotenv.parse(fs.readFileSync(path.join(repo, "packages/db", envFile)));
const { PrismaClient } = dbRequire("@prisma/client");
const db = new PrismaClient({ datasources: { db: { url: settings.DIRECT_URL || settings.DATABASE_URL } } });
const migrationName = "20261018120000_transaction_tax_rate";
const migration = fs.readFileSync(path.join(repo, "packages/db/prisma/migrations", migrationName, "migration.sql"), "utf8");

try {
  await test(`tax database smoke: ${environment} schema and applied migration`, async () => {
    await db.$transaction(async tx => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      const columns = await tx.$queryRawUnsafe(`SELECT column_name, data_type, is_nullable, numeric_precision, numeric_scale, column_default
        FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'pos_transactions'
        AND column_name IN ('taxRate', 'taxMethod')`);
      const rate = columns.find(column => column.column_name === "taxRate");
      const method = columns.find(column => column.column_name === "taxMethod");
      assert.ok(rate, "Kolom taxRate harus tersedia setelah migrasi.");
      assert.deepEqual([rate.data_type, rate.numeric_precision, rate.numeric_scale, rate.is_nullable], ["numeric", 5, 2, "YES"]);
      assert.ok(method, "Kolom taxMethod harus tersedia setelah migrasi.");
      assert.equal(method.is_nullable, "NO");
      assert.match(method.column_default, /STANDARD/);
      const constraints = await tx.$queryRawUnsafe(`SELECT conname, pg_get_constraintdef(oid) AS definition
        FROM pg_constraint WHERE conrelid = 'public.pos_transactions'::regclass
        AND conname IN ('pos_transactions_taxRate_check', 'pos_transactions_taxMethod_check')`);
      assert.equal(constraints.length, 2, "Kedua constraint pajak harus terpasang.");
      const history = await tx.$queryRawUnsafe('SELECT finished_at, rolled_back_at, checksum FROM "_prisma_migrations" WHERE migration_name = $1', migrationName);
      assert.equal(history.length, 1);
      assert.ok(history[0].finished_at);
      assert.equal(history[0].rolled_back_at, null);
      const { createHash } = await import("node:crypto");
      assert.equal(history[0].checksum, createHash("sha256").update(migration).digest("hex"));
      const invalid = await tx.$queryRawUnsafe(`SELECT count(*)::int AS count FROM public.pos_transactions
        WHERE ("taxRate" IS NOT NULL AND ("taxRate" < 0 OR "taxRate" > 100))
        OR "taxMethod" NOT IN ('STANDARD', 'DPP_NILAI_LAIN')`);
      assert.equal(invalid[0].count, 0);
    }, { timeout: 15000 });
  });

  if (environment === "development") {
    await test("tax migration: preserves legacy totals, defaults and rejects invalid rates/methods", async () => {
      await db.$transaction(async tx => {
        await tx.$executeRawUnsafe('CREATE TEMP TABLE "pos_transactions" ("id" TEXT PRIMARY KEY, "total" NUMERIC(12,2) NOT NULL) ON COMMIT DROP');
        await tx.$executeRawUnsafe('INSERT INTO pg_temp."pos_transactions" ("id", "total") VALUES ($1, $2)', "legacy", 706000);
        // The temporary relation shadows the application table for this session.
        for (const statement of migration.split(";").map(value => value.trim()).filter(Boolean)) {
          await tx.$executeRawUnsafe(statement);
        }
        const legacy = await tx.$queryRawUnsafe('SELECT "total"::text AS total, "taxRate"::text AS rate, "taxMethod" AS method FROM pg_temp."pos_transactions" WHERE id = $1', "legacy");
        assert.deepEqual(legacy, [{ total: "706000.00", rate: null, method: "STANDARD" }]);
        await tx.$executeRawUnsafe('INSERT INTO pg_temp."pos_transactions" (id,total,"taxRate","taxMethod") VALUES ($1,$2,$3,$4),($5,$6,$7,$8)', "zero", 0, 0, "STANDARD", "maximum", 100, 100, "DPP_NILAI_LAIN");
        for (const [id, rate, method] of [["negative", -0.01, "STANDARD"], ["over", 100.01, "STANDARD"], ["method", 12, "UNKNOWN"]]) {
          await tx.$executeRawUnsafe("SAVEPOINT invalid_tax");
          let rejected = false;
          try {
            await tx.$executeRawUnsafe('INSERT INTO pg_temp."pos_transactions" (id,total,"taxRate","taxMethod") VALUES ($1,$2,$3,$4)', id, 100, rate, method);
          } catch (error) {
            rejected = error.meta?.code === "23514";
          }
          await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT invalid_tax");
          assert.ok(rejected, `Constraint harus menolak ${id}.`);
        }
        const rows = await tx.$queryRawUnsafe('SELECT count(*)::int AS count FROM pg_temp."pos_transactions"');
        assert.equal(rows[0].count, 3);
      }, { timeout: 30000 });
    });
  }
} finally {
  await db.$disconnect();
}
