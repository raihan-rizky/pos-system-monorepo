import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST, DELETE } from "../manual-transfer-attempts/route";

const mocks = vi.hoisted(() => ({ permission: vi.fn(), page: vi.fn(), can: vi.fn(), lock: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), deleteMany: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/rbac/guard", () => ({ requirePermission: mocks.permission, canAuthenticatedUserAccessPage: mocks.page, canAuthenticatedUserPerform: mocks.can, authorizeInTransaction: async () => true,
  handleAuthError: (error: unknown) => error instanceof Error && error.message === "forbidden" ? new Response(null, { status: 403 }) : null }));
vi.mock("@pos/db", () => ({ db: { manualTransferAttempt: { findMany: mocks.findMany }, $transaction: mocks.transaction } }));
vi.mock("@/lib/logger", () => ({ getLogger: () => ({ error: vi.fn() }) }));

const key = "2d82db0d-647a-4e65-9bd1-ec8a66bb2c02";
const payload = JSON.stringify({ applicantName: "Pemasok", description: "Belanja", amount: 100, occurredAt: "2026-11-01", reportCategory: "ATK", manualPurchasePaymentMethod: "TRANSFER", allocations: [] });
const request = (method: string, value?: unknown) => new Request("http://localhost/api/finance/expenses/manual-transfer-attempts", { method, headers: { "Content-Type": "application/json" }, ...(value === undefined ? {} : { body: JSON.stringify(value) }) });

describe("pemulihan transfer manual per pengguna dan toko", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.permission.mockResolvedValue({ id: "owner-1", storeId: "store-1", role: "OWNER" });
    mocks.page.mockResolvedValue(true); mocks.can.mockResolvedValue(true);
    mocks.lock.mockResolvedValue([]); mocks.findMany.mockResolvedValue([]); mocks.findUnique.mockResolvedValue(null);
    mocks.create.mockImplementation(async ({ data }) => ({ ...data, createdAt: new Date("2026-11-01T00:00:00Z"), completedAt: null }));
    mocks.deleteMany.mockResolvedValue({ count: 1 });
    mocks.transaction.mockImplementation(async callback => callback({ $executeRaw: mocks.lock, manualTransferAttempt: { findMany: mocks.findMany, findUnique: mocks.findUnique, create: mocks.create, deleteMany: mocks.deleteMany } }));
  });
  it("menyimpan percobaan di server dengan kunci milik pengguna dan toko", async () => {
    const response = await POST(request("POST", { key, body: payload, forceNew: false }));
    expect(response.status).toBe(201);
    expect(mocks.lock).toHaveBeenCalled();
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ id: key, storeId: "store-1", userId: "owner-1", body: payload }) }));
  });
  it("menolak percobaan dengan bukti transfer toko lain", async () => {
    const body = JSON.stringify({ ...JSON.parse(payload), attachmentUrl: "https://pub-example.r2.dev/proofs/manual-transfers/store-2/a.webp" });
    expect((await POST(request("POST", { key, body, forceNew: false }))).status).toBe(422);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("meminta pilihan bila percobaan sebelumnya belum diselesaikan", async () => {
    mocks.findMany.mockResolvedValueOnce([{ id: "previous", storeId: "store-1", userId: "owner-1", body: payload, createdAt: new Date(), completedAt: null }]);
    expect((await POST(request("POST", { key, body: payload, forceNew: false }))).status).toBe(409);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("mengizinkan transfer yang benar-benar baru setelah pengguna memilihnya", async () => {
    mocks.findMany.mockResolvedValueOnce([{ id: "previous", completedAt: null }]);
    expect((await POST(request("POST", { key, body: payload, forceNew: true, acknowledgedAttempts: [{ key: "previous", completedAt: null }] }))).status).toBe(201);
    expect(mocks.create).toHaveBeenCalledOnce();
  });
  it("meminta pemeriksaan ulang jika status percobaan berubah setelah layar dibuka", async () => {
    mocks.findMany.mockResolvedValueOnce([{ id: "previous", body: payload, createdAt: new Date(), completedAt: new Date("2026-11-01T00:00:00Z") }]);
    const response = await POST(request("POST", { key, body: payload, forceNew: true, acknowledgedAttempts: [{ key: "previous", completedAt: null }] }));
    expect(response.status).toBe(409);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("tidak membuat percobaan ke-101 yang tidak dapat ditampilkan untuk pemulihan", async () => {
    const pending = Array.from({ length: 100 }, (_, index) => ({ id: `previous-${index}`, body: payload, createdAt: new Date(), completedAt: null }));
    mocks.findMany.mockResolvedValueOnce(pending);
    const response = await POST(request("POST", { key, body: payload, forceNew: true, acknowledgedAttempts: pending.map(row => ({ key: row.id, completedAt: null })) }));
    expect(response.status).toBe(409);
    expect((await response.json()).attempts).toHaveLength(100);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("hanya membaca percobaan pengguna dan toko saat ini", async () => {
    const response = await GET(request("GET"));
    expect(response.status).toBe(200);
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { storeId: "store-1", userId: "owner-1" } }));
  });
  it("menunggu penyimpanan yang sedang berlangsung sebelum mengembalikan status", async () => {
    await GET(request("GET"));
    expect(mocks.lock).toHaveBeenCalledOnce();
    expect(mocks.transaction).toHaveBeenCalledOnce();
  });
  it("menyembunyikan data alokasi jika izin hutang dicabut", async () => {
    mocks.can.mockResolvedValue(false);
    mocks.findMany.mockResolvedValueOnce([{ id: key, storeId: "store-1", userId: "owner-1", body: JSON.stringify({ ...JSON.parse(payload), allocations: [{ payableId: "private", paymentId: "p1", amount: 100 }] }), createdAt: new Date(), completedAt: null }]);
    const result = await (await GET(request("GET"))).json();
    expect(JSON.stringify(result)).not.toContain("private");
    expect(result.attempts[0].body).toBeNull();
  });
  it("menolak persiapan jika identitas berubah ketika izin alokasi diperiksa", async () => {
    mocks.permission.mockImplementation(async (target: string) => ({ id: target === 'expense.payable' ? 'other-user' : 'owner-1', storeId: 'store-1', role: 'OWNER' }));
    const body = JSON.stringify({ ...JSON.parse(payload), allocations: [{ payableId: 'd1', paymentId: 'p1', amount: 100 }] });
    expect((await POST(request('POST', { key, body, forceNew: false }))).status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("menghapus percobaan hanya dalam scope pengguna dan toko", async () => {
    mocks.findUnique.mockResolvedValueOnce({ id: key, storeId: "store-1", userId: "owner-1", body: payload, createdAt: new Date(), completedAt: null });
    expect((await DELETE(request("DELETE", { key, expectedCompleted: false }))).status).toBe(200);
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { id: key, storeId: "store-1", userId: "owner-1" } });
  });
  it("meminta pemeriksaan ulang bila hasil transfer berubah sebelum percobaan dilupakan", async () => {
    mocks.findUnique.mockResolvedValueOnce({ id: key, storeId: "store-1", userId: "owner-1", body: payload, createdAt: new Date(), completedAt: new Date("2026-11-01T00:00:00Z") });
    const response = await DELETE(request("DELETE", { key, expectedCompleted: false }));
    expect(response.status).toBe(409);
    expect((await response.json()).attempt.completedAt).toBe("2026-11-01T00:00:00.000Z");
    expect(mocks.deleteMany).not.toHaveBeenCalled();
  });
});
