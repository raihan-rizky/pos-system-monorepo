import React, { isValidElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Product } from "@/hooks/useProducts";
import type { ProductCartItem } from "@/hooks/useCart";
import type { CustomerCategoryPricingRule } from "@/hooks/useCustomerCategoryPricingRules";

// The Node test environment has no DOM renderer. Retain hook slots between
// component calls so reference assertions also exercise dependency changes.
const harness = vi.hoisted(() => ({
  stateCursor: 0,
  memoCursor: 0,
  states: [] as Array<{ value: any; set: (value: any) => void }>,
  memos: [] as Array<{ value: any; dependencies: readonly unknown[] }>,
  rules: undefined as CustomerCategoryPricingRule[] | undefined,
  catalog: [] as Product[],
  cart: null as any,
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  const useMemo = (factory: () => unknown, dependencies: readonly unknown[]) => {
    const index = harness.memoCursor++;
    const previous = harness.memos[index];
    if (!previous || dependencies.length !== previous.dependencies.length ||
        dependencies.some((value, i) => !Object.is(value, previous.dependencies[i]))) {
      harness.memos[index] = { value: factory(), dependencies };
    }
    return harness.memos[index].value;
  };
  const hooks = {
    useMemo,
    useCallback: (callback: () => unknown, dependencies: readonly unknown[]) => useMemo(() => callback, dependencies),
    useEffect: () => {},
    useDeferredValue: (value: unknown) => value,
    useState: (initial: any) => {
      const index = harness.stateCursor++;
      if (!harness.states[index]) {
        const slot = { value: typeof initial === "function" ? initial() : initial, set: (_value: any) => {} };
        slot.set = (value: any) => { slot.value = typeof value === "function" ? value(slot.value) : value; };
        harness.states[index] = slot;
      }
      return [harness.states[index].value, harness.states[index].set];
    },
  };
  return { ...actual, ...hooks, default: { ...actual, ...hooks } };
});
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@pos/ui", () => ({ Button: "button", Input: "input", Modal: "dialog" }));
vi.mock("@/components/ProductGrid", () => ({ ProductGrid: () => null }));
vi.mock("@/components/CartSidebar", () => ({ CartSidebar: () => null }));
vi.mock("@/components/ShiftStatusBanner", () => ({ ShiftStatusBanner: () => null }));
vi.mock("@/components/Pagination", () => ({ Pagination: () => null }));
vi.mock("@/components/ui/HorizontalScroll", () => ({ HorizontalScroll: () => null }));
vi.mock("@/features/pos-checkout/components/CustomerCheckoutSelect", () => ({ CustomerCheckoutSelect: () => null }));
vi.mock("@/hooks/useProducts", () => ({
  useProductsPage: () => ({ data: { data: harness.catalog }, isLoading: false, isFetching: false }),
  useCategories: () => ({ data: [] }),
  useUpdateProduct: () => ({}),
  useUpdateProductGroupMetadata: () => ({}),
}));
vi.mock("@/hooks/useCart", () => ({ useCart: () => ({ ...harness.cart }) }));
vi.mock("@/hooks/useCustomerCategoryPricingRules", () => ({ useCustomerCategoryPricingRules: () => ({ data: harness.rules }) }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: harness.catalog }) }));
vi.mock("@/hooks/useBrands", () => ({ useBrands: () => ({ data: [] }) }));
vi.mock("@/hooks/useShift", () => ({ useActiveShift: () => ({ data: null, isLoading: false }) }));
vi.mock("@/hooks/useShiftSettings", () => ({ useShiftSettings: () => ({ data: { enabled: false } }) }));
vi.mock("@/hooks/useTransactions", () => ({ useCreateTransaction: () => ({}) }));
vi.mock("@/features/transactions-draft", () => ({ useCreateDraft: () => ({}) }));
vi.mock("@/components/providers/RoleProvider", () => ({ useRole: () => ({ role: "CASHIER", canPerform: () => false }) }));
vi.mock("@/features/invoice-date/hooks/useServerClock", () => ({ useServerClock: () => ({ now: null }) }));

import POSClientPage from "../POSClientPage";
import { ProductGrid } from "@/components/ProductGrid";
import { CartSidebar } from "@/components/CartSidebar";
import { CustomerCheckoutSelect } from "@/features/pos-checkout/components/CustomerCheckoutSelect";

function findProps(node: React.ReactNode, predicate: (element: React.ReactElement<any>) => boolean): any {
  if (Array.isArray(node)) {
    for (const child of node) { const match = findProps(child, predicate); if (match) return match; }
  } else if (isValidElement<any>(node)) {
    if (predicate(node)) return node.props;
    return findProps((node as React.ReactElement<{ children?: React.ReactNode }>).props.children, predicate);
  }
}

function render() {
  harness.stateCursor = 0;
  harness.memoCursor = 0;
  const tree = POSClientPage({ initialData: { products: null, categories: [], shiftEnabled: false } });
  return {
    grid: findProps(tree, element => element.type === ProductGrid),
    cart: findProps(tree, element => element.type === CartSidebar),
    customer: findProps(tree, element => element.type === CustomerCheckoutSelect),
    payment: findProps(tree, element => typeof element.props.onCustomerSelectionChange === "function" && "initialCustomerSelection" in element.props),
    search: findProps(tree, element => element.type === "input" && typeof element.props.onChange === "function"),
  };
}

