import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildInventoryCheckOutSnapshot,
  buildInventoryDayCompletion,
  buildInventoryDaySessionPreview,
} from "../inventory-day-session";

const dbReadTracker = vi.hoisted(() => ({
  activeReads: 0,
  maxActiveReads: 0,
}));

const dbMock = vi.hoisted(() => ({
  inventoryDaySession: { findUnique: vi.fn() },
  inventoryTask: { findUnique: vi.fn() },
  inventoryLog: { count: vi.fn(), findMany: vi.fn() },
  inventoryTaskChecklistItem: { count: vi.fn() },
  suratJalan: { count: vi.fn() },
  product: { findMany: vi.fn() },
  inventoryInboundReceipt: { count: vi.fn() },
  inventoryProductionMaterial: { findMany: vi.fn() },
  transactionItem: { groupBy: vi.fn() },
}));

vi.mock("@pos/db", () => ({
  db: dbMock,
}));

function trackedRead<T>(value: T) {
  return async () => {
    dbReadTracker.activeReads += 1;
    dbReadTracker.maxActiveReads = Math.max(
      dbReadTracker.maxActiveReads,
      dbReadTracker.activeReads,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    dbReadTracker.activeReads -= 1;
    return value;
  };
}

describe("inventory day session service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbReadTracker.activeReads = 0;
    dbReadTracker.maxActiveReads = 0;

    dbMock.inventoryDaySession.findUnique.mockImplementation(
      trackedRead({ id: "session-1", status: "CHECKED_IN" }),
    );
    dbMock.inventoryTask.findUnique.mockImplementation(
      trackedRead({ status: "SUBMITTED" }),
    );
    dbMock.inventoryLog.count.mockImplementation(trackedRead(0));
    dbMock.inventoryLog.findMany.mockImplementation(trackedRead([]));
    dbMock.inventoryTaskChecklistItem.count.mockImplementation(trackedRead(0));
    dbMock.suratJalan.count.mockImplementation(trackedRead(0));
    dbMock.product.findMany.mockImplementation(trackedRead([]));
    dbMock.inventoryInboundReceipt.count.mockImplementation(trackedRead(0));
    dbMock.inventoryProductionMaterial.findMany.mockImplementation(trackedRead([]));
    dbMock.transactionItem.groupBy.mockImplementation(trackedRead([]));
  });

  it("limits completion database reads to the Prisma pool size", async () => {
    await buildInventoryDayCompletion(
      "store-main",
      "2026-07-03",
      new Date("2026-07-03T03:00:00.000Z"),
    );

    expect(dbReadTracker.maxActiveReads).toBeLessThanOrEqual(3);
  });

  it("evaluates all operational tasks without loading a morning check", async () => {
    dbMock.inventoryDaySession.findUnique.mockResolvedValue(null);
    dbMock.inventoryTask.findUnique.mockResolvedValue({ status: "PENDING" });
    dbMock.inventoryLog.count.mockResolvedValue(1);
    dbMock.inventoryTaskChecklistItem.count.mockResolvedValue(1);
    dbMock.suratJalan.count.mockResolvedValue(1);
    const completion = await buildInventoryDayCompletion("store-main", "2026-07-04", new Date("2026-07-04T03:00:00Z"));
    expect(completion.tasks.map((task) => task.id)).toEqual([
      "daily-matching", "out-log-verification", "damaged-reports", "manual-checklist", "surat-jalan-marking", "weekly-proof",
    ]);
    expect(completion.tasks.every((task) => task.required && !task.completed)).toBe(true);
    expect(completion.blockers).toHaveLength(6);
    expect(dbMock.inventoryDaySession.findUnique).not.toHaveBeenCalled();
  });

  it("keeps weekly proof optional outside Saturday and recognizes completed operational tasks", async () => {
    dbMock.inventoryTask.findUnique.mockImplementation(async ({ where }) => ({ status: where.storeId_type_periodKey.type === "DAILY_STOCK_MATCHING" ? "SUBMITTED" : "PENDING" }));
    const completion = await buildInventoryDayCompletion("store-main", "2026-07-03", new Date("2026-07-03T03:00:00Z"));
    expect(completion.blockers).toEqual([]);
    expect(completion.tasks.find((task) => task.id === "weekly-proof")).toMatchObject({ required: false, completed: false });
    expect(completion.tasks.filter((task) => task.required).every((task) => task.completed)).toBe(true);
  });

  it("limits checkout snapshot database reads to the Prisma pool size", async () => {
    await buildInventoryCheckOutSnapshot({
      storeId: "store-main",
      dateKey: "2026-07-03",
      now: new Date("2026-07-03T03:00:00.000Z"),
      note: null,
      exceptionNotes: {},
      completion: {
        dateKey: "2026-07-03",
        weekKey: "2026-W27",
        isSaturday: false,
        tasks: [],
        blockers: [],
      },
      morningCheckSnapshot: null,
    });

    expect(dbReadTracker.maxActiveReads).toBeLessThanOrEqual(3);
  });

  it("limits preview database reads to the Prisma pool size", async () => {
    await buildInventoryDaySessionPreview(
      "store-main",
      new Date("2026-07-03T03:00:00.000Z"),
    );

    expect(dbReadTracker.maxActiveReads).toBeLessThanOrEqual(3);
  });
});
