import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import MainError from "../error";

vi.mock("lucide-react", () => ({
  AlertTriangle: () => React.createElement("span", { "data-icon": "alert" }),
  RefreshCw: () => React.createElement("span", { "data-icon": "refresh" }),
  RotateCcw: () => React.createElement("span", { "data-icon": "retry" }),
}));

describe("MainError", () => {
  it("offers a latest-version reload for a runtime mismatch", () => {
    const rawMessage = "Cannot read properties of undefined (reading 'call')";
    const html = renderToStaticMarkup(
      <MainError error={new TypeError(rawMessage)} reset={vi.fn()} />,
    );

    expect(html).toContain("Versi aplikasi telah diperbarui");
    expect(html).toContain("Muat Ulang Versi Terbaru");
    expect(html).not.toContain("Coba Lagi");
    expect(html).not.toContain(rawMessage);
    expect(html).toContain('type="button"');
    expect(html).toContain("min-h-11");
    expect(html).toContain("focus-visible:");
  });

  it("offers reset and full reload for an ordinary error", () => {
    const rawMessage = "Database timeout with internal details";
    const error = Object.assign(new Error(rawMessage), {
      digest: "support-123",
    });
    const html = renderToStaticMarkup(
      <MainError error={error} reset={vi.fn()} />,
    );

    expect(html).toContain("Halaman tidak dapat dimuat");
    expect(html).toContain("Coba Lagi");
    expect(html).toContain("Muat Ulang Halaman");
    expect(html).toContain("support-123");
    expect(html).not.toContain(rawMessage);
  });
});
