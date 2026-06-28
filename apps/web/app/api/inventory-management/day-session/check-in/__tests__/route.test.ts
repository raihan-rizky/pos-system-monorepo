import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const upsertMock = vi.hoisted(() => vi.fn());
const loadStockRiskItemsMock = vi.hoisted(() => vi.fn());
const loadProductionMaterialsMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@pos/db", () => ({
  db: {
    inventoryDaySession: {
      upsert: upsertMock,
    },
  },
  Prisma: {
    JsonNull: "JSON_NULL",
  },
}));

vi.mock("@/features/inventory-management/services/inventory-day-session", () => ({
  WORKSPACE_SAFETY_ITEMS: [
    { id: "machine-area", label: "Area mesin printing bersih dan siap dipakai" },
    { id: "paper-area", label: "Area kertas, ATK, dan bahan produksi tertata" },
  ],
  loadStockRiskItems: loadStockRiskItemsMock,
  loadProductionMaterials: loadProductionMaterialsMock,
}));

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/inventory-management/day-session/check-in", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
}

const validBody = {
  stockRiskAcknowledged: true,
  materialCounts: [
    { productId: "paper-a3", actualQuantity: 20 },
    { productId: "ink-black", actualQuantity: 5, note: "sealed" },
  ],
  safetyChecks: [
    { id: "machine-area", checked: true },
    { id: "paper-area", checked: true },
  ],
};

describe("POST /api/inventory-management/day-session/check-in", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleAuthErrorMock.mockReturnValue(null);
    requirePermissionMock.mockResolvedValue({
      id: "inventory-1",
      username: "inventory",
      name: "Inventory Staff",
      role: "INVENTORY",
      storeId: "store-main",
    });
    loadStockRiskItemsMock.mockResolvedValue({
      negative: [{ id: "neg-1", name: "Kertas Minus", stock: -1, minStock: 5, unit: "rim" }],
      outOfStock: [],
      lowStock: [],
    });
    loadProductionMaterialsMock.mockResolvedValue([
      {
        source: "AUTO",
        product: { id: "paper-a3", name: "Kertas A3", sku: "A3", stock: 20, minStock: 5, unit: "rim" },
      },
      {
        source: "PINNED",
        product: { id: "ink-black", name: "Tinta Hitam", sku: "INK-B", stock: 5, minStock: 2, unit: "botol" },
      },
    ]);
    upsertMock.mockResolvedValue({
      id: "session-1",
      periodKey: "2026-06-28",
      status: "CHECKED_IN",
    });
  });

  it("creates or updates a checked-in store day session with morning check snapshot", async () => {
    const response = await post(validBody);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(requirePermissionMock).toHaveBeenCalledWith("inventory", "update");
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          storeId_periodKey: expect.objectContaining({ storeId: "store-main" }),
        },
        create: expect.objectContaining({
          storeId: "store-main",
          status: "CHECKED_IN",
          checkInById: "inventory-1",
          checkInByName: "Inventory Staff",
          morningCheckSnapshot: expect.objectContaining({
            stockRiskAcknowledged: true,
            materialCounts: validBody.materialCounts,
          }),
        }),
        update: expect.objectContaining({
          status: "CHECKED_IN",
          checkOutSnapshot: "JSON_NULL",
        }),
      }),
    );
    expect(body.data.status).toBe("CHECKED_IN");
  });

  it("rejects check-in when stock risk review is not acknowledged", async () => {
    const response = await post({ ...validBody, stockRiskAcknowledged: false });

    expect(response.status).toBe(422);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("rejects check-in when workspace safety checklist is incomplete", async () => {
    const response = await post({
      ...validBody,
      safetyChecks: [
        { id: "machine-area", checked: true },
        { id: "paper-area", checked: false },
      ],
    });

    expect(response.status).toBe(422);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("rejects check-in when a required production material is not counted", async () => {
    const response = await post({
      ...validBody,
      materialCounts: [{ productId: "paper-a3", actualQuantity: 20 }],
    });

    expect(response.status).toBe(422);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("rejects users without a store scope", async () => {
    requirePermissionMock.mockResolvedValue({
      id: "inventory-1",
      username: "inventory",
      name: "Inventory Staff",
      role: "INVENTORY",
      storeId: null,
    });

    const response = await post(validBody);

    expect(response.status).toBe(403);
    expect(upsertMock).not.toHaveBeenCalled();
  });
});
