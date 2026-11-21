import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE } from "../route";

const requirePermission = vi.hoisted(() => vi.fn());
const findFirst = vi.hoisted(() => vi.fn());
const update = vi.hoisted(() => vi.fn());
const removeAsset = vi.hoisted(() => vi.fn());
const transaction = vi.hoisted(() => vi.fn());
const lock = vi.hoisted(() => vi.fn());
const authorizeInTransaction = vi.hoisted(() => vi.fn());
const requestKey = "e3b8e0f4-b158-4868-9d59-0ac0f05c4cee";
vi.mock("@/lib/rbac/guard", () => ({ requirePermission, authorizeInTransaction, canAuthenticatedUserAccessPage: async () => true, handleAuthError: vi.fn((error: unknown) => error instanceof Error && error.message === "forbidden" ? new Response(null, { status: 403 }) : null) }));
vi.mock("@pos/db", () => ({ db: { expense: { findFirst, update }, $transaction: transaction } }));
vi.mock("@/features/proof-upload/server/remove-stored-proof", async original => ({ ...await original<object>(), removeStoredProofAsset: removeAsset }));

describe("DELETE expense attachment", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    requirePermission.mockResolvedValue({ id: "owner-1", storeId: "store-main" });
    findFirst.mockResolvedValue({ id: "expense-1", attachmentUrl: "https://prnt.sc/abc", deletedAt: null });
    removeAsset.mockResolvedValue({ storage: "legacy" });
    update.mockResolvedValue({ id: "expense-1", attachmentUrl: null });
    lock.mockResolvedValue([{ id: "expense-1", attachmentUrl: "https://prnt.sc/abc", updatedAt: new Date("2026-11-01T00:00:00Z") }]);
    authorizeInTransaction.mockResolvedValue(true);
    transaction.mockImplementation(async callback => callback({ $queryRaw: lock, $executeRaw: async () => 1, expense: { update } }));
  });
  it.each([false, true])("menolak perubahan dan replay jika izin dicabut saat menunggu kunci (replay: %s)", async (replay) => {
    const url = replay ? null : "https://prnt.sc/abc";
    findFirst.mockResolvedValueOnce({ id: "expense-1", attachmentUrl: url, deletedAt: null, manualPurchasePaymentMethod: "TRANSFER" });
    lock.mockResolvedValueOnce([{ id: "expense-1", attachmentUrl: url, updatedAt: new Date("2026-11-01T00:00:00Z"),
      ...(replay ? { manualTransferProofDeleteKey: requestKey, manualTransferProofDeleteExpectedVersion: new Date("2026-11-01T00:00:00Z"), manualTransferProofDeleteVersion: new Date("2026-11-01T00:00:01Z") } : {}) }]);
    authorizeInTransaction.mockResolvedValueOnce(false);
    const request = new Request("http://localhost", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedUpdatedAt: "2026-11-01T00:00:00.000Z", requestKey }) });
    expect((await DELETE(request, { params: Promise.resolve({ id: "expense-1" }) })).status).toBe(403);
    expect(update).not.toHaveBeenCalled();
  });
  it("clears the stored attachment without deleting the expense or shared object", async () => {
    findFirst.mockResolvedValueOnce({ id: "expense-1", attachmentUrl: "https://prnt.sc/abc", deletedAt: null }).mockResolvedValueOnce(null);
    const response = await DELETE(new Request("http://localhost", { method: "DELETE" }), { params: Promise.resolve({ id: "expense-1" }) });
    expect(response.status).toBe(200);
    expect(requirePermission).toHaveBeenCalledWith("proof_upload", "delete");
    expect(removeAsset).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: { attachmentUrl: null } }));
  });
  it("reports a database reference failure as 500", async () => {
    findFirst.mockResolvedValueOnce({ id: "expense-1", attachmentUrl: "https://prnt.sc/abc", deletedAt: null }).mockResolvedValueOnce(null);
    update.mockRejectedValue(new Error("database unavailable"));
    const response = await DELETE(new Request("http://localhost", { method: "DELETE" }), { params: Promise.resolve({ id: "expense-1" }) });
    expect(response.status).toBe(500);
  });
  it("does not mutate attachments on automatic goods-purchase expenses", async () => {
    findFirst.mockResolvedValueOnce({
      id: "expense-1",
      attachmentUrl: "https://prnt.sc/abc",
      deletedAt: null,
      shoppingRequestId: "request-1",
      goodsPurchaseId: "purchase-1",
    });

    const response = await DELETE(
      new Request("http://localhost", { method: "DELETE" }),
      { params: Promise.resolve({ id: "expense-1" }) },
    );

    expect(response.status).toBe(409);
    expect(removeAsset).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
  it("requires both transfer edit permissions before removing a manual transfer attachment", async () => {
    findFirst.mockResolvedValueOnce({ id: "expense-1", attachmentUrl: "https://prnt.sc/abc", deletedAt: null, manualPurchasePaymentMethod: "TRANSFER" });
    requirePermission.mockImplementation(async (target: string) => {
      if (target === "expense.manual_transfer.edit") throw new Error("forbidden");
      return { id: "owner-1", storeId: "store-main" };
    });
    const response = await DELETE(new Request("http://localhost", { method: "DELETE" }), { params: Promise.resolve({ id: "expense-1" }) });
    expect(response.status).toBe(403);
    expect(requirePermission).toHaveBeenCalledWith("expense.manual_transfer", "update");
    expect(requirePermission).toHaveBeenCalledWith("expense.manual_transfer.edit", "update");
    expect(removeAsset).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
  it("menolak penghapusan jika identitas berubah saat izin transfer diperiksa", async () => {
    findFirst.mockResolvedValueOnce({ id: "expense-1", attachmentUrl: "https://prnt.sc/abc", deletedAt: null, manualPurchasePaymentMethod: "TRANSFER" });
    requirePermission.mockImplementation(async (target: string) => ({ id: target === "expense.manual_transfer.edit" ? "other-user" : "owner-1", storeId: "store-main" }));
    const request = new Request("http://localhost", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedUpdatedAt: "2026-11-01T00:00:00.000Z", requestKey }) });
    expect((await DELETE(request, { params: Promise.resolve({ id: "expense-1" }) })).status).toBe(403);
    expect(removeAsset).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
  it("checks the transfer version under lock before removing its proof", async () => {
    findFirst.mockResolvedValueOnce({ id: "expense-1", attachmentUrl: "https://prnt.sc/abc", deletedAt: null, manualPurchasePaymentMethod: "TRANSFER" });
    const request = new Request("http://localhost", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedUpdatedAt: "2026-10-31T00:00:00.000Z", requestKey }) });
    expect((await DELETE(request, { params: Promise.resolve({ id: "expense-1" }) })).status).toBe(409);
    expect(removeAsset).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
  it("melepas bukti tanpa menghapus objek milik toko lain", async () => {
    const url = "https://pub-example.r2.dev/proofs/manual-transfers/store-other/abc.webp";
    findFirst.mockResolvedValueOnce({ id: "expense-1", attachmentUrl: url, deletedAt: null, manualPurchasePaymentMethod: "TRANSFER" });
    lock.mockResolvedValueOnce([{ id: "expense-1", attachmentUrl: url, updatedAt: new Date("2026-11-01T00:00:00Z") }]);
    const request = new Request("http://localhost", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedUpdatedAt: "2026-11-01T00:00:00.000Z", requestKey }) });
    expect((await DELETE(request, { params: Promise.resolve({ id: "expense-1" }) })).status).toBe(200);
    expect(removeAsset).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledOnce();
  });
  it("melepas bukti lama tanpa menghapus objek yang juga terhubung ke transfer", async () => {
    const url = "https://pub-example.r2.dev/proofs/expenses/store-main/legacy.webp";
    findFirst.mockResolvedValueOnce({ id: "expense-1", attachmentUrl: url, deletedAt: null, manualPurchasePaymentMethod: null });
    findFirst.mockResolvedValueOnce({ id: "transfer-1" });
    const request = new Request("http://localhost", { method: "DELETE" });
    expect((await DELETE(request, { params: Promise.resolve({ id: "expense-1" }) })).status).toBe(200);
    expect(removeAsset).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledOnce();
  });
  it("returns the new transfer version after removing its proof", async () => {
    findFirst.mockResolvedValueOnce({ id: "expense-1", attachmentUrl: "https://prnt.sc/abc", deletedAt: null, manualPurchasePaymentMethod: "TRANSFER" });
    update.mockResolvedValueOnce({ id: "expense-1", attachmentUrl: null, updatedAt: new Date("2026-11-01T00:00:01Z") });
    const request = new Request("http://localhost", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedUpdatedAt: "2026-11-01T00:00:00.000Z", requestKey }) });
    const response = await DELETE(request, { params: Promise.resolve({ id: "expense-1" }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { updatedAt: "2026-11-01T00:00:01.000Z" } });
    expect(lock).toHaveBeenCalledOnce();
  });
  it("mengembalikan versi penghapusan semula jika respons hilang meski transfer kemudian diubah", async () => {
    findFirst.mockResolvedValueOnce({ id: "expense-1", attachmentUrl: null, deletedAt: null, manualPurchasePaymentMethod: "TRANSFER" });
    lock.mockResolvedValueOnce([{ id: "expense-1", attachmentUrl: null, updatedAt: new Date("2026-11-01T00:00:05Z"),
      manualTransferProofDeleteKey: requestKey, manualTransferProofDeleteExpectedVersion: new Date("2026-11-01T00:00:00Z"),
      manualTransferProofDeleteVersion: new Date("2026-11-01T00:00:01Z") }]);
    const request = new Request("http://localhost", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedUpdatedAt: "2026-11-01T00:00:00.000Z", requestKey }) });
    const response = await DELETE(request, { params: Promise.resolve({ id: "expense-1" }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { updatedAt: "2026-11-01T00:00:01.000Z" } });
    expect(removeAsset).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});
