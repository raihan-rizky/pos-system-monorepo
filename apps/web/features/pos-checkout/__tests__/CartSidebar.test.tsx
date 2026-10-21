import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CartSidebar } from "@/components/CartSidebar";
import type { ProductCartItem } from "@/hooks/useCart";

vi.mock("@pos/ui", () => ({
  Modal: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <section>
      <h1>{title}</h1>
      {children}
    </section>
  ),
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  Input: ({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label?: string }) => (
    <label>
      {label}
      <input {...props} />
    </label>
  ),
}));

const productItem: ProductCartItem = {
  cartLineId: "PRODUCT:paper-rim",
  lineType: "PRODUCT",
  productId: "paper-rim",
  name: "Kertas A4",
  price: 10000,
  catalogPrice: 10000,
  costPrice: 7000,
  hargaAgen: 9000,
  hargaDinas: null,
  quantity: 2,
  unit: "Rim",
  stock: 20,
  categoryId: "cat-paper",
  categoryName: "Kertas",
  stockGroup: { id: "paper", baseUnit: "Rim" },
  appliedPricing: null,
};

function renderCart() {
  return renderToStaticMarkup(
    <CartSidebar
      items={[productItem]}
      subtotal={20000}
      totalItems={2}
      onUpdateQuantity={vi.fn()}
      onRemoveItem={vi.fn()}
      onClearCart={vi.fn()}
      onCheckout={vi.fn()}
    />,
  );
}

