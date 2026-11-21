import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import * as components from "../components/UnvoidPreviewModal";

const Preview = (components as Record<string, any>).UnvoidPreviewContent ?? (() => null);
const data = {
  invoiceNumber: "INV-1", previousStatus: "DP", customerId: "cust-1", previewToken: "token",
  financialReversal: { amountPaid: 75, debtRemoved: 25 },
  stock: [{ productId: "prod-1", stockGroupId: null, name: "Kertas", amount: 2, unit: "lembar", available: 5 }],
  shipments: [{ id: "sj-1", number: "SJ-1", status: "CONFIRMED" }],
};

describe("pratinjau pemulihan di Riwayat", () => {
  it("menampilkan dampak nyata sebelum konfirmasi", () => {
    const html = renderToStaticMarkup(<Preview preview={data} />);
    for (const text of ["INV-1", "DP", "Kertas", "2", "lembar", "SJ-1", "Piutang"]) expect(html).toContain(text);
  });
  it("menjelaskan bila tidak ada perubahan stok atau surat jalan", () => {
    const html = renderToStaticMarkup(<Preview preview={{ ...data, stock: [], shipments: [], financialReversal: null }} />);
    expect(html).toContain("Tidak ada perubahan stok");
    expect(html).toContain("Tidak ada surat jalan yang dipulihkan");
  });
});
