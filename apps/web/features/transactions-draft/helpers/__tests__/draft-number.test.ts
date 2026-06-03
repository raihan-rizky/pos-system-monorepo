import { describe, it, expect } from "vitest";
import {
  buildDraftNumber,
  formatDraftNumberForDisplay,
} from "../draft-number";

describe("buildDraftNumber", () => {
  it("formats PNW-TLD-YYYYMMDD-### with zero-padded count", () => {
    expect(buildDraftNumber("20260602", 1)).toBe("PNW-TLD-20260602-001");
    expect(buildDraftNumber("20260602", 42)).toBe("PNW-TLD-20260602-042");
    expect(buildDraftNumber("20260602", 999)).toBe("PNW-TLD-20260602-999");
  });

  it("throws when count is negative", () => {
    expect(() => buildDraftNumber("20260520", -1)).toThrow();
  });

  it("throws on malformed date", () => {
    expect(() => buildDraftNumber("2026-05-20", 1)).toThrow();
    expect(() => buildDraftNumber("20260", 1)).toThrow();
  });
});

describe("formatDraftNumberForDisplay", () => {
  it("formats stored PNW numbers for visual nota penawaran display", () => {
    expect(formatDraftNumberForDisplay("PNW-TLD-20260602-001")).toBe(
      "001/PNW-TLD/02/VI/2026",
    );
  });

  it("leaves unknown formats unchanged", () => {
    expect(formatDraftNumberForDisplay("DRAFT-20260520-0001")).toBe(
      "DRAFT-20260520-0001",
    );
  });
});
