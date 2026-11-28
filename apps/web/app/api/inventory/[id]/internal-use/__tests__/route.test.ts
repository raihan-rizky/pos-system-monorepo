import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";
import { StockMutationError } from "@/features/product-stock-groups/stock-mutations";

const { tx, requirePermission, applyDeltas, actor } = vi.hoisted(() => ({
  tx: {
    $queryRaw: vi.fn(),
    inventoryLog: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    batchOperationItem: { findFirst: vi.fn() },
    inventoryLogCorrectionRequest: { create: vi.fn() },
    inventoryLogCorrectionMovement: { create: vi.fn() },
    product: { findFirst: vi.fn() },
    inventoryTask: { findUnique: vi.fn() },
    inventoryDaySession: { findUnique: vi.fn() },
  },
  requirePermission: vi.fn(),
  applyDeltas: vi.fn(),
  actor: { id: "warehouse", name: "Rina", role: "INVENTORY", storeId: "store-1" },
}));

vi.mock("@pos/db", () => ({
  db: { $transaction: async (run: (db: typeof tx) => Promise<unknown>) => run(tx) },
}));

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission,
  handleAuthError: (error: unknown) =>
    error instanceof Error && error.message === "Denied"
      ? Response.json({ message: "Akses ditolak" }, { status: 403 })
      : null,
}));

vi.mock("@/features/product-stock-groups/stock-mutations", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  applyProductStockDeltas: applyDeltas,
}));

type LogCorrection = {
  id: string;
  status: "APPROVED" | "PENDING" | "REJECTED";
  correctedProductId: string;
  correctedQuantity: number;
  correctedReason: "USAGE";
  correctedNote: string;
  movements: [];
};

const source = {
  id: "stock-out",
  productId: "paper",
  type: "OUT",
  reason: "USAGE",
  quantity: 10,
  unitCost: 12000,
  note: "Kertas untuk toko",
  createdBy: "warehouse",
  status: "APPROVED",
  createdAt: new Date("2026-11-28T02:00:00.000Z"),
  correctionRequests: [] as LogCorrection[],
};

const correct = {
  action: "correct",
  expectedCorrectionId: null,
  productId: "paper",
  quantity: 7,
  note: "Hitungan awal keliru",
};

const cancel = { action: "cancel", expectedCorrectionId: null, note: "Barang tidak jadi dipakai" };

async function submit(body: object) {
  return POST(new Request("http://localhost/api/inventory/stock-out/internal-use", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }), { params: Promise.resolve({ id: "stock-out" }) });
}

