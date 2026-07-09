import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PaymentModal } from "@/components/PaymentModal";

let roleMock = "OWNER";

vi.mock("@pos/ui", () => ({
  Modal: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
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
  useCustomerCategoryPricingRules: () => ({ data: [], isError: false }),
}));

vi.mock("@/features/pos-checkout/components/CustomerCheckoutSelect", () => ({
  CustomerCheckoutSelect: () => <div>Pilih pelanggan</div>,
}));

describe("PaymentModal custom invoice date", () => {
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
