import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import StockLogsTab from "../StockLogsTab";

const { listLogs, user } = vi.hoisted(() => ({
  listLogs: vi.fn(),
  user: { role: "INVENTORY", userId: "author", allowEdit: true },
}));

vi.mock("@/hooks/useInventoryLogs", () => ({
  useInventoryLogs: listLogs,
  useApproveInventoryLog: () => ({}),
  useRejectInventoryLog: () => ({}),
  useCancelInventoryLog: () => ({}),
  useUpdateInternalUseLog: () => ({}),
}));
vi.mock("@/components/providers/RoleProvider", () => ({
  useRole: () => ({
    ...user,
    canPerform: (resource: string) => resource === "inventory.approve"
      ? user.role === "OWNER"
      : resource !== "inventory.internal_use" || user.allowEdit,
  }),
}));
vi.mock("@/features/bulk-stock-approval/hooks/useBulkApproval", () => ({
  useCancelBulkBatch: () => ({}),
}));
vi.mock("@/features/internal-use-recap/hooks/useInternalUseRecap", () => ({
  useInternalUseRecap: () => ({ isLoading: true }),
}));
vi.mock("@/hooks/useProducts", () => ({ useProducts: () => ({ data: [] }) }));

const log = {
  id: "log-1", productId: "paper", type: "OUT", reason: "USAGE",
  quantity: 10, createdAt: "2026-11-28T02:00:00Z", createdBy: "author", person: "Rina",
  note: "Kertas dipakai", status: "PENDING", batchItem: null,
  product: { id: "paper", name: "Kertas", sku: "K", unit: "rim", stock: 18 },
};

function renderLog(overrides: Record<string, unknown> = {}) {
  listLogs.mockReturnValue({ data: {
    data: [{ ...log, ...overrides }], pagination: { totalPages: 1, pendingTotal: 0 },
  } });
  return renderToStaticMarkup(<StockLogsTab />);
}

describe("internal usage actions in the stock log", () => {
  beforeEach(() => {
    user.role = "INVENTORY";
    user.allowEdit = true;
  });

  it("shows Edit alongside Batalkan for the author on both screen sizes", () => {
    const html = renderLog();

    expect(html.match(/>Edit<\/button>/g)).toHaveLength(2);
    expect(html.match(/>Batalkan<\/button>/g)).toHaveLength(2);
  });

  it("hides Edit when the author lacks the feature permission", () => {
    user.allowEdit = false;
    expect(renderLog()).not.toContain(">Edit</button>");
  });

  it("shows Koreksi and Batalkan to the Owner on an approved usage log", () => {
    user.role = "OWNER";
    const html = renderLog({ status: "APPROVED", internalUseDayLocked: false });

    expect(html.match(/>Koreksi<\/button>/g)).toHaveLength(2);
    expect(html.match(/>Batalkan<\/button>/g)).toHaveLength(2);
  });

  it("shows the cancellation in history without another stock action", () => {
    user.role = "OWNER";
    const html = renderLog({
      status: "APPROVED", internalUseDayLocked: false,
      effectiveInternalUse: {
        correctionId: "cancelled-1", product: log.product, quantity: 0, note: "Barang kembali",
      },
    });

    expect(html).toContain("Dibatalkan");
    expect(html).toContain("Barang kembali");
    expect(html).not.toContain(">Batalkan</button>");
  });

  it("hides approved changes when the inventory day is locked", () => {
    user.role = "OWNER";
    const html = renderLog({ status: "APPROVED", internalUseDayLocked: true });

    expect(html).not.toContain(">Koreksi</button>");
    expect(html).not.toContain(">Batalkan</button>");
  });
});
