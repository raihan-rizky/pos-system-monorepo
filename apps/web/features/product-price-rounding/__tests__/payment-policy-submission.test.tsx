import React, { isValidElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PaymentModal } from "@/components/PaymentModal";
import type { ProductCartItem } from "@/hooks/useCart";

const policy = vi.hoisted(() => ({ enabled: true, increment: 500, threshold: 50 }));
let emptyObjectCount = 0;
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useEffect: () => undefined,
  useId: () => "test-payment",
  useState: (initial: unknown) => {
    let value = typeof initial === "function" ? initial() : initial;
    if (value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0) {
      if (emptyObjectCount++ === 0) value = { CASH: 5000 };
    }
    return [value, vi.fn()];
  },
}));
vi.mock("@/hooks/useCustomers", () => ({ useCreateCustomer: () => ({ mutateAsync: vi.fn(), isPending: false }) }));
vi.mock("@/hooks/useSalespersons", () => ({ useSalespersons: () => ({ data: [] }) }));
vi.mock("@/components/providers/RoleProvider", () => ({ useRole: () => ({ role: "CASHIER" }) }));
vi.mock("@/hooks/useCustomerCategoryPricingRules", () => ({ useCustomerCategoryPricingRules: () => ({ data: [] }) }));
vi.mock("@/features/customer-category-pricing/hooks/useSpecialPricingSettings", () => ({ useSpecialPricingSettings: () => ({ data: false }) }));
vi.mock("@/features/pos-checkout/hooks/useCartCatalogPrices", () => ({ useCartCatalogPrices: (items: unknown) => items }));
vi.mock("@/features/product-price-rounding/hooks/usePriceRoundingSettings", () => ({ usePriceRoundingSettings: () => ({ data: policy, isPlaceholderData: false }) }));
vi.mock("@/features/invoice-date/hooks/useServerClock", () => ({ useServerClock: () => ({ now: null, isLoading: false }) }));
vi.mock("@/features/invoice-date/hooks/useInvoiceDateInputs", () => ({ useInvoiceDateInputs: () => ({ invoiceDate: "", invoiceTime: "", setInvoiceDate: vi.fn(), setInvoiceTime: vi.fn() }) }));

function findAction(node: React.ReactNode, label: string): React.ReactElement<{ children?: React.ReactNode; onClick?: () => Promise<void>; disabled?: boolean }> | undefined {
  if (Array.isArray(node)) return node.map(child => findAction(child, label)).find(Boolean);
  if (!isValidElement<{ children?: React.ReactNode; onClick?: () => Promise<void>; disabled?: boolean }>(node)) return undefined;
  if (node.props.children === label && node.props.onClick) return node;
  return findAction(node.props.children, label);
}

describe("checkout rounding policy snapshot", () => {
  beforeEach(() => { emptyObjectCount = 0; });
  it("submits the policy used to calculate the confirmed payment", async () => {
    const onConfirm = vi.fn();
    const item: ProductCartItem = { cartLineId: "paper", lineType: "PRODUCT", productId: "paper", name: "Produk contoh", price: 4050, catalogPrice: 4050, quantity: 1, unit: "pcs", stock: 10, categoryId: "paper", categoryName: "Kertas" };
    const tree = PaymentModal({ open: true, onClose: vi.fn(), items: [item], subtotal: 4050, onConfirm });
    const action = findAction(tree, "Konfirmasi Bayar")!;
    expect(action.props.disabled).toBe(false);
    await action.props.onClick!();
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ priceRoundingSettings: policy, items: [expect.objectContaining({ price: 4500 })] }));
  });
});
