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
  it("mengikuti grant Sales untuk upload, Void, dan Hapus tanpa membuka tanggal invoice", () => {
    const html = renderToStaticMarkup(<TransactionActionMenu {...mockProps} isSalesRole initialOpen />);
    expect(html).toContain("Upload Bukti Transaksi");
    expect(html).not.toContain("Ubah Tanggal Invoice");
    expect(html).toMatch(/>\s*Void\s*</);
    expect(html).toMatch(/>\s*Hapus\s*</);
  });

  it.each([
    { update: false, delete: false, wantVoid: false, wantDelete: false },
    { update: true, delete: false, wantVoid: true, wantDelete: false },
    { update: false, delete: true, wantVoid: false, wantDelete: true },
    { update: true, delete: true, wantVoid: true, wantDelete: true },
  ])("memisahkan grant Sales pada transaksi surat jalan: %j", ({ update, delete: remove, wantVoid, wantDelete }) => {
    const html = renderToStaticMarkup(<TransactionActionMenu {...mockProps} isSalesRole isBundled canVoid={update} canDeleteTransactions={remove} initialOpen />);
    expect(/>\s*Void\s*</.test(html)).toBe(wantVoid);
    expect(/>\s*Hapus\s*</.test(html)).toBe(wantDelete);
  });

  it("tidak menawarkan upload bukti tanpa grant update", () => {
    const html = renderToStaticMarkup(<TransactionActionMenu {...mockProps} canUpdateTransactions={false} initialOpen />);
    expect(html).not.toContain("Upload Bukti Transaksi");
  });

  it("menawarkan Hapus dan Void untuk transaksi dengan surat jalan", () => {
    const html = renderToStaticMarkup(<TransactionActionMenu {...mockProps} isBundled initialOpen />);
    expect(html).toMatch(/>\s*Hapus\s*</);
    expect(html).toMatch(/>\s*Void\s*</);
    expect(html).not.toContain("Upload Bukti Transaksi");
    expect(html).not.toContain("Ubah Tanggal Invoice");
    expect(html).not.toContain("Cetak Surat Jalan");
  });

  it.each(["VOIDED", "REFUNDED"])("tidak menawarkan Void ulang untuk status %s", (status) => {
    const html = renderToStaticMarkup(<TransactionActionMenu {...mockProps} tx={{ ...mockTx, status }} initialOpen />);
    expect(html).not.toMatch(/>\s*Void\s*</);
    expect(html).toMatch(/>\s*Hapus\s*</);
  });

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
