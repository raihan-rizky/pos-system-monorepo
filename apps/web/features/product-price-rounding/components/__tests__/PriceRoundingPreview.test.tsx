import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PriceRoundingPreview } from "../PriceRoundingPreview";

describe("PriceRoundingPreview", () => {
  it("shows an effective sale price without modifying the raw input", () => {
    const price = "4050";
    const html = renderToStaticMarkup(<PriceRoundingPreview price={price} />);
    expect(html).toContain("Harga jual berlaku");
    expect(html).toContain("4.500");
    expect(html).toContain("Dibulatkan ke atas");
    expect(price).toBe("4050");
  });
  it("uses the current policy and leaves unchanged prices without a badge", () => {
    const html = renderToStaticMarkup(<PriceRoundingPreview price={4050} settings={{ enabled: false, increment: 500, threshold: 50 }} />);
    expect(html).toContain("4.050");
    expect(html).not.toContain("Dibulatkan");
  });
  it.each(["", "-", "bad", -1, Infinity, null, undefined])("hides invalid and incomplete input %s", (price) => {
    expect(renderToStaticMarkup(<PriceRoundingPreview price={price} />)).toBe("");
  });
});
