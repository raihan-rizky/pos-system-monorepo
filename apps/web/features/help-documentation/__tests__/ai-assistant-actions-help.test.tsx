import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import HelpContent from "../components/HelpContent";

describe("AI assistant action help", () => {
  it("documents export defaults, whole-report analysis, and modal shortcuts", () => {
    const html = renderToStaticMarkup(<HelpContent targetRole="AI_ASSISTANT" />);

    expect(html).toContain("30 hari terakhir");
    expect(html).toContain("PDF");
    expect(html).toContain("seluruh metrik");
    expect(html).toContain("membuka modal");
  });
});
