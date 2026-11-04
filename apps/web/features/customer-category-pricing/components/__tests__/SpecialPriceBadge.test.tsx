import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SpecialPriceBadge } from "../SpecialPriceBadge";
import { getPricingBadgeLabel } from "../../helpers/pricing-rules";

describe("sumber badge harga", () => {
  it.each(["harga-agen", "harga-dinas"])("menandai %s sebagai harga manual", (ruleId) => {
    expect(getPricingBadgeLabel({ ruleId })).toBe("Harga manual");
    const html = renderToStaticMarkup(<SpecialPriceBadge appliedPricing={{ ruleId }} />);
    expect(html).toContain("Harga manual");
    expect(html).not.toContain("Harga Khusus");
  });

  it("menandai aturan otomatis sebagai Harga Khusus", () => {
    expect(getPricingBadgeLabel({ ruleId: "rule-1" })).toBe("Harga Khusus");
    const html = renderToStaticMarkup(<SpecialPriceBadge appliedPricing={{ ruleId: "rule-1" }} />);
    expect(html).toContain("Harga Khusus");
    expect(html).not.toContain("Harga manual");
  });

  it("tidak menampilkan badge tanpa harga terapan", () => {
    expect(getPricingBadgeLabel(null)).toBeNull();
    expect(renderToStaticMarkup(<SpecialPriceBadge appliedPricing={null} />)).toBe("");
  });
});
