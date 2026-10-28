import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MemberPriceField } from "@/features/customer-category-pricing/components/MemberPriceField";

describe("rounding in member price inputs", () => {
  it("retains the raw override and previews the rounded member price", () => {
    const html = renderToStaticMarkup(<MemberPriceField label="Harga Agen" sellingPrice={5000} value="4050" onChange={vi.fn()} />);
    expect(html).toContain('value="4050"');
    expect(html).toContain("Harga asal sebelum pembulatan");
    expect(html).toContain("Harga jual berlaku");
    expect(html).toContain("4.500");
  });
  it("previews inherited prices with the selected policy", () => {
    const html = renderToStaticMarkup(<MemberPriceField label="Harga Dinas" sellingPrice={4049} value="" onChange={vi.fn()} roundingSettings={{ enabled: false, increment: 500, threshold: 50 }} />);
    expect(html).toContain("4.049");
    expect(html).not.toContain("Dibulatkan");
  });
});
