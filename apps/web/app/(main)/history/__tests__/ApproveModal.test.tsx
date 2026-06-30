import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ApproveModal } from "../components/ApproveModal";

// Mock hooks called by ApproveModal
vi.mock("@/hooks/useTransactions", () => ({
  useApproveTransaction: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}));

vi.mock("@pos/ui", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    Modal: ({ children, title }: any) => (
      <div data-testid="modal-mock">
        {title}
        {children}
      </div>
    ),
  };
});

describe("ApproveModal", () => {
  it("renders the list of products from the transaction/invoice", () => {
    const mockTx = {
      id: "tx-1",
      invoiceNumber: "INV-20260630-9999",
      total: 150000,
      paymentMethod: "CASH",
      amountPaid: 150000,
      change: 0,
      customerName: "Jane Doe",
      items: [
        {
          id: "item-1",
          productName: "Produk Keren A",
          quantity: 2,
          unitPrice: 50000,
          subtotal: 100000,
          product: { unit: "pcs" },
        },
        {
          id: "item-2",
          productName: "Produk Cetak B",
          quantity: 1,
          unitPrice: 50000,
          subtotal: 50000,
          printingService: { unit: "lembar" },
          size: "A4 = 21x29.7 cm",
          material: "Art Paper 260g",
        },
      ],
      status: "PENDING_APPROVAL",
    } as any;

    const html = renderToStaticMarkup(
      <ApproveModal
        tx={mockTx}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    // Verify it renders the list section header
    expect(html).toContain("Daftar Produk");

    // Verify it renders the first item details
    expect(html).toContain("Produk Keren A");
    expect(html).toContain("2 pcs");
    expect(html).toContain("100.000");

    // Verify it renders the second item details
    expect(html).toContain("Produk Cetak B");
    expect(html).toContain("1 lembar");
    expect(html).toContain("50.000");
    expect(html).toContain("Ukuran: A4");
    expect(html).toContain("Bahan: Art Paper 260g");
  });

  it("renders 'Metode: DEBIT' for a single payment method in payments list", () => {
    const mockTx = {
      id: "tx-1",
      invoiceNumber: "INV-20260630-9999",
      total: 148500,
      paymentMethod: "DEBIT",
      amountPaid: 148500,
      change: 0,
      customerName: "Pelanggan Umum",
      items: [],
      payments: [
        { method: "DEBIT", amount: 148500 },
      ],
      status: "PENDING_APPROVAL",
    } as any;

    const html = renderToStaticMarkup(
      <ApproveModal
        tx={mockTx}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    expect(html).toContain("Metode: DEBIT");
    expect(html).not.toContain("Metode Multi-payment");
  });

  it("renders 'Metode Multi-payment' for multiple payment methods in payments list", () => {
    const mockTx = {
      id: "tx-1",
      invoiceNumber: "INV-20260630-9999",
      total: 150000,
      paymentMethod: "CASH",
      amountPaid: 150000,
      change: 0,
      customerName: "Jane Doe",
      items: [],
      payments: [
        { method: "CASH", amount: 100000 },
        { method: "DEBIT", amount: 50000 },
      ],
      status: "PENDING_APPROVAL",
    } as any;

    const html = renderToStaticMarkup(
      <ApproveModal
        tx={mockTx}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    expect(html).toContain("Metode Multi-payment");
  });
});
