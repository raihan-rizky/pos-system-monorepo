import { beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const notificationUpdateManyMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requireRole: requireRoleMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@pos/db", () => ({
  db: { notification: { updateMany: notificationUpdateManyMock } },
}));

describe("PATCH /api/notifications/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleAuthErrorMock.mockReturnValue(null);
    requireRoleMock.mockResolvedValue({ id: "owner-1", role: "OWNER" });
  });

  it("marks a notification as read only when it belongs to the current user", async () => {
    notificationUpdateManyMock.mockResolvedValue({ count: 1 });
    const { PATCH } = await import("../route");
    const response = await PATCH(
      new Request("http://localhost/api/notifications/notification-1", { method: "PATCH" }),
      { params: Promise.resolve({ id: "notification-1" }) },
    );

    expect(response.status).toBe(200);
    expect(notificationUpdateManyMock).toHaveBeenCalledWith({
      where: { id: "notification-1", userId: "owner-1" },
      data: { readAt: expect.any(Date) },
    });
  });

  it("does not expose another user's notification", async () => {
    notificationUpdateManyMock.mockResolvedValue({ count: 0 });
    const { PATCH } = await import("../route");
    const response = await PATCH(
      new Request("http://localhost/api/notifications/other", { method: "PATCH" }),
      { params: Promise.resolve({ id: "other" }) },
    );

    expect(response.status).toBe(404);
  });
});
