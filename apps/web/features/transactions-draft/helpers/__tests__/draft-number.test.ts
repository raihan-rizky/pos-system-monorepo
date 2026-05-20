import { describe, it, expect } from "vitest";
import { buildDraftNumber } from "../draft-number";

describe("buildDraftNumber", () => {
  it("formats DRAFT-YYYYMMDD-#### with zero-padded count", () => {
    expect(buildDraftNumber("20260520", 1)).toBe("DRAFT-20260520-0001");
    expect(buildDraftNumber("20260520", 42)).toBe("DRAFT-20260520-0042");
    expect(buildDraftNumber("20260520", 9999)).toBe("DRAFT-20260520-9999");
  });

  it("throws when count is negative", () => {
    expect(() => buildDraftNumber("20260520", -1)).toThrow();
  });

  it("throws on malformed date", () => {
    expect(() => buildDraftNumber("2026-05-20", 1)).toThrow();
    expect(() => buildDraftNumber("20260", 1)).toThrow();
  });
});
