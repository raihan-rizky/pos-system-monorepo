import { describe, expect, it } from "vitest";

import {
  expandProductNameAbbreviations,
  normalizeProductDuplicateKey,
} from "../name-normalization";

describe("expandProductNameAbbreviations", () => {
  it("expands product abbreviations case-insensitively before duplicate matching", () => {
    expect(expandProductNameAbbreviations("msntik r. pita fc")).toBe(
      "Mesin Tik Ribbon Pita Fotocopy",
    );
  });

  it("normalizes duplicate keys after abbreviation expansion and category lowercasing", () => {
    expect(
      normalizeProductDuplicateKey({
        name: "  C. Form   Klir ",
        category: "  ATK ",
      }),
    ).toBe("continuous form clear|atk");
  });
});
