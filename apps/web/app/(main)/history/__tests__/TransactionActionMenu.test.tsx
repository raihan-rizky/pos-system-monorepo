import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { TransactionActionMenu } from "../TransactionActionMenu";

vi.mock("@/features/surat-jalan/components/SuratJalanBundleButton", () => ({
  isTransactionEligibleForSuratJalan: () => true,
}));

const mockTx = {
  id: "tx-123",
  status: "COMPLETED",
  items: [
    {
      id: "item-1",
      productId: "prod-1",
      productName: "Test Product",
      quantity: 1,
    }
  ],
  invoiceNumber: "INV-123",
} as any;

const mockProps = {
  tx: mockTx,
  isSalesRole: false,
  canUpdateTransactions: true,
  canDeleteTransactions: true,
  canApproveTransactions: true,
  canRejectTransactions: true,
  canApproveDrafts: true,
  canVoid: true,
  canChangeInvoiceDate: true,
  isPending: false,
  isBundled: false,
  onEdit: () => {},
  onEditInvoiceDate: () => {},
  onDelete: () => {},
  onApprove: () => {},
  onReject: () => {},
  onApproveDraft: () => {},
  onVoid: () => {},
};

describe("TransactionActionMenu z-level and positioning", () => {
  it("renders with mt-2 when showUpward is false or not provided", () => {
    const html = renderToStaticMarkup(
      <TransactionActionMenu {...mockProps} initialOpen={true} />
    );
    expect(html).toContain("mt-2");
    expect(html).not.toContain("bottom-full mb-2");
  });

  it("renders with bottom-full mb-2 when showUpward is true", () => {
    const html = renderToStaticMarkup(
      <TransactionActionMenu {...mockProps} initialOpen={true} showUpward={true} />
    );
    expect(html).toContain("bottom-full mb-2");
    expect(html).not.toContain("mt-2");
  });

  it("renders with a high z-index (z-[100]) to prevent being covered by floating widgets", () => {
    const html = renderToStaticMarkup(
      <TransactionActionMenu {...mockProps} initialOpen={true} />
    );
    expect(html).toContain("z-[100]");
    expect(html).not.toContain("z-50");
  });
});
