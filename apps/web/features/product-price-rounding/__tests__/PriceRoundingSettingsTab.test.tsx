import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PriceRoundingSettingsView, type PriceRoundingSettingsViewProps } from "../components/PriceRoundingSettingsTab";

const props: PriceRoundingSettingsViewProps = {
  settings: { enabled: true, increment: 500, threshold: 50 },
  canUpdate: true, isLoading: false, isUpdating: false, error: null, success: false,
  onChange: vi.fn(), onSubmit: vi.fn(),
};

describe("price rounding settings form", () => {
  it("labels its controls and explains the 49/50 threshold preview", () => {
    const html = renderToStaticMarkup(<PriceRoundingSettingsView {...props} />);
    expect(html).toContain('for="rounding-increment"');
    expect(html).toContain('for="rounding-threshold"');
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain("4.049");
    expect(html).toContain("4.050");
    expect(html).toContain("4.500");
    expect(html).toContain("Simpan pengaturan");
  });

  it("prevents edits for a role with read access only", () => {
    const html = renderToStaticMarkup(<PriceRoundingSettingsView {...props} canUpdate={false} />);
    expect(html).toContain('<fieldset disabled=""');
    expect(html).toContain("izin Ubah");
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
