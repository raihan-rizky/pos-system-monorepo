import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import * as details from "../FinanceCalculationDetails";

describe("penjelasan perhitungan keuangan", () => {
  it("menampilkan rumus dan nominal setiap komponen yang membentuk total", () => {
    const Component = (details as { FinanceCalculationDetails?: React.ComponentType<Record<string, unknown>> }).FinanceCalculationDetails;
    expect(Component).toBeTypeOf("function");
    if (!Component) return;
    const html = renderToStaticMarkup(createElement(Component, {
      income: { total: 160_000, supplierRefund: 10_000, components: { sales: 100_000, manualIncome: 20_000, manualReceivable: 30_000 } },
      expense: { total: 100_000, incomplete: false, correctionOutflow: 10_000, components: { manual: 10_000, transfer: 20_000, giroPayment: 30_000, giroDue: 25_000, overpayment: 5_000 } },
    }));
    expect(html).toContain("<details");
    expect(html).toContain("Pemasukan − Pengeluaran");
    expect(html).toContain("Pelunasan piutang manual");
    expect(html).toContain("Giro jatuh tempo dengan pembayaran tercatat");
    expect(html).toContain("termasuk yang sudah dibayar lebih awal");
    expect(html).toContain("Sisa giro jatuh tempo");
    expect(html).toContain("Kelebihan pembayaran");
    expect(html).toContain("Pengembalian dana pemasok");
    expect(html).toContain("Pembayaran pembelian yang dibatalkan");
    expect(html).toContain("60.000");
  });

  it("menandai perhitungan belum lengkap tanpa menampilkan hasil parsial sebagai total", () => {
    const Component = (details as { FinanceCalculationDetails?: React.ComponentType<Record<string, unknown>> }).FinanceCalculationDetails;
    expect(Component).toBeTypeOf("function");
    if (!Component) return;
    const html = renderToStaticMarkup(createElement(Component, {
      income: { total: 150_000, components: null },
      expense: { total: null, incomplete: true, components: { manual: 10_000, transfer: 0, giroPayment: 0, giroDue: 0, overpayment: 0 } },
    }));
    expect(html).toContain("belum lengkap");
    expect(html).toContain("Belum tersedia");
  });
});
