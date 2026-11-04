import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  previewShoppingRequestDeletionRecord: vi.fn(),
  deleteShoppingRequestRecord: vi.fn(),
}));
vi.mock("../../repositories/shopping-request-deletion-repository", () => repository);
import * as service from "../shopping-request-deletion-service";

const actor = { id: "owner-1", name: "Owner", storeId: "store-1" };

describe("penghapusan daftar belanja", () => {
  beforeEach(() => vi.resetAllMocks());

  it("memuat pratinjau dalam lingkup toko pengguna", async () => {
    const preview = (service as any).previewShoppingRequestDeletion;
    expect(preview).toBeTypeOf("function");
    repository.previewShoppingRequestDeletionRecord.mockResolvedValue({ number: "DPB-1", movements: [] });
    await expect(preview("sr-1", actor)).resolves.toEqual({ number: "DPB-1", movements: [] });
    expect(repository.previewShoppingRequestDeletionRecord).toHaveBeenCalledWith("sr-1", actor.storeId);
  });

  it("mewajibkan alasan dan meneruskan alasan yang sudah dirapikan", async () => {
    const remove = (service as any).deleteShoppingRequest;
    expect(remove).toBeTypeOf("function");
    await expect(remove("sr-1", "  ", actor)).rejects.toThrow(/alasan/i);
    expect(repository.deleteShoppingRequestRecord).not.toHaveBeenCalled();
    repository.deleteShoppingRequestRecord.mockResolvedValue({ id: "sr-1", status: "CANCELLED" });
    await expect(remove("sr-1", "  Salah catat  ", actor)).resolves.toEqual({ id: "sr-1", status: "CANCELLED" });
    expect(repository.deleteShoppingRequestRecord).toHaveBeenCalledWith("sr-1", "Salah catat", actor);
  });

  it("menolak alasan terlalu panjang sebelum memulai transaksi", async () => {
    const remove = (service as any).deleteShoppingRequest;
    expect(remove).toBeTypeOf("function");
    await expect(remove("sr-1", "x".repeat(501), actor)).rejects.toThrow(/alasan/i);
    expect(repository.deleteShoppingRequestRecord).not.toHaveBeenCalled();
  });
});
