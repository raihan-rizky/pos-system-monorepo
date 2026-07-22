import React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/Sidebar", () => ({
  Sidebar: () => React.createElement("aside", null, "Sidebar"),
}));

import MainLayout from "../layout";

describe("MainLayout", () => {
  it("renders global floating AI Assistant widget", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        MainLayout,
        null,
        React.createElement("main", null, "Dashboard"),
      ),
    );

    expect(html).toContain("floating-ai-button");
  });

  it("defers the heavy AI Assistant implementation from the initial app-shell chunk", () => {
    const source = readFileSync(new URL("../layout.tsx", import.meta.url), "utf8");

    expect(source).toContain("DeferredAssistantWidget");
    expect(source).not.toMatch(/import\s+\{\s*AssistantWidget\s*\}/);
  });

  it("allows horizontal scrolling in the main layout content area of the app shell", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        MainLayout,
        null,
        React.createElement("main", null, "Dashboard"),
      ),
    );

    expect(html).toContain("overflow-x-auto");
    expect(html).toContain("overflow-y-hidden");
  });

  it("renders a subtle shared loop animation without blocking page interaction", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        MainLayout,
        null,
        React.createElement("main", null, "Dashboard"),
      ),
    );

    expect(html).toContain("app-page-loop");
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("pointer-events-none");
  });
});
