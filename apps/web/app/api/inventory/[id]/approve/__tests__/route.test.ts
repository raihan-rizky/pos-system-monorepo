import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const inventoryLogFindUniqueMock = vi.hoisted(() => vi.fn());
const inventoryLogUpdateMock = vi.hoisted(() => vi.fn());
const productFindUniqueMock = vi.hoisted(() => vi.fn());
const productUpdateMock = vi.hoisted(() => vi.fn());
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
  Prisma: {},
}));

function call(id: string) {
  return POST(new Request(`http://localhost/api/inventory/${id}/approve`, { method: "POST" }), {
    params: Promise.resolve({ id }),
  });
}

describe("POST /api/inventory/[id]/approve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleAuthErrorMock.mockReturnValue(null);
    requirePermissionMock.mockResolvedValue({ id: "owner-1", name: "Boss", role: "OWNER" });
    inventoryLogUpdateMock.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "log-1",
      status: "APPROVED",
      ...data,
    }));
    productUpdateMock.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "product-1",
      ...data,
    }));
    dbTransactionMock.mockImplementation(async (callback) =>
      callback({
        inventoryLog: {
          findUnique: inventoryLogFindUniqueMock,
          update: inventoryLogUpdateMock,
        },
        product: {
          findUnique: productFindUniqueMock,
          update: productUpdateMock,
        },
      }),
    );
  });

  it("flips PENDING to APPROVED and applies the stock delta atomically for an IN log", async () => {
    inventoryLogFindUniqueMock.mockResolvedValue({
      id: "log-1",
      productId: "product-1",
      type: "IN",
      quantity: 5,
      status: "PENDING",
    });
    productFindUniqueMock.mockResolvedValue({ id: "product-1", stock: 10 });

    const response = await call("log-1");

    expect(response.status).toBe(200);
    expect(productUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "product-1" },
        data: { stock: 15 },
      }),
    );
    expect(inventoryLogUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "APPROVED", approvedBy: "owner-1" }),
      }),
    );
  });

  it("returns 409 with currentStatus when the log was already decided", async () => {
    inventoryLogFindUniqueMock.mockResolvedValue({
      id: "log-1",
      productId: "product-1",
      type: "IN",
      quantity: 5,
      status: "APPROVED",
    });

    const response = await call("log-1");
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.currentStatus).toBe("APPROVED");
    expect(productUpdateMock).not.toHaveBeenCalled();
  });

  it("returns 422 with available and requested when approval would make stock negative, and leaves stock untouched", async () => {
    inventoryLogFindUniqueMock.mockResolvedValue({
      id: "log-1",
      productId: "product-1",
      type: "OUT",
      quantity: 50,
      status: "PENDING",
    });
    productFindUniqueMock.mockResolvedValue({ id: "product-1", stock: 10 });

    const response = await call("log-1");
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.available).toBe(10);
    expect(body.requested).toBe(50);
    expect(productUpdateMock).not.toHaveBeenCalled();
    expect(inventoryLogUpdateMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the log is missing", async () => {
    inventoryLogFindUniqueMock.mockResolvedValue(null);

    const response = await call("missing");

    expect(response.status).toBe(404);
  });
});
