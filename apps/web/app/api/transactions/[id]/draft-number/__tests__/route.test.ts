import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  permission: vi.fn(), authError: vi.fn(), find: vi.fn(), siblings: vi.fn(), update: vi.fn(),
}));
vi.mock("@/lib/rbac/guard", () => ({ requirePermission: mocks.permission, handleAuthError: mocks.authError }));
vi.mock("@pos/db", () => ({ db: { transaction: { findFirst: mocks.find, findMany: mocks.siblings, updateMany: mocks.update } } }));
vi.mock("@/lib/logger", () => ({ getLogger: () => ({ error: vi.fn() }) }));

const existing = { id: "draft-1", status: "DRAFT", draftNumber: "PNW-TLD-20261018-003", invoiceDate: new Date("2026-10-17T20:30:00Z"), createdAt: new Date("2026-10-17T20:30:00Z") };
const params = { params: Promise.resolve({ id: "draft-1" }) };
const request = (draftNumber: unknown) => new Request("http://localhost/api/transactions/draft-1/draft-number", { method: "PATCH", body: JSON.stringify({ draftNumber }) });

describe("saved draft numbering", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.permission.mockResolvedValue({ storeId: "store-main", role: "CASHIER" });
    mocks.authError.mockReturnValue(null);
    mocks.find.mockResolvedValue(existing);
    mocks.siblings.mockResolvedValue([]);
    mocks.update.mockResolvedValue({ count: 1 });
  });

  it("previews the saved automatic number without allocating or updating", async () => {
    const { GET } = await import("../route");
    const response = await GET(new Request("http://localhost"), params);
    expect(await response.json()).toEqual({ draftNumber: existing.draftNumber, automaticNumber: existing.draftNumber });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.permission).toHaveBeenCalledWith("transaction.draft", "read");
    expect(mocks.find).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "draft-1", storeId: "store-main" } }));
  });

  it("previews a custom draft's next number using its WIB date without writing", async () => {
    mocks.find.mockResolvedValue({ ...existing, draftNumber: "CUSTOM/001" });
    mocks.siblings.mockResolvedValue([{ draftNumber: "PNW-TLD-20261018-014" }]);
    const { GET } = await import("../route");
    const response = await GET(new Request("http://localhost"), params);
    expect(await response.json()).toEqual({ draftNumber: "CUSTOM/001", automaticNumber: "PNW-TLD-20261018-015" });
    expect(mocks.siblings).toHaveBeenCalledWith({
      where: { storeId: "store-main", id: { not: "draft-1" }, draftNumber: { startsWith: "PNW-TLD-20261018-" } },
      select: { draftNumber: true },
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("uses createdAt in WIB for legacy drafts without an invoice date", async () => {
    mocks.find.mockResolvedValue({ ...existing, draftNumber: null, invoiceDate: null });
    const { PATCH } = await import("../route");
    const response = await PATCH(request(null), params);
    expect((await response.json()).draftNumber).toBe("PNW-TLD-20261018-001");
  });

  it("accepts exactly 100 characters", async () => {
    const { PATCH } = await import("../route");
    const response = await PATCH(request("X".repeat(100)), params);
    expect(response.status).toBe(200);
    expect((await response.json()).draftNumber).toBe("X".repeat(100));
  });

  it("does not rewrite a display number equivalent to the saved number", async () => {
    const { PATCH } = await import("../route");
    const response = await PATCH(request("003/PNW-TLD/18/X/2026"), params);
    expect(response.status).toBe(200);
    expect((await response.json()).draftNumber).toBe(existing.draftNumber);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("persists a normalized custom number with draft and store guards", async () => {
    const { PATCH } = await import("../route");
    const response = await PATCH(request("  007/PNW-TLD/18/X/2026  "), params);
    expect(response.status).toBe(200);
    expect((await response.json()).draftNumber).toBe("PNW-TLD-20261018-007");
    expect(mocks.permission).toHaveBeenCalledWith("transaction.draft", "update");
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: "draft-1", storeId: "store-main", status: "DRAFT", draftNumber: existing.draftNumber }, data: { draftNumber: "PNW-TLD-20261018-007" } });
  });

  it("returns to automatic numbering using the invoice's WIB date", async () => {
    mocks.find.mockResolvedValue({ ...existing, draftNumber: "CUSTOM/001" });
    mocks.siblings.mockResolvedValue([{ draftNumber: "PNW-TLD-20261018-009" }]);
    const { PATCH } = await import("../route");
    const response = await PATCH(request(null), params);
    expect((await response.json()).draftNumber).toBe("PNW-TLD-20261018-010");
  });

  it("preserves an existing automatic number on repeated prints", async () => {
    const { PATCH } = await import("../route");
    const response = await PATCH(request(null), params);
    expect((await response.json()).draftNumber).toBe(existing.draftNumber);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it.each(["", " ", "x".repeat(101), 42, undefined, {}, []])("rejects invalid custom input: %s", async (value) => {
    const { PATCH } = await import("../route");
    expect((await PATCH(request(value), params)).status).toBe(422);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("stops after five automatic allocation collisions and returns a retry message", async () => {
    mocks.find.mockResolvedValue({ ...existing, draftNumber: "CUSTOM/001" });
    mocks.update.mockRejectedValue({ code: "P2002" });
    const { PATCH } = await import("../route");
    const response = await PATCH(request(null), params);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ message: "Nomor otomatis sedang digunakan. Silakan coba lagi." });
    expect(mocks.update).toHaveBeenCalledTimes(5);
  });

  it("does not retry non-unique database errors or report a successful save", async () => {
    mocks.update.mockRejectedValue({ code: "P2024" });
    const { PATCH } = await import("../route");
    const response = await PATCH(request("CUSTOM/001"), params);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ message: "Nomor faktur gagal disimpan. Silakan coba lagi." });
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });

  it("rejects a duplicate custom number", async () => {
    mocks.update.mockRejectedValue({ code: "P2002" });
    const { PATCH } = await import("../route");
    const response = await PATCH(request("CUSTOM/001"), params);
    expect(response.status).toBe(409);
    expect((await response.json()).message).toContain("sudah digunakan");
  });

  it("retries an automatic number after a concurrent allocation", async () => {
    mocks.find.mockResolvedValue({ ...existing, draftNumber: "CUSTOM/001" });
    mocks.siblings.mockResolvedValueOnce([]).mockResolvedValue([{ draftNumber: "PNW-TLD-20261018-001" }]);
    mocks.update.mockRejectedValueOnce({ code: "P2002" }).mockResolvedValue({ count: 1 });
    const { PATCH } = await import("../route");
    expect((await (await PATCH(request(null), params)).json()).draftNumber).toBe("PNW-TLD-20261018-002");
  });

  it("rejects drafts approved or changed concurrently", async () => {
    mocks.update.mockResolvedValue({ count: 0 });
    const { PATCH } = await import("../route");
    expect((await PATCH(request("CUSTOM/001"), params)).status).toBe(409);
  });

  it.each(["COMPLETED", "VOIDED", "REFUNDED", "DP", "PENDING_APPROVAL"])("rejects %s transactions", async status => {
    mocks.find.mockResolvedValue({ ...existing, status });
    const { PATCH } = await import("../route");
    expect((await PATCH(request("CUSTOM/001"), params)).status).toBe(409);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it.each(["COMPLETED", "VOIDED", "REFUNDED", "DP", "PENDING_APPROVAL"])("does not preview editable numbering for %s transactions", async status => {
    mocks.find.mockResolvedValue({ ...existing, status });
    const { GET } = await import("../route");
    expect((await GET(new Request("http://localhost"), params)).status).toBe(409);
    expect(mocks.siblings).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("returns 404 for previews of missing drafts", async () => {
    mocks.find.mockResolvedValue(null);
    const { GET } = await import("../route");
    expect((await GET(new Request("http://localhost"), params)).status).toBe(404);
    expect(mocks.siblings).not.toHaveBeenCalled();
  });

  it("uses the authenticated store for both reads and writes", async () => {
    mocks.permission.mockResolvedValue({ storeId: "store-other", role: "ADMIN" });
    const { PATCH } = await import("../route");
    expect((await PATCH(request("CUSTOM/001"), params)).status).toBe(200);
    expect(mocks.find).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "draft-1", storeId: "store-other" } }));
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ storeId: "store-other", status: "DRAFT" }) }));
  });

  it("returns 404 for missing or other-store transactions", async () => {
    mocks.find.mockResolvedValue(null);
    const { PATCH } = await import("../route");
    expect((await PATCH(request("CUSTOM/001"), params)).status).toBe(404);
  });

  it.each([401, 403])("preserves authorization failure %s for reads and writes", async status => {
    mocks.permission.mockRejectedValue(new Error("denied"));
    mocks.authError.mockImplementation(() => new Response("denied", { status }));
    const { GET, PATCH } = await import("../route");
    expect((await GET(new Request("http://localhost"), params)).status).toBe(status);
    expect((await PATCH(request("CUSTOM/001"), params)).status).toBe(status);
    expect(mocks.find).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("returns a readable preview error when the database is unavailable", async () => {
    mocks.find.mockRejectedValue(new Error("database unavailable"));
    const { GET } = await import("../route");
    const response = await GET(new Request("http://localhost"), params);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ message: "Nomor faktur belum dapat dimuat." });
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
