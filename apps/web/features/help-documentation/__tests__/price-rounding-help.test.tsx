import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HELP_ROLE_CONTENT } from "../components/HelpContent";
import { SettingsPreview } from "../components/app-shell-preview/pages/SettingsPreview";
import { resolvePreviewState } from "../components/app-shell-preview/preview-registry";

describe("price rounding help visuals", () => {
  it("provides three audited owner steps with permission and badge guidance", () => {
    const guide = HELP_ROLE_CONTENT.OWNER.find((item) => item.id === "owner-price-rounding");
    expect(guide?.steps).toHaveLength(3);
    expect(guide?.steps.map((step) => step.visual?.target)).toEqual([
      "settings-rounding-tab", "settings-rounding-rule", "settings-rounding-save",
    ]);
    const descriptions = guide?.steps.map((step) => step.description).join(" ");
    expect(descriptions).toContain("settings.price_rounding");
    expect(descriptions).toContain("Rp4.049");
    expect(descriptions).toContain("Rp4.050");
    expect(descriptions).toContain("harga asal");
    expect(descriptions).toContain("selisih");
  });

  it.each(["settings-rounding-tab", "settings-rounding-rule", "settings-rounding-save"])("renders the active rounding policy panel for %s", (target) => {
    const state = resolvePreviewState("settings", target);
    expect(state).toBe("settings-price-rounding");
    const html = renderToStaticMarkup(<SettingsPreview page="settings" activeTarget={target} stepNumber={2} stepTitle="Atur pembulatan" callout="Periksa pengaturan" state={state} />);
    expect(html).toContain('data-help-step-state="settings-price-rounding-active"');
    expect(html).toContain(`data-help-target="${target}" data-help-target-active="true"`);
    expect(html).toContain("Ilustrasi");
    expect(html).toContain("Kelipatan (Rp)");
    expect(html).toContain("Ambang naik (Rp)");
    expect(html).toContain("500");
    expect(html).toContain("50");
    expect(html).toContain("Rp4.049");
    expect(html).toContain("Rp4.000");
    expect(html).toContain("Rp4.050");
    expect(html).toContain("Rp4.500");
    expect(html).toContain("Dibulatkan ke atas");
    expect(html).toContain("Dibulatkan ke bawah");
    expect(html).toContain("Simpan pengaturan");
  });
});
