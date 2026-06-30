import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ColumnMappingStep } from "../ColumnMappingStep";

const baseProps = {
  rawHeaders: ["name"],
  mapping: { name: "name" as const },
  onMappingChange: vi.fn(),
  onConfirm: vi.fn(),
  onBack: vi.fn(),
};

describe("Supplier import ColumnMappingStep", () => {
  it("shows visible feedback while preview is being prepared", () => {
    const html = renderToStaticMarkup(
      <ColumnMappingStep {...baseProps} isPreviewing />,
    );

    expect(html).toContain("Membuat Preview");
    expect(html).toContain("disabled");
  });

  it("surfaces preview failures on the mapping step", () => {
    const html = renderToStaticMarkup(
      <ColumnMappingStep
        {...baseProps}
        previewErrorMessage="Preview supplier gagal. Coba lagi."
      />,
    );

    expect(html).toContain("Preview supplier gagal. Coba lagi.");
  });
});
