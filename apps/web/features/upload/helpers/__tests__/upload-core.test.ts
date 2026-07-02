import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { isMissingStorageBucketError, POS_MEDIA_BUCKET } from "../upload-core";

const migrationsDir = join(process.cwd(), "../../packages/db/prisma/migrations");

function readMigrationSql(entry: string) {
  return readFileSync(join(migrationsDir, entry, "migration.sql"), "utf8");
}

describe("upload storage setup", () => {
  it("detects Supabase bucket-not-found errors", () => {
    expect(
      isMissingStorageBucketError({
        message: "Bucket not found",
        statusCode: "404",
        namespace: "storage",
      }),
    ).toBe(true);
  });

  it("keeps storage shadow prerequisites before the POS media migration", () => {
    const entries = readdirSync(migrationsDir)
      .filter((entry) => entry !== "migration_lock.toml")
      .sort();
    const mediaMigrationIndex = entries.indexOf("20260517_supabase_storage_pos_media");
    const prerequisiteSql = entries.slice(0, mediaMigrationIndex).map(readMigrationSql).join("\n");

    expect(mediaMigrationIndex).toBeGreaterThan(0);
    expect(prerequisiteSql).toContain("CREATE SCHEMA IF NOT EXISTS storage");
    expect(prerequisiteSql).toContain("CREATE TABLE IF NOT EXISTS storage.buckets");
    expect(prerequisiteSql).toContain("CREATE TABLE IF NOT EXISTS storage.objects");
  });

  it("creates the upload bucket and storage policies in migrations", () => {
    const sql = readdirSync(migrationsDir)
      .filter((entry) => entry.includes("storage") || entry.includes("upload"))
      .map(readMigrationSql)
      .join("\n");

    expect(sql).toContain(`'${POS_MEDIA_BUCKET}'`);
    expect(sql).toContain("storage.buckets");
    expect(sql).toContain("storage.objects");
    expect(sql).toContain("FOR INSERT");
    expect(sql).toContain("TO authenticated");
  });
});
