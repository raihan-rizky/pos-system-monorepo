import { describe, expect, it } from "vitest";
import {
  encodeDivisionInNote,
  decodeDivisionFromNote,
} from "../division-note";

describe("encodeDivisionInNote", () => {
  it("appends [DIVISI:value] to existing note", () => {
    expect(encodeDivisionInNote("Harga proyek", "Purchasing")).toBe(
      "Harga proyek [DIVISI:Purchasing]",
    );
  });

  it("returns only the tag when note is empty", () => {
    expect(encodeDivisionInNote("", "Purchasing")).toBe("[DIVISI:Purchasing]");
    expect(encodeDivisionInNote(null, "Purchasing")).toBe("[DIVISI:Purchasing]");
  });

  it("returns the note unchanged when division is empty", () => {
    expect(encodeDivisionInNote("Harga proyek", "")).toBe("Harga proyek");
    expect(encodeDivisionInNote("Harga proyek", "  ")).toBe("Harga proyek");
  });

  it("returns null when both note and division are empty", () => {
    expect(encodeDivisionInNote(null, "")).toBeNull();
    expect(encodeDivisionInNote("", "")).toBeNull();
  });
});

describe("decodeDivisionFromNote", () => {
  it("extracts division and cleans note", () => {
    const result = decodeDivisionFromNote("Harga proyek [DIVISI:Purchasing]");
    expect(result.division).toBe("Purchasing");
    expect(result.cleanNote).toBe("Harga proyek");
  });

  it("extracts division when note is only the tag", () => {
    const result = decodeDivisionFromNote("[DIVISI:Purchasing]");
    expect(result.division).toBe("Purchasing");
    expect(result.cleanNote).toBeNull();
  });

  it("returns empty division when tag is not present", () => {
    const result = decodeDivisionFromNote("Harga proyek");
    expect(result.division).toBe("");
    expect(result.cleanNote).toBe("Harga proyek");
  });

  it("handles null/undefined note", () => {
    expect(decodeDivisionFromNote(null)).toEqual({ division: "", cleanNote: null });
    expect(decodeDivisionFromNote(undefined)).toEqual({ division: "", cleanNote: null });
  });

  it("round-trips through encode → decode", () => {
    const encoded = encodeDivisionInNote("Catatan penting", "Divisi IT");
    const { division, cleanNote } = decodeDivisionFromNote(encoded);
    expect(division).toBe("Divisi IT");
    expect(cleanNote).toBe("Catatan penting");
  });
});
