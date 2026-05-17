import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { isMissingStorageBucketError, POS_MEDIA_BUCKET } from "../upload-core";

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

  it("creates the upload bucket and storage policies in migrations", () => {
    const migrationsDir = join(process.cwd(), "../../packages/db/prisma/migrations");
    const sql = readdirSync(migrationsDir)
      .filter((entry) => entry.includes("storage") || entry.includes("upload"))
      .map((entry) => readFileSync(join(migrationsDir, entry, "migration.sql"), "utf8"))
      .join("\n");

    expect(sql).toContain(`'${POS_MEDIA_BUCKET}'`);
    expect(sql).toContain("storage.buckets");
    expect(sql).toContain("storage.objects");
    expect(sql).toContain("FOR INSERT");
    expect(sql).toContain("TO authenticated");
  });
});
