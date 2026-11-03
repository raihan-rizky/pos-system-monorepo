import React, { isValidElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  rounding: { enabled: true, increment: 500, threshold: 50 },
  mutateTransaction: vi.fn(),
  mutateProduct: vi.fn(),
  queueTransaction: vi.fn(),
  offlineRows: new Map<string, any>(),
  userId: "cashier-1" as string | null,
  storeId: "store-main" as string | null,
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
    useRef: (initial: unknown) => useMemo(() => ({ current: initial }), []),
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
  useUpdateProduct: () => ({ mutateAsync: harness.mutateProduct }),
  useUpdateProductGroupMetadata: () => ({}),
}));
vi.mock("@/hooks/useCart", () => ({ useCart: () => ({ ...harness.cart }) }));
vi.mock("@/hooks/useCustomerCategoryPricingRules", () => ({ useCustomerCategoryPricingRules: () => ({ data: harness.rules }) }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: harness.catalog }) }));
vi.mock("@/hooks/useBrands", () => ({ useBrands: () => ({ data: [] }) }));
vi.mock("@/hooks/useShift", () => ({ useActiveShift: () => ({ data: null, isLoading: false }) }));
vi.mock("@/hooks/useShiftSettings", () => ({ useShiftSettings: () => ({ data: { enabled: false } }) }));
vi.mock("@/features/product-price-rounding/hooks/usePriceRoundingSettings", () => ({ usePriceRoundingSettings: () => ({ data: harness.rounding }) }));
vi.mock("@/hooks/useTransactions", () => ({ useCreateTransaction: () => ({ mutateAsync: harness.mutateTransaction }) }));
vi.mock("@/lib/offline/offline-db", () => ({
  createOfflineTransaction: harness.queueTransaction,
  offlineDb: {
    offlineTransactions: {
      where: () => ({ anyOf: () => ({ count: async () => harness.offlineRows.size }) }),
      add: async (row: any) => { harness.offlineRows.set(row.clientMutationId, structuredClone(row)); },
      get: async (id: string) => harness.offlineRows.get(id),
      update: async (id: string, changes: any) => Object.assign(harness.offlineRows.get(id), changes),
    },
    transaction: async (...args: any[]) => args.at(-1)(),
  },
}));
vi.mock("@/features/transactions-draft", () => ({ useCreateDraft: () => ({}) }));
vi.mock("@/components/providers/RoleProvider", () => ({ useRole: () => ({ role: "CASHIER", userId: harness.userId, storeId: harness.storeId, canPerform: () => false }) }));
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
    priceEditor: findProps(tree, element => "item" in element.props && "roundingSettings" in element.props && typeof element.props.onSave === "function"),
  };
}

