import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  productFindMany: vi.fn(),
  productCount: vi.fn(),
  categoryFindMany: vi.fn(),
  storeSettingsFindUnique: vi.fn(),
}));

vi.mock("@pos/db", () => ({
  db: {
    product: {
      findMany: mocks.productFindMany,
      count: mocks.productCount,
    },
    category: {
      findMany: mocks.categoryFindMany,
    },
    storeSettings: {
      findUnique: mocks.storeSettingsFindUnique,
    },
  },
}));

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: mocks.requirePermission,
}));

import { loadPOSInitialData } from "../pos-initial-data";

describe("loadPOSInitialData", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("returns shift mode disabled from store settings", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mocks.requirePermission.mockResolvedValue({ storeId: "store-main" });
    mocks.productFindMany.mockResolvedValue([]);
    mocks.productCount.mockResolvedValue(0);
    mocks.categoryFindMany.mockResolvedValue([]);
    mocks.storeSettingsFindUnique.mockResolvedValue({ shiftEnabled: false });

    await expect(loadPOSInitialData()).resolves.toMatchObject({
      shiftEnabled: false,
      categories: [],
    });
  });

  it("does not allow E2E auth bypass in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("E2E_AUTH_BYPASS", "1");
    mocks.requirePermission.mockRejectedValueOnce(new Error("Unauthorized"));

    await expect(loadPOSInitialData()).resolves.toEqual({
      products: null,
      categories: [],
      shiftEnabled: true,
    });

    expect(mocks.requirePermission).toHaveBeenCalledWith("product", "read");
  });
});
