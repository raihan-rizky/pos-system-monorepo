import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

describe("category icon picker", () => {
  it("shows the selected icon with an exact accessible trigger label", async () => {
    const picker = await import("../components/CategoryIconPicker").catch(() => null);
    expect(picker, "visual searchable icon picker must exist").not.toBeNull();
    if (!picker) return;
    const { CategoryIconPicker } = picker;
    const html = renderToStaticMarkup(<CategoryIconPicker value="coffee" color="#2563eb" label="Ikon 1" onChange={() => {}} />);
    expect(html).toContain('aria-label="Ikon 1"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('type="button"');
    expect(html).toContain("lucide-coffee");
    expect(html).toContain("Kopi");
    expect(html).toContain("#2563eb");
    expect(html).not.toContain("<select");
  });

  it("shows the default package icon for null and forwards disabled state", async () => {
    const picker = await import("../components/CategoryIconPicker").catch(() => null);
    expect(picker).not.toBeNull();
    if (!picker) return;
    const html = renderToStaticMarkup(<picker.CategoryIconPicker value={null} label="Ikon 2" disabled onChange={() => {}} />);
    expect(html).toContain("Ikon bawaan");
    expect(html).toContain("lucide-package");
    expect(html).toContain("background-color:#f1f5f9");
    expect(html).toContain('disabled=""');
    expect(html).toContain('aria-expanded="false"');
  });

  it("keeps icons readable on white and yellow category colors", async () => {
    const { CategoryIconPicker } = await import("../components/CategoryIconPicker");
    for (const color of ["#fff", "#ffff00", "#fefefe"]) {
      const html = renderToStaticMarkup(<CategoryIconPicker value="coffee" color={color} label="Ikon 1" onChange={() => {}} />);
      expect(html).toContain(`background-color:${color}`);
      expect(html).toContain("color:#0f172a");
    }
  });
});