describe("internal usage log actions", () => {
  let current: typeof source;

  beforeEach(() => {
    vi.resetAllMocks();
    actor.role = "INVENTORY";
    current = { ...source, correctionRequests: [] };
    tx.$queryRaw.mockResolvedValue([{ id: source.id }]);
    tx.inventoryLog.findFirst.mockImplementation(async () => current);
    tx.batchOperationItem.findFirst.mockResolvedValue(null);
    tx.inventoryTask.findUnique.mockResolvedValue(null);
    tx.inventoryDaySession.findUnique.mockResolvedValue(null);
    tx.product.findFirst.mockResolvedValue({ id: "paper", costPrice: 23000 });
    tx.inventoryLog.update.mockImplementation(async ({ data }) => ({ ...current, ...data }));
    tx.inventoryLog.create.mockResolvedValue({ id: "journal-entry" });
    applyDeltas.mockResolvedValue([]);
    tx.inventoryLogCorrectionRequest.create.mockImplementation(async ({ data }) => {
      const correction = { id: "correction-1", ...data, movements: [] };
      current.correctionRequests.unshift(correction);
      return correction;
    });
    requirePermission.mockImplementation(async (target: string) => {
      if (target === "inventory.approve" && actor.role !== "OWNER") throw new Error("Denied");
      return actor;
    });
  });

  it("lets the author revise a pending request without applying stock", async () => {
    current.status = "PENDING";
    tx.product.findFirst.mockResolvedValue({ id: "labels", costPrice: 23000 });
    const result = await submit({
      action: "editPending", productId: "labels", quantity: 4, note: "Label untuk rak",
    });

    expect(result.status).toBe(200);
    expect((await result.json()).data).toMatchObject({ id: source.id, status: "PENDING" });
    expect(tx.inventoryLog.update).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: source.id, status: "PENDING" }),
      data: expect.objectContaining({ productId: "labels", quantity: 4, note: "Label untuk rak", unitCost: 23000 }),
    }));
    expect(applyDeltas).not.toHaveBeenCalled();
  });

  it("denies editing another user's pending request", async () => {
    current.status = "PENDING";
    current.createdBy = "another-employee";

    expect((await submit({ ...correct, action: "editPending" })).status).toBe(403);
    expect(tx.inventoryLog.update).not.toHaveBeenCalled();
  });

  it("denies a pending edit when the specific permission has been disabled", async () => {
    current.status = "PENDING";
    requirePermission.mockImplementation(async (target: string) => {
      if (target === "inventory.internal_use") throw new Error("Denied");
      return actor;
    });

    expect((await submit({ ...correct, action: "editPending" })).status).toBe(403);
    expect(tx.inventoryLog.update).not.toHaveBeenCalled();
  });

  it("denies approved cancellation to the requester when they are not Owner", async () => {
    expect((await submit(cancel)).status).toBe(403);
    expect(applyDeltas).not.toHaveBeenCalled();
  });

  it("returns only the difference to stock when the Owner corrects the quantity", async () => {
    actor.role = "OWNER";
    expect((await submit(correct)).status).toBe(200);

    expect(applyDeltas).toHaveBeenCalledWith(tx, {
      storeId: "store-1", items: [{ productId: "paper", delta: 3 }], allowNegative: true,
    });
    expect(tx.inventoryLog.update).not.toHaveBeenCalled();
    expect(tx.inventoryLogCorrectionRequest.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        inventoryLogId: source.id, status: "APPROVED", correctedQuantity: 7, correctedNote: correct.note,
      }),
    }));
    expect(tx.inventoryLogCorrectionMovement.create).toHaveBeenCalledWith(expect.objectContaining({
      data: { correctionRequestId: "correction-1", inventoryLogId: "journal-entry", kind: "NET" },
    }));
  });

  it("restores the previous product and consumes the replacement in the same action", async () => {
    actor.role = "OWNER";
    tx.product.findFirst.mockResolvedValue({ id: "labels", costPrice: 23000 });

    expect((await submit({ ...correct, productId: "labels", quantity: 4 })).status).toBe(200);
    expect(applyDeltas).toHaveBeenCalledWith(tx, {
      storeId: "store-1", items: [{ productId: "paper", delta: 10 }, { productId: "labels", delta: -4 }], allowNegative: true,
    });
    expect(tx.inventoryLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ productId: "labels", quantity: -4, unitCost: 23000 }),
    }));
  });

  it("accepts a shared-stock exchange when the restored quantity covers the replacement", async () => {
    actor.role = "OWNER";
    tx.product.findFirst.mockResolvedValue({ id: "labels", costPrice: 23000 });
    applyDeltas.mockImplementation(async (_tx, { allowNegative }) => {
      if (!allowNegative) throw new StockMutationError("INSUFFICIENT_STOCK", { productId: "labels" });
      return [
        { productId: "labels", stockGroupId: "paper-group", beforeStock: 0, afterStock: -4, baseDelta: -4 },
        { productId: "paper", stockGroupId: "paper-group", beforeStock: -4, afterStock: 6, baseDelta: 10 },
      ];
    });

    expect((await submit({ ...correct, productId: "labels", quantity: 4 })).status).toBe(200);
    expect(tx.inventoryLogCorrectionMovement.create).toHaveBeenCalledTimes(2);
  });

  it("rejects an exchange when the shared balance would close below zero", async () => {
    actor.role = "OWNER";
    tx.product.findFirst.mockResolvedValue({ id: "labels", costPrice: 23000 });
    applyDeltas.mockResolvedValue([
      { productId: "labels", stockGroupId: "paper-group", beforeStock: 0, afterStock: -14, baseDelta: -14 },
      { productId: "paper", stockGroupId: "paper-group", beforeStock: -14, afterStock: -4, baseDelta: 10 },
    ]);

    expect((await submit({ ...correct, productId: "labels", quantity: 14 })).status).toBe(422);
    expect(tx.inventoryLogCorrectionMovement.create).not.toHaveBeenCalled();
  });

  it("cancels only the effective amount and prevents a second stock restoration", async () => {
    actor.role = "OWNER";
    current.correctionRequests = [{
      id: "earlier-correction", status: "APPROVED", correctedProductId: "paper",
      correctedQuantity: 7, correctedReason: "USAGE", correctedNote: "Hitung ulang", movements: [],
    }];
    const action = { ...cancel, expectedCorrectionId: "earlier-correction" };

    expect((await submit(action)).status).toBe(200);
    expect((await submit({ ...cancel, expectedCorrectionId: "correction-1" })).status).toBe(409);
    expect(applyDeltas).toHaveBeenCalledTimes(1);
    expect(applyDeltas).toHaveBeenCalledWith(tx, {
      storeId: "store-1", items: [{ productId: "paper", delta: 7 }], allowNegative: true,
    });
  });

  it("rejects stale forms after another correction", async () => {
    actor.role = "OWNER";
    current.correctionRequests = [{
      id: "different-correction", status: "APPROVED", correctedProductId: "paper",
      correctedQuantity: 7, correctedReason: "USAGE", correctedNote: "Hitung ulang", movements: [],
    }];

    expect((await submit(cancel)).status).toBe(409);
    expect(applyDeltas).not.toHaveBeenCalled();
  });

  it.each(["CHECKED_OUT", "SUBMITTED"])("blocks Owner actions when the day is %s", async (status) => {
    actor.role = "OWNER";
    const delegate = status === "SUBMITTED" ? tx.inventoryTask : tx.inventoryDaySession;
    delegate.findUnique.mockResolvedValue({ status });

    expect((await submit(cancel)).status).toBe(409);
    expect(applyDeltas).not.toHaveBeenCalled();
  });

  it("keeps the source and pending approval workflow separate", async () => {
    actor.role = "OWNER";
    current.correctionRequests = [{
      id: "awaiting-review", status: "PENDING", correctedProductId: "paper",
      correctedQuantity: 6, correctedReason: "USAGE", correctedNote: "Cek jumlah", movements: [],
    }];

    expect((await submit(cancel)).status).toBe(409);
    expect(tx.inventoryLogCorrectionRequest.create).not.toHaveBeenCalled();
  });

  it("scopes the source to the current store and individual usage log", async () => {
    actor.role = "OWNER";
    tx.inventoryLog.findFirst.mockResolvedValue(null);

    expect((await submit(cancel)).status).toBe(404);
    expect(tx.inventoryLog.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: source.id, product: { storeId: "store-1" }, type: "OUT", reason: "USAGE" }),
    }));
    expect(applyDeltas).not.toHaveBeenCalled();
  });

  it("blocks individual correction of usage logs belonging to a bundle", async () => {
    actor.role = "OWNER";
    tx.batchOperationItem.findFirst.mockResolvedValue({ id: "bundle-item" });

    expect((await submit(cancel)).status).toBe(409);
    expect(applyDeltas).not.toHaveBeenCalled();
  });
});
