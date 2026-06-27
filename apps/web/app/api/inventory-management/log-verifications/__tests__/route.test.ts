import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const inventoryLogFindFirstMock = vi.hoisted(() => vi.fn());
const inventoryLogVerificationUpsertMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@pos/db", () => ({
  db: {
    inventoryLog: { findFirst: inventoryLogFindFirstMock },
    inventoryLogVerification: { upsert: inventoryLogVerificationUpsertMock },
  },
}));

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/inventory-management/log-verifications", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /api/inventory-management/log-verifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleAuthErrorMock.mockReturnValue(null);
    requirePermissionMock.mockResolvedValue({
      id: "inventory-1",
      role: "INVENTORY",
      storeId: "store-main",
    });
    inventoryLogFindFirstMock.mockResolvedValue({
      id: "log-1",
      type: "OUT",
      reason: "USAGE",
      status: "APPROVED",
      product: { storeId: "store-main" },
    });
    inventoryLogVerificationUpsertMock.mockResolvedValue({
      id: "verification-1",
      inventoryLogId: "log-1",
      status: "VERIFIED",
    });
  });

  it("requires inventory write permission and verifies approved internal stock-out logs", async () => {
    const response = await post({
      inventoryLogId: "log-1",
      status: "VERIFIED",
      note: "Barang benar dipakai produksi",
    });

    expect(response.status).toBe(200);
    expect(requirePermissionMock).toHaveBeenCalledWith("inventory", "update");
    expect(inventoryLogFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "log-1",
          type: "OUT",
          status: "APPROVED",
          product: { storeId: "store-main" },
        }),
      }),
    );
    expect(inventoryLogVerificationUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { inventoryLogId: "log-1" },
        create: expect.objectContaining({
          inventoryLogId: "log-1",
          storeId: "store-main",
          status: "VERIFIED",
          note: "Barang benar dipakai produksi",
          verifiedBy: "inventory-1",
        }),
        update: expect.objectContaining({
          status: "VERIFIED",
          note: "Barang benar dipakai produksi",
          verifiedBy: "inventory-1",
        }),
      }),
    );
  });

  it("rejects approved OUT logs that are not internal/manual stock-out tasks", async () => {
    inventoryLogFindFirstMock.mockResolvedValue({
      id: "log-1",
      type: "OUT",
      reason: "SALE",
      status: "APPROVED",
      product: { storeId: "store-main" },
    });

    const response = await post({
      inventoryLogId: "log-1",
      status: "VERIFIED",
    });

    expect(response.status).toBe(422);
    expect(inventoryLogVerificationUpsertMock).not.toHaveBeenCalled();
  });

  it("records mismatch decisions for stock-out logs that are not real", async () => {
    inventoryLogVerificationUpsertMock.mockResolvedValue({
      id: "verification-1",
      inventoryLogId: "log-1",
      status: "MISMATCH",
    });

    const response = await post({
      inventoryLogId: "log-1",
      status: "MISMATCH",
      note: "Barang masih ada di gudang",
    });

    expect(response.status).toBe(200);
    expect(inventoryLogVerificationUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ status: "MISMATCH" }),
        update: expect.objectContaining({ status: "MISMATCH" }),
      }),
    );
  });

  it("rejects users without a store scope", async () => {
    requirePermissionMock.mockResolvedValue({
      id: "inventory-1",
      role: "INVENTORY",
      storeId: null,
    });

    const response = await post({
      inventoryLogId: "log-1",
      status: "VERIFIED",
    });

    expect(response.status).toBe(403);
    expect(inventoryLogFindFirstMock).not.toHaveBeenCalled();
    expect(inventoryLogVerificationUpsertMock).not.toHaveBeenCalled();
  });
});