describe("POS pricing across unrelated renders", () => {
  beforeEach(() => {
    harness.mutateTransaction.mockReset();
    harness.mutateProduct.mockReset();
    harness.queueTransaction.mockReset();
    harness.offlineRows.clear();
    harness.userId = "cashier-1";
    harness.storeId = "store-main";
    harness.states.length = 0;
    harness.memos.length = 0;
    harness.rules = undefined;
    harness.rounding = { enabled: true, increment: 500, threshold: 50 };
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
    harness.cart = { items: [item], totalItems: 1, subtotal: 2000, hasLoadedStorage: true, addItem: vi.fn(), clearCart: vi.fn(), updateTransactionPrice: vi.fn() };
  });

  afterEach(() => vi.unstubAllGlobals());

  it("saves quick prices only to the current cart and ignores legacy master updates", async () => {
    render().cart.onEditPrice(harness.cart.items[0]);
    const editor = render().priceEditor;
    expect(editor.item.cartLineId).toBe("line-paper");
    await editor.onSave({ transactionPrice: 1500, masterUpdate: { price: 1500, hargaAgen: null, hargaDinas: null } });
    expect(harness.cart.updateTransactionPrice).toHaveBeenLastCalledWith("line-paper", 1500);
    expect(harness.mutateProduct).not.toHaveBeenCalled();
    await editor.onSave({ transactionPrice: null });
    expect(harness.cart.updateTransactionPrice).toHaveBeenLastCalledWith("line-paper", null);
  });

  it("uses the same checkout ID when an online response is lost and the sale is queued", async () => {
    render().cart.onCheckout();
    const payment = render().payment;
    vi.stubGlobal("window", { dispatchEvent: vi.fn() });
    vi.stubGlobal("CustomEvent", class {});
    vi.stubGlobal("navigator", { onLine: true });
    harness.mutateTransaction.mockRejectedValueOnce(new TypeError("response lost"));

    await payment.onConfirm({
      items: harness.cart.items, paymentMethod: "CASH", amountPaid: 2000,
      discount: 0, taxRate: 0, note: "", customerName: "", customerId: null,
      salesName: "", salespersonId: "", paymentStatus: "COMPLETED",
      isJobOrder: false, estimatedDoneAt: null,
      payments: [{ method: "CASH", amount: 500 }, { method: "TRANSFER", amount: 1500 }],
    });

    const onlineId = harness.mutateTransaction.mock.calls[0][0].clientMutationId;
    expect(onlineId).toEqual(expect.any(String));
    const queued = harness.offlineRows.get(onlineId);
    expect(queued).toMatchObject({ clientMutationId: onlineId, status: "PENDING_SYNC" });
    expect(queued.payload).toMatchObject({
      originCashierId: "cashier-1", originStoreId: "store-main",
      payments: [{ method: "CASH", amount: 500 }, { method: "TRANSFER", amount: 1500 }],
    });
  });

  it("keeps a product invoice date in the offline reconciliation payload", async () => {
    render().cart.onCheckout();
    const payment = render().payment;
    vi.stubGlobal("window", { dispatchEvent: vi.fn() });
    vi.stubGlobal("CustomEvent", class {});
    vi.stubGlobal("navigator", { onLine: false });

    await payment.onConfirm({
      items: harness.cart.items, paymentMethod: "CASH", amountPaid: 2000,
      discount: 0, taxRate: 0, note: "", customerName: "", customerId: null,
      salesName: "", salespersonId: "", paymentStatus: "COMPLETED",
      isJobOrder: false, estimatedDoneAt: null, invoiceDate: "2026-10-28",
      invoiceTime: "09:30", invoiceDateReason: "Koreksi tanggal",
    });

    expect([...harness.offlineRows.values()][0]).toMatchObject({
      status: "PENDING_SYNC", reconcileOffline: true,
      payload: { invoiceDate: "2026-10-28", invoiceTime: "09:30", invoiceDateReason: "Koreksi tanggal" },
    });
  });

  it("does not queue an unattributed sale when the cashier identity is unavailable", async () => {
    harness.userId = null;
    render().cart.onCheckout();
    const payment = render().payment;
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", { onLine: false });
    harness.mutateTransaction.mockRejectedValueOnce(new TypeError("offline"));

    await payment.onConfirm({
      items: harness.cart.items, paymentMethod: "CASH", amountPaid: 2000,
      discount: 0, taxRate: 0, note: "", customerName: "", customerId: null,
      salesName: "", salespersonId: "", paymentStatus: "COMPLETED",
      isJobOrder: false, estimatedDoneAt: null,
    });

    expect(harness.queueTransaction).not.toHaveBeenCalled();
    expect(harness.cart.clearCart).not.toHaveBeenCalled();
  });

  it("reprices the cart when the rounding policy changes", () => {
    harness.catalog = [{ ...harness.catalog[0], price: 4050 }];
    expect(render().cart.subtotal).toBe(4500);
    harness.rounding = { enabled: false, increment: 500, threshold: 50 };
    expect(render().cart.subtotal).toBe(4050);
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

  it("refreshes customer prices from payment and clears the selection on reopen", () => {
    const before = render();
    before.cart.onCheckout();
    const opened = render();
    expect(opened.payment.initialCustomerSelection).toEqual({ kind: "general" });
    const selection = { kind: "existing", customer: { id: "agent", name: "Agen", type: "AGEN" } };
    opened.payment.onCustomerSelectionChange(selection);
    const after = render();
    expect(after.grid.customerType).toBe("AGEN");
    expect(after.cart.items[0].price).toBe(2000);
    expect(after.cart.items[0].priceRounding.originalPrice).toBe(1800);
    expect(after.cart.subtotal).toBe(2000);
    after.payment.onClose();
    const closed = render();
    expect(closed.payment).toBeDefined();
    expect(closed.payment.open).toBe(false);
    closed.cart.onCheckout();
    expect(render().payment.initialCustomerSelection).toEqual({ kind: "general" });
  });

  it("keeps the payment modal mounted while its cart remains active", () => {
    const before = render();
    before.cart.onCheckout();

    const opened = render();
    expect(opened.payment.open).toBe(true);
    opened.payment.onClose();

    const closed = render();
    expect(closed.payment).toBeDefined();
    expect(closed.payment.open).toBe(false);

    harness.cart = { ...harness.cart, items: [], totalItems: 0 };
    expect(render().payment).toBeUndefined();
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
