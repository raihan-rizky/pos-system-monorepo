import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import ProductFormModal from "@/components/inventory/ProductFormModal";

vi.mock("@pos/ui", () => ({
  Modal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Button: ({ children, variant: _variant, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }) => <button {...props}>{children}</button>,
  Input: ({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) => <label>{label}<input {...props} /></label>,
}));

describe("optional product units", () => {
  it("offers additional units immediately without requiring a conversion first", () => {
    const html = renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}>
      <ProductFormModal isOpen onClose={vi.fn()} productId={null} categories={[]} />
    </QueryClientProvider>);
    expect(html).toContain("Tambah unit lain (opsional)");
    expect(html).toContain("Unit utama");
    expect(html).not.toContain("Isi per Unit Terkecil");
  });

  it("keeps new unit creation out of existing-product editing", () => {
    const html = renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}>
      <ProductFormModal isOpen onClose={vi.fn()} productId="existing-product" categories={[]} />
    </QueryClientProvider>);
    expect(html).not.toContain("Tambah unit lain (opsional)");
  });
});
