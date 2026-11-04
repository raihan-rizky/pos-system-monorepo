import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReceiptChangesPage } from "../components/ReceiptChangesPage";

describe("keadaan awal halaman perubahan nota", () => {
  it("mengumumkan pemuatan dan tetap menyediakan jalan kembali ke Riwayat", () => {
    const html = renderToStaticMarkup(
      <ReceiptChangesPage transactionId="invoice-demo" />,
    );
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('role="status"');
    expect(html).toContain("Memuat riwayat perubahan nota");
    expect(html).toContain('href="/history"');
    expect(html).toContain("Perubahan nota");
  });
});
