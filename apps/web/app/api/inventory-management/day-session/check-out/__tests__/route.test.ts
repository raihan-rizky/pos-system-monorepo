import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const upsertMock = vi.hoisted(() => vi.fn());
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
      upsert: upsertMock,
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
    upsertMock.mockResolvedValue({
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
    expect(upsertMock).toHaveBeenCalledWith({
      where: { storeId_periodKey: { storeId: "store-main", periodKey: expect.any(String) } },
      create: expect.objectContaining({ storeId: "store-main", periodKey: expect.any(String), status: "CHECKED_OUT" }),
      update: expect.objectContaining({
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

  it.each([null, { id: "session-1", status: "NOT_CHECKED_IN" }])("checks out without prior check-in (%s)", async (session) => {
    loadInventoryDaySessionMock.mockResolvedValue(session);
    const response = await post();
    expect(response.status).toBe(200);
    expect(buildInventoryCheckOutSnapshotMock).toHaveBeenCalledWith(expect.objectContaining({ morningCheckSnapshot: null }));
    const write = upsertMock.mock.calls[0][0];
    expect(write.create).toMatchObject({ storeId: "store-main", status: "CHECKED_OUT" });
    for (const data of [write.create, write.update]) {
      expect(data).not.toHaveProperty("checkedInAt");
      expect(data).not.toHaveProperty("checkInById");
      expect(data).not.toHaveProperty("morningCheckSnapshot");
    }
  });

  it("allows repeated closure of an existing checked-out session", async () => {
    loadInventoryDaySessionMock.mockResolvedValue({ id: "session-1", status: "CHECKED_OUT", morningCheckSnapshot: null });
    expect((await post()).status).toBe(200);
    expect(upsertMock).toHaveBeenCalledTimes(1);
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
    expect(upsertMock).not.toHaveBeenCalled();
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
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          checkOutSnapshot: expect.objectContaining({
            exceptionNotes: {
              "daily-matching": "Matching fisik dilanjutkan besok karena toko sudah tutup.",
            },
          }),
        }),
      }),
    );
  });

  it("allows check-out with a short non-empty guided exception note", async () => {
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
        "daily-matching": "Besok",
      },
    });

    expect(response.status).toBe(200);
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          checkOutSnapshot: expect.objectContaining({
            exceptionNotes: {
              "daily-matching": "Besok",
            },
          }),
        }),
      }),
    );
  });

  it.each([null, { id: "session-1", status: "NOT_CHECKED_IN" }, { id: "session-1", status: "CHECKED_IN" }])("returns task-specific blockers for blank exception notes (%s)", async (session) => {
    loadInventoryDaySessionMock.mockResolvedValue(session);
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
      exceptionNotes: {
        "daily-matching": "",
      },
    });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.blockers).toEqual(["Matching stok harian tersubmit"]);
    expect(body.missingExceptionTaskIds).toEqual(["daily-matching"]);
    expect(upsertMock).not.toHaveBeenCalled();
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

    const response = await post();

    expect(response.status).toBe(403);
    expect(upsertMock).not.toHaveBeenCalled();
  });
});
