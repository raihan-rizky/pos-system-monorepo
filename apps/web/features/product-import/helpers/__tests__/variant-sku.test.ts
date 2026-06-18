import { describe, expect, it } from "vitest";

import { generateVariantSku } from "../variant-sku";

describe("generateVariantSku", () => {
  it("uses existing SKU plus unit suffix for variants", () => {
    expect(generateVariantSku("HVS-A4", "rim", new Set())).toBe("HVS-A4-RIM");
  });

  it("appends an incrementing number when generated SKU already exists", () => {
    expect(
      generateVariantSku("HVS-A4", "rim", new Set(["HVS-A4-RIM", "HVS-A4-RIM-2"])),
    ).toBe("HVS-A4-RIM-3");
  });
});
