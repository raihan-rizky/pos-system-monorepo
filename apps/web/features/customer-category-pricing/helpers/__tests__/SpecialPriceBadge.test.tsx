import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
const { SpecialPriceBadge } = await import("../../components/SpecialPriceBadge").catch(() => ({ SpecialPriceBadge: undefined }));

describe("SpecialPriceBadge", () => {
  it("renders the automatic rule label visibly and accessibly", () => {
    const html = SpecialPriceBadge ? renderToStaticMarkup(<SpecialPriceBadge appliedPricing={{ ruleId: "rule-1" }} />) : "";
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Harga Khusus"');
    expect(html).toContain('title="Harga Khusus"');
    expect(html).toContain("<svg");
    expect(html).toContain(">Harga Khusus<");
    expect(html).toContain("bg-emerald-50");
    expect(html).toContain("text-emerald-800");
    expect(html).toContain("border-emerald-200");
    expect(html).not.toContain("button");
  });
});