describe("CartSidebar quick product references", () => {
  it("always shows normal, agent, and government prices for product lines", () => {
    const html = renderCart();

    expect(html).toContain("Normal");
    expect(html).toContain("Agen");
    expect(html).toContain("9.000");
    expect(html).toContain("Dinas");
    expect(html).toContain("Belum diatur");
  });

  it("shows product and price actions immediately for users with edit permission", () => {
    const html = renderToStaticMarkup(
      <CartSidebar
        items={[productItem]}
        subtotal={20000}
        totalItems={2}
        onUpdateQuantity={vi.fn()}
        onRemoveItem={vi.fn()}
        onClearCart={vi.fn()}
        onCheckout={vi.fn()}
        canQuickEdit
        onEditProduct={vi.fn()}
        onEditPrice={vi.fn()}
      />,
    );

    expect(html).not.toContain("Aktifkan Edit Cepat");
    expect(html).not.toContain("Nonaktifkan Edit Cepat");
    expect(html).toContain('aria-label="Ubah produk Kertas A4"');
    expect(html).toContain('aria-label="Ubah harga produk Kertas A4"');
  });

  it("hides product and price actions without edit permission even with callbacks", () => {
    const html = renderToStaticMarkup(
      <CartSidebar
        items={[productItem]}
        subtotal={20000}
        totalItems={2}
        onUpdateQuantity={vi.fn()}
        onRemoveItem={vi.fn()}
        onClearCart={vi.fn()}
        onCheckout={vi.fn()}
        onEditProduct={vi.fn()}
        onEditPrice={vi.fn()}
      />,
    );

    expect(html).not.toContain('aria-label="Ubah produk Kertas A4"');
    expect(html).not.toContain('aria-label="Ubah harga produk Kertas A4"');
  });

  it("marks an active transaction-only price in the cart", () => {
    const html = renderToStaticMarkup(
      <CartSidebar
        items={[{ ...productItem, price: 8000, transactionPrice: 8000 }]}
        subtotal={16000}
        totalItems={2}
        onUpdateQuantity={vi.fn()}
        onRemoveItem={vi.fn()}
        onClearCart={vi.fn()}
        onCheckout={vi.fn()}
      />,
    );

    expect(html).toContain("Harga khusus");
    expect(html).toContain("Hanya berlaku untuk transaksi ini");
  });

  it("lets the cashier choose another product unit directly from the cart", () => {
    const itemWithUnits = {
      ...productItem,
      unitOptions: [
        {
          productId: "paper-rim",
          name: "Kertas A4",
          price: 10000,
          catalogPrice: 10000,
          costPrice: 7000,
          hargaAgen: 9000,
          hargaDinas: null,
          unit: "Rim",
          stock: 20,
          unitMultiplierToBase: 1,
          stockGroup: { id: "paper", baseUnit: "Rim" },
          categoryId: "cat-paper",
          categoryName: "Kertas",
        },
        {
          productId: "paper-box",
          name: "Kertas A4",
          price: 50000,
          catalogPrice: 50000,
          costPrice: 35000,
          hargaAgen: 45000,
          hargaDinas: 47000,
          unit: "Box",
          stock: 4,
          unitMultiplierToBase: 5,
          stockGroup: { id: "paper", baseUnit: "Rim" },
          categoryId: "cat-paper",
          categoryName: "Kertas",
        },
      ],
    } as ProductCartItem & { unitOptions: Array<Record<string, unknown>> };
    const html = renderToStaticMarkup(
      <CartSidebar
        items={[itemWithUnits]}
        subtotal={20000}
        totalItems={2}
        onUpdateQuantity={vi.fn()}
        onChangeUnit={vi.fn()}
        onRemoveItem={vi.fn()}
        onClearCart={vi.fn()}
        onCheckout={vi.fn()}
      />,
    );

    expect(html).toContain('aria-label="Satuan Kertas A4"');
    expect(html).toMatch(/aria-label="Satuan Kertas A4"[^>]*class="[^"]*min-h-11/);
    expect(html).toContain('Box');
  });

  it("renders an editable quantity field for each cart line", () => {
    const html = renderCart();

    expect(html).toContain('aria-label="Jumlah Kertas A4"');
    expect(html).toContain('inputMode="numeric"');
    expect(html).toMatch(/aria-label="Jumlah Kertas A4"[^>]*class="[^"]*min-h-11/);
    expect(html).toContain('aria-label="Kurangi jumlah Kertas A4"');
    expect(html).toContain('aria-label="Tambah jumlah Kertas A4"');
    expect(html).toMatch(/aria-label="Kurangi jumlah Kertas A4"[^>]*class="[^"]*touchTarget/);
    expect(html).toMatch(/aria-label="Tambah jumlah Kertas A4"[^>]*class="[^"]*touchTarget/);
    expect(html).toContain('aria-label="Hapus Kertas A4 dari keranjang"');
    expect(html).toMatch(/aria-label="Hapus Kertas A4 dari keranjang"[^>]*class="[^"]*touchTarget/);
  });

  it("renders the focused POS price modal with a transaction-only price", async () => {
    const priceModalModule = await import("@/components/inventory/PriceUpdateModal");
    const PosPriceQuickEditModal = (
      priceModalModule as typeof priceModalModule & {
        PosPriceQuickEditModal?: React.ComponentType<{
          open: boolean;
          item: ProductCartItem | null;
          onClose: () => void;
          onSave: (input: unknown) => void;
        }>;
      }
    ).PosPriceQuickEditModal;

    expect(PosPriceQuickEditModal).toBeTypeOf("function");
    if (!PosPriceQuickEditModal) return;

    const html = renderToStaticMarkup(
      <PosPriceQuickEditModal
        open
        item={productItem}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    expect(html).toContain("Ubah Harga Produk");
    expect(html).toContain("Harga Normal");
    expect(html).toContain("Harga Agen");
    expect(html).toContain("Harga Dinas");
    expect(html).toContain("Harga Khusus");
    expect(html).toContain("Hanya berlaku untuk transaksi ini");
  });

  it("warns when a transaction price is below HPP", async () => {
    const priceModalModule = await import("@/components/inventory/PriceUpdateModal");
    const PosPriceQuickEditModal = priceModalModule.PosPriceQuickEditModal;
    const html = renderToStaticMarkup(
      <PosPriceQuickEditModal
        open
        item={{ ...productItem, price: 6000, transactionPrice: 6000 }}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    expect(html).toContain("Harga khusus di bawah HPP");
  });

  it("warns when Harga Agen is below HPP", async () => {
    const priceModalModule = await import("@/components/inventory/PriceUpdateModal");
    const html = renderToStaticMarkup(
      <priceModalModule.PosPriceQuickEditModal
        open
        item={{ ...productItem, hargaAgen: 6000 }}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    expect(html).toContain("Harga Agen di bawah HPP");
  });

  it("renders the focused POS product modal for all variants", async () => {
    const productModalModule = await import("@/components/EditProductModal");
    const PosProductQuickEditModal = (
      productModalModule as typeof productModalModule & {
        PosProductQuickEditModal?: React.ComponentType<{
          open: boolean;
          item: ProductCartItem | null;
          categories: Array<{ id: string; name: string }>;
          brands: Array<{ id: string; name: string }>;
          onClose: () => void;
          onSave: (input: unknown) => void;
        }>;
      }
    ).PosProductQuickEditModal;

    expect(PosProductQuickEditModal).toBeTypeOf("function");
    if (!PosProductQuickEditModal) return;

    const html = renderToStaticMarkup(
      <PosProductQuickEditModal
        open
        item={productItem}
        categories={[{ id: "cat-paper", name: "Kertas" }]}
        brands={[{ id: "brand-paper", name: "Paper Co" }]}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    expect(html).toContain("Ubah Produk");
    expect(html).toContain("Nama Produk");
    expect(html).toContain("Kategori");
    expect(html).toContain("Merek");
    expect(html).toContain("berlaku untuk seluruh varian");
  });
});
