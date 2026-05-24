import { beforeEach, describe, expect, it, vi } from "vitest";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const transactionFindFirstMock = vi.hoisted(() => vi.fn());
const productionActivityCreateMock = vi.hoisted(() => vi.fn());
const isWaConfiguredMock = vi.hoisted(() => vi.fn());
const sendWaTextMessageMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@pos/db", () => ({
  db: {
    transaction: {
      findFirst: transactionFindFirstMock,
    },
    productionActivityLog: {
      create: productionActivityCreateMock,
    },
  },
}));

vi.mock("@/lib/whatsapp", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/whatsapp")>();
  return {
    ...actual,
    isWaConfigured: isWaConfiguredMock,
    sendWaTextMessage: sendWaTextMessageMock,
  };
});

vi.mock("@/lib/logger", () => ({
  getLogger: () => ({
    error: vi.fn(),
  }),
}));

describe("POST /api/job-orders/[id]/pickup-notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePermissionMock.mockResolvedValue({
      id: "admin-1",
      username: "admin",
      name: "Admin User",
      role: "ADMIN",
      storeId: "store-main",
    });
    handleAuthErrorMock.mockReturnValue(null);
    isWaConfiguredMock.mockReturnValue(true);
    sendWaTextMessageMock.mockResolvedValue({ id: "wa-1" });
    transactionFindFirstMock.mockResolvedValue({
      id: "job-1",
      invoiceNumber: "INV-20260524-0001",
      customerName: "Budi",
      productionStatus: "READY_PICKUP",
      customer: { phone: "082341234567" },
    });
    productionActivityCreateMock.mockResolvedValue({
      id: "activity-1",
      eventType: "PICKUP_WHATSAPP_SENT",
      createdAt: new Date("2026-05-24T06:00:00.000Z"),
    });
  });

  it("sends a pickup notification and creates activity", async () => {
    const { POST } = await import("../route");

    const response = await POST(
      new Request("http://localhost/api/job-orders/job-1/pickup-notifications", {
        method: "POST",
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: "job-1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(requirePermissionMock).toHaveBeenCalledWith("production", "update");
    expect(sendWaTextMessageMock).toHaveBeenCalledWith(
      "6282341234567@c.us",
      "Halo Budi, pesanan Anda dengan invoice INV-20260524-0001 sudah siap diambil. Terima kasih.",
    );
    expect(productionActivityCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        transactionId: "job-1",
        storeId: "store-main",
        invoiceNumber: "INV-20260524-0001",
        customerName: "Budi",
        fromStatus: "READY_PICKUP",
        toStatus: "READY_PICKUP",
        actorId: "admin-1",
        actorName: "Admin User",
        actorRole: "ADMIN",
        eventType: "PICKUP_WHATSAPP_SENT",
        note: "Notifikasi WhatsApp pickup terkirim",
      }),
    });
    expect(body.data).toEqual(
      expect.objectContaining({
        id: "activity-1",
        jobOrderId: "job-1",
        channel: "WHATSAPP",
        eventType: "PICKUP_WHATSAPP_SENT",
        recipient: "*********4567",
      }),
    );
  });

  it("rejects jobs that are not ready for pickup", async () => {
    transactionFindFirstMock.mockResolvedValue({
      id: "job-1",
      invoiceNumber: "INV-20260524-0001",
      customerName: "Budi",
      productionStatus: "PRINTING",
      customer: { phone: "082341234567" },
    });
    const { POST } = await import("../route");

    const response = await POST(
      new Request("http://localhost/api/job-orders/job-1/pickup-notifications", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "job-1" }) },
    );

    expect(response.status).toBe(409);
    expect(sendWaTextMessageMock).not.toHaveBeenCalled();
    expect(productionActivityCreateMock).not.toHaveBeenCalled();
  });

  it("rejects ready jobs without a WhatsApp number", async () => {
    transactionFindFirstMock.mockResolvedValue({
      id: "job-1",
      invoiceNumber: "INV-20260524-0001",
      customerName: "Budi",
      productionStatus: "READY_PICKUP",
      customer: { phone: null },
    });
    const { POST } = await import("../route");

    const response = await POST(
      new Request("http://localhost/api/job-orders/job-1/pickup-notifications", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "job-1" }) },
    );

    expect(response.status).toBe(422);
    expect(sendWaTextMessageMock).not.toHaveBeenCalled();
    expect(productionActivityCreateMock).not.toHaveBeenCalled();
  });

  it("does not create activity when WAHA send fails", async () => {
    sendWaTextMessageMock.mockRejectedValue(new Error("WAHA down"));
    const { POST } = await import("../route");

    const response = await POST(
      new Request("http://localhost/api/job-orders/job-1/pickup-notifications", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "job-1" }) },
    );

    expect(response.status).toBe(502);
    expect(productionActivityCreateMock).not.toHaveBeenCalled();
  });
});
