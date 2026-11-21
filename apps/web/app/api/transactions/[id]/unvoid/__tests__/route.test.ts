import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requirePermission: vi.fn(), handleAuthError: vi.fn(), preview: vi.fn(), restore: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/rbac/guard", () => ({ requirePermission: mocks.requirePermission, handleAuthError: mocks.handleAuthError }));
vi.mock("@pos/db", () => ({ db: { $transaction: mocks.transaction } }));
vi.mock("@/features/transactions-stock/services/transaction-unvoid-service", () => ({ previewTransactionUnvoid: mocks.preview, restoreTransactionUnvoid: mocks.restore }));
import * as route from "../route";

const handlers = route as Record<string, any>;
const params = { params: Promise.resolve({ id: "tx-1" }) };
describe("API pemulihan transaksi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePermission.mockResolvedValue({ id: "owner-1", role: "OWNER", name: "Owner", storeId: "store-1" });
    mocks.handleAuthError.mockReturnValue(null);
    mocks.transaction.mockImplementation(async (callback) => callback({}));
    mocks.preview.mockResolvedValue({ previewToken: "a".repeat(64) });
    mocks.restore.mockResolvedValue({ previousStatus: "COMPLETED" });
  });

  it.each(["ADMIN", "CASHIER", "SALES", "INVENTORY"])("menolak %s meskipun memiliki grant", async (role) => {
    mocks.requirePermission.mockResolvedValue({ id: "user-1", role, storeId: "store-1" });
    const response = await (handlers.GET?.(new Request("http://localhost"), params) ?? Promise.resolve(new Response(null, { status: 501 })));
    expect(response.status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it.each(["ADMIN", "CASHIER", "SALES", "INVENTORY"])("menolak POST %s sebelum menyentuh data", async (role) => {
    mocks.requirePermission.mockResolvedValue({ id: "user-1", role, storeId: "store-1" });
    const request = new Request("http://localhost", { method: "POST", body: JSON.stringify({ previewToken: "a".repeat(64) }) });
    const response = await handlers.POST(request, params);
    expect(response.status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("menolak token yang hilang", async () => {
    const response = await handlers.POST(new Request("http://localhost", { method: "POST", body: "{}" }), params);
    expect(response.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("mengembalikan pratinjau owner tanpa mutasi", async () => {
    const response = await (handlers.GET?.(new Request("http://localhost"), params) ?? Promise.resolve(new Response(null, { status: 501 })));
    expect(response.status).toBe(200);
    expect(mocks.preview).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ transactionId: "tx-1", storeId: "store-1" }));
    expect(mocks.restore).not.toHaveBeenCalled();
  });

  it("memulihkan hanya setelah menerima token pratinjau", async () => {
    const request = new Request("http://localhost", { method: "POST", body: JSON.stringify({ previewToken: "a".repeat(64) }) });
    const response = await (handlers.POST?.(request, params) ?? Promise.resolve(new Response(null, { status: 501 })));
    expect(response.status).toBe(200);
    expect(mocks.restore).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ previewToken: "a".repeat(64) }));
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ timeout: 30000 }));
  });
});
