import { describe, expect, it } from "vitest";

import {
  findDuplicateSupplierNameWarnings,
  normalizeSupplierName,
} from "../supplier-warnings";

describe("supplier duplicate warnings", () => {
  it("normalizes supplier names for duplicate checks", () => {
    expect(normalizeSupplierName("  CV   Sinar Jaya  ")).toBe("cv sinar jaya");
  });

  it("returns a non-blocking duplicate warning for matching supplier names", () => {
    const warnings = findDuplicateSupplierNameWarnings(
      { name: "cv sinar  jaya" },
      [
        { id: "supplier-1", name: "CV Sinar Jaya" },
        { id: "supplier-2", name: "PT Kertas Maju" },
      ],
    );

    expect(warnings).toEqual([
      {
        code: "DuplicateSupplierName",
        message: "Nama supplier mirip sudah ada.",
        matchedSupplierIds: ["supplier-1"],
      },
    ]);
  });

  it("ignores the supplier being edited when checking duplicates", () => {
    const warnings = findDuplicateSupplierNameWarnings(
      { id: "supplier-1", name: "CV Sinar Jaya" },
      [{ id: "supplier-1", name: "CV Sinar Jaya" }],
    );

    expect(warnings).toEqual([]);
  });
});
