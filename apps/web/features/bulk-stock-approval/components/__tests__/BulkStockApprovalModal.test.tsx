import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { BulkStockApprovalModal } from "../BulkStockApprovalModal";

vi.mock("@pos/ui", () => ({
  Button: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
  Modal: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <section>
      <h1>{title}</h1>
      {children}
    </section>
  ),
}));

vi.mock("@/components/providers/RoleProvider", () => ({
  useRole: () => ({ role: "OWNER" }),
}));

vi.mock("@/hooks/useInventoryLogs", () => ({
  useBulkBatchDetail: () => ({
    isLoading: false,
    isError: false,
    data: {
      id: "batch-1",
      type: "BULK_STOCK_GROUP_ADJUSTMENT",
      status: "PENDING",
      createdBy: "user-1",
      createdAt: "2026-07-03T08:00:00.000Z",
      creator: { id: "user-1", name: "Rina", role: "INVENTORY" },
      summary: {
        source: "PRODUCT_FIRST_STOCK_GROUP_BULK",
        productName: "Update Stok Massal - Stok Bersama",
        totalCount: 2,
        pendingCount: 2,
        rows: [
          {
            productId: "pack",
            productName: "Kertas A4",
            stockGroupId: "group-1",
            stockGroupName: "Kertas A4",
            type: "IN",
            inputValue: 2,
          },
        ],
      },
      items: [
        {
          id: "item-1",
          inventoryLogId: "log-1",
          sku: "A4-LBR",
          beforeSnapshot: { stock: 100 },
          afterSnapshot: { stock: 120 },
          product: { id: "sheet", name: "Kertas A4", sku: "A4-LBR", stock: 100 },
          inventoryLog: {
            id: "log-1",
            productId: "sheet",
            type: "IN",
            reason: "RESTOCK",
            quantity: 20,
            note: "Tambah pack",
            createdBy: "user-1",
            person: "Rina",
            createdAt: "2026-07-03T08:00:00.000Z",
            status: "PENDING",
            approvedBy: null,
            approverName: null,
            decidedAt: null,
            rejectionReason: null,
            product: {
              id: "sheet",
              name: "Kertas A4",
              sku: "A4-LBR",
              unit: "lembar",
              stock: 100,
              imageUrl: null,
              category: { name: "Kertas", icon: null },
            },
          },
        },
      ],
    },
  }),
}));

vi.mock("../../hooks/useBulkApproval", () => ({
  useApproveBulkAll: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useApproveBulkItem: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useEditBulkItem: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useRejectBulkAll: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useRejectBulkItem: () => ({ isPending: false, mutateAsync: vi.fn() }),
}));

vi.mock("@/features/inventory-management/api/inventory-management-api", () => ({
  approveDailyStockMatching: vi.fn(),
  approveStockGroupBulk: vi.fn(),
  previewStockGroupBulk: vi.fn(),
}));

describe("BulkStockApprovalModal", () => {
  it("renders product-first Stok Bersama bundles without the legacy basis review fields", () => {
    const html = renderToStaticMarkup(
      <BulkStockApprovalModal batchId="batch-1" open onClose={() => {}} />,
    );

    expect(html).toContain("Stok Bersama");
    expect(html).toContain("Setujui Bundle");
    expect(html).not.toContain("Basis Review");
  });
});
