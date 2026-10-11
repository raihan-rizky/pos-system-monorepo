import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import ProductFormModal from '@/components/inventory/ProductFormModal';
import { PosProductQuickEditModal } from '@/components/EditProductModal';

vi.mock('@pos/ui', () => ({
  Modal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
  Input: ({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) => <label>{label}<input {...props} /></label>,
}));

describe('product description forms', () => {
  it('offers an optional multiline description in the inventory form', () => {
    const html = renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}><ProductFormModal isOpen onClose={vi.fn()} productId={null} categories={[]} /></QueryClientProvider>);
    expect(html).toMatch(/<label[^>]*>Deskripsi produk/);
    expect(html).toMatch(/<textarea[^>]*rows="3"/);
    expect(html).not.toMatch(/<textarea[^>]*required/);
  });

  it('offers the same optional field in POS group quick edit', () => {
    const html = renderToStaticMarkup(<PosProductQuickEditModal open item={{ name: 'Kertas A4', categoryId: 'paper' } as never} categories={[]} brands={[]} onClose={vi.fn()} onSave={vi.fn()} />);
    expect(html).toMatch(/<label[^>]*>Deskripsi produk/);
    expect(html).toMatch(/<textarea[^>]*rows="3"/);
    expect(html).toContain('Deskripsi');
  });
});
