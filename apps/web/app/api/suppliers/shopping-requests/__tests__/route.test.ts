import { beforeEach, describe, expect, it, vi } from "vitest";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const listShoppingRequestsPageMock = vi.hoisted(() => vi.fn());
const createShoppingRequestMock = vi.hoisted(() => vi.fn());
const sendRolePushEventMock = vi.hoisted(() => vi.fn());
const afterMock = vi.hoisted(() => vi.fn());

vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return { ...actual, after: afterMock };
});

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
    createShoppingRequest: createShoppingRequestMock,
    listShoppingRequestsPage: listShoppingRequestsPageMock,
    ShoppingRequestValidationError: class extends Error {},
  }),
);

vi.mock("@/lib/push-events", () => ({
  sendRolePushEvent: sendRolePushEventMock,
}));

import { GET, POST } from "../route";

describe("GET /api/suppliers/shopping-requests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleAuthErrorMock.mockReturnValue(null);
    listShoppingRequestsPageMock.mockResolvedValue({ total: 0, requests: [] });
    afterMock.mockImplementation((callback: () => void | Promise<void>) => callback());
    sendRolePushEventMock.mockResolvedValue({
      activeCandidates: 1,
      recipients: 1,
      attempted: 1,
      sent: 1,
      failed: 0,
      deactivated: 0,
    });
  });

  it("notifies other owners and admins when a shopping request is created", async () => {
    requirePermissionMock.mockResolvedValue({
      id: "inventory-1",
      name: "Rina",
      role: "INVENTORY",
      storeId: "store-utama",
    });
    createShoppingRequestMock.mockResolvedValue({
      id: "request-1",
      number: "PB-202607-001",
      items: [{ id: "item-1" }, { id: "item-2" }],
    });

    const response = await POST(new Request(
      "http://localhost/api/suppliers/shopping-requests",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: "supplier-1",
          items: [{
            productId: "product-1",
            requestedQty: 5,
            stockMode: "PRODUCT_ONLY",
          }],
        }),
      },
    ));

    expect(response.status).toBe(201);
    expect(sendRolePushEventMock).toHaveBeenCalledWith({
      eventName: "shopping-request-created",
      storeId: "store-utama",
      roles: ["OWNER", "ADMIN"],
      featureKey: "shoppingRequests",
      excludeUserIds: ["inventory-1"],
      payload: {
        title: "Permohonan belanja baru",
        body: "Rina mengajukan PB-202607-001 dengan 2 item.",
        url: "/suppliers?tab=shopping-requests",
        tag: "shopping-request:request-1",
      },
    });
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
