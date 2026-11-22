import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import ProductFormModal from "@/components/inventory/ProductFormModal";

vi.mock("@pos/ui", () => ({
  Modal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Button: ({ children, variant: _variant, loading: _loading, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; loading?: boolean }) => <button {...props}>{children}</button>,
  Input: ({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) => <label>{label}<input {...props} /></label>,
}));

describe("klasifikasi saat membuat produk", () => {
  it("offers optional category and subcategory choices in the product form", () => {
    const client = new QueryClient();
    client.setQueryData(["product-classification", "catalog"], { subcategories: [], legacyCategories: [] });
    const html = renderToStaticMarkup(<QueryClientProvider client={client}><ProductFormModal isOpen onClose={vi.fn()} productId={null} categories={[]} /></QueryClientProvider>);
    expect(html).toContain('for="inventory-product-classification-group"');
    expect(html).toContain('for="inventory-product-subcategory"');
    expect(html).toContain("ATK");
    expect(html).toContain("PERCETAKAN");
    expect(html).toContain("Bisa diatur nanti");
  });
});
