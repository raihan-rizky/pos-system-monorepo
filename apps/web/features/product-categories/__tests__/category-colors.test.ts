import { describe, expect, it } from "vitest";
import { CATEGORY_COLORS, categoryColorStyle } from "../components/category-colors";

function luminance(hex: string) {
  const expanded = hex.length === 4 ? hex.slice(1).split("").map(c => c + c).join("") : hex.slice(1);
  const values = [0, 2, 4].map(i => parseInt(expanded.slice(i, i + 2), 16) / 255)
    .map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
}

describe("category color previews", () => {
  it("keeps icons readable on every preset and custom light/dark color", () => {
    const grays = Array.from({ length: 256 }, (_, shade) => `#${shade.toString(16).padStart(2, "0").repeat(3)}`);
    for (const color of [...CATEGORY_COLORS.map(option => option.value), "#000", "#fff", "#778899", "#f0a", "#123456", ...grays]) {
      const style = categoryColorStyle(color);
      const a = luminance(style.backgroundColor);
      const b = luminance(style.color);
      expect((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05), color).toBeGreaterThanOrEqual(4.5);
      expect(style.backgroundColor).toBe(color);
    }
  });

  it("uses a neutral preview for absent or invalid stored colors", () => {
    for (const color of [null, undefined, "", "red", "#12", "url(example)"]) {
      expect(categoryColorStyle(color)).toEqual(categoryColorStyle(null));
    }
    expect(categoryColorStyle("#000").color).toBe("#ffffff");
    expect(categoryColorStyle("#fff").color).toBe("#0f172a");
  });
});
