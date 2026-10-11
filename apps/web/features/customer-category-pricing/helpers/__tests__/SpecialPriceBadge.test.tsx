import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
const { SpecialPriceBadge } = await import("../../components/SpecialPriceBadge").catch(() => ({ SpecialPriceBadge: undefined }));

describe("SpecialPriceBadge", () => {
  it("renders an icon-only badge with an accessible label and consistent emerald colors", () => {
    const html = SpecialPriceBadge ? renderToStaticMarkup(<SpecialPriceBadge />) : "";
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Harga Khusus"');
    expect(html).toContain('title="Harga Khusus"');
    expect(html).toContain("<svg");
    expect(html).not.toContain(">Harga Khusus<");
    expect(html).toContain("bg-emerald-50");
    expect(html).toContain("text-emerald-800");
    expect(html).toContain("border-emerald-200");
    expect(html).not.toContain("button");
  });
});
