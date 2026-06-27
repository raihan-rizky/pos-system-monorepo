import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AssistantWidget } from "../AssistantWidget";

describe("AssistantWidget", () => {
  it("renders a floating assistant button", () => {
    const html = renderToStaticMarkup(<AssistantWidget />);

    expect(html).toContain("floating-ai-button");
    expect(html).toContain("fixed");
    expect(html).toContain("bottom-6");
  });

  it("renders chat panel markup when opened by default", () => {
    const html = renderToStaticMarkup(<AssistantWidget defaultOpen />);

    expect(html).toContain("Tanya AI");
    expect(html).toContain("Pak Teladan");
    expect(html).toContain("Halo, saya siap membantu");
    expect(html).toContain('maxLength="2000"');
    expect(html).toContain("Maksimal 2.000 karakter per pesan.");
  });

  it("renders source metadata under AI messages", () => {
    const html = renderToStaticMarkup(
      <AssistantWidget
        defaultOpen
        initialMessages={[
          {
            role: "assistant",
            content: "Ini produk low stock.",
            metadata: {
              sourceLabel: "Tool stok rendah",
              generatedAt: "2026-06-26T10:15:00.000Z",
            },
          },
        ]}
      />,
    );

    expect(html).toContain("Sumber: Tool stok rendah");
    expect(html).toContain("26 Jun 2026");
  });

  it("renders a safe collapsed status log under assistant messages", () => {
    const html = renderToStaticMarkup(
      <AssistantWidget
        defaultOpen
        initialMessages={[
          {
            role: "assistant",
            content: "Ini produk low stock.",
            actionLog: [
              {
                id: "step-1",
                label: "Processing request",
                status: "done",
                occurredAt: "2026-06-26T10:15:00.000Z",
              },
              {
                id: "step-2",
                label: "Checking data",
                status: "done",
                occurredAt: "2026-06-26T10:16:00.000Z",
              },
            ],
          },
        ]}
      />,
    );

    expect(html).toContain("Status");
    expect(html).toContain("Checking data");
    expect(html).not.toContain("get_low_stock_items");
  });

  it("expands an active status log so live progress is visible", () => {
    const html = renderToStaticMarkup(
      <AssistantWidget
        defaultOpen
        initialMessages={[
          {
            role: "assistant",
            content: "",
            actionLog: [
              {
                id: "request-1",
                label: "Request sent",
                status: "done",
                occurredAt: "2026-06-27T01:00:00.000Z",
              },
              {
                id: "planning-1",
                label: "Processing request",
                status: "active",
                occurredAt: "2026-06-27T01:00:01.000Z",
              },
            ],
          },
        ]}
      />,
    );

    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-label="Proses AI"');
    expect(html).toContain("Request sent");
    expect(html).toContain("Processing request");
  });
});
