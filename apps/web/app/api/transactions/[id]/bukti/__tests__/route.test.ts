import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE } from "../route";

const requirePermission = vi.hoisted(() => vi.fn());
const findFirst = vi.hoisted(() => vi.fn());
const update = vi.hoisted(() => vi.fn());
const removeAsset = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({ requirePermission, handleAuthError: vi.fn(() => null) }));
vi.mock("@pos/db", () => ({ db: { transaction: { findFirst, update } } }));
vi.mock("@/features/proof-upload/server/remove-stored-proof", () => ({ removeStoredProofAsset: removeAsset }));

describe("DELETE transaction proof", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePermission.mockResolvedValue({ id: "owner-1", storeId: "store-main" });
    findFirst.mockResolvedValue({ id: "tx-1", buktiTransaksiUrls: ["https://prnt.sc/abc", "https://prnt.sc/keep"] });
    removeAsset.mockResolvedValue({ storage: "legacy" });
    update.mockResolvedValue({ id: "tx-1" });
  });

  it("removes the asset first and then clears only its reference", async () => {
    const response = await DELETE(
      new Request("http://localhost", { method: "DELETE", body: JSON.stringify({ url: "https://prnt.sc/abc" }) }),
      { params: Promise.resolve({ id: "tx-1" }) },
    );
    expect(response.status).toBe(200);
    expect(requirePermission).toHaveBeenCalledWith("proof_upload", "delete");
    expect(removeAsset).toHaveBeenCalledWith("https://prnt.sc/abc");
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: { buktiTransaksiUrls: ["https://prnt.sc/keep"] } }));
    expect(removeAsset.mock.invocationCallOrder[0]).toBeLessThan(update.mock.invocationCallOrder[0]);
  });
});
