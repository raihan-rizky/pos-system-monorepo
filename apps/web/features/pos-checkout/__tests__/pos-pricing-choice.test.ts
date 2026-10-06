import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const posClientPageSource = readFileSync(
  new URL("../../../app/(main)/pos/POSClientPage.tsx", import.meta.url),
  "utf8",
);

describe("POS pricing choice", () => {
  it("does not forward a presentation-only pricing preference to transaction APIs", () => {
    expect(posClientPageSource).not.toContain("pricingPreference");
  });
});
