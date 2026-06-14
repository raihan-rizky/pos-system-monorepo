import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("surat jalan print header", () => {
  it("places surat jalan metadata in the top-right header and removes the red divider", () => {
    const source = readFileSync(
      join(process.cwd(), "features/surat-jalan/components/SuratJalanPrintModal.tsx"),
      "utf8",
    );

    expect(source).toContain("No. Surat Jalan");
    expect(source).toContain("Tanggal");
    expect(source).toContain("Penerima");
    expect(source).toContain("formatSuratJalanDate");
    expect(source).not.toContain('borderTop: "2.5px solid #cc0000"');
  });
});
