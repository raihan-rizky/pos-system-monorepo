import { describe, expect, it } from "vitest";
import {
  parseStorageReferenceNormalizationOptions,
  planMissingStorageReferenceClears,
  planNormalizedStorageReferenceUpdates,
  parseSupabasePublicObjectKey,
} from "../storage-reference-normalization-core";

const SOURCE_BASE_URL =
  "https://hqlyyyjlemqskpurzltz.supabase.co/storage/v1/object/public/pos-media";
const TARGET_BASE_URL = "https://assets.teladanpos.biz.id";

describe("parseSupabasePublicObjectKey", () => {
  it("decodes a legacy object key from the exact configured bucket", () => {
    expect(
      parseSupabasePublicObjectKey(
        `${SOURCE_BASE_URL}/products/FOTO%20KERTAS.png`,
        SOURCE_BASE_URL,
      ),
    ).toBe("products/FOTO KERTAS.png");
  });

  it.each([
    "https://evil.example/storage/v1/object/public/pos-media/products/a.png",
    `${SOURCE_BASE_URL}.evil.example/products/a.png`,
    `${SOURCE_BASE_URL}/products/%2e%2e/secret.png`,
    `${SOURCE_BASE_URL}/products/%E0%A4%A.png`,
  ])("rejects an unsafe or unrelated URL: %s", (url) => {
    expect(parseSupabasePublicObjectKey(url, SOURCE_BASE_URL)).toBeNull();
  });
});

describe("planNormalizedStorageReferenceUpdates", () => {
  it("plans updates only when the normalized object key exists in storage", () => {
    const rows = [
      {
        id: "product-1",
        imageUrl: `${SOURCE_BASE_URL}/products/FOTO%20KERTAS.png`,
      },
      {
        id: "product-2",
        imageUrl: `${SOURCE_BASE_URL}/products/missing.png`,
      },
    ];

    expect(
      planNormalizedStorageReferenceUpdates({
        rows,
        availableObjectKeys: new Set(["products/FOTO KERTAS.png"]),
        sourceBaseUrl: SOURCE_BASE_URL,
        targetBaseUrl: TARGET_BASE_URL,
      }),
    ).toEqual({
      updates: [
        {
          id: "product-1",
          before: `${SOURCE_BASE_URL}/products/FOTO%20KERTAS.png`,
          after:
            "https://assets.teladanpos.biz.id/products/FOTO%20KERTAS.png",
          objectKey: "products/FOTO KERTAS.png",
        },
      ],
      skippedMissingObject: 1,
      skippedInvalidUrl: 0,
    });
  });
});

describe("parseStorageReferenceNormalizationOptions", () => {
  it("defaults to a dry-run", () => {
    expect(parseStorageReferenceNormalizationOptions([])).toEqual({
      apply: false,
      expectedCount: null,
    });
  });

  it("requires an exact expected count before apply", () => {
    expect(() =>
      parseStorageReferenceNormalizationOptions(["--apply"]),
    ).toThrow("--expected-count wajib");

    expect(
      parseStorageReferenceNormalizationOptions([
        "--",
        "--apply",
        "--expected-count=97",
      ]),
    ).toEqual({ apply: true, expectedCount: 97 });
  });
});

describe("planMissingStorageReferenceClears", () => {
  it("plans only valid legacy references whose object key is absent", () => {
    const rows = [
      {
        id: "product-missing",
        imageUrl: `${SOURCE_BASE_URL}/products/missing.png`,
      },
      {
        id: "product-existing",
        imageUrl: `${SOURCE_BASE_URL}/products/existing.png`,
      },
      {
        id: "product-unrelated",
        imageUrl: "https://example.com/products/missing.png",
      },
    ];

    expect(
      planMissingStorageReferenceClears({
        rows,
        availableObjectKeys: new Set(["products/existing.png"]),
        sourceBaseUrl: SOURCE_BASE_URL,
      }),
    ).toEqual({
      clears: [
        {
          id: "product-missing",
          before: `${SOURCE_BASE_URL}/products/missing.png`,
          objectKey: "products/missing.png",
        },
      ],
      skippedExistingObject: 1,
      skippedInvalidUrl: 1,
    });
  });
});
