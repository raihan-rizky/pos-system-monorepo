import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CategoryIcon } from "../category-icons";

describe("category icon rendering", () => {
  it("falls back safely for inherited object keys", () => {
    const fallback = renderToStaticMarkup(createElement(CategoryIcon, { value: null }));
    for (const value of ["toString", "constructor", "__proto__", "unknown-icon"]) {
      expect(() => renderToStaticMarkup(createElement(CategoryIcon, { value }))).not.toThrow();
      expect(renderToStaticMarkup(createElement(CategoryIcon, { value }))).toBe(fallback);
    }
  });

  it("provides a broad searchable catalogue with a real renderer for every option", async () => {
    const catalogue = await import("../category-icon-catalog").catch(() => null);
    expect(catalogue, "searchable category catalogue must exist").not.toBeNull();
    if (!catalogue) return;
    const { CATEGORY_ICON_OPTIONS, isCategoryIconName, searchCategoryIcons } = catalogue;
    expect(CATEGORY_ICON_OPTIONS.length).toBeGreaterThanOrEqual(80);
    expect(new Set(CATEGORY_ICON_OPTIONS.map((option) => option.id)).size).toBe(CATEGORY_ICON_OPTIONS.length);
    const packageMarkup = renderToStaticMarkup(createElement(CategoryIcon, { value: "package" }));
    for (const option of CATEGORY_ICON_OPTIONS) {
      expect(isCategoryIconName(option.id)).toBe(true);
      expect(option.label.length).toBeGreaterThan(1);
      expect(option.group.length).toBeGreaterThan(1);
      const markup = renderToStaticMarkup(createElement(CategoryIcon, { value: option.id }));
      expect(markup).toContain("<svg");
      if (option.id !== "package") expect(markup).not.toBe(packageMarkup);
    }
    for (const value of ["toString", "constructor", "__proto__", "pizza-unknown"]) {
      expect(isCategoryIconName(value)).toBe(false);
    }
    expect(searchCategoryIcons("MAKANAN").some((option) => option.id === "utensils")).toBe(true);
    expect(searchCategoryIcons("printer").some((option) => option.id === "printer")).toBe(true);
    expect(searchCategoryIcons("baju").some((option) => option.id === "shirt")).toBe(true);
    expect(searchCategoryIcons("", "Makanan & minuman").every((option) => option.group === "Makanan & minuman")).toBe(true);
    const legacy = ["disc", "droplets", "file-text", "id-card", "image", "package", "pen-tool", "printer", "settings", "stamp"];
    expect(legacy.every(isCategoryIconName)).toBe(true);
  });
});
