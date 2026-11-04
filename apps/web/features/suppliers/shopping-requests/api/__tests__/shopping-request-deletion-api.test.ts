import { afterEach, describe, expect, it, vi } from "vitest";
import * as api from "../shopping-request-deletion-api";

describe("klien penghapusan daftar belanja", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("memuat pratinjau dengan ID yang aman", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { id: "sr 1", movements: [] } }), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    const load = (api as any).getShoppingRequestDeletionPreview;
    expect(load).toBeTypeOf("function");
    await expect(load("sr 1")).resolves.toMatchObject({ id: "sr 1", movements: [] });
    expect(fetcher).toHaveBeenCalledWith("/api/suppliers/shopping-requests/sr%201/deletion");
  });
  it("mengirim alasan dan meneruskan kesalahan server", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "Stok tidak cukup" }), { status: 409 }));
    vi.stubGlobal("fetch", fetcher);
    const remove = (api as any).deleteShoppingRequest;
    expect(remove).toBeTypeOf("function");
    await expect(remove("sr-1", "Salah catat")).rejects.toThrow("Stok tidak cukup");
    expect(fetcher).toHaveBeenCalledWith("/api/suppliers/shopping-requests/sr-1/deletion", expect.objectContaining({ method: "POST", body: JSON.stringify({ reason: "Salah catat" }) }));
  });
});
