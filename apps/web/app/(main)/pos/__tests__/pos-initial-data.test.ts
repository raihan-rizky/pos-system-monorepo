import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
}));

vi.mock("@pos/db", () => ({
  db: {
    product: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    category: {
      findMany: vi.fn(),
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

  it("does not allow E2E auth bypass in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("E2E_AUTH_BYPASS", "1");
    mocks.requirePermission.mockRejectedValueOnce(new Error("Unauthorized"));

    await expect(loadPOSInitialData()).resolves.toEqual({
      products: null,
      categories: [],
    });

    expect(mocks.requirePermission).toHaveBeenCalledWith("product", "read");
  });
});
