import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
const { SpecialPriceBadge } = await import("../../components/SpecialPriceBadge").catch(() => ({ SpecialPriceBadge: undefined }));

describe("SpecialPriceBadge", () => {
  it("renders a passive readable label with consistent emerald colors", () => {
    const html = SpecialPriceBadge ? renderToStaticMarkup(<SpecialPriceBadge />) : "";
    expect(html).toContain("Harga Khusus");
    expect(html).toContain("bg-emerald-50");
    expect(html).toContain("text-emerald-800");
    expect(html).toContain("border-emerald-200");
    expect(html).not.toContain("button");
  });
});
