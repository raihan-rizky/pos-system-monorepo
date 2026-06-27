import React from "react";
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
});
