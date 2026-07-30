import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  PricingPreferenceSelector,
  pricingPreferenceReducer,
} from "../components/PricingPreferenceSelector";
import type { CustomerType } from "@/features/customer-category-pricing/helpers/pricing-rules";

function renderSelector(customerType: CustomerType) {
  return renderToStaticMarkup(
    <PricingPreferenceSelector
      customerType={customerType}
      value="SPECIAL"
      onChange={vi.fn()}
    />,
  );
}

describe("PricingPreferenceSelector", () => {
  it("shows one transaction-level choice for Agen and Pemerintah", () => {
    expect(renderSelector("AGEN")).toContain("Prioritas Harga");
    expect(renderSelector("AGEN")).toContain("Harga Khusus (Default)");
    expect(renderSelector("PEMERINTAH")).toContain("Harga Agen/Dinas");
    expect(renderSelector("AGEN")).toContain(
      "Pilihan ini berlaku untuk seluruh transaksi.",
    );
  });

  it("stays hidden when the customer has no member price type", () => {
    expect(renderSelector("UMUM")).toBe("");
    expect(renderSelector("INDUSTRI")).toBe("");
  });

  it("resets the transaction choice to Harga Khusus", () => {
    expect(
      pricingPreferenceReducer("MEMBER", { type: "RESET" }),
    ).toBe("SPECIAL");
  });
});