describe("POS pricing across unrelated renders", () => {
  beforeEach(() => {
    harness.states.length = 0;
    harness.memos.length = 0;
    harness.rules = undefined;
    harness.catalog = [{
      id: "paper", name: "Kertas", sku: "PAPER", unit: "pcs", stock: 10,
      price: 2000, hargaAgen: 1800, costPrice: 1000, baseCostPrice: 1000, baseCostUnit: "pcs",
      category: { id: "cat-paper", name: "Kertas", icon: null, color: null },
    } as Product];
    const item: ProductCartItem = {
      cartLineId: "line-paper", lineType: "PRODUCT", productId: "paper", name: "Kertas",
      unit: "pcs", stock: 10, price: 2000, catalogPrice: 2000, quantity: 1,
      categoryId: "cat-paper", categoryName: "Kertas",
    };
    harness.cart = { items: [item], totalItems: 1, subtotal: 2000, hasLoadedStorage: true, addItem: vi.fn() };
  });

  it("preserves grid rules and priced cart references when only search changes", () => {
    const before = render();
    before.search.onChange({ target: { value: "Kertas A4" } });
    const after = render();
    expect(after.grid.categoryPricingRules).toBe(before.grid.categoryPricingRules);
    expect(after.cart.items).toBe(before.cart.items);
    expect(after.cart.subtotal).toBe(2000);
  });

  it("preserves the product click handler when the cart hook returns a new wrapper", () => {
    const before = render();
    before.search.onChange({ target: { value: "Kertas A4" } });
    const after = render();
    expect(after.grid.onAddToCart).toBe(before.grid.onAddToCart);
    after.grid.onAddToCart(harness.catalog[0]);
    expect(harness.cart.addItem).toHaveBeenCalledWith(expect.objectContaining({ id: "paper", price: 2000 }));
  });

  it("does not show a customer selector above the product grid", () => {
    expect(render().customer).toBeUndefined();
  });

  it("reopens the desktop cart when a product is clicked", () => {
    render().cart.onClose();
    const closed = render();
    expect(closed.cart).toBeUndefined();

    closed.grid.onAddToCart(harness.catalog[0]);

    expect(render().cart).toBeDefined();
    expect(harness.cart.addItem).toHaveBeenCalledOnce();
  });

  it("keeps the mobile cart closed when a product is added", () => {
    render().grid.onAddToCart(harness.catalog[0]);
    // Close the desktop copy to inspect the independently rendered mobile cart.
    render().cart.onClose();

    const mobile = render();
    expect(mobile.cart).toBeUndefined();
    expect(harness.cart.addItem).toHaveBeenCalledOnce();
  });

  it("allows the mobile cart to be opened manually", () => {
    render().cart.onClose();
    harness.stateCursor = 0;
    harness.memoCursor = 0;
    const tree = POSClientPage({ initialData: { products: null, categories: [], shiftEnabled: false } });
    findProps(tree, element => element.type === "button" && element.props.className?.includes("lg:hidden fixed bottom-")).onClick();
    expect(render().cart).toBeDefined();
    render().cart.onClose();
    expect(render().cart).toBeUndefined();
  });

  it("keeps the mobile cart closed after confirming an empty-stock product", () => {
    render().grid.onAddToCart({ ...harness.catalog[0], stock: 0 });
    expect(harness.cart.addItem).not.toHaveBeenCalled();
    harness.stateCursor = 0;
    harness.memoCursor = 0;
    const tree = POSClientPage({ initialData: { products: null, categories: [], shiftEnabled: false } });
    expect(findProps(tree, element => element.props.title === "Stok Kosong")).toBeDefined();
    expect(findProps(tree, element => element.props.className === "lg:hidden fixed inset-0 z-[200] flex flex-col justify-end")).toBeUndefined();

    findProps(tree, element => element.type === "button" && element.props.children === "Tambahkan").onClick();
    expect(harness.cart.addItem).toHaveBeenCalledOnce();
    render().cart.onClose();
    expect(render().cart).toBeUndefined();
  });

  it("refreshes customer prices from payment and retains the selection on reopen", () => {
    const before = render();
    before.cart.onCheckout();
    const opened = render();
    expect(opened.payment.initialCustomerSelection).toEqual({ kind: "general" });
    const selection = { kind: "existing", customer: { id: "agent", name: "Agen", type: "AGEN" } };
    opened.payment.onCustomerSelectionChange(selection);
    const after = render();
    expect(after.grid.customerType).toBe("AGEN");
    expect(after.cart.items[0].price).toBe(1800);
    expect(after.cart.subtotal).toBe(1800);
    after.payment.onClose();
    const closed = render();
    expect(closed.payment).toBeUndefined();
    closed.cart.onCheckout();
    expect(render().payment.initialCustomerSelection).toEqual(selection);
  });

  it("refreshes cart prices when new catalog data arrives", () => {
    render();
    harness.catalog = [{ ...harness.catalog[0], price: 2500 }];
    expect(render().cart.subtotal).toBe(2500);
  });

  it("refreshes displayed rules and prices when pricing rules arrive", () => {
    const before = render();
    harness.rules = [{
      id: "special", categoryId: "cat-paper", customerType: "ALL", unit: "pcs",
      mode: "COST_PLUS_FLAT", value: 500, isActive: true,
      category: harness.catalog[0].category,
    } as CustomerCategoryPricingRule];
    const after = render();
    expect(after.grid.categoryPricingRules).not.toBe(before.grid.categoryPricingRules);
    expect(after.cart.items[0].price).toBe(1500);
    expect(after.cart.subtotal).toBe(1500);
  });

  it("refreshes totals when cart quantity changes", () => {
    render();
    harness.cart = { ...harness.cart, items: [{ ...harness.cart.items[0], quantity: 2 }], totalItems: 2 };
    expect(render().cart.subtotal).toBe(4000);
  });
});
