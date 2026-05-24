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

vi.mock("@/lib/logger", () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("@pos/db", () => ({
  db: {
    $transaction: dbTransactionMock,
  },
}));

function call(id: string, body: unknown) {
  return POST(
    new Request(`http://localhost/api/inventory/${id}/reject`, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
      headers: { "Content-Type": "application/json" },
    }),
    { params: Promise.resolve({ id }) },
  );
}

describe("POST /api/inventory/[id]/reject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleAuthErrorMock.mockReturnValue(null);
    requirePermissionMock.mockResolvedValue({ id: "owner-1", name: "Boss", role: "OWNER" });
    inventoryLogUpdateMock.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "log-1",
      status: "REJECTED",
      ...data,
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

  it("flips PENDING to REJECTED with the supplied reason", async () => {
    inventoryLogFindUniqueMock.mockResolvedValue({ id: "log-1", status: "PENDING" });

    const response = await call("log-1", { reason: "stok tidak cukup" });

    expect(response.status).toBe(200);
    expect(inventoryLogUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "REJECTED",
          rejectionReason: "stok tidak cukup",
          approvedBy: "owner-1",
        }),
      }),
    );
  });

  it("rejects requests without a reason with 422", async () => {
    inventoryLogFindUniqueMock.mockResolvedValue({ id: "log-1", status: "PENDING" });

    const response = await call("log-1", { reason: "" });

    expect(response.status).toBe(422);
    expect(inventoryLogUpdateMock).not.toHaveBeenCalled();
  });

  it("returns 409 with currentStatus when log is not PENDING", async () => {
    inventoryLogFindUniqueMock.mockResolvedValue({ id: "log-1", status: "REJECTED" });

    const response = await call("log-1", { reason: "anything" });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.currentStatus).toBe("REJECTED");
  });

  it("returns 404 when the log does not exist", async () => {
    inventoryLogFindUniqueMock.mockResolvedValue(null);

    const response = await call("missing", { reason: "anything" });

    expect(response.status).toBe(404);
  });
});
