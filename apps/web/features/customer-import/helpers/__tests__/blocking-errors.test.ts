import { describe, expect, it } from "vitest";
import { buildBlockingErrorItems } from "../blocking-errors";

describe("buildBlockingErrorItems", () => {
  it("builds stable unique keys when duplicate error messages exist", () => {
    const items = buildBlockingErrorItems([
      "Name is required.",
      "Name is required.",
      "Email is invalid.",
    ]);

    expect(items).toEqual([
      { key: "0:Name is required.", message: "Name is required." },
      { key: "1:Name is required.", message: "Name is required." },
      { key: "2:Email is invalid.", message: "Email is invalid." },
    ]);
    expect(new Set(items.map((item) => item.key)).size).toBe(items.length);
  });
});
