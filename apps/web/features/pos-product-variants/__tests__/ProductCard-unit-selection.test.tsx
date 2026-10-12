import React, { isValidElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Product } from "@/hooks/useProducts";

const state = vi.hoisted(() => ({ selectedId: undefined as string | undefined }));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  const hooks = {
    useState: (initial: string) => [state.selectedId ?? initial, (value: string) => { state.selectedId = value; }],
    useMemo: (factory: () => unknown) => factory(),
    useCallback: (callback: unknown) => callback,
  };
  return { ...actual, ...hooks, default: { ...actual, ...hooks } };
});
vi.mock("@/components/providers/RoleProvider", () => ({ useRole: () => ({ canPerform: () => false }) }));

import { ProductCard } from "../components/ProductCard";
import { VariantSelector } from "../components/VariantSelector";

function findElement(node: React.ReactNode, predicate: (element: React.ReactElement<any>) => boolean): React.ReactElement<any> | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findElement(child, predicate);
      if (match) return match;
    }
  } else if (isValidElement<any>(node)) {
    if (predicate(node)) return node;
    return findElement((node as React.ReactElement<{ children?: React.ReactNode }>).props.children, predicate);
  }
}

describe("ProductCard selected unit", () => {
  beforeEach(() => { state.selectedId = undefined; });

  it.each([2, 3])("updates the badge and added variant after choosing among %i units", (count) => {
    const variants = [
      { id: "dus", unit: "dus", price: 12000, stock: 10, sku: "DUS" },
      { id: "pcs", unit: "pcs", price: 1000, stock: 120, sku: "PCS" },
      { id: "pack", unit: "pack", price: 6000, stock: 20, sku: "PACK" },
    ].slice(0, count);
    const product = {
      id: "paper", name: "Kertas", price: 12000, stock: 10, unit: "dus", sku: "DUS",
      category: { id: "atk", name: "ATK", icon: null, color: "#1976d2" },
      defaultVariant: variants[0], variants,
    } as Product;
    const onAddToCart = vi.fn();
    const render = () => (ProductCard as unknown as { type: (props: { product: Product; onAddToCart: typeof onAddToCart }) => React.ReactNode }).type({ product, onAddToCart });
    const before = render();
    expect(findElement(before, element => element.props["aria-label"] === "Satuan terpilih")?.props.children).toBe("dus");

    if (count === 2) {
      findElement(before, element => element.type === "button" && element.key === "pcs")!.props.onClick();
    } else {
      findElement(before, element => element.type === VariantSelector)!.props.onChange("pcs");
    }

    const after = render();
    expect(findElement(after, element => element.props["aria-label"] === "Satuan terpilih")?.props.children).toBe("pcs");
    findElement(after, element => element.type === "div" && typeof element.props.onClick === "function")!.props.onClick();
    expect(onAddToCart).toHaveBeenCalledWith(product, "pcs");
  });
});
