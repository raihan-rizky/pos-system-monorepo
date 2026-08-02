import { beforeEach, describe, expect, it, vi } from "vitest";
import { getShiftSettings, setShiftEnabled } from "../shift-settings-server";

const storeFindUniqueMock = vi.hoisted(() => vi.fn());
const storeUpsertMock = vi.hoisted(() => vi.fn());
const transactionMock = vi.hoisted(() => vi.fn());
const shiftUpdateManyMock = vi.hoisted(() => vi.fn());
const shiftFindManyMock = vi.hoisted(() => vi.fn());
const shiftUpdateMock = vi.hoisted(() => vi.fn());

vi.mock("@pos/db", () => ({
  db: {
    storeSettings: {
      findUnique: storeFindUniqueMock,
    },
    $transaction: transactionMock,
  },
}));

const transactionClient = {
  storeSettings: {
    findUnique: storeFindUniqueMock,
    upsert: storeUpsertMock,
  },
  cashierShift: {
    updateMany: shiftUpdateManyMock,
    findMany: shiftFindManyMock,
    update: shiftUpdateMock,
  },
};

describe("shift settings server service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transactionMock.mockImplementation(async (callback) => callback(transactionClient));
    storeFindUniqueMock.mockResolvedValue({ shiftEnabled: true });
    storeUpsertMock.mockResolvedValue({ shiftEnabled: true });
    shiftUpdateManyMock.mockResolvedValue({ count: 0 });
    shiftFindManyMock.mockResolvedValue([]);
    shiftUpdateMock.mockResolvedValue({});
  });

  it("defaults a missing settings row to enabled", async () => {
    storeFindUniqueMock.mockResolvedValueOnce(null);

    await expect(getShiftSettings()).resolves.toEqual({ enabled: true });
  });

  it("pauses open shifts when disabling shift mode", async () => {
    const now = new Date("2026-08-02T10:00:00.000Z");

    await expect(setShiftEnabled(false, now)).resolves.toEqual({ enabled: false });

    expect(shiftUpdateManyMock).toHaveBeenCalledWith({
      where: { status: "OPEN", pausedAt: null },
      data: { pausedAt: now },
    });
    expect(storeUpsertMock).toHaveBeenCalledWith({
      where: { id: "store-main" },
      update: { shiftEnabled: false },
      create: { id: "store-main", shiftEnabled: false },
    });
  });

  it("resumes paused shifts and accumulates their pause time", async () => {
    const now = new Date("2026-08-02T10:15:30.000Z");
    storeFindUniqueMock.mockResolvedValue({ shiftEnabled: false });
    shiftFindManyMock.mockResolvedValue([
      {
        id: "shift-1",
        pausedAt: new Date("2026-08-02T10:00:00.000Z"),
        pausedDurationSeconds: 60,
      },
    ]);

    await expect(setShiftEnabled(true, now)).resolves.toEqual({ enabled: true });

    expect(shiftUpdateMock).toHaveBeenCalledWith({
      where: { id: "shift-1" },
      data: {
        pausedAt: null,
        pausedDurationSeconds: { increment: 930 },
      },
    });
    expect(storeUpsertMock).toHaveBeenCalledWith({
      where: { id: "store-main" },
      update: { shiftEnabled: true },
      create: { id: "store-main", shiftEnabled: true },
    });
  });

  it("does not pause or resume shifts when the value is unchanged", async () => {
    storeFindUniqueMock.mockResolvedValue({ shiftEnabled: false });

    await setShiftEnabled(false, new Date("2026-08-02T10:00:00.000Z"));

    expect(shiftUpdateManyMock).not.toHaveBeenCalled();
    expect(shiftFindManyMock).not.toHaveBeenCalled();
    expect(shiftUpdateMock).not.toHaveBeenCalled();
  });

  it("propagates transaction errors so setting and pause state stay atomic", async () => {
    transactionMock.mockRejectedValueOnce(new Error("database unavailable"));

    await expect(setShiftEnabled(false)).rejects.toThrow("database unavailable");
  });
});
