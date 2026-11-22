import { describe, expect, it, vi } from "vitest";
import { createReceivable, createReceivableSchema } from "../manual-receivables";

const input = {
  customerId: "customer-1", amount: 125000, debtDate: "2026-09-01", dueDate: "2026-10-01",
  clientMutationId: "9e70ff2c-9401-4edb-91a6-d0637ed226ad", reportCategory: "PLAT" as const,
};
const actor = { id: "user-1", storeId: "store-1" };

describe("manual receivable report category", () => {
  it.each(["CETAK", "PLAT", "STEMPEL", "SPANDUK", "ATK", "PRINT"] as const)("retains category %s", (reportCategory) => {
    expect(createReceivableSchema.parse({ ...input, reportCategory }).reportCategory).toBe(reportCategory);
  });

  it.each([undefined, null, "OTHER", "UNMAPPED", "atk"])("rejects a new receivable without a valid report category: %s", (reportCategory) => {
    expect(createReceivableSchema.safeParse({ ...input, reportCategory }).success).toBe(false);
  });

  it("persists the chosen category and rejects a retry with a different category", async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      customer: { findFirst: vi.fn().mockResolvedValue({ id: input.customerId }), update: vi.fn().mockResolvedValue({}) },
      customerReceivable: {
        findUnique: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({
          ...input, reportCategory: "ATK", storeId: actor.storeId, note: null,
          debtDate: new Date("2026-09-01T00:00:00Z"), dueDate: new Date("2026-10-01T00:00:00Z"),
        }),
        create: vi.fn().mockImplementation(({ data }) => ({ id: "receivable-1", ...data })),
      },
    };

    await createReceivable(tx as never, createReceivableSchema.parse(input), actor);
    expect(tx.customerReceivable.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ reportCategory: "PLAT" }) }));
    await expect(createReceivable(tx as never, createReceivableSchema.parse(input), actor)).rejects.toMatchObject({ status: 409 });
    expect(tx.customerReceivable.create).toHaveBeenCalledTimes(1);
  });
});
