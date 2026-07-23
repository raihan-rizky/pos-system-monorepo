import { describe, expect, it } from "vitest";

import {
  approveAllShoppingRequestItemsWithQuantities,
  approveShoppingRequestItemWithQuantity,
  parseApprovedQuantity,
  type InlineApprovalActions,
} from "../shopping-request-inline-approval";

function createActions(events: string[]): InlineApprovalActions {
  return {
    saveQuantities: async ({ input }) => {
      events.push(
        `save:${input.items
          .map((item) => `${item.id}=${item.approvedQty}`)
          .join(",")}`,
      );
    },
    approveItem: async ({ itemId }) => {
      events.push(`approve-item:${itemId}`);
    },
    approveAll: async ({ input }) => {
      events.push(
        `approve-all:${input.items
          .map((item) => item.id)
          .join(",")}`,
      );
    },
  };
}

describe("parseApprovedQuantity", () => {
  it.each(["", " ", "-1", "abc"])("menolak input %j", (raw) => {
    expect(parseApprovedQuantity(raw)).toBeNull();
  });

  it.each([
    ["0", 0],
    ["2", 2],
    ["2.5", 2.5],
  ])("menerima %s", (raw, expected) => {
    expect(parseApprovedQuantity(raw)).toBe(expected);
  });
});

describe("inline shopping request approval orchestration", () => {
  it("menyimpan quantity sebelum menyetujui satu item", async () => {
    const events: string[] = [];

    await approveShoppingRequestItemWithQuantity(
      {
        requestId: "request-1",
        item: {
          id: "item-1",
          approvedQty: 0,
        },
        canSetApprovedQty: true,
        confirmOverRequested: false,
      },
      createActions(events),
    );

    expect(events).toEqual([
      "save:item-1=0",
      "approve-item:item-1",
    ]);
  });

  it("menyimpan semua quantity dalam satu mutation sebelum approval massal", async () => {
    const events: string[] = [];

    await approveAllShoppingRequestItemsWithQuantities(
      {
        requestId: "request-1",
        items: [
          { id: "item-1", approvedQty: 2 },
          { id: "item-2", approvedQty: 0 },
        ],
        canSetApprovedQty: true,
        confirmOverRequested: true,
      },
      createActions(events),
    );

    expect(events).toEqual([
      "save:item-1=2,item-2=0",
      "approve-all:item-1,item-2",
    ]);
  });

  it("melewati save untuk approver tanpa izin mengubah quantity", async () => {
    const events: string[] = [];

    await approveShoppingRequestItemWithQuantity(
      {
        requestId: "request-1",
        item: {
          id: "item-1",
          approvedQty: 3,
        },
        canSetApprovedQty: false,
        confirmOverRequested: false,
      },
      createActions(events),
    );

    expect(events).toEqual(["approve-item:item-1"]);
  });

  it("tidak menjalankan approval ketika penyimpanan quantity gagal", async () => {
    const events: string[] = [];
    const actions = createActions(events);
    actions.saveQuantities = async () => {
      events.push("save-failed");
      throw new Error("Gagal menyimpan jumlah");
    };

    await expect(
      approveShoppingRequestItemWithQuantity(
        {
          requestId: "request-1",
          item: {
            id: "item-1",
            approvedQty: 2,
          },
          canSetApprovedQty: true,
          confirmOverRequested: false,
        },
        actions,
      ),
    ).rejects.toThrow("Gagal menyimpan jumlah");

    expect(events).toEqual(["save-failed"]);
  });
});
