import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("surat jalan print css", () => {
  it("prints only the surat jalan target and hides the regular invoice receipt", () => {
    const css = readFileSync(
      join(process.cwd(), "features/surat-jalan/components/surat-jalan-print.css"),
      "utf8",
    );

    expect(css).toContain("size: 215mm 165mm");
    expect(css).toContain("#surat-jalan-print");
    expect(css).toContain("body:has(#surat-jalan-print) *");
    expect(css).toContain("visibility: hidden");
    expect(css).toContain("visibility: visible !important");
    expect(css).toContain("#print-receipt");
    expect(css).toContain("#draft-receipt-page");
    expect(css).toContain("display: none !important");
    expect(css).toContain("div[role=\"dialog\"]");
    expect(css).toContain("transform: none !important");
    expect(css).toContain("position: absolute !important");
    expect(css).toContain("left: 0 !important");
    expect(css).toContain("top: 0 !important");
    expect(css).toContain("display: flex");
    expect(css).toContain("padding: 4mm 6mm !important");
  });
});
