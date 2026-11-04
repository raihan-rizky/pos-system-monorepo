import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { VariantSelector } from "../components/VariantSelector";
import type { ProductVariant } from "@/hooks/useProducts";

describe("sumber harga pada pilihan satuan", () => {
  it("membedakan harga manual, aturan otomatis, dan harga biasa", () => {
    const variants = [
      { id: "a", unit: "pcs", price: 9000, stock: 5, appliedPricing: { ruleId: "harga-agen" } },
      { id: "b", unit: "rim", price: 8000, stock: 5, appliedPricing: { ruleId: "rule-1" } },
      { id: "c", unit: "box", price: 7000, stock: 5, appliedPricing: null },
    ] as ProductVariant[];
    const html = renderToStaticMarkup(<VariantSelector variants={variants} selected="a" onChange={vi.fn()} />);
    expect(html).toMatch(/pcs[^<]*Harga manual/);
    expect(html).toMatch(/rim[^<]*Harga Khusus/);
    expect(html).not.toMatch(/box[^<]*Harga (manual|Khusus)/);
  });
});
