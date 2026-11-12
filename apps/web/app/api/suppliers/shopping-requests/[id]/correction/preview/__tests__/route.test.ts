import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildDefaultRolePermissions } from "@/features/rbac/helpers/rbac-core";

const mocks = vi.hoisted(() => ({ currentUser: vi.fn(), permissions: vi.fn(), preview: vi.fn() }));
vi.mock(import("@/lib/rbac/guard"), async importOriginal => ({
  ...await importOriginal(),
  getCurrentUser: mocks.currentUser,
}));
vi.mock("@/features/rbac/helpers/rbac-server", () => ({ getGlobalRolePermissions: mocks.permissions }));
vi.mock("@/features/suppliers/shopping-requests/services/shopping-request-correction-service", () => ({ previewShoppingRequestCorrection: mocks.preview }));
vi.mock("@/lib/logger", () => ({ getLogger: () => ({ error: vi.fn() }) }));

import { POST } from "../route";

const context = { params: Promise.resolve({ id: "request-1" }) };
const body = {
  idempotencyKey: "key-1", expectedVersion: "version-1", reason: "Salah catat",
  header: { name: "Belanja", number: "DB-1", businessDate: "2026-11-07", supplierId: null, requestedByName: null, note: null },
  items: [{ clientLineKey: "line-1", requestItemId: null, purchaseItemId: null, productId: "product-1", unit: "pcs", requestedQty: 2, approvedQty: 2, orderedQty: 2, unitPrice: "1000.00", receipts: [{ receiptLineId: null, receivedQty: 1 }] }],
  payment: { method: null, dueDate: null, allocations: [], corrections: [] }, catalog: [],
};
const request = (value: unknown) => new Request("http://localhost/api/suppliers/shopping-requests/request-1/correction/preview", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value),
});

describe("pratinjau koreksi daftar belanja", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.currentUser.mockResolvedValue({ id: "owner-1", name: "Pemilik", role: "OWNER", storeId: "store-1" });
    mocks.permissions.mockResolvedValue(buildDefaultRolePermissions());
    mocks.preview.mockResolvedValue({ oldTotal: "2000.00", newTotal: "1000.00", overpaid: "0.00" });
  });

  it("mengembalikan dampak pratinjau untuk pengguna yang diizinkan", async () => {
    const response = await POST(request(body), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { oldTotal: "2000.00", newTotal: "1000.00" } });
    expect(mocks.preview).toHaveBeenCalledWith("request-1", body, { id: "owner-1", name: "Pemilik", storeId: "store-1" });
  });

  it("menolak role tanpa izin sebelum memuat data koreksi", async () => {
    mocks.currentUser.mockResolvedValue({ id: "admin-1", name: "Admin", role: "ADMIN", storeId: "store-1" });
    expect((await POST(request(body), context)).status).toBe(403);
    expect(mocks.preview).not.toHaveBeenCalled();
  });

  it("menolak input yang tidak sah tanpa menghitung dampak", async () => {
    expect((await POST(request({ ...body, reason: "" }), context)).status).toBe(422);
    expect(mocks.preview).not.toHaveBeenCalled();
  });
});
