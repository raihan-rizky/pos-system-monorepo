import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildDefaultRolePermissions, normalizeRolePermissions } from "@/features/rbac/helpers/rbac-core";

const mocks = vi.hoisted(() => ({ currentUser: vi.fn(), permissions: vi.fn(), editor: vi.fn(), commit: vi.fn(), history: vi.fn() }));
vi.mock("@/lib/rbac/guard", () => ({ getCurrentUser: mocks.currentUser }));
vi.mock("@/features/rbac/helpers/rbac-server", () => ({ getGlobalRolePermissions: mocks.permissions }));
vi.mock("@/features/suppliers/shopping-requests/services/shopping-request-correction-service", () => ({ getShoppingRequestCorrectionEditor: mocks.editor, commitShoppingRequestCorrection: mocks.commit, listShoppingRequestCorrectionHistory: mocks.history }));
vi.mock("@/lib/logger", () => ({ getLogger: () => ({ error: vi.fn() }) }));

import { GET } from "../route";
import { POST } from "../route";

const context = { params: Promise.resolve({ id: "request-1" }) };
const request = () => new Request("http://localhost/api/suppliers/shopping-requests/request-1/correction");
const body = { idempotencyKey: "key-1", expectedVersion: "version-1", reason: "Salah catat", header: { name: "Belanja", number: "DB-1", businessDate: "2026-11-07", supplierId: null, requestedByName: null, note: null }, items: [{ clientLineKey: "line-1", requestItemId: "request-item-1", purchaseItemId: "purchase-item-1", productId: "product-1", unit: "pcs", requestedQty: 2, approvedQty: 2, orderedQty: 2, unitPrice: "1000.00", receipts: [{ receiptLineId: "receipt-1", receivedQty: 1 }] }], payment: { method: "TRANSFER", dueDate: null, allocations: [], corrections: [] }, catalog: [] };

describe("akses data koreksi daftar belanja", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.currentUser.mockResolvedValue({ id: "owner-1", name: "Pemilik", role: "OWNER", storeId: "store-1" });
    mocks.permissions.mockResolvedValue(buildDefaultRolePermissions());
    mocks.editor.mockResolvedValue({ requestId: "request-1", version: "version-1", items: [] });
    mocks.commit.mockResolvedValue({ requestId: "request-1", correctionId: "correction-1", preview: { version: "version-1", stock: [], oldTotal: "0.00", newTotal: "0.00", paid: "0.00", overpaid: "0.00", affectedDates: [], changes: [] } });
    mocks.history.mockResolvedValue([]);
  });

  it("memberikan data koreksi kepada Owner dalam toko sesi", async () => {
    const response = await GET(request(), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { requestId: "request-1", version: "version-1" } });
    expect(mocks.editor).toHaveBeenCalledWith("request-1", { id: "owner-1", name: "Pemilik", storeId: "store-1" });
  });

  it("menolak role yang hanya diberi izin edit daftar awal", async () => {
    mocks.currentUser.mockResolvedValue({ id: "admin-1", name: "Admin", role: "ADMIN", storeId: "store-1" });
    mocks.permissions.mockResolvedValue(normalizeRolePermissions([{ role: "ADMIN", scope: "resource", target: "supplier.shopping_request.edit", action: "update", allowed: true }]));
    expect((await GET(request(), context)).status).toBe(403);
    expect(mocks.editor).not.toHaveBeenCalled();
  });

  it("mengizinkan role lain yang mendapat izin koreksi dan akses supplier", async () => {
    mocks.currentUser.mockResolvedValue({ id: "admin-1", name: "Admin", role: "ADMIN", storeId: "store-1" });
    mocks.permissions.mockResolvedValue(normalizeRolePermissions([{ role: "ADMIN", scope: "resource", target: "supplier.shopping_request.correct_processed", action: "update", allowed: true }]));
    expect((await GET(request(), context)).status).toBe(200);
    expect(mocks.editor).toHaveBeenCalledWith("request-1", { id: "admin-1", name: "Admin", storeId: "store-1" });
  });

  it("menolak izin koreksi tanpa akses halaman supplier", async () => {
    mocks.currentUser.mockResolvedValue({ id: "admin-1", name: "Admin", role: "ADMIN", storeId: "store-1" });
    mocks.permissions.mockResolvedValue(normalizeRolePermissions([
      { role: "ADMIN", scope: "resource", target: "supplier.shopping_request.correct_processed", action: "update", allowed: true },
      { role: "ADMIN", scope: "page", target: "/suppliers", action: "access", allowed: false },
    ]));
    expect((await GET(request(), context)).status).toBe(403);
    expect(mocks.editor).not.toHaveBeenCalled();
  });

  it("menolak sesi tanpa toko dan gagal tertutup jika izin tidak terbaca", async () => {
    mocks.currentUser.mockResolvedValueOnce({ id: "owner-1", name: "Pemilik", role: "OWNER", storeId: null });
    expect((await GET(request(), context)).status).toBe(403);
    mocks.permissions.mockRejectedValueOnce(new Error("unavailable"));
    expect((await GET(request(), context)).status).toBe(503);
    expect(mocks.editor).not.toHaveBeenCalled();
  });

  it("menyimpan koreksi melalui izin server yang sama", async () => {
    const reviewed = { ...body, expectedPreviewVersion: "reviewed-1" };
    const response = await POST(new Request("http://localhost", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(reviewed) }), context);
    expect(response.status).toBe(200);
    expect(mocks.commit).toHaveBeenCalledWith("request-1", reviewed, { id: "owner-1", name: "Pemilik", storeId: "store-1" });
  });

  it("memerlukan versi pratinjau sebelum menyimpan koreksi", async () => {
    const response = await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify(body) }), context);
    expect(response.status).toBe(422);
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it("menolak payload koreksi tidak sah sebelum commit", async () => {
    expect((await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ ...body, reason: "" }) }), context)).status).toBe(422);
    expect(mocks.commit).not.toHaveBeenCalled();
  });
});
