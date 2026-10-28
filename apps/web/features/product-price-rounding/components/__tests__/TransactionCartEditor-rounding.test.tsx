import React, { isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { TransactionCartEditor } from "@/app/(main)/history/components/TransactionCartEditor";

vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(), useState: () => ["contoh", vi.fn()] }));
vi.mock("@/hooks/useProducts", () => ({ useProducts: () => ({ data: [{ id: "contoh", name: "Produk contoh", sku: "CONTOH", price: 4050 }], isLoading: false }) }));
vi.mock("@/features/product-price-rounding/hooks/usePriceRoundingSettings", () => ({ usePriceRoundingSettings: () => ({ data: { enabled: true, increment: 500, threshold: 50 } }) }));

function findAddButton(node: React.ReactNode): React.ReactElement<any> | undefined {
  if (Array.isArray(node)) return node.map(findAddButton).find(Boolean);
  if (!isValidElement<any>(node)) return undefined;
  if (node.type === "button" && node.key === "contoh") return node;
  return findAddButton((node as React.ReactElement<{ children?: React.ReactNode }>).props.children);
}

describe("transaction editor product picker rounding", () => {
  it("displays and adds a new product at the same effective price", () => {
    const onChange = vi.fn();
    const tree = TransactionCartEditor({ items: [], onChange });
    const html = renderToStaticMarkup(tree);
    expect(html).toContain("4.500");
    expect(html).toContain("Dibulatkan ke atas");
    findAddButton(tree)!.props.onClick();
    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ originalUnitPrice: 4050, unitPrice: 4500, appliedUnitPrice: 4500, subtotal: 4500, priceIntent: "AUTOMATIC" })]);
  });
  it("discloses rounding from approval quotes and preserves saved prices without quote metadata", () => {
    const item = { productId: "contoh", productName: "Produk contoh", quantity: 1, unitPrice: 4050, originalUnitPrice: 4050, appliedUnitPrice: 4050, subtotal: 4050 };
    const rounding = { originalPrice: 4050, roundedPrice: 4500, direction: "UP" as const, difference: 450 };
    const saved = renderToStaticMarkup(<TransactionCartEditor items={[item]} onChange={vi.fn()} readOnly />);
    expect(saved).toContain("4.050");
    expect(saved).not.toContain("Dibulatkan");
    const quoted = renderToStaticMarkup(<TransactionCartEditor items={[item]} onChange={vi.fn()} readOnly priceDetails={[{ name: "Produk contoh", modal: 2000, regular: 4500, agent: 4500, government: 4500, special: 4500, appliedUnitPrice: 4500, subtotal: 4500, priceRounding: rounding, referencePriceRounding: { regular: rounding, agent: rounding, government: rounding, special: rounding } }]} />);
    expect(quoted.match(/<summary/g)).toHaveLength(5);
    expect(quoted).toContain("Harga final");
  });
});
