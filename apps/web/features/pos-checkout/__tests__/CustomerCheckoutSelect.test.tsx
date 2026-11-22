import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CustomerCheckoutSelect } from "../components/CustomerCheckoutSelect";

vi.mock("@/hooks/useCustomers", () => ({
  useCustomers: () => ({ data: { data: [] }, isFetching: false }),
}));

vi.mock("@/hooks/useDebounce", () => ({
  useDebounce: <T,>(value: T) => value,
}));

describe("CustomerCheckoutSelect new customer form", () => {
  it("shows a customer type dropdown defaulted to UMUM", () => {
    const html = renderToStaticMarkup(
      <CustomerCheckoutSelect
        value={{ kind: "new", name: "Agen Budi" }}
        onChange={vi.fn()}
      />,
    );

    expect(html).toContain('id="checkout-customer-type"');
    expect(html).toContain('name="type"');
    expect(html).toMatch(/<option value="UMUM" selected="">UMUM<\/option>/);
    expect(html).toContain('<option value="AGEN">AGEN</option>');
    expect(html).toContain('<option value="INDUSTRI">INDUSTRI</option>');
    expect(html).toContain('<option value="PEMERINTAH">PEMERINTAH</option>');
  });
});
