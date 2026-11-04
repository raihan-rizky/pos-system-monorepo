import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => vi.fn());
const preview = vi.hoisted(() => vi.fn());
const remove = vi.hoisted(() => vi.fn());
vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: auth,
  handleAuthError: (error: unknown) => error instanceof Error && error.message === "denied" ? Response.json({ message: "Tidak diizinkan" }, { status: 403 }) : null,
}));
vi.mock("@/features/suppliers/shopping-requests/services/shopping-request-deletion-service", () => ({
  previewShoppingRequestDeletion: preview,
  deleteShoppingRequest: remove,
  ShoppingRequestDeletionError: class extends Error { constructor(message: string, public status = 409) { super(message); } },
}));
import * as route from "../route";

const params = { params: Promise.resolve({ id: "sr-1" }) };
const user = { id: "owner-1", name: "Owner", storeId: "store-1" };

describe("API penghapusan daftar belanja", () => {
  beforeEach(() => { vi.resetAllMocks(); auth.mockResolvedValue(user); });

  it("memerlukan izin khusus untuk pratinjau dengan lingkup toko", async () => {
    const get = (route as any).GET;
    expect(get).toBeTypeOf("function");
    preview.mockResolvedValue({ id: "sr-1", movements: [] });
    const response = await get(new Request("http://localhost"), params);
    expect(response.status).toBe(200);
    expect(auth).toHaveBeenCalledWith("supplier.shopping_request.delete", "delete");
    expect(preview).toHaveBeenCalledWith("sr-1", user);
  });

  it("menjalankan penghapusan menggunakan alasan dan identitas yang sah", async () => {
    const post = (route as any).POST;
    expect(post).toBeTypeOf("function");
    remove.mockResolvedValue({ id: "sr-1", status: "CANCELLED" });
    const response = await post(new Request("http://localhost", { method: "POST", body: JSON.stringify({ reason: "Salah catat" }) }), params);
    expect(response.status).toBe(200);
    expect(auth).toHaveBeenCalledWith("supplier.shopping_request.delete", "delete");
    expect(remove).toHaveBeenCalledWith("sr-1", "Salah catat", user);
  });

  it("menolak pengguna tanpa izin sebelum mengambil data atau mengubah stok", async () => {
    const post = (route as any).POST;
    expect(post).toBeTypeOf("function");
    auth.mockRejectedValue(new Error("denied"));
    const response = await post(new Request("http://localhost", { method: "POST", body: "{}" }), params);
    expect(response.status).toBe(403);
    expect(remove).not.toHaveBeenCalled();
  });

  it("menolak isi permintaan yang tidak memuat alasan", async () => {
    const post = (route as any).POST;
    expect(post).toBeTypeOf("function");
    const response = await post(new Request("http://localhost", { method: "POST", body: "{}" }), params);
    expect(response.status).toBe(422);
    expect(remove).not.toHaveBeenCalled();
  });
});
