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
