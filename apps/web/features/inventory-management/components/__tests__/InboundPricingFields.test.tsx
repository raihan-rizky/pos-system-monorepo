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

  it("explains that mismatched prices are recorded without updating product prices", () => {
    const html = renderToStaticMarkup(<InboundPricingFields units={[unit]} value={pricingDraftForUnit(unit)} onChange={vi.fn()} required={false} namePrefix="line" />);
    expect(html).toContain("dicatat tanpa memperbarui harga produk");
    expect(html).not.toContain("diperbarui setelah penerimaan disetujui");
  });

  it("shows an automatic-unit rounding error before submitting a matched item", () => {
    const autoBox = { ...unit, autoCostSource: { productId: "pcs", unit: "pcs", unitMultiplierToBase: 1 } };
    const draft = { ...pricingDraftForUnit(autoBox), costPrice: "100" };
    expect(isInboundPricingDraftValid(draft, true, [autoBox])).toBe(false);
    expect(isInboundPricingDraftValid(draft, false, [autoBox])).toBe(true);
    const html = renderToStaticMarkup(<InboundPricingFields units={[autoBox]} value={draft} onChange={vi.fn()} required namePrefix="line" />);
    expect(html).toContain("99,96");
    expect(html).toContain("pcs");
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
