import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("surat jalan print header", () => {
  it("shows the document number with the title and includes vehicle details", () => {
    const source = readFileSync(
      join(process.cwd(), "features/surat-jalan/components/SuratJalanDocument.tsx"),
      "utf8",
    );

    expect(source).toContain("No. {number}");
    expect(source).toContain("Tanggal");
    expect(source).toContain("Penerima");
    expect(source).toContain("formatSuratJalanDate");
    expect(source).toContain("Kendaraan");
    expect(source).toContain("No. Polisi");
  });
});
