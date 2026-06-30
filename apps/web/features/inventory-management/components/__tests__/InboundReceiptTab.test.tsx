import { describe, expect, it } from "vitest";
import { getInboundReceiptRowActions } from "../InboundReceiptTab";

describe("InboundReceiptTab row actions", () => {
  it("shows owner decision actions only when granular permissions are present", () => {
    const actions = getInboundReceiptRowActions({
      status: "SUBMITTED",
      isCreator: false,
      canUpdateInventory: true,
      canApproveInboundReceipt: true,
      canRejectInboundReceipt: true,
      canReviseInboundReceipt: true,
    });

    expect(actions.map((action) => action.label)).toEqual([
      "Setujui",
      "Tolak",
      "Minta Revisi",
    ]);
  });

  it("shows edit and resubmit only for creator-owned draft or revision receipts", () => {
    expect(
      getInboundReceiptRowActions({
        status: "NEEDS_REVISION",
        isCreator: true,
        canUpdateInventory: true,
        canApproveInboundReceipt: false,
        canRejectInboundReceipt: false,
        canReviseInboundReceipt: false,
      }).map((action) => action.label),
    ).toEqual(["Edit & Ajukan"]);

    expect(
      getInboundReceiptRowActions({
        status: "NEEDS_REVISION",
        isCreator: false,
        canUpdateInventory: true,
        canApproveInboundReceipt: false,
        canRejectInboundReceipt: false,
        canReviseInboundReceipt: false,
      }),
    ).toEqual([]);
  });
});
