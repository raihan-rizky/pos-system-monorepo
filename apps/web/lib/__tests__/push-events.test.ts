import { beforeEach, describe, expect, it, vi } from "vitest";

const pushSubscriptionFindManyMock = vi.hoisted(() => vi.fn());
const sendPushToSubscriptionsMock = vi.hoisted(() => vi.fn());

vi.mock("@pos/db", () => ({
  db: {
    pushSubscription: {
      findMany: pushSubscriptionFindManyMock,
    },
  },
}));

vi.mock("@/lib/push", () => ({
  sendPushToSubscriptions: sendPushToSubscriptionsMock,
}));

describe("sendRolePushEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendPushToSubscriptionsMock.mockResolvedValue({
      attempted: 1,
      sent: 1,
      failed: 0,
      deactivated: 0,
    });
  });

  it("selects active subscriptions by store, roles, and feature flag", async () => {
    const { sendRolePushEvent } = await import("../push-events");
    const subscriptions = [
      { id: "sub-1", features: { inventoryRequests: true } },
      { id: "sub-2", features: { inventoryRequests: false } },
      { id: "sub-3", features: null },
    ];
    pushSubscriptionFindManyMock.mockResolvedValue(subscriptions);

    const result = await sendRolePushEvent({
      eventName: "inventory-request-created",
      storeId: "store-main",
      roles: ["OWNER", "ADMIN"],
      featureKey: "inventoryRequests",
      payload: {
        title: "Permintaan stok baru",
        body: "Ada membuat permintaan stok OUT sebanyak 5 item.",
        url: "/inventory?tab=stock-logs",
        tag: "inventory-request:log-1",
      },
    });

    expect(pushSubscriptionFindManyMock).toHaveBeenCalledWith({
      where: {
        isActive: true,
        role: { in: ["OWNER", "ADMIN"] },
        storeId: "store-main",
      },
    });
    expect(sendPushToSubscriptionsMock).toHaveBeenCalledWith(
      [subscriptions[0], subscriptions[2]],
      expect.objectContaining({ tag: "inventory-request:log-1" }),
    );
    expect(result).toEqual({
      activeCandidates: 3,
      recipients: 2,
      attempted: 1,
      sent: 1,
      failed: 0,
      deactivated: 0,
    });
  });

  it("does not configure or send web push when no recipients match", async () => {
    const { sendRolePushEvent } = await import("../push-events");
    pushSubscriptionFindManyMock.mockResolvedValue([
      { id: "sub-1", features: { pendingTransactions: false } },
    ]);

    const result = await sendRolePushEvent({
      eventName: "pending-transaction-created",
      storeId: "store-main",
      roles: ["CASHIER", "OWNER", "ADMIN"],
      featureKey: "pendingTransactions",
      payload: {
        title: "Transaksi menunggu approval",
        body: "Sales membuat transaksi Rp125.000.",
        url: "/history",
        tag: "pending-transaction:tx-1",
      },
    });

    expect(sendPushToSubscriptionsMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      activeCandidates: 1,
      recipients: 0,
      attempted: 0,
      sent: 0,
      failed: 0,
      deactivated: 0,
    });
  });
});
