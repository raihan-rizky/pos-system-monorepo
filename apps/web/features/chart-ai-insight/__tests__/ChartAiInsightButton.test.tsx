import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChartAiInsightButton } from "../ChartAiInsightButton";

describe("ChartAiInsightButton", () => {
  it("renders a sparkles AI button with aria-label", () => {
    const html = renderToStaticMarkup(
      <ChartAiInsightButton chartTitle="Tren Omzet" chartContext="omzet 100k" />,
    );
    expect(html).toContain("chart-ai-insight-btn");
    expect(html).toContain("Analisis AI");
  });

  it("renders insight panel when defaultOpen=true", () => {
    const html = renderToStaticMarkup(
      <ChartAiInsightButton
        chartTitle="Tren Omzet"
        chartContext="omzet 100k"
        defaultOpen
      />,
    );
    expect(html).toContain("chart-ai-insight-panel");
    expect(html).toContain("Tren Omzet");
  });

  it("renders loading skeleton when defaultOpen and defaultLoading", () => {
    const html = renderToStaticMarkup(
      <ChartAiInsightButton
        chartTitle="Revenue"
        chartContext="data"
        defaultOpen
        defaultLoading
      />,
    );
    expect(html).toContain("chart-ai-insight-loading");
  });

  it("renders insight points when provided via defaultInsights", () => {
    const html = renderToStaticMarkup(
      <ChartAiInsightButton
        chartTitle="Rekap"
        chartContext="data"
        defaultOpen
        defaultInsights={["Omzet naik 15%", "Kategori A dominan"]}
      />,
    );
    expect(html).toContain("Omzet naik 15%");
    expect(html).toContain("Kategori A dominan");
  });

  it("renders error message when defaultError provided", () => {
    const html = renderToStaticMarkup(
      <ChartAiInsightButton
        chartTitle="Stok"
        chartContext="data"
        defaultOpen
        defaultError="Gagal memuat insight"
      />,
    );
    expect(html).toContain("Gagal memuat insight");
  });
});
