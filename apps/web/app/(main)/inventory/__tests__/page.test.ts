import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const getInventorySummaryMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
}));

vi.mock("@/features/inventory-management/services/inventory-management-service", () => ({
  getInventorySummary: getInventorySummaryMock,
}));

vi.mock("@/features/inventory-management/components/InventoryWorkspace", () => ({
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

  afterEach(() => {
    vi.unstubAllEnvs();
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

  it("renders the inventory workspace without loading the database during E2E", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("E2E_AUTH_BYPASS", "1");
    requirePermissionMock.mockResolvedValue({
      id: "e2e-user",
      role: "SUPER_ADMIN",
      storeId: "store-main",
    });
    getInventorySummaryMock.mockRejectedValue(new Error("Database is unavailable"));

    const element = await InventoryPage();
    const html = renderToStaticMarkup(element);

    expect(html).toContain("Inventory workspace");
    expect(getInventorySummaryMock).not.toHaveBeenCalled();
  });
});
