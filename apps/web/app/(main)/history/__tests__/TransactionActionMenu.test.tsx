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
  it("prefers the bottom placement when showUpward is false or not provided", () => {
    const html = renderToStaticMarkup(
      <TransactionActionMenu {...mockProps} initialOpen={true} />
    );
    expect(html).toContain('data-placement="bottom"');
    expect(html).toContain("position:fixed");
  });

  it("prefers the top placement when showUpward is true", () => {
    const html = renderToStaticMarkup(
      <TransactionActionMenu {...mockProps} initialOpen={true} showUpward={true} />
    );
    expect(html).toContain('data-placement="top"');
    expect(html).toContain("position:fixed");
  });

  it("renders with a high z-index (z-[100]) to prevent being covered by floating widgets", () => {
    const html = renderToStaticMarkup(
      <TransactionActionMenu {...mockProps} initialOpen={true} />
    );
    expect(html).toContain("z-[100]");
    expect(html).not.toContain("z-50");
  });

  it("renders an open menu as viewport-fixed to escape scroll-container clipping", () => {
    const html = renderToStaticMarkup(
      <TransactionActionMenu {...mockProps} initialOpen={true} />
    );
    expect(html).toContain("position:fixed");
  });
});
