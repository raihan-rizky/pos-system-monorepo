import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  afterLock: false,
  inTransaction: false,
  revoked: "",
  revokedAfterLocks: "",
  identityChanged: false,
  failOnceP2002: false,
  create: vi.fn(),
  update: vi.fn(),
  deleteAttempt: vi.fn(),
  attempts: vi.fn(),
  findAttempt: vi.fn(),
  lock: vi.fn(),
  query: vi.fn(),
  findExpense: vi.fn(),
}));

const actor = { id: "user-1", storeId: "store-1", role: "ADMIN" };
vi.mock("@/lib/rbac/guard", () => ({
  requireRole: async () => actor,
  requirePermission: async () => {
    if (state.inTransaction) throw new Error("no spare connection");
    return actor;
  },
  canAuthenticatedUserAccessPage: async () => true,
  canAuthenticatedUserPerform: async () => true,
  authorizeInTransaction: async (_tx: unknown, _actor: unknown, requirements: { resources: Array<{ resource: string; action: string }>; page?: string }) => {
    if (!state.afterLock) throw new Error("authorization preceded lock");
    if (state.identityChanged) return false;
    return state.revoked !== `page:${requirements.page}` && !requirements.resources.some(({ resource, action }) => `${resource}:${action}` === state.revoked);
  },
  handleAuthError: () => null,
}));
vi.mock("@/features/keuangan/services/manual-transfer-allocation-service", () => ({
  linkTransferAllocations: async (_tx: unknown, scope: { authorizeAfterLocks: () => Promise<void>; authorizeAutomaticCorrection: () => Promise<void> }) => {
    if (state.revokedAfterLocks) state.revoked = state.revokedAfterLocks;
    await scope.authorizeAfterLocks();
    await scope.authorizeAutomaticCorrection();
  },
}));
vi.mock("@pos/db", () => ({ db: {
  expense: { findFirst: state.findExpense, create: state.create, update: state.update },
  $transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
    if (state.failOnceP2002) { state.failOnceP2002 = false; throw Object.assign(new Error("duplicate"), { code: "P2002" }); }
    state.inTransaction = true;
    try {
      return await callback({
        $executeRaw: state.lock, $queryRaw: state.query,
        expense: { findFirst: state.findExpense, create: state.create, update: state.update },
        manualTransferAttempt: { findMany: state.attempts, findUnique: state.findAttempt, create: state.create, deleteMany: state.deleteAttempt, updateMany: async () => ({ count: 1 }) },
        manualTransferAllocation: { findMany: async () => [] },
      });
    } finally { state.inTransaction = false; }
  },
} }));
vi.mock("@/lib/logger", () => ({ getLogger: () => ({ error: vi.fn() }) }));

import { GET as getAttempts, POST as registerAttempt, DELETE as deleteAttempt } from "../manual-transfer-attempts/route";
import { POST as createExpense } from "../route";
import { PATCH as updateExpense, DELETE as deleteExpense } from "../[id]/route";

