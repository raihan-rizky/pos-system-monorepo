import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import ProductFormModal from "@/components/inventory/ProductFormModal";
import { EditProductModal } from "@/components/EditProductModal";

vi.mock("@pos/ui", () => ({
  Modal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Button: ({ children, variant: _variant, loading: _loading, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; loading?: boolean }) => <button {...props}>{children}</button>,
  Input: ({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) => <label>{label}<input {...props} /></label>,
}));

const product = { id: "p", name: "Kertas", price: 1000, stock: 5, unit: "pcs", category: { id: "cat" }, stockGroupId: "group" } as never;
const hint = "Mengubah kategori akan memindahkan semua satuan dalam grup stok ini, termasuk satuan tidak aktif.";

describe("category editing guidance", () => {
  it("explains the group impact in the inventory edit form", () => {
    const html = renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}><ProductFormModal isOpen onClose={vi.fn()} productId="p" categories={[]} initialData={product} /></QueryClientProvider>);
    expect(html).toContain(hint);
    expect(html).toContain('aria-describedby="inventory-category-group-hint"');
  });

  it("explains the group impact in the POS edit form", () => {
    const html = renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}><EditProductModal open onClose={vi.fn()} product={product} /></QueryClientProvider>);
    expect(html).toContain(hint);
    expect(html).toContain('aria-describedby="pos-category-group-hint"');
  });
});
