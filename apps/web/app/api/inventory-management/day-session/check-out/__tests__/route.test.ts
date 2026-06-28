import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const updateMock = vi.hoisted(() => vi.fn());
const loadInventoryDaySessionMock = vi.hoisted(() => vi.fn());
const buildInventoryDayCompletionMock = vi.hoisted(() => vi.fn());
const loadStockRiskItemsMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@pos/db", () => ({
  db: {
    inventoryDaySession: {
      update: updateMock,
    },
  },
  Prisma: {},
}));

vi.mock("@/features/inventory-management/services/inventory-day-session", () => ({
  loadInventoryDaySession: loadInventoryDaySessionMock,
  buildInventoryDayCompletion: buildInventoryDayCompletionMock,
  loadStockRiskItems: loadStockRiskItemsMock,
}));

function post(body: unknown = {}) {
  return POST(
    new Request("http://localhost/api/inventory-management/day-session/check-out", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
}

const completeTasks = [
  { id: "morning-check", label: "Morning Check selesai", completed: true, required: true },
  { id: "daily-matching", label: "Matching stok harian tersubmit", completed: true, required: true },
  { id: "weekly-proof", label: "Proof kebersihan mingguan", completed: false, required: false },
];

describe("POST /api/inventory-management/day-session/check-out", () => {
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
    loadInventoryDaySessionMock.mockResolvedValue({
      id: "session-1",
      status: "CHECKED_IN",
      morningCheckSnapshot: { materialCounts: [] },
    });
    buildInventoryDayCompletionMock.mockResolvedValue({
      dateKey: "2026-06-28",
      weekKey: "2026-W26",
      isSaturday: false,
      tasks: completeTasks,
      blockers: [],
    });
    loadStockRiskItemsMock.mockResolvedValue({
      negative: [],
      outOfStock: [],
      lowStock: [{ id: "paper-a3", name: "Kertas A3", stock: 2, minStock: 5, unit: "rim" }],
    });
    updateMock.mockResolvedValue({
      id: "session-1",
      status: "CHECKED_OUT",
      checkOutByName: "Inventory Staff",
    });
  });

  it("checks out a store day session when all required daily tasks are complete", async () => {
    const response = await post({ note: "Shift aman" });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(requirePermissionMock).toHaveBeenCalledWith("inventory", "update");
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "session-1" },
      data: expect.objectContaining({
        status: "CHECKED_OUT",
        checkOutById: "inventory-1",
        checkOutByName: "Inventory Staff",
        checkOutSnapshot: expect.objectContaining({
          note: "Shift aman",
          completion: expect.objectContaining({ blockers: [] }),
          stockRisk: expect.objectContaining({
            lowStock: [expect.objectContaining({ id: "paper-a3" })],
          }),
          morningCheckSnapshot: { materialCounts: [] },
        }),
      }),
    });
    expect(body.data.status).toBe("CHECKED_OUT");
  });

  it("rejects check-out when the inventory day has not been checked in", async () => {
    loadInventoryDaySessionMock.mockResolvedValue(null);

    const response = await post();

    expect(response.status).toBe(409);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("rejects check-out while required daily task blockers remain", async () => {
    buildInventoryDayCompletionMock.mockResolvedValue({
      dateKey: "2026-06-28",
      weekKey: "2026-W26",
      isSaturday: false,
      tasks: [
        { id: "daily-matching", label: "Matching stok harian tersubmit", completed: false, required: true },
      ],
      blockers: ["Matching stok harian tersubmit"],
    });

    const response = await post();
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.blockers).toEqual(["Matching stok harian tersubmit"]);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("treats Saturday weekly proof as a required blocker when incomplete", async () => {
    buildInventoryDayCompletionMock.mockResolvedValue({
      dateKey: "2026-06-27",
      weekKey: "2026-W26",
      isSaturday: true,
      tasks: [
        { id: "weekly-proof", label: "Proof kebersihan mingguan", completed: false, required: true },
      ],
      blockers: ["Proof kebersihan mingguan"],
    });

    const response = await post();
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.completion.isSaturday).toBe(true);
    expect(body.blockers).toContain("Proof kebersihan mingguan");
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("rejects users without a store scope", async () => {
    requirePermissionMock.mockResolvedValue({
      id: "inventory-1",
      username: "inventory",
      name: "Inventory Staff",
      role: "INVENTORY",
      storeId: null,
    });

    const response = await post();

    expect(response.status).toBe(403);
    expect(updateMock).not.toHaveBeenCalled();
  });
});
