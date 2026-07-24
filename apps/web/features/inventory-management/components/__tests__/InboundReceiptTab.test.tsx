import { describe, expect, it } from "vitest";
import { getInboundReceiptRowActions } from "../InboundReceiptTab";

describe("InboundReceiptTab row actions", () => {
  it("shows process and reject actions only when granular permissions are present", () => {
    const actions = getInboundReceiptRowActions({
      status: "SUBMITTED",
      canApproveInboundReceipt: true,
      canRejectInboundReceipt: true,
    });

    expect(actions.map((action) => action.label)).toEqual(["Proses", "Tolak"]);
  });

  it("does not expose legacy creator revision actions", () => {
    expect(
      getInboundReceiptRowActions({
        status: "NEEDS_REVISION",
        canApproveInboundReceipt: false,
        canRejectInboundReceipt: false,
      }),
    ).toEqual([]);
  });
});
