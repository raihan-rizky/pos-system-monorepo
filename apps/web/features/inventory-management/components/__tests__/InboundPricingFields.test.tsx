import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  InboundPricingFields,
  inboundPricingInputFromDraft,
  isInboundPricingDraftValid,
  pricingDraftForUnit,
} from "../InboundPricingFields";

const unit = {
  productId: "box", unit: "box", unitMultiplierToBase: 12,
  costPrice: 1200, price: 1800, hargaAgen: 1700, hargaDinas: 1600,
};

describe("inbound pricing fields", () => {
  it("prepopulates values from the selected unit and serializes them as numbers", () => {
    const draft = pricingDraftForUnit(unit);
    expect(draft).toEqual({ productId: "box", costPrice: "1200", price: "1800", hargaAgen: "1700", hargaDinas: "1600" });
    expect(inboundPricingInputFromDraft(draft)).toEqual({
      productId: "box", costPrice: 1200, price: 1800, hargaAgen: 1700, hargaDinas: 1600,
    });
  });

  it("renders all required fields for a matched line", () => {
    const html = renderToStaticMarkup(<InboundPricingFields units={[unit]} value={pricingDraftForUnit(unit)} onChange={vi.fn()} required namePrefix="line" />);
    for (const label of ["Satuan", "HPP Unit", "Harga Jual", "Harga Jual Agen", "Harga Jual Dinas"]) expect(html).toContain(label);
    expect(html.match(/required=""/g)).toHaveLength(5);
    expect(html).toContain('value="box"');
  });

  it("allows an empty mismatched line and serializes blank values to null", () => {
    const draft = pricingDraftForUnit();
    expect(isInboundPricingDraftValid(draft, false)).toBe(true);
    expect(isInboundPricingDraftValid(draft, true)).toBe(false);
    expect(inboundPricingInputFromDraft(draft)).toEqual({ productId: null, costPrice: null, price: null, hargaAgen: null, hargaDinas: null });
    const html = renderToStaticMarkup(<InboundPricingFields units={[unit]} value={draft} onChange={vi.fn()} required={false} namePrefix="line" />);
    expect(html).not.toContain('required=""');
    expect(html.match(/disabled=""/g)).toHaveLength(4);
  });

  it("accepts zero and partial optional prices but rejects invalid and unitless values", () => {
    const draft = { ...pricingDraftForUnit(unit), costPrice: "0", price: "", hargaAgen: "", hargaDinas: "" };
    expect(isInboundPricingDraftValid(draft, false)).toBe(true);
    expect(isInboundPricingDraftValid(draft, true)).toBe(false);
    expect(isInboundPricingDraftValid({ ...draft, productId: "" }, false)).toBe(false);
    for (const value of ["-1", "1.001", "Infinity", "10000000000"]) {
      expect(isInboundPricingDraftValid({ ...draft, costPrice: value }, false)).toBe(false);
    }
  });
});
