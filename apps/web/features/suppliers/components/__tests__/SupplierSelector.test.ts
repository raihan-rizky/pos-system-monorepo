import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function supplierSelectorSource() {
  return readFileSync(
    join(process.cwd(), "features/suppliers/components/SupplierSelector.tsx"),
    "utf8",
  );
}

describe("SupplierSelector", () => {
  it("menggabungkan pencarian dan pemilihan supplier dalam satu combobox", () => {
    const content = supplierSelectorSource();

    expect(content).toContain('role="combobox"');
    expect(content).toContain('placeholder="Cari kode atau nama supplier"');
    expect(content).toContain('role="listbox"');
    expect(content).not.toContain('<option value="">Pilih supplier</option>');
  });
});
