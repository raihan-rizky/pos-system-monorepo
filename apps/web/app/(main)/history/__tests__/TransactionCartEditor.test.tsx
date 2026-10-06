import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { TransactionCartEditor } from "../components/TransactionCartEditor";

vi.mock("@/hooks/useProducts", () => ({
  useProducts: () => ({ data: [], isLoading: false }),
}));

describe("TransactionCartEditor approval pricing", () => {
  it("shows cost, regular, agent, government, special, and applied prices", () => {
    const html = renderToStaticMarkup(
      <TransactionCartEditor
        items={[
          {
            productId: "paper-1",
            productName: "Kertas A4",
            quantity: 2,
            unitPrice: 90,
            originalUnitPrice: 100,
            appliedUnitPrice: 90,
            subtotal: 180,
          },
        ]}
        priceDetails={[
          {
            name: "Kertas A4",
            modal: 40,
            regular: 100,
            agent: 85,
            government: 88,
            special: 90,
            appliedUnitPrice: 90,
            subtotal: 180,
          },
        ]}
        onChange={vi.fn()}
      />,
    );

    expect(html).toContain("Modal");
    expect(html).toContain("Normal");
    expect(html).toContain("Agen");
    expect(html).toContain("Dinas");
    expect(html).toContain("Harga khusus");
    expect(html).toContain("Harga berlaku");
  });
});
