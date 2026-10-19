import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PaymentModal } from "@/components/PaymentModal";
import type { ProductCartItem } from "@/hooks/useCart";

let roleMock = "OWNER";
const useServerClockMock = vi.hoisted(() => vi.fn());
const pricingRulesMock = vi.hoisted(() => vi.fn<() => unknown[]>(() => []));

vi.mock("@/features/invoice-date/hooks/useServerClock", () => ({
  useServerClock: useServerClockMock,
}));

vi.mock("@pos/ui", () => ({
  Modal: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
  Button: ({
    children,
    loading,
    disabled,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) => (
    <button {...props} disabled={disabled || loading}>{children}</button>
  ),
  Input: ({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label?: string }) => (
    <label>
      {label}
      <input {...props} />
    </label>
  ),
}));

vi.mock("@/hooks/useCustomers", () => ({
  useCreateCustomer: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}));

vi.mock("@/components/providers/RoleProvider", () => ({
  useRole: () => ({ role: roleMock }),
}));

vi.mock("@/hooks/useSalespersons", () => ({
  useSalespersons: () => ({ data: [] }),
}));

vi.mock("@/hooks/useCustomerCategoryPricingRules", () => ({
  useCustomerCategoryPricingRules: () => ({ data: pricingRulesMock(), isError: false }),
}));

vi.mock("@/features/pos-checkout/hooks/useCartCatalogPrices", () => ({
  useCartCatalogPrices: (items: ProductCartItem[]) => items,
}));

vi.mock("@/features/pos-checkout/components/CustomerCheckoutSelect", () => ({
  CustomerCheckoutSelect: () => <div>Pilih pelanggan</div>,
}));

describe("PaymentModal custom invoice date", () => {
  it("offers a labelled percentage tax input before the payment total", () => {
    const html = renderToStaticMarkup(<PaymentModal open onClose={vi.fn()} items={[]} subtotal={0} onConfirm={vi.fn()} />);
    expect(html).toContain("Pajak (%)");
    const input = html.match(/<input\b[^>]*name="taxRate"[^>]*>/)?.[0] ?? "";
    for (const attribute of ['min="0"', 'max="100"', 'step="0.01"']) expect(input).toContain(attribute);
    expect(html.indexOf('name="taxRate"')).toBeLessThan(html.indexOf("<span>Total</span>"));
  });
  it("prefills the date and time inputs with the synchronized WIB time", () => {
    roleMock = "OWNER";
    const html = renderToStaticMarkup(<PaymentModal open onClose={vi.fn()} items={[]} subtotal={0} onConfirm={vi.fn()} onSaveDraft={vi.fn()} />);
    expect(html).toMatch(/type="date"[^>]*value="2026-10-06"/);
    expect(html).toMatch(/type="time"[^>]*value="03:24"/);
  });

  it("leaves draft numbering to the quotation print modal", () => {
    const html = renderToStaticMarkup(<PaymentModal open onClose={vi.fn()} items={[]} subtotal={0} onConfirm={vi.fn()} onSaveDraft={vi.fn()} />);
    expect(html).not.toContain("No. Faktur");
    expect(html).not.toContain("Gunakan otomatis");
  });
  beforeEach(() => {
    pricingRulesMock.mockReturnValue([]);
    useServerClockMock.mockReturnValue({
      now: new Date("2026-10-05T20:24:41.000Z"),
      source: "TIMEAPI_IO",
      lastSyncedAt: Date.parse("2026-10-05T20:24:30.000Z"),
      isLoading: false,
    });
  });

  it("offers Tempo/Tagihan as a separate payment term", () => {
    const html = renderToStaticMarkup(
      <PaymentModal
        open
        onClose={vi.fn()}
        items={[]}
        subtotal={0}
        onConfirm={vi.fn()}
      />,
    );

    expect(html).toContain("Tempo/Tagihan");
  });

  it("labels the default invoice clock as Jakarta WIB", () => {
    const html = renderToStaticMarkup(
      <PaymentModal
        open
        onClose={vi.fn()}
        items={[]}
        subtotal={0}
        onConfirm={vi.fn()}
      />,
    );

    expect(html).toContain("Waktu invoice default");
    expect(html).toContain("Jakarta (WIB)");
  });

  it("shows Internet synchronization source and last sync time", () => {
    const html = renderToStaticMarkup(
      <PaymentModal
        open
        onClose={vi.fn()}
        items={[]}
        subtotal={0}
        onConfirm={vi.fn()}
      />,
    );

    expect(html).toContain("Internet tersinkron");
    expect(html).toContain("6 Oktober 2026 pukul 03.24 WIB");
  });

  it("shows a cart transaction price as a transaction-only override", () => {
    const item: ProductCartItem = {
      cartLineId: "PRODUCT:paper-rim",
      lineType: "PRODUCT",
      productId: "paper-rim",
      name: "Kertas A4",
      price: 8000,
      catalogPrice: 10000,
      transactionPrice: 8000,
      costPrice: 7000,
      hargaAgen: 9000,
      hargaDinas: null,
      quantity: 1,
      unit: "Rim",
      stock: 20,
      categoryId: "cat-paper",
      categoryName: "Kertas",
      appliedPricing: null,
    };

    const html = renderToStaticMarkup(
      <PaymentModal
        open
        onClose={vi.fn()}
        items={[item]}
        subtotal={8000}
        onConfirm={vi.fn()}
      />,
    );

    expect(html).toContain("Harga khusus transaksi");
    expect(html).toContain("Hanya berlaku untuk transaksi ini");
  });

  it("shows both sequential percentages in the applied pricing label", () => {
    pricingRulesMock.mockReturnValue([{
      id: "rule-sequential", categoryId: "cat-paper", customerType: "UMUM",
      unit: "Rim", brandId: null, mode: "UNIT_COST_PLUS_PERCENT_DISCOUNT",
      value: 10, discountPercent: 5, isActive: true,
      category: { id: "cat-paper", name: "Kertas" },
    }]);
    const item: ProductCartItem = {
      cartLineId: "PRODUCT:paper-rim", lineType: "PRODUCT", productId: "paper-rim",
      name: "Kertas A4", price: 16200, catalogPrice: 16200, costPrice: 12000,
      hargaAgen: null, hargaDinas: null, quantity: 1, unit: "Rim", stock: 20,
      categoryId: "cat-paper", categoryName: "Kertas", appliedPricing: null,
    };
    const html = renderToStaticMarkup(
      <PaymentModal open onClose={vi.fn()} items={[item]} subtotal={16200} onConfirm={vi.fn()} />,
    );
    expect(html).toContain("UMUM HPP masing-masing satuan + 10% lalu − 5%");
    expect(html).not.toContain("lalu − 0%");
  });

  it("shows optional invoice date and time controls for owners", () => {
    roleMock = "OWNER";

    const html = renderToStaticMarkup(
      <PaymentModal
        open
        onClose={vi.fn()}
        items={[]}
        subtotal={0}
        onConfirm={vi.fn()}
      />,
    );

    expect(html).toContain("Tanggal Invoice (Opsional)");
    expect(html).toContain("Jam Invoice (Opsional)");
  });

  it("hides custom invoice date controls for cashiers", () => {
    roleMock = "CASHIER";

    const html = renderToStaticMarkup(
      <PaymentModal
        open
        onClose={vi.fn()}
        items={[]}
        subtotal={0}
        onConfirm={vi.fn()}
      />,
    );

    expect(html).not.toContain("Tanggal Invoice (Opsional)");
    expect(html).not.toContain("Jam Invoice (Opsional)");
  });
});
