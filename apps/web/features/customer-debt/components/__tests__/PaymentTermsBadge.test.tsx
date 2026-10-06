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

    expect(unpaid).toContain("Tempo/Tagihan");
    expect(unpaid).toContain("Belum lunas");
    expect(paid).toContain("Tempo/Tagihan");
    expect(paid).toContain("Lunas");
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
