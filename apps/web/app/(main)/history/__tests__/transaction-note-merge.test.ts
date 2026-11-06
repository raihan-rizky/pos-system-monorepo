import { describe, expect, it } from "vitest";
import {
  displayTransactionNote,
  mergeTransactionUserNote,
} from "../helpers/transaction-note";

describe("mergeTransactionUserNote", () => {
  it("adds a multiline note to an empty transaction", () => {
    expect(mergeTransactionUserNote(null, "Kirim pagi\nHubungi dulu")).toBe(
      "Kirim pagi\nHubungi dulu",
    );
  });

  it("changes and clears ordinary notes", () => {
    expect(mergeTransactionUserNote("Catatan lama", "Catatan baru")).toBe("Catatan baru");
    expect(mergeTransactionUserNote("Catatan lama", "")).toBeNull();
  });

  it("preserves division and settlement annotations when replacing text", () => {
    const merged = mergeTransactionUserNote(
      "Catatan lama | Pelunasan piutang 500.000 (CASH) [DIVISI:Produksi]",
      "Catatan baru",
    );
    expect(merged).toContain("[DIVISI:Produksi]");
    expect(merged).toContain("Pelunasan piutang 500.000 (CASH)");
    expect(displayTransactionNote(merged)).toBe("Catatan baru");
  });

  it("preserves annotations when the visible note is cleared", () => {
    const merged = mergeTransactionUserNote(
      "Catatan | Pelunasan piutang 500.000 (CASH) [DIVISI:Produksi]",
      "",
    );
    expect(merged).toContain("[DIVISI:Produksi]");
    expect(merged).toContain("Pelunasan piutang 500.000 (CASH)");
    expect(displayTransactionNote(merged)).toBeNull();
  });

  it("keeps multiple settlement annotations while adding text to metadata-only notes", () => {
    const merged = mergeTransactionUserNote(
      "Pelunasan 50.000 (CASH) | Pelunasan piutang 25.000 (TRANSFER) [DIVISI:Admin]",
      "Sudah dikonfirmasi",
    );
    expect(merged).toContain("Pelunasan 50.000 (CASH)");
    expect(merged).toContain("Pelunasan piutang 25.000 (TRANSFER)");
    expect(merged).toContain("[DIVISI:Admin]");
    expect(displayTransactionNote(merged)).toBe("Sudah dikonfirmasi");
  });

  it("keeps offline sync information editable as ordinary note text", () => {
    const merged = mergeTransactionUserNote(
      "Offline sync: koneksi terputus [DIVISI:Admin]",
      "Offline sync: sudah diperiksa",
    );
    expect(displayTransactionNote(merged)).toBe("Offline sync: sudah diperiksa");
    expect(merged).toContain("[DIVISI:Admin]");
  });

  it("retains every division annotation without exposing it as editable text", () => {
    const merged = mergeTransactionUserNote("[DIVISI:Admin] [DIVISI:Produksi]", "Catatan baru");
    expect(merged).toContain("[DIVISI:Admin]");
    expect(merged).toContain("[DIVISI:Produksi]");
    expect(displayTransactionNote(merged)).toBe("Catatan baru");
  });
});
