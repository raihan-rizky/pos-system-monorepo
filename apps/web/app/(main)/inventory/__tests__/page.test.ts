import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const getInventorySummaryMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
}));

vi.mock("@/features/inventory-management", () => ({
  getInventorySummary: getInventorySummaryMock,
  InventoryWorkspace: () => React.createElement("section", null, "Inventory workspace"),
}));

vi.mock("@/features/inventory-management/repositories/InventoryManagementRepository", () => ({
  InventoryManagementRepository: class InventoryManagementRepository {},
}));

import InventoryPage from "../page";

describe("InventoryPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a store assignment message for unscoped inventory users", async () => {
    requirePermissionMock.mockResolvedValue({
      id: "inventory-1",
      role: "INVENTORY",
      storeId: null,
    });
    getInventorySummaryMock.mockRejectedValue(
      new Error("Inventory summary requires a store-scoped user"),
    );

    const element = await InventoryPage();
    const html = renderToStaticMarkup(element);

    expect(html).toContain("Akun inventory belum terhubung ke toko");
    expect(getInventorySummaryMock).not.toHaveBeenCalled();
  });
});
