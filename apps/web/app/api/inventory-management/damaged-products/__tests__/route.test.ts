import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const productFindFirstMock = vi.hoisted(() => vi.fn());
const inventoryLogCreateMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@pos/db", () => ({
  db: {
    product: { findFirst: productFindFirstMock },
    inventoryLog: { create: inventoryLogCreateMock },
  },
}));

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/inventory-management/damaged-products", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /api/inventory-management/damaged-products", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleAuthErrorMock.mockReturnValue(null);
    requirePermissionMock.mockResolvedValue({
      id: "inventory-1",
      name: "Ira",
      role: "INVENTORY",
      storeId: "store-main",
    });
    productFindFirstMock.mockResolvedValue({
      id: "product-1",
      stock: 8,
      costPrice: { toString: () => "12000" },
    });
    inventoryLogCreateMock.mockResolvedValue({
      id: "log-1",
      status: "PENDING",
      reason: "WASTE",
    });
    vi.stubEnv("R2_PUBLIC_BASE_URL", "https://pub-example.r2.dev");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          '<meta property="og:image" content="https://image.prntscr.com/image/damaged.png">',
          { status: 200 },
        ),
      ),
    );
  });

  it("accepts a proof from the configured R2 public origin without proxying it", async () => {
    const proofUrl =
      "https://pub-example.r2.dev/proofs/damaged-products/store-main/proof.jpg";

    const response = await post({
      productId: "product-1",
      quantity: 1,
      proofUrl,
    });

    expect(response.status).toBe(201);
    expect(fetch).not.toHaveBeenCalled();
    expect(inventoryLogCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        note: expect.stringContaining(`Resolved proof: ${proofUrl}`),
      }),
    });
  });

  it("creates a pending WASTE stock-out request with resolved damage proof", async () => {
    const response = await post({
      productId: "product-1",
      quantity: 2,
      proofUrl: "https://prnt.sc/dmg123",
      note: "Kemasan pecah",
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(requirePermissionMock).toHaveBeenCalledWith("inventory", "update");
    expect(productFindFirstMock).toHaveBeenCalledWith({
      where: { id: "product-1", storeId: "store-main" },
      select: { id: true, stock: true, costPrice: true },
    });
    expect(inventoryLogCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        productId: "product-1",
        type: "OUT",
        reason: "WASTE",
        quantity: 2,
        unitCost: 12000,
        status: "PENDING",
        createdBy: "inventory-1",
        person: "Ira",
        approvedBy: null,
        decidedAt: null,
        note: expect.stringContaining("Proof URL: https://prnt.sc/dmg123"),
      }),
    });
    expect(body.data.status).toBe("PENDING");
  });

  it("keeps owner damage reports pending instead of applying stock immediately", async () => {
    requirePermissionMock.mockResolvedValue({
      id: "owner-1",
      name: "Owner",
      role: "OWNER",
      storeId: "store-main",
    });

    const response = await post({
      productId: "product-1",
      quantity: 1,
      proofUrl: "https://prnt.sc/dmg123",
    });

    expect(response.status).toBe(201);
    expect(inventoryLogCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "PENDING",
          approvedBy: null,
          decidedAt: null,
        }),
      }),
    );
  });

  it("rejects quantities above available stock", async () => {
    productFindFirstMock.mockResolvedValue({
      id: "product-1",
      stock: 1,
      costPrice: null,
    });

    const response = await post({
      productId: "product-1",
      quantity: 2,
      proofUrl: "https://prnt.sc/dmg123",
    });

    expect(response.status).toBe(422);
    expect(inventoryLogCreateMock).not.toHaveBeenCalled();
  });

  it("rejects users without a store scope", async () => {
    requirePermissionMock.mockResolvedValue({
      id: "inventory-1",
      name: "Ira",
      role: "INVENTORY",
      storeId: null,
    });

    const response = await post({
      productId: "product-1",
      quantity: 1,
      proofUrl: "https://prnt.sc/dmg123",
    });

    expect(response.status).toBe(403);
    expect(productFindFirstMock).not.toHaveBeenCalled();
    expect(inventoryLogCreateMock).not.toHaveBeenCalled();
  });
});
