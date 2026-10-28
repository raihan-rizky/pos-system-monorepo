import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PriceRoundingBadge } from "../PriceRoundingBadge";

describe("PriceRoundingBadge", () => {
  it.each([
    { originalPrice: 4050, roundedPrice: 4500, direction: "UP" as const, difference: 450, label: "atas", delta: "+Rp" },
    { originalPrice: 4049.99, roundedPrice: 4000, direction: "DOWN" as const, difference: -49.99, label: "bawah", delta: "−Rp" },
  ])("explains $direction with original, final and signed change", ({ label, delta, ...rounding }) => {
    const html = renderToStaticMarkup(<PriceRoundingBadge rounding={rounding} />);
    expect(html).toContain(`Dibulatkan ke ${label}`);
    expect(html).toContain("Harga asal");
    expect(html).toContain("Harga final");
    expect(html).toContain("Selisih");
    expect(html).toContain(delta);
    expect(html).toContain(rounding.direction === "UP" ? "4.050" : "4.049,99");
    expect(html).toContain(rounding.direction === "UP" ? "4.500" : "4.000");
  });

  it("hides unchanged and missing rounding", () => {
    expect(renderToStaticMarkup(<PriceRoundingBadge rounding={null} />)).toBe("");
    expect(renderToStaticMarkup(<PriceRoundingBadge rounding={{ originalPrice: 4500, roundedPrice: 4500, direction: "NONE", difference: 0 }} />)).toBe("");
  });

  it("uses native keyboard and touch disclosure and prevents card actions", () => {
    const element = PriceRoundingBadge({ rounding: { originalPrice: 4050, roundedPrice: 4500, direction: "UP", difference: 450 } });
    expect(element?.type).toBe("details");
    const children = React.Children.toArray(element?.props.children) as React.ReactElement[];
    expect(children[0].type).toBe("summary");
    const event = { stopPropagation: vi.fn(), preventDefault: vi.fn() };
    element?.props.onClick(event);
    element?.props.onKeyDown(event);
    expect(event.stopPropagation).toHaveBeenCalledTimes(2);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});
