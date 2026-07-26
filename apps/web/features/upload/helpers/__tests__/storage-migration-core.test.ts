import { describe, expect, it, vi } from "vitest";
import {
  buildDestinationObjectKey,
  buildPublicObjectUrl,
  chunkItems,
  formatMigrationError,
  listStorageFiles,
  parseMigrationOptions,
  referenceTargetsForStorageObject,
  shouldReuseExistingObject,
} from "../storage-migration-core.mjs";

describe("Supabase to R2 storage migration", () => {
  it("defaults to dry-run and requires apply before source deletion", () => {
    expect(parseMigrationOptions([])).toEqual({
      apply: false,
      deleteSource: false,
      bucketNames: ["product-images", "pos-media"],
    });
    expect(parseMigrationOptions(["--apply"])).toEqual({
      apply: true,
      deleteSource: false,
      bucketNames: ["product-images", "pos-media"],
    });
    expect(() => parseMigrationOptions(["--delete-source"])).toThrow(
      "--delete-source hanya boleh dipakai bersama --apply.",
    );
    expect(parseMigrationOptions(["--apply", "--delete-source"])).toEqual({
      apply: true,
      deleteSource: true,
      bucketNames: ["product-images", "pos-media"],
    });
    expect(parseMigrationOptions(["--bucket=pos-media"])).toEqual({
      apply: false,
      deleteSource: false,
      bucketNames: ["pos-media"],
    });
  });

  it("walks nested Supabase Storage folders without treating folders as files", async () => {
    const listPage = vi.fn(async (prefix: string, offset: number) => {
      if (offset > 0) return [];
      if (prefix === "") {
        return [
          { id: null, name: "products", metadata: null },
          { id: null, name: "expenses", metadata: null },
        ];
      }
      if (prefix === "products") {
        return [
          {
            id: "product-1",
            name: "one.webp",
            metadata: { size: 3, mimetype: "image/webp" },
          },
        ];
      }
      return [
        {
          id: "expense-1",
          name: "invoice.pdf",
          metadata: { size: 5, mimetype: "application/pdf" },
        },
      ];
    });

    await expect(listStorageFiles(listPage)).resolves.toEqual([
      {
        objectKey: "expenses/invoice.pdf",
        size: 5,
        contentType: "application/pdf",
      },
      {
        objectKey: "products/one.webp",
        size: 3,
        contentType: "image/webp",
      },
    ]);
  });

  it("maps migrated URLs only to database fields that use each namespace", () => {
    expect(
      referenceTargetsForStorageObject("pos-media", "products/one.webp"),
    ).toEqual([
      { table: "pos_products", column: "imageUrl" },
      { table: "StoreSettings", column: "logoUrl" },
    ]);
    expect(
      referenceTargetsForStorageObject("product-images", "one.webp"),
    ).toEqual([
      { table: "pos_products", column: "imageUrl" },
      { table: "StoreSettings", column: "logoUrl" },
    ]);
    expect(
      referenceTargetsForStorageObject("pos-media", "expenses/invoice.pdf"),
    ).toEqual([
      { table: "pos_expenses", column: "attachmentUrl" },
    ]);
    expect(
      referenceTargetsForStorageObject("unknown", "file.bin"),
    ).toEqual([]);
  });

  it("isolates legacy bucket keys from current media keys in R2", () => {
    expect(
      buildDestinationObjectKey("product-images", "catalog/one.webp"),
    ).toBe("products/legacy/catalog/one.webp");
    expect(
      buildDestinationObjectKey("pos-media", "products/one.webp"),
    ).toBe("products/one.webp");
  });

  it("builds encoded public URLs without duplicate slashes", () => {
    expect(
      buildPublicObjectUrl(
        "https://pub-example.r2.dev/",
        "products/foto produk.webp",
      ),
    ).toBe("https://pub-example.r2.dev/products/foto%20produk.webp");
  });

  it("formats PostgREST error objects without hiding the root cause", () => {
    expect(
      formatMigrationError({
        message: "Could not find table",
        code: "PGRST205",
        hint: "Use pos_products",
      }),
    ).toBe("PGRST205: Could not find table (hint: Use pos_products)");
    expect(formatMigrationError(new Error("network unavailable"))).toBe(
      "network unavailable",
    );
  });

  it("reuses only existing R2 objects with the exact known source size", () => {
    expect(shouldReuseExistingObject(226_297, 226_297)).toBe(true);
    expect(shouldReuseExistingObject(226_297, 100)).toBe(false);
    expect(shouldReuseExistingObject(0, 0)).toBe(false);
  });

  it("splits migration work into bounded concurrent batches", () => {
    expect(chunkItems([1, 2, 3, 4, 5], 2)).toEqual([
      [1, 2],
      [3, 4],
      [5],
    ]);
    expect(() => chunkItems([1], 0)).toThrow(
      "Ukuran batch harus lebih besar dari 0.",
    );
  });
});
