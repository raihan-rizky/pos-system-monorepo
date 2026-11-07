import { describe, expect, it } from "vitest";
import { getInboundReceiptRowActions } from "../InboundReceiptTab";

it("opens editing for a role with edit permission only", () => {
  expect(getInboundReceiptRowActions({ status: "SUBMITTED", canApproveInboundReceipt: false, canRejectInboundReceipt: false, canEditInboundReceipt: true }))
    .toEqual([{ key: "process", label: "Ubah Penerimaan" }]);
});

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
