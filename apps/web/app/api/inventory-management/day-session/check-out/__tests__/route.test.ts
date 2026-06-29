import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const updateMock = vi.hoisted(() => vi.fn());
const loadInventoryDaySessionMock = vi.hoisted(() => vi.fn());
const buildInventoryDayCompletionMock = vi.hoisted(() => vi.fn());
const loadStockRiskItemsMock = vi.hoisted(() => vi.fn());
const buildInventoryCheckOutSnapshotMock = vi.hoisted(() => vi.fn());

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
  buildInventoryCheckOutSnapshot: buildInventoryCheckOutSnapshotMock,
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
    buildInventoryCheckOutSnapshotMock.mockImplementation(
      async ({ note, exceptionNotes }: { note?: string | null; exceptionNotes?: Record<string, string> }) => ({
        checkedOutAt: "2026-06-28T10:00:00.000Z",
        note: note || null,
        exceptionNotes: exceptionNotes ?? {},
        completion: {
          dateKey: "2026-06-28",
          weekKey: "2026-W26",
          isSaturday: false,
          tasks: completeTasks,
          blockers: [],
        },
        stockRisk: {
          negative: [],
          outOfStock: [],
          lowStock: [{ id: "paper-a3", name: "Kertas A3", stock: 2, minStock: 5, unit: "rim" }],
        },
        movementSummary: {
          stockInQuantity: 12,
          stockOutQuantity: 4,
          internalUseQuantity: 3,
          damagedQuantity: 1,
          adjustmentQuantity: 2,
          approvedLogCount: 5,
          pendingRequestCount: 1,
        },
        workflowSummary: {
          submittedInboundReceipts: 2,
          needsRevisionReceipts: 1,
          pendingSuratJalan: 3,
          unmarkedSuratJalan: 0,
          dailyChecklistRemaining: 0,
          unverifiedOutLogs: 0,
          damagedReportsPending: 0,
        },
        morningCheckSnapshot: { materialCounts: [] },
      }),
    );
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
          movementSummary: expect.objectContaining({
            stockInQuantity: 12,
            stockOutQuantity: 4,
            internalUseQuantity: 3,
          }),
          workflowSummary: expect.objectContaining({
            submittedInboundReceipts: 2,
            pendingSuratJalan: 3,
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

  it("rejects check-out while required daily task blockers remain without guided exception notes", async () => {
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
    expect(body.missingExceptionTaskIds).toEqual(["daily-matching"]);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("allows check-out with unresolved required blockers when each blocker has a guided exception note", async () => {
    buildInventoryDayCompletionMock.mockResolvedValue({
      dateKey: "2026-06-28",
      weekKey: "2026-W26",
      isSaturday: false,
      tasks: [
        { id: "daily-matching", label: "Matching stok harian tersubmit", completed: false, required: true },
      ],
      blockers: ["Matching stok harian tersubmit"],
    });

    const response = await post({
      note: "Tutup shift dengan pengecualian",
      exceptionNotes: {
        "daily-matching": "Matching fisik dilanjutkan besok karena toko sudah tutup.",
      },
    });

    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          checkOutSnapshot: expect.objectContaining({
            exceptionNotes: {
              "daily-matching": "Matching fisik dilanjutkan besok karena toko sudah tutup.",
            },
          }),
        }),
      }),
    );
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
