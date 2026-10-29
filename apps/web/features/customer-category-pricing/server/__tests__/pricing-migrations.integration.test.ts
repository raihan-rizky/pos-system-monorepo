import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@pos/db";
import { describe, expect, it } from "vitest";

const integration = process.env.PRICING_MIGRATION_DB_TEST === "1" ? describe : describe.skip;
const migrationDirectory = resolve(process.cwd(), "../../packages/db/prisma/migrations");

integration("migrasi Harga Khusus dan harga Manual", () => {
  it("preserves legacy values and defaults the new switch off", async () => {
    const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
    if (!url) throw new Error("A development database URL is required for the migration integration test.");
    const client = new PrismaClient({ datasources: { db: { url } } });
    const rollback = new Error("rollback temporary migration fixtures");
    try {
      await client.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('CREATE TEMP TABLE "pos_category_customer_pricing_rules" ("id" TEXT, "unit" TEXT) ON COMMIT DROP');
        await tx.$executeRawUnsafe('CREATE TEMP TABLE "pos_product_stock_groups" ("id" TEXT, "pricingConfig" JSONB, "updatedAt" TIMESTAMPTZ) ON COMMIT DROP');
        await tx.$executeRawUnsafe('CREATE TEMP TABLE "StoreSettings" ("id" TEXT) ON COMMIT DROP');
        await tx.$executeRawUnsafe('CREATE TEMP TABLE "price_probe" ("price" NUMERIC, "costPrice" NUMERIC) ON COMMIT DROP');
        await tx.$executeRawUnsafe(`INSERT INTO "pos_category_customer_pricing_rules" VALUES ('single', ' Rim '), ('all', NULL), ('blank', ' ')`);
        await tx.$executeRawUnsafe(`INSERT INTO "pos_product_stock_groups" VALUES
          ('valid', '{"sourceProductId":"pcs","revision":1,"members":{"pcs":{"mode":"AUTO"},"box":{"mode":"AUTO"},"pak":{"mode":"MANUAL"}}}'::jsonb, now()),
          ('malformed', '{"revision":1,"members":[]}'::jsonb, now()),
          ('unset', NULL, now())`);
        await tx.$executeRawUnsafe(`INSERT INTO "StoreSettings" VALUES ('existing')`);
        await tx.$executeRawUnsafe(`INSERT INTO "price_probe" VALUES (9000, 6500)`);

        for (const name of ["20261029010000_pricing_rule_multiple_units", "20261029011000_default_manual_group_pricing", "20261029012000_special_pricing_setting"]) {
          const sql = readFileSync(resolve(migrationDirectory, name, "migration.sql"), "utf8");
          for (const statement of sql.replace(/^--.*$/gm, "").split(";").map(part => part.trim()).filter(Boolean)) await tx.$executeRawUnsafe(statement);
        }

        const rules = await tx.$queryRawUnsafe<Array<{ id: string; units: string[] }>>('SELECT "id", "units" FROM "pos_category_customer_pricing_rules" ORDER BY "id"');
        expect(rules).toEqual([{ id: "all", units: [] }, { id: "blank", units: [] }, { id: "single", units: ["rim"] }]);
        const groups = await tx.$queryRawUnsafe<Array<{ id: string; pricingConfig: unknown }>>('SELECT "id", "pricingConfig" FROM "pos_product_stock_groups" ORDER BY "id"');
        expect(groups.find(group => group.id === "valid")?.pricingConfig).toMatchObject({
          revision: 2, members: { pcs: { mode: "AUTO" }, box: { mode: "MANUAL" }, pak: { mode: "MANUAL" } },
        });
        expect(groups.find(group => group.id === "malformed")?.pricingConfig).toEqual({ revision: 1, members: [] });
        expect(groups.find(group => group.id === "unset")?.pricingConfig).toBeNull();
        expect(await tx.$queryRawUnsafe('SELECT "price"::TEXT, "costPrice"::TEXT FROM "price_probe"')).toEqual([{ price: "9000", costPrice: "6500" }]);
        await tx.$executeRawUnsafe(`INSERT INTO "StoreSettings" ("id") VALUES ('new')`);
        expect(await tx.$queryRawUnsafe('SELECT "id", "specialPricingEnabled" FROM "StoreSettings" ORDER BY "id"')).toEqual([
          { id: "existing", specialPricingEnabled: false }, { id: "new", specialPricingEnabled: false },
        ]);
        throw rollback;
      }, { timeout: 30000 });
    } catch (error) {
      if (error !== rollback) throw error;
    } finally {
      await client.$disconnect();
    }
  }, 60000);
});
