import { beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const queryRawMock = vi.hoisted(() => vi.fn());
const executeRawMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requireRole: requireRoleMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@pos/db", () => ({
  db: {
    $queryRaw: queryRawMock,
    $executeRaw: executeRawMock,
  },
}));

function request(method: string, body: unknown) {
  return new Request("http://localhost/api/push/subscriptions", {
    method,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("/api/push/subscriptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleAuthErrorMock.mockReturnValue(null);
    requireRoleMock.mockResolvedValue({
      id: "user-1",
      role: "OWNER",
      storeId: "store-main",
    });
  });

  it("saves a subscription through explicit SQL upsert", async () => {
    const { POST } = await import("../route");
    queryRawMock.mockResolvedValue([{ id: "sub-1", isActive: true }]);

    const response = await POST(
      request("POST", {
        endpoint: "https://fcm.googleapis.com/fcm/send/test",
        keys: {
          auth: "auth-key",
          p256dh: "p256dh-key",
        },
      }),
    );

    await expect(response.json()).resolves.toEqual({
      success: true,
      id: "sub-1",
    });
    expect(response.status).toBe(200);
    expect(queryRawMock).toHaveBeenCalledTimes(1);
  });

  it("allows INVENTORY users to manage their own subscription", async () => {
    const { POST } = await import("../route");
    requireRoleMock.mockResolvedValue({
      id: "inventory-1",
      role: "INVENTORY",
      storeId: "store-main",
    });
    queryRawMock.mockResolvedValue([{ id: "sub-inventory", isActive: true }]);

    const response = await POST(
      request("POST", {
        endpoint: "https://fcm.googleapis.com/fcm/send/inventory",
        keys: {
          auth: "auth-key",
          p256dh: "p256dh-key",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(requireRoleMock).toHaveBeenCalledWith(
      "OWNER",
      "ADMIN",
      "CASHIER",
      "SALES",
      "INVENTORY",
    );
  });

  it("disables the current user's subscription through explicit SQL update", async () => {
    const { DELETE } = await import("../route");
    executeRawMock.mockResolvedValue(1);

    const response = await DELETE(
      request("DELETE", {
        endpoint: "https://fcm.googleapis.com/fcm/send/test",
      }),
    );

    await expect(response.json()).resolves.toEqual({
      success: true,
      disabled: 1,
    });
    expect(response.status).toBe(200);
    expect(executeRawMock).toHaveBeenCalledTimes(1);
  });
});
