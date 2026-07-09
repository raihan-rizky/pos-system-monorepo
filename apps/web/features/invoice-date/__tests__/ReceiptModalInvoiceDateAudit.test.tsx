import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ReceiptModal } from "@/components/ReceiptModal";

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
}));

vi.mock("@/hooks/useSettings", () => ({
  useStoreSettings: () => ({
    data: {
      name: "Toko Test",
      address: "Jl. Test",
      phone: "021",
    },
  }),
}));

vi.mock("@/features/surat-jalan/components/SuratJalanBundleButton", () => ({
  SuratJalanBundleButton: () => <button>Cetak Surat Jalan</button>,
}));

vi.mock("@/components/InvoicePrintModal", () => ({
  InvoicePrintModal: () => null,
}));

describe("ReceiptModal invoice date audit", () => {
  it("shows invoice date change history when detail data includes logs", () => {
    const html = renderToStaticMarkup(
      <ReceiptModal
        open
        onClose={vi.fn()}
        transaction={{
          id: "tx-1",
          invoiceNumber: "INV-20260708-0001",
          draftNumber: null,
          subtotal: 100000,
          discount: 0,
          tax: 0,
          total: 100000,
          paymentMethod: "CASH",
          amountPaid: 100000,
          change: 0,
          customerName: "Jane Doe",
          salesName: "Sales A",
          salespersonId: null,
          note: null,
          status: "COMPLETED",
          invoiceDate: "2026-07-08T03:15:00.000Z",
          createdAt: "2026-07-09T03:15:00.000Z",
          invoiceDateChangeLogs: [
            {
              id: "change-1",
              oldInvoiceDate: "2026-07-09T03:15:00.000Z",
              newInvoiceDate: "2026-07-08T03:15:00.000Z",
              oldDocumentNumber: "INV-20260709-0001",
              newDocumentNumber: "INV-20260708-0001",
              reason: "Transaksi seharusnya masuk pembukuan kemarin.",
              actorName: "Owner One",
              actorRole: "OWNER",
              createdAt: "2026-07-09T05:00:00.000Z",
            },
          ],
          items: [],
        }}
      />,
    );

    expect(html).toContain("Riwayat Perubahan Tanggal Invoice");
    expect(html).toContain("INV-20260709-0001");
    expect(html).toContain("INV-20260708-0001");
    expect(html).toContain("Transaksi seharusnya masuk pembukuan kemarin.");
  });
});
