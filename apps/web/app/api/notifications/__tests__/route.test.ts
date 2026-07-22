import { beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const notificationFindManyMock = vi.hoisted(() => vi.fn());
const notificationCountMock = vi.hoisted(() => vi.fn());
const notificationUpdateManyMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requireRole: requireRoleMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@pos/db", () => ({
  db: {
    notification: {
      findMany: notificationFindManyMock,
      count: notificationCountMock,
      updateMany: notificationUpdateManyMock,
    },
  },
}));

describe("notification inbox API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleAuthErrorMock.mockReturnValue(null);
    requireRoleMock.mockResolvedValue({
      id: "owner-1",
      role: "OWNER",
      storeId: "store-main",
    });
    notificationFindManyMock.mockResolvedValue([
      {
        id: "notification-1",
        eventName: "shopping-request-created",
        title: "Permohonan belanja baru",
        body: "Rina mengajukan PB-001.",
        url: "/suppliers?tab=shopping-requests",
        readAt: null,
        createdAt: new Date("2026-07-22T02:00:00.000Z"),
      },
    ]);
    notificationCountMock.mockResolvedValue(1);
    notificationUpdateManyMock.mockResolvedValue({ count: 1 });
  });

  it("returns only the current user's notifications with the unread count", async () => {
    const { GET } = await import("../route");
    const response = await GET(new Request("http://localhost/api/notifications?limit=20"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(notificationFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "owner-1" },
      take: 20,
      orderBy: { createdAt: "desc" },
    }));
    expect(notificationCountMock).toHaveBeenCalledWith({
      where: { userId: "owner-1", readAt: null },
    });
    expect(body.data.unreadCount).toBe(1);
    expect(body.data.notifications[0].title).toBe("Permohonan belanja baru");
  });

  it("marks all notifications as read for the current user only", async () => {
    const { POST } = await import("../read-all/route");
    const response = await POST();

    expect(response.status).toBe(200);
    expect(notificationUpdateManyMock).toHaveBeenCalledWith({
      where: { userId: "owner-1", readAt: null },
      data: { readAt: expect.any(Date) },
    });
    await expect(response.json()).resolves.toEqual({ data: { updated: 1 } });
  });
});
