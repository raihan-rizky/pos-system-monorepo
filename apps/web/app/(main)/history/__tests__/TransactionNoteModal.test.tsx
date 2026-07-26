import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { TransactionNoteModal } from "../components/TransactionNoteModal";

describe("TransactionNoteModal", () => {
  it("renders the full note text across line breaks plus the document number", () => {
    const html = renderToStaticMarkup(
      <TransactionNoteModal
        note={"Baris pertama\nBaris kedua yang panjang sekali dan tidak boleh terpotong"}
        documentNumber="INV-20260727-0001"
        onClose={vi.fn()}
      />,
    );

    expect(html).toContain("Catatan");
    expect(html).toContain("INV-20260727-0001");
    expect(html).toContain("Baris pertama");
    expect(html).toContain("Baris kedua yang panjang sekali dan tidak boleh terpotong");
    expect(html).toContain("whitespace-pre-wrap");
  });

  it("omits the subtitle when the transaction has no document number", () => {
    const html = renderToStaticMarkup(
      <TransactionNoteModal
        note="Transaksi tanpa nomor"
        documentNumber={null}
        onClose={vi.fn()}
      />,
    );

    expect(html).toContain("Transaksi tanpa nomor");
    expect(html).not.toContain("data-testid=\"note-modal-subtitle\"");
  });
});
