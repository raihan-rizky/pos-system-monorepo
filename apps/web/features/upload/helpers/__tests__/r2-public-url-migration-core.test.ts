import { describe, expect, it, vi } from "vitest";
import {
  parseR2PublicUrlMigrationOptions,
  rewriteR2PublicUrl,
  runR2PublicUrlMigration,
} from "../../../../../../packages/db/scripts/r2-public-url-migration-core";

const OLD_BASE_URL =
  "https://pub-98906725b9e34904828d5d9146038e3e.r2.dev";
const NEW_BASE_URL = "https://assets.teladanpos.biz.id";

describe("R2 public URL migration", () => {
  it("defaults to dry-run and normalizes both base URLs", () => {
    expect(
      parseR2PublicUrlMigrationOptions([
        `--from=${OLD_BASE_URL}/`,
        `--to=${NEW_BASE_URL}/`,
      ]),
    ).toEqual({
      apply: false,
      expectedCount: null,
      fromBaseUrl: OLD_BASE_URL,
      toBaseUrl: NEW_BASE_URL,
    });
  });

  it("requires an expected row count before apply", () => {
    expect(() =>
      parseR2PublicUrlMigrationOptions([
        "--apply",
        `--from=${OLD_BASE_URL}`,
        `--to=${NEW_BASE_URL}`,
      ]),
    ).toThrow("--expected-count wajib disertakan bersama --apply.");

    expect(
      parseR2PublicUrlMigrationOptions([
        "--apply",
        "--expected-count=2",
        `--from=${OLD_BASE_URL}`,
        `--to=${NEW_BASE_URL}`,
      ]),
    ).toEqual({
      apply: true,
      expectedCount: 2,
      fromBaseUrl: OLD_BASE_URL,
      toBaseUrl: NEW_BASE_URL,
    });
  });

  it("rejects unsafe URLs, equal origins, invalid counts, and unknown flags", () => {
    expect(() =>
      parseR2PublicUrlMigrationOptions([
        "--from=http://legacy.example.com",
        `--to=${NEW_BASE_URL}`,
      ]),
    ).toThrow("--from harus berupa URL HTTPS yang valid.");
    expect(() =>
      parseR2PublicUrlMigrationOptions([
        `--from=${OLD_BASE_URL}`,
        `--to=${OLD_BASE_URL}/`,
      ]),
    ).toThrow("--from dan --to tidak boleh sama.");
    expect(() =>
      parseR2PublicUrlMigrationOptions([
        "--apply",
        "--expected-count=-1",
        `--from=${OLD_BASE_URL}`,
        `--to=${NEW_BASE_URL}`,
      ]),
    ).toThrow("--expected-count harus berupa bilangan bulat non-negatif.");
    expect(() =>
      parseR2PublicUrlMigrationOptions([
        "--delete-source",
        `--from=${OLD_BASE_URL}`,
        `--to=${NEW_BASE_URL}`,
      ]),
    ).toThrow("Argumen tidak dikenal: --delete-source");
  });

  it("rewrites only exact URLs below the legacy base URL", () => {
    expect(
      rewriteR2PublicUrl(
        `${OLD_BASE_URL}/products/foto%20produk.webp`,
        OLD_BASE_URL,
        NEW_BASE_URL,
      ),
    ).toBe(`${NEW_BASE_URL}/products/foto%20produk.webp`);

    expect(
      rewriteR2PublicUrl(
        `${OLD_BASE_URL}.evil.test/products/foto.webp`,
        OLD_BASE_URL,
        NEW_BASE_URL,
      ),
    ).toBeNull();
    expect(
      rewriteR2PublicUrl(
        "https://example.com/products/foto.webp",
        OLD_BASE_URL,
        NEW_BASE_URL,
      ),
    ).toBeNull();
  });

  it("keeps dry-run read-only and returns a bounded preview", async () => {
    const repository = {
      countByPrefix: vi.fn().mockResolvedValue(2),
      sampleByPrefix: vi.fn().mockResolvedValue([
        {
          id: "product-1",
          name: "Produk Satu",
          imageUrl: `${OLD_BASE_URL}/products/one.jpg`,
        },
        {
          id: "product-2",
          name: "Produk Dua",
          imageUrl: `${OLD_BASE_URL}/products/two.jpg`,
        },
      ]),
      replacePrefix: vi.fn(),
    };

    await expect(
      runR2PublicUrlMigration(
        {
          apply: false,
          expectedCount: null,
          fromBaseUrl: OLD_BASE_URL,
          toBaseUrl: NEW_BASE_URL,
        },
        repository,
      ),
    ).resolves.toEqual({
      mode: "dry-run",
      matched: 2,
      updated: 0,
      sample: [
        {
          id: "product-1",
          name: "Produk Satu",
          before: `${OLD_BASE_URL}/products/one.jpg`,
          after: `${NEW_BASE_URL}/products/one.jpg`,
        },
        {
          id: "product-2",
          name: "Produk Dua",
          before: `${OLD_BASE_URL}/products/two.jpg`,
          after: `${NEW_BASE_URL}/products/two.jpg`,
        },
      ],
    });
    expect(repository.replacePrefix).not.toHaveBeenCalled();
    expect(repository.sampleByPrefix).toHaveBeenCalledWith(
      `${OLD_BASE_URL}/`,
      10,
    );
  });

  it("aborts apply when the live row count differs from the confirmed count", async () => {
    const repository = {
      countByPrefix: vi.fn().mockResolvedValue(3),
      sampleByPrefix: vi.fn().mockResolvedValue([]),
      replacePrefix: vi.fn(),
    };

    await expect(
      runR2PublicUrlMigration(
        {
          apply: true,
          expectedCount: 2,
          fromBaseUrl: OLD_BASE_URL,
          toBaseUrl: NEW_BASE_URL,
        },
        repository,
      ),
    ).rejects.toThrow(
      "Jumlah row berubah: expected=2, ditemukan=3. Jalankan dry-run ulang.",
    );
    expect(repository.replacePrefix).not.toHaveBeenCalled();
  });

  it("applies one prefix replacement and verifies the affected row count", async () => {
    const repository = {
      countByPrefix: vi.fn().mockResolvedValue(2),
      sampleByPrefix: vi.fn().mockResolvedValue([]),
      replacePrefix: vi.fn().mockResolvedValue(2),
    };

    await expect(
      runR2PublicUrlMigration(
        {
          apply: true,
          expectedCount: 2,
          fromBaseUrl: OLD_BASE_URL,
          toBaseUrl: NEW_BASE_URL,
        },
        repository,
      ),
    ).resolves.toEqual({
      mode: "apply",
      matched: 2,
      updated: 2,
      sample: [],
    });
    expect(repository.replacePrefix).toHaveBeenCalledWith(
      `${OLD_BASE_URL}/`,
      `${NEW_BASE_URL}/`,
    );
  });
});
