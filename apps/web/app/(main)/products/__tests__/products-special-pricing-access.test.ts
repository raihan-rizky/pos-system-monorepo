import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("products special pricing access", () => {
  it("offers the tab to all roles while keeping the rules component owner-only", () => {
    const source = readFileSync(join(process.cwd(), "app/(main)/products/ProductsClientPage.tsx"), "utf8");
    expect(source).not.toMatch(/\.\.\.\(canManageSpecialPrices\s*\?\s*\[\s*\{\s*id: "special-prices"/);
    expect(source).toMatch(/canManageSpecialPrices\s*\?\s*<CustomerCategoryPricingRulesTab[\s\S]*?:\s*<SpecialPricingRestrictedNotice/);
  });
});
