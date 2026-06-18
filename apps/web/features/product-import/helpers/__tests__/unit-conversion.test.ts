import { describe, expect, it } from "vitest";

import { resolveImportUnitMultiplier } from "../unit-conversion";

describe("resolveImportUnitMultiplier", () => {
  it("uses the provided import multiplier when present", () => {
    expect(
      resolveImportUnitMultiplier({
        unit: "rim",
        baseUnit: "lembar",
        providedMultiplier: 480,
      }),
    ).toEqual({ multiplier: 480, conversionNeedsReview: false, source: "provided" });
  });

  it("guesses only conservative known unit multipliers", () => {
    expect(
      resolveImportUnitMultiplier({
        unit: "rim",
        baseUnit: "lembar",
      }),
    ).toEqual({ multiplier: 500, conversionNeedsReview: false, source: "guessed" });
  });

  it("marks unknown conversions for review", () => {
    expect(
      resolveImportUnitMultiplier({
        unit: "box",
        baseUnit: "pcs",
      }),
    ).toEqual({ multiplier: 1, conversionNeedsReview: true, source: "unknown" });
  });
});
