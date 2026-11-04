import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PriceRoundingSettingsView, type PriceRoundingSettingsViewProps } from "../components/PriceRoundingSettingsTab";

const props: PriceRoundingSettingsViewProps = {
  settings: { enabled: true, increment: 500, threshold: 50 },
  canUpdate: true, isLoading: false, isUpdating: false, error: null, success: false,
  onChange: vi.fn(), onSubmit: vi.fn(),
};

describe("price rounding settings form", () => {
  it("shows searchable categories and preserves selected exceptions", () => {
    const html = renderToStaticMarkup(<PriceRoundingSettingsView {...props}
      settings={{ ...props.settings, excludedCategoryIds: ["cat-a"] }}
      categories={[{ id: "cat-a", name: "Alat Tulis" }, { id: "cat-b", name: "Kertas" }]} />);
    expect(html).toContain("Kategori yang dikecualikan");
    expect(html).toContain("Cari kategori");
    expect(html).toContain("1 kategori dipilih");
    expect(html).toContain("Alat Tulis");
    expect(html).toContain("Kertas");
    expect(html).toMatch(/type="checkbox"[^>]*checked=""/);
  });

  it("reports category loading failure and blocks saving", () => {
    const html = renderToStaticMarkup(<PriceRoundingSettingsView {...props} categoriesError />);
    expect(html).toContain("Kategori belum dapat dimuat");
    expect(html).toMatch(/<button type="submit" disabled=""/);
  });
  it("labels its controls and explains the 49/50 threshold preview", () => {
    const html = renderToStaticMarkup(<PriceRoundingSettingsView {...props} />);
    expect(html).toContain('for="rounding-increment"');
    expect(html).toContain('for="rounding-threshold"');
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain("4.049");
    expect(html).toContain("4.050");
    expect(html).toContain("4.500");
    expect(html).toContain("Contoh untuk kategori yang tidak dikecualikan");
    expect(html).toContain("Simpan pengaturan");
  });

  it("prevents edits for a role with read access only", () => {
    const html = renderToStaticMarkup(<PriceRoundingSettingsView {...props} canUpdate={false} categories={[{ id: "cat-a", name: "Kertas" }]} />);
    expect(html).toContain('<fieldset disabled=""');
    expect(html).toContain("izin Ubah");
    expect(html).toMatch(/<fieldset class="[^"]+"><legend[^>]*>Kategori yang dikecualikan/);
    expect(html).toMatch(/type="checkbox" disabled=""/);
  });

  it("blocks saving when the active policy could not be loaded", () => {
    const html = renderToStaticMarkup(<PriceRoundingSettingsView {...props} unavailable error="Gagal memuat pengaturan." />);
    expect(html).toContain('<fieldset disabled=""');
    expect(html).toContain('role="alert"');
    expect(html).toContain("Gagal memuat pengaturan.");
  });

  it("shows validation errors accessibly and prevents saving an invalid policy", () => {
    const html = renderToStaticMarkup(<PriceRoundingSettingsView {...props} settings={{ enabled: true, increment: 0, threshold: 50 }} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain("Kelipatan");
    expect(html).toContain('disabled=""');
  });

  it("announces pending, error, and successful states", () => {
    expect(renderToStaticMarkup(<PriceRoundingSettingsView {...props} isUpdating />)).toContain("Menyimpan");
    expect(renderToStaticMarkup(<PriceRoundingSettingsView {...props} error="Gagal menyimpan." />)).toContain("Gagal menyimpan.");
    expect(renderToStaticMarkup(<PriceRoundingSettingsView {...props} success />)).toContain("Pengaturan pembulatan berhasil disimpan.");
  });
});