const key = "2d82db0d-647a-4e65-9bd1-ec8a66bb2c02";
const transfer = { applicantName: "Pemasok", description: "Kertas", amount: 100, occurredAt: "2026-11-01", updatedAt: "2026-11-02T00:00:00.000Z", reportCategory: "ATK", manualPurchasePaymentMethod: "TRANSFER" };
const allocation = { payableId: "debt-1", paymentId: null, amount: 100 };
const request = (method: string, body?: unknown) => new Request("http://localhost/api", { method, headers: { "Content-Type": "application/json", "Idempotency-Key": key }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const context = { params: Promise.resolve({ id: "expense-1" }) };

describe("otorisasi transfer setelah menunggu penguncian", () => {
  beforeEach(() => {
    vi.resetAllMocks(); state.afterLock = false; state.inTransaction = false; state.revoked = ""; state.revokedAfterLocks = ""; state.identityChanged = false; state.failOnceP2002 = false;
    state.lock.mockImplementation(async () => { state.afterLock = true; return 1; });
    state.query.mockImplementation(async (parts: TemplateStringsArray) => {
      state.afterLock = true;
      return parts.join("").includes("pos_manual_transfer_attempts")
        ? [{ id: key, body: JSON.stringify({ ...transfer, allocations: [allocation] }) }]
        : [{ id: "expense-1", updatedAt: new Date(transfer.updatedAt), attachmentUrl: null }];
    });
    state.attempts.mockResolvedValue([]);
    state.findAttempt.mockResolvedValue(null);
    state.deleteAttempt.mockResolvedValue({ count: 1 });
    const row = { ...transfer, id: "expense-1", deletedAt: null, shoppingRequestId: null, goodsPurchaseId: null, backdatedPurchaseDueId: null, backdatedPurchasePaymentId: null, customCategoryId: null, attachmentUrl: null, changeAmount: 0, createdAt: new Date() };
    state.findExpense.mockResolvedValue(row);
    state.create.mockResolvedValue(row); state.update.mockResolvedValue(row);
  });

  it.each(["GET", "POST", "DELETE"])("menolak %s saat izin membuat transfer dicabut sebelum lock diperoleh", async method => {
    state.revoked = "expense.manual_transfer:create";
    if (method === "DELETE") state.findAttempt.mockResolvedValue({ id: key, storeId: actor.storeId, userId: actor.id, completedAt: null });
    const response = method === "GET" ? await getAttempts() : method === "POST"
      ? await registerAttempt(request("POST", { key, body: JSON.stringify(transfer), forceNew: false }))
      : await deleteAttempt(request("DELETE", { key, expectedCompleted: false }));
    expect(response.status).toBe(403);
    expect(state.create).not.toHaveBeenCalled(); expect(state.deleteAttempt).not.toHaveBeenCalled();
  });

  it.each(["GET", "POST", "DELETE"])("menolak %s jika identitas atau akses halaman berubah sebelum lock diperoleh", async method => {
    state.identityChanged = true;
    if (method === "DELETE") state.findAttempt.mockResolvedValue({ id: key, storeId: actor.storeId, userId: actor.id, completedAt: null });
    const invoke = () => method === "GET" ? getAttempts() : method === "POST"
      ? registerAttempt(request("POST", { key, body: JSON.stringify(transfer), forceNew: false }))
      : deleteAttempt(request("DELETE", { key, expectedCompleted: false }));
    expect((await invoke()).status).toBe(403);
    state.identityChanged = false; state.revoked = "page:/keuangan";
    expect((await invoke()).status).toBe(403);
    expect(state.create).not.toHaveBeenCalled(); expect(state.deleteAttempt).not.toHaveBeenCalled();
  });

  it("menolak pendaftaran alokasi saat izin hutang dicabut sebelum lock diperoleh", async () => {
    state.revoked = "expense.payable:update";
    const response = await registerAttempt(request("POST", { key, body: JSON.stringify({ ...transfer, allocations: [allocation] }), forceNew: false }));
    expect(response.status).toBe(403);
    expect(state.create).not.toHaveBeenCalled();
  });

  it.each([
    ["POST", "expense.manual_transfer:create"], ["POST", "expense:read"],
    ["POST", "expense.payable:read"], ["POST", "expense.payable:update"], ["POST", "expense.manual_transfer.allocation:update"],
    ["PATCH", "expense.manual_transfer:update"], ["PATCH", "expense.manual_transfer.edit:update"],
    ["PATCH", "expense:read"], ["PATCH", "expense.payable:read"], ["PATCH", "expense.payable:update"], ["PATCH", "expense.manual_transfer.allocation:update"],
  ])("menolak %s ketika grant %s dicabut sebelum lock diperoleh", async (method, revoked) => {
    state.revoked = revoked;
    state.findExpense.mockResolvedValueOnce(method === "POST" ? null : await state.findExpense());
    const response = method === "POST" ? await createExpense(request("POST", { ...transfer, allocations: [allocation] })) : await updateExpense(request("PATCH", { ...transfer, allocations: [allocation] }), context);
    expect(response.status).toBe(403);
    expect(state.create).not.toHaveBeenCalled(); expect(state.update).not.toHaveBeenCalled();
  });

  it.each(["POST", "PATCH"])("menolak %s saat izin dicabut ketika menunggu lock hutang", async method => {
    state.revokedAfterLocks = "expense.payable:read";
    state.findExpense.mockResolvedValueOnce(method === "POST" ? null : await state.findExpense());
    const response = method === "POST" ? await createExpense(request("POST", { ...transfer, allocations: [allocation] })) : await updateExpense(request("PATCH", { ...transfer, allocations: [allocation] }), context);
    expect(response.status).toBe(403);
  });

  it.each(["POST", "PATCH"])("menolak %s tanpa izin koreksi pelunasan otomatis", async method => {
    state.revoked = "expense.payable.manual.payment:update";
    state.findExpense.mockResolvedValueOnce(method === "POST" ? null : await state.findExpense());
    const response = method === "POST" ? await createExpense(request("POST", { ...transfer, allocations: [allocation] })) : await updateExpense(request("PATCH", { ...transfer, allocations: [allocation] }), context);
    expect(response.status).toBe(403);
  });

  it("menolak penggantian bukti jika izin menghapus bukti dicabut sebelum lock", async () => {
    state.revoked = "proof_upload:delete";
    state.findExpense.mockResolvedValueOnce({ ...(await state.findExpense()), attachmentUrl: "https://pub-example.r2.dev/proofs/manual-transfers/store-1/old.webp" });
    const response = await updateExpense(request("PATCH", { ...transfer, attachmentUrl: null }), context);
    expect(response.status).toBe(403);
    expect(state.update).not.toHaveBeenCalled();
  });

  it.each(["POST", "PATCH"])("menolak %s ketika akses halaman dicabut sebelum lock diperoleh", async method => {
    state.revoked = "page:/keuangan";
    state.findExpense.mockResolvedValueOnce(method === "POST" ? null : await state.findExpense());
    const response = method === "POST" ? await createExpense(request("POST", { ...transfer, allocations: [allocation] })) : await updateExpense(request("PATCH", { ...transfer, allocations: [allocation] }), context);
    expect(response.status).toBe(403);
    expect(state.create).not.toHaveBeenCalled(); expect(state.update).not.toHaveBeenCalled();
  });

  it.each(["POST", "PATCH"])("menolak %s ketika identitas berubah sebelum lock diperoleh", async method => {
    state.identityChanged = true;
    state.findExpense.mockResolvedValueOnce(method === "POST" ? null : await state.findExpense());
    const response = method === "POST" ? await createExpense(request("POST", { ...transfer, allocations: [allocation] })) : await updateExpense(request("PATCH", { ...transfer, allocations: [allocation] }), context);
    expect(response.status).toBe(403);
    expect(state.create).not.toHaveBeenCalled(); expect(state.update).not.toHaveBeenCalled();
  });

  it.each(["expense.manual_transfer:delete", "page:/keuangan", "identity"])("menolak penghapusan transfer jika %s berubah setelah lock", async revoked => {
    state.revoked = revoked === "identity" ? "" : revoked;
    state.identityChanged = revoked === "identity";
    const response = await deleteExpense(request("DELETE"), context);
    expect(response.status).toBe(403);
    expect(state.update).not.toHaveBeenCalled();
  });

  it("memeriksa izin ulang saat permintaan transfer bertabrakan lalu dipulihkan", async () => {
    state.failOnceP2002 = true;
    state.revoked = "expense.manual_transfer:create";
    const response = await createExpense(request("POST", transfer));
    expect(response.status).toBe(403);
  });

  it("memeriksa izin ulang untuk replay transfer yang telah dihapus", async () => {
    state.findExpense.mockResolvedValueOnce({ ...(await state.findExpense()), deletedAt: new Date("2026-11-03T00:00:00Z") });
    state.query.mockImplementationOnce(async () => { state.afterLock = true; return [{ id: "expense-1", deletedAt: new Date("2026-11-03T00:00:00Z") }]; });
    state.revoked = "expense.manual_transfer:delete";
    const response = await deleteExpense(request("DELETE"), context);
    expect(response.status).toBe(403);
    expect(state.update).not.toHaveBeenCalled();
  });

  it.each(["POST", "PATCH"])("menyimpan %s dengan satu koneksi saat alokasi perlu mengoreksi pelunasan", async method => {
    state.findExpense.mockResolvedValueOnce(method === "POST" ? null : await state.findExpense());
    const response = method === "POST" ? await createExpense(request("POST", { ...transfer, allocations: [allocation] })) : await updateExpense(request("PATCH", { ...transfer, allocations: [allocation] }), context);
    expect(response.status).toBe(method === "POST" ? 201 : 200);
  });
});
