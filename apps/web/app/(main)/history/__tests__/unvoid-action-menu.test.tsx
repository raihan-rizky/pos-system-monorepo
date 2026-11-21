import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { TransactionActionMenu } from "../TransactionActionMenu";

const auth = vi.hoisted(() => ({ role: "OWNER" }));
vi.mock("@/components/providers/RoleProvider", () => ({ useRole: () => auth }));
vi.mock("@/features/surat-jalan/components/SuratJalanBundleButton", () => ({
  isTransactionEligibleForSuratJalan: () => false,
}));

const props = {
  tx: { id: "tx-1", status: "VOIDED", invoiceNumber: "INV-1", items: [] },
  isSalesRole: false,
  canUpdateTransactions: true,
  canDeleteTransactions: false,
  canApproveTransactions: false,
  canRejectTransactions: false,
  canApproveDrafts: false,
  canVoid: true,
  canChangeInvoiceDate: false,
  isPending: false,
  isBundled: false,
  onEdit: () => {},
  onEditInvoiceDate: () => {},
  onDelete: () => {},
  onApprove: () => {},
  onReject: () => {},
  onApproveDraft: () => {},
  onVoid: () => {},
  onRestore: () => {},
  initialOpen: true,
};

describe("aksi pemulihan transaksi", () => {
  it("menawarkan pemulihan transaksi void kepada owner", () => {
    auth.role = "OWNER";
    const html = renderToStaticMarkup(<TransactionActionMenu {...(props as any)} />);
    expect(html).toContain("Pulihkan transaksi");
  });

  it("tidak menawarkan pemulihan kepada peran lain", () => {
    auth.role = "SALES";
    const html = renderToStaticMarkup(<TransactionActionMenu {...(props as any)} />);
    expect(html).not.toContain("Pulihkan transaksi");
  });
});
