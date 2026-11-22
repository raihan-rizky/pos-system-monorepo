import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LegacyGiroPaymentRecovery } from "../LegacyGiroPaymentRecovery";

const record = {
  payableId: "old-debt",
  raw: JSON.stringify({ key: "b14f880a-fb50-43bc-a2aa-4733c8811dad", amount: "30000", paidAt: "2026-10-20" }),
  pending: { key: "b14f880a-fb50-43bc-a2aa-4733c8811dad", amount: "30000", paidAt: "2026-10-20" },
};

describe("pemulihan pembayaran lama", () => {
  it("menjelaskan akun dan toko asal tidak diketahui, serta meminta keputusan sebelum memeriksa atau menghapus", () => {
    const html = renderToStaticMarkup(<LegacyGiroPaymentRecovery records={[record]} onRecover={vi.fn()} onRemove={vi.fn()} />);
    expect(html).toContain("Akun dan toko asal tidak tercatat");
    expect(html).toContain("Periksa pembayaran pada akun/toko ini");
    expect(html).toContain("Hapus catatan setelah memeriksa riwayat");
    expect(html).toContain("type=\"checkbox\"");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Periksa pembayaran pada akun\/toko ini<\/button>/);
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Hapus catatan setelah memeriksa riwayat<\/button>/);
  });

  it("tidak menawarkan replay untuk catatan yang datanya tidak bisa dibaca", () => {
    const html = renderToStaticMarkup(<LegacyGiroPaymentRecovery records={[{ ...record, pending: null }]} onRecover={vi.fn()} onRemove={vi.fn()} />);
    expect(html).toContain("Rincian catatan lama tidak dapat dibaca");
    expect(html).not.toContain("Periksa pembayaran pada akun/toko ini");
    expect(html).toContain("Hapus catatan setelah memeriksa riwayat");
  });
});
