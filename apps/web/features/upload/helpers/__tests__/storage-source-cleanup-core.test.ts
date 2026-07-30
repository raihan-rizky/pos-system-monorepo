import { describe, expect, it } from "vitest";
import {
  parseStorageSourceCleanupOptions,
  selectLargestStorageObjectsForTarget,
} from "../storage-source-cleanup-core";

describe("selectLargestStorageObjectsForTarget", () => {
  it("selects the fewest largest objects needed to reach the byte target", () => {
    expect(
      selectLargestStorageObjectsForTarget(
        [
          { objectKey: "products/small.png", size: 10 },
          { objectKey: "products/large.png", size: 70 },
          { objectKey: "products/medium.png", size: 40 },
        ],
        100,
      ),
    ).toEqual({
      selected: [
        { objectKey: "products/large.png", size: 70 },
        { objectKey: "products/medium.png", size: 40 },
      ],
      selectedBytes: 110,
    });
  });

  it("uses object key as a stable tie breaker", () => {
    expect(
      selectLargestStorageObjectsForTarget(
        [
          { objectKey: "products/b.png", size: 50 },
          { objectKey: "products/a.png", size: 50 },
        ],
        50,
      ).selected,
    ).toEqual([{ objectKey: "products/a.png", size: 50 }]);
  });
});

describe("parseStorageSourceCleanupOptions", () => {
  it("parses a dry-run target", () => {
    expect(
      parseStorageSourceCleanupOptions(["--target-bytes=250000000"]),
    ).toEqual({
      apply: false,
      targetBytes: 250_000_000,
      expectedFiles: null,
      expectedBytes: null,
    });
  });

  it("requires exact file and byte expectations before apply", () => {
    expect(() =>
      parseStorageSourceCleanupOptions([
        "--apply",
        "--target-bytes=250000000",
      ]),
    ).toThrow("--expected-files dan --expected-bytes wajib");

    expect(
      parseStorageSourceCleanupOptions([
        "--",
        "--apply",
        "--target-bytes=250000000",
        "--expected-files=2",
        "--expected-bytes=260000000",
      ]),
    ).toEqual({
      apply: true,
      targetBytes: 250_000_000,
      expectedFiles: 2,
      expectedBytes: 260_000_000,
    });
  });
});
