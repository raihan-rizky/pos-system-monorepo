import { describe, expect, it, vi } from "vitest";

const updateMany = vi.hoisted(() => vi.fn().mockResolvedValue({ count: 1 }));
vi.mock("@pos/db", () => ({ db: { shoppingRequest: { updateMany } } }));

import { rejectShoppingRequest } from "../reject-shopping-request";

describe("rejectShoppingRequest", () => {
  it("only rejects an unreviewed version-two request in the actor's store", async () => {
    await rejectShoppingRequest("request-1", "Harga terlalu tinggi", { id: "user-1", name: "Admin", storeId: "store-1" });
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "request-1", storeId: "store-1", status: "REQUESTED", approvalFlowVersion: 2 },
      data: expect.objectContaining({ status: "REJECTED", rejectionReason: "Harga terlalu tinggi", rejectedById: "user-1" }),
    }));
  });

  it("reports a conflict on repeated rejection", async () => {
    updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(rejectShoppingRequest("request-1", "Alasan", { id: "user-1", name: "Admin", storeId: "store-1" }))
      .rejects.toMatchObject({ status: 409 });
  });
});
