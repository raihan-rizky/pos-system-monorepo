import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PaymentTermsBadge } from "../PaymentTermsBadge";

describe("PaymentTermsBadge", () => {
  it("labels a Tempo invoice and marks it settled only after payment", () => {
    const unpaid = renderToStaticMarkup(
      <PaymentTermsBadge
        status="COMPLETED"
        paymentMethod="TEMPO"
        total={100_000}
        amountPaid={0}
      />,
    );
    const paid = renderToStaticMarkup(
      <PaymentTermsBadge
        status="COMPLETED"
        paymentMethod="TEMPO"
        total={100_000}
        amountPaid={100_000}
      />,
    );

    expect(unpaid.replace(/<[^>]+>/g, "")).toBe("Tempo");
    expect(unpaid).toContain("Belum lunas");
    expect(paid.replace(/<[^>]+>/g, "")).toBe("Lunas");
    expect(paid).toContain("text-emerald-700");
    expect(unpaid).toContain("text-amber-800");
    expect(unpaid).toContain("whitespace-nowrap");
  });

  it("describes the remaining balance without adding visible badge text", () => {
    const markup = renderToStaticMarkup(
      <PaymentTermsBadge
        status="COMPLETED"
        paymentMethod="TEMPO"
        total={100_000}
        amountPaid={50_000}
      />,
    );

    expect(markup.replace(/<[^>]+>/g, "")).toBe("Tempo");
    expect(markup).toMatch(/title="[^"]*Sisa tagihan: Rp\s*50\.000/);
    expect(markup).toMatch(/aria-description="[^"]*Sisa tagihan: Rp\s*50\.000/);
    expect(markup).toContain('aria-label="TEMPO/TAGIHAN, Belum lunas"');
    expect(markup).toContain('aria-hidden="true"');
  });

  it("keeps the existing DP badge and hides itself for a regular sale", () => {
    expect(
      renderToStaticMarkup(
        <PaymentTermsBadge
          status="DP"
          paymentMethod="CASH"
          total={100_000}
          amountPaid={25_000}
        />,
      ),
    ).toContain("DP");
    expect(
      renderToStaticMarkup(
        <PaymentTermsBadge
          status="COMPLETED"
          paymentMethod="CASH"
          total={100_000}
          amountPaid={100_000}
        />,
      ),
    ).toBe("");
  });
});
