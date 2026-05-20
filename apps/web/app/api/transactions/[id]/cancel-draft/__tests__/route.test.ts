import { beforeEach, describe, expect, it, vi } from "vitest";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const transactionUpdateManyMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
  AuthError: class AuthError extends Error {
    public statusCode: number;
    constructor(statusCode: number, message?: string) {
      super(message || "auth");
      this.statusCode = statusCode;
    }
  },
}));

vi.mock("@pos/db", () => ({
  db: {
    transaction: { updateMany: transactionUpdateManyMock },
  },
}));

describe("POST /api/transactions/[id]/cancel-draft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePermissionMock.mockResolvedValue({
      id: "cashier-1",
      role: "CASHIER",
      storeId: "store-main",
      name: "Cashier One",
    });
    handleAuthErrorMock.mockReturnValue(null);
  });

  it("flips DRAFT → VOIDED in a single optimistic-locked update", async () => {
    transactionUpdateManyMock.mockResolvedValue({ count: 1 });
    const { POST } = await import("../route");
    const res = await POST(
      new Request("http://localhost/api/transactions/draft-1/cancel-draft", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "draft-1" }) },
    );
    expect(res.status).toBe(200);
    expect(transactionUpdateManyMock).toHaveBeenCalledWith({
      where: { id: "draft-1", storeId: "store-main", status: "DRAFT" },
      data: { status: "VOIDED" },
    });
  });

  it("returns 409 when the row is no longer DRAFT", async () => {
    transactionUpdateManyMock.mockResolvedValue({ count: 0 });
    const { POST } = await import("../route");
    const res = await POST(
      new Request("http://localhost/api/transactions/draft-1/cancel-draft", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "draft-1" }) },
    );
    expect(res.status).toBe(409);
  });
});
