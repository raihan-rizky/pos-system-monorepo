import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ApproveDraftDialog } from "../components/ApproveDraftDialog";

let roleMock = "OWNER";

vi.mock("../hooks/useDraftMutations", () => ({
  useApproveDraft: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useCancelDraft: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}));

vi.mock("@/components/providers/RoleProvider", () => ({
  useRole: () => ({ role: roleMock }),
}));

const draft = {
  id: "draft-1",
  draftNumber: "DRF-20260709-0001",
  invoiceNumber: null,
  total: 150000,
  paymentMethod: "CASH",
  amountPaid: 0,
  change: 0,
  customerName: "Jane Doe",
  status: "DRAFT",
  createdAt: "2026-07-09T03:00:00.000Z",
  items: [
    {
      id: "item-1",
      productName: "Produk A",
      quantity: 2,
      subtotal: 150000,
    },
  ],
} as any;

describe("ApproveDraftDialog custom invoice date", () => {
  it("shows optional invoice date and time controls for owners", () => {
    roleMock = "OWNER";

    const html = renderToStaticMarkup(
      <ApproveDraftDialog
        draft={draft}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    expect(html).toContain("Tanggal Invoice (Opsional)");
    expect(html).toContain("Jam Invoice (Opsional)");
  });

  it("hides optional invoice date controls for cashiers", () => {
    roleMock = "CASHIER";

    const html = renderToStaticMarkup(
      <ApproveDraftDialog
        draft={draft}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    expect(html).not.toContain("Tanggal Invoice (Opsional)");
    expect(html).not.toContain("Jam Invoice (Opsional)");
  });
});
