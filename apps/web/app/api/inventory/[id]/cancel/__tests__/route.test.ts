import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const inventoryLogFindUniqueMock = vi.hoisted(() => vi.fn());
const inventoryLogUpdateMock = vi.hoisted(() => vi.fn());
const dbTransactionMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@pos/db", () => ({
  db: {
    $transaction: dbTransactionMock,
  },
}));

function call(id: string) {
  return POST(new Request(`http://localhost/api/inventory/${id}/cancel`, { method: "POST" }), {
    params: Promise.resolve({ id }),
  });
}

describe("POST /api/inventory/[id]/cancel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleAuthErrorMock.mockReturnValue(null);
    inventoryLogUpdateMock.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "log-1",
      status: "REJECTED",
      rejectionReason: data.rejectionReason,
    }));
    dbTransactionMock.mockImplementation(async (callback) =>
      callback({
        inventoryLog: {
          findUnique: inventoryLogFindUniqueMock,
          update: inventoryLogUpdateMock,
        },
      }),
    );
  });

  it("lets the requester cancel their own pending request and writes the system reason", async () => {
    requirePermissionMock.mockResolvedValue({ id: "user-1", name: "Ada", role: "ADMIN" });
    inventoryLogFindUniqueMock.mockResolvedValue({
      id: "log-1",
      status: "PENDING",
      createdBy: "user-1",
    });

    const response = await call("log-1");

    expect(response.status).toBe(200);
    expect(inventoryLogUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "log-1" },
        data: expect.objectContaining({
          status: "REJECTED",
          rejectionReason: "Dibatalkan oleh pemohon",
        }),
      }),
    );
  });

  it("lets an OWNER cancel another user's pending request as an override", async () => {
    requirePermissionMock.mockResolvedValue({ id: "owner-1", name: "Boss", role: "OWNER" });
    inventoryLogFindUniqueMock.mockResolvedValue({
      id: "log-1",
      status: "PENDING",
      createdBy: "user-2",
    });

    const response = await call("log-1");

    expect(response.status).toBe(200);
    expect(inventoryLogUpdateMock).toHaveBeenCalled();
  });

  it("returns 403 when a non-OWNER tries to cancel someone else's request", async () => {
    requirePermissionMock.mockResolvedValue({ id: "user-1", name: "Ada", role: "ADMIN" });
    inventoryLogFindUniqueMock.mockResolvedValue({
      id: "log-1",
      status: "PENDING",
      createdBy: "user-2",
    });

    const response = await call("log-1");
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.message).toMatch(/membatalkan/i);
    expect(inventoryLogUpdateMock).not.toHaveBeenCalled();
  });

  it("returns 409 with currentStatus when the log is no longer PENDING", async () => {
    requirePermissionMock.mockResolvedValue({ id: "user-1", name: "Ada", role: "ADMIN" });
    inventoryLogFindUniqueMock.mockResolvedValue({
      id: "log-1",
      status: "APPROVED",
      createdBy: "user-1",
    });

    const response = await call("log-1");
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.currentStatus).toBe("APPROVED");
  });

  it("returns 404 when the log does not exist", async () => {
    requirePermissionMock.mockResolvedValue({ id: "user-1", name: "Ada", role: "ADMIN" });
    inventoryLogFindUniqueMock.mockResolvedValue(null);

    const response = await call("missing");

    expect(response.status).toBe(404);
    expect(inventoryLogUpdateMock).not.toHaveBeenCalled();
  });
});
