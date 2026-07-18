import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, removeDamageProofLines } from "../route";
const requirePermission = vi.hoisted(() => vi.fn());
const findFirst = vi.hoisted(() => vi.fn());
const findMany = vi.hoisted(() => vi.fn());
const update = vi.hoisted(() => vi.fn());
const transaction = vi.hoisted(() => vi.fn(async (operations: unknown[]) => Promise.all(operations)));
const removeAsset = vi.hoisted(() => vi.fn());
vi.mock("@/lib/rbac/guard", () => ({ requirePermission, handleAuthError: vi.fn(() => null) }));
vi.mock("@pos/db", () => ({ db: { inventoryLog: { findFirst, findMany, update }, $transaction: transaction } }));
vi.mock("@/features/proof-upload/server/remove-stored-proof", () => ({ removeStoredProofAsset: removeAsset }));
describe("DELETE damaged-product proof", () => {
  beforeEach(() => {
    vi.clearAllMocks(); requirePermission.mockResolvedValue({ id: "owner-1", storeId: "store-main" });
    findFirst.mockResolvedValue({ id: "log-1", note: "Rusak\nProof URL: https://prnt.sc/abc\nResolved proof: https://image.prntscr.com/a.png" });
    findMany.mockResolvedValue([
      { id: "log-1", note: "Rusak\nProof URL: https://prnt.sc/abc\nResolved proof: https://image.prntscr.com/a.png" },
      { id: "log-2", note: "Salinan\nProof URL: https://prnt.sc/abc\nResolved proof: https://image.prntscr.com/a.png" },
    ]);
    removeAsset.mockResolvedValue({ storage: "legacy" }); update.mockImplementation((args) => Promise.resolve(args));
  });
  it("removes proof lines from every scoped log sharing the URL", async () => {
    const response = await DELETE(new Request("http://localhost", { method: "DELETE" }), { params: Promise.resolve({ id: "log-1" }) });
    expect(response.status).toBe(200); expect(removeAsset).toHaveBeenCalledWith("https://prnt.sc/abc");
    expect(update).toHaveBeenCalledTimes(2);
    expect(update.mock.calls[0][0].data.note).toBe("Rusak");
  });
  it("removes only proof metadata lines", () => {
    expect(removeDamageProofLines("Catatan\nProof URL: a\nResolved proof: b")).toBe("Catatan");
  });
});
