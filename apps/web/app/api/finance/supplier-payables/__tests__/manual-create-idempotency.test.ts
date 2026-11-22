import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn(), transaction: vi.fn(), permission: vi.fn(), page: vi.fn(), txAuth: vi.fn() }));
vi.mock("@pos/db", () => ({ db: { $transaction: mocks.transaction } }));
vi.mock("@/lib/rbac/guard", () => ({ requirePermission: mocks.permission, canAuthenticatedUserAccessPage: mocks.page, authorizeInTransaction: mocks.txAuth, handleAuthError: () => null }));
vi.mock("@/lib/logger", () => ({ getLogger: () => ({ error: vi.fn() }) }));
import { POST } from "../route";
import { parsePayable } from "@/features/keuangan/helpers/supplier-payable-input";

const key = "b14f880a-fb50-43bc-a2aa-4733c8811dad";
const body = { supplierName: "Pemasok", amount: "1000", debtDate: "2026-11-01", dueDate: "", note: "", reportCategory: "ATK", initialPayment: "300", initialPaidAt: "2026-11-02" };
const request = (payload: unknown = body, requestKey: string | null = key) => new Request("http://localhost/api", { method: "POST",
  headers: { "Content-Type": "application/json", ...(requestKey ? { "Idempotency-Key": requestKey } : {}) }, body: JSON.stringify(payload) });
describe("idempotensi penciptaan hutang manual", () => {
  beforeEach(() => {
    vi.resetAllMocks(); mocks.permission.mockResolvedValue({ id: "user-1", storeId: "store-1", role: "OWNER" }); mocks.page.mockResolvedValue(true);
    mocks.txAuth.mockResolvedValue(true);
    mocks.transaction.mockImplementation(async callback => callback({ $queryRaw: mocks.query, $executeRaw: mocks.execute }));
    mocks.execute.mockResolvedValue(1);
  });
  it("menolak pembuatan tanpa kunci", async () => {
    expect((await POST(request(body, null))).status).toBe(422);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it("mengembalikan hutang yang sudah disimpan tanpa membuat pembayaran awal lagi", async () => {
    mocks.query.mockResolvedValueOnce([{ key, body: JSON.stringify(parsePayable(body)), completedAt: null }]).mockResolvedValueOnce([]);
    const first = await POST(request());
    expect(first.status).toBe(201);
    const insert = mocks.execute.mock.calls.find(call => call[0].join("").includes('INSERT INTO "pos_manual_payable_requests"'))!;
    const fingerprint = insert.find(value => typeof value === "string" && /^[0-9a-f]{64}$/.test(value));
    mocks.query.mockReset().mockResolvedValueOnce([{ key, body: JSON.stringify(parsePayable(body)), completedAt: new Date() }]).mockResolvedValueOnce([{ id: "debt-1", fingerprint, available: true, linked: false }]);
    mocks.execute.mockClear();
    const replay = await POST(request());
    expect(replay.status).toBe(200); expect((await replay.json()).id).toBe("debt-1");
    expect(mocks.execute.mock.calls.some(call => call[0].join("").includes('INSERT INTO "pos_supplier_payable_payments"'))).toBe(false);
  });
  it("menolak kunci yang dipakai untuk data berbeda", async () => {
    mocks.query.mockResolvedValueOnce([{ key, body: JSON.stringify(parsePayable(body)), completedAt: new Date() }]);
    mocks.query.mockResolvedValueOnce([{ id: "debt-1", fingerprint: "different" }]);
    expect((await POST(request({ ...body, initialPayment: "400" }))).status).toBe(409);
    expect(mocks.execute.mock.calls.some(call => call[0].join("").includes('INSERT INTO "pos_supplier_payables"'))).toBe(false);
  });
  it("mempertahankan izin pembayaran awal", async () => {
    mocks.permission.mockImplementation(async (_target: string, action: string) => {
      if (action === "update") throw new Error("denied");
      return { id: "user-1", storeId: "store-1", role: "OWNER" };
    });
    expect((await POST(request())).status).toBe(500);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("memeriksa ulang identitas sebelum menyimpan setelah menunggu kunci", async () => {
    mocks.txAuth.mockResolvedValue(false);
    mocks.query.mockResolvedValueOnce([{ key, body: JSON.stringify(parsePayable(body)), completedAt: null }]).mockResolvedValueOnce([]);
    expect((await POST(request())).status).toBe(403);
    expect(mocks.execute.mock.calls.some(call => call[0].join("").includes('INSERT INTO "pos_supplier_payables"'))).toBe(false);
  });
});
