import { describe, expect, it } from "vitest";
import { displayTransactionNote } from "../helpers/transaction-note";

describe("displayTransactionNote", () => {
  it("returns null for null input", () => {
    expect(displayTransactionNote(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(displayTransactionNote(undefined)).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(displayTransactionNote("")).toBeNull();
  });

  it("passes a plain user note through unchanged", () => {
    expect(displayTransactionNote("Ambil sore, hubungi dulu")).toBe(
      "Ambil sore, hubungi dulu",
    );
  });

  it("returns null when the note is only a Divisi tag", () => {
    expect(displayTransactionNote("[DIVISI:Produksi]")).toBeNull();
  });

  it("strips a trailing Divisi tag and keeps the user text", () => {
    expect(displayTransactionNote("Ambil sore [DIVISI:Produksi]")).toBe(
      "Ambil sore",
    );
  });

  it("strips a Pelunasan annotation", () => {
    expect(
      displayTransactionNote("Pelunasan piutang 500.000 (CASH)"),
    ).toBeNull();
  });

  it("strips a Pelunasan annotation appended after user text", () => {
    expect(
      displayTransactionNote(
        "Ambil sore | Pelunasan piutang 500.000 (CASH)",
      ),
    ).toBe("Ambil sore");
  });

  it("strips both a Divisi tag and a Pelunasan annotation, leaving only user text", () => {
    expect(
      displayTransactionNote(
        "Ambil sore | Pelunasan piutang 500.000 (CASH) [DIVISI:Produksi]",
      ),
    ).toBe("Ambil sore");
  });

  it("keeps Offline sync annotations visible", () => {
    expect(
      displayTransactionNote("Ambil sore | Offline sync: koneksi terputus"),
    ).toBe("Ambil sore | Offline sync: koneksi terputus");
  });
});
