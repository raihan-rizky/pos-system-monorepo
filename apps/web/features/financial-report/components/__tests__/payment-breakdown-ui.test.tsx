import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PaymentBreakdownCard } from "../PaymentBreakdownCard";

describe("PaymentBreakdownCard", () => {
  it("labels actual tender totals as receipts rather than revenue", () => {
    const html = renderToStaticMarkup(
      createElement(PaymentBreakdownCard, {
        rows: [
          {
            method: "CASH",
            transactionCount: 1,
            revenue: 0,
            collected: 25000,
          },
        ],
        totalRevenue: 100000,
      }),
    );

    expect(html).toContain("Uang Diterima per Metode Pembayaran");
    expect(html).toContain("Komposisi penerimaan per metode pembayaran");
    expect(html).toContain("Diterima");
    expect(html).toContain("25.000");
    expect(html).not.toContain("100.000");
  });
});
