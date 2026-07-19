import { beforeEach, describe, expect, it, vi } from "vitest";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const listShoppingRequestsPageMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@/lib/logger", () => ({
  getLogger: () => ({ error: vi.fn() }),
}));

vi.mock(
  "@/features/suppliers/shopping-requests/services/shopping-requests-service",
  () => ({
    createShoppingRequest: vi.fn(),
    listShoppingRequestsPage: listShoppingRequestsPageMock,
    ShoppingRequestValidationError: class extends Error {},
  }),
);

import { GET } from "../route";

describe("GET /api/suppliers/shopping-requests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleAuthErrorMock.mockReturnValue(null);
    listShoppingRequestsPageMock.mockResolvedValue({ total: 0, requests: [] });
  });

  it("passes the authenticated store to the paginated repository filters", async () => {
    requirePermissionMock.mockResolvedValue({
      id: "admin-1",
      storeId: "store-utama",
    });

    const response = await GET(
      new Request("http://localhost/api/suppliers/shopping-requests?page=1"),
    );

    expect(response.status).toBe(200);
    expect(listShoppingRequestsPageMock).toHaveBeenCalledWith(
      expect.objectContaining({ storeId: "store-utama" }),
    );
  });

  it("does not list requests when the user has no store", async () => {
    requirePermissionMock.mockResolvedValue({ id: "admin-1", storeId: null });

    const response = await GET(
      new Request("http://localhost/api/suppliers/shopping-requests"),
    );

    expect(response.status).toBe(403);
    expect(listShoppingRequestsPageMock).not.toHaveBeenCalled();
  });
});
