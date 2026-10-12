import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShoppingRequestListItem } from "../../types/shopping-request";

const state = vi.hoisted(() => ({ values: [] as unknown[], index: 0 }));
const listMock = vi.hoisted(() => vi.fn());

vi.mock("react", async () => ({
  ...await vi.importActual<typeof import("react")>("react"),
  useState: (initial: unknown) => {
    const index = state.index++;
    if (!(index in state.values)) state.values[index] = initial;
    return [state.values[index], (value: unknown) => { state.values[index] = value; }];
  },
}));
vi.mock("../../hooks/useShoppingRequests", () => ({
  useShoppingRequests: listMock,
  useShoppingRequestSummary: () => ({ data: undefined, isPending: false, isError: false }),
  useCancelShoppingRequest: () => ({ isPending: false, mutateAsync: vi.fn() }),
}));
vi.mock("@/components/providers/RoleProvider", () => ({ useRole: () => ({ canPerform: () => true }) }));
vi.mock("@pos/ui", () => ({ Button: () => null, Modal: () => null }));
vi.mock("../ShoppingRequestPrintModal", () => ({ ShoppingRequestPrintModal: () => null }));
vi.mock("../ShoppingRequestApproveModal", () => ({ ShoppingRequestApproveModal: () => null }));
vi.mock("../ShoppingRequestEditModal", () => ({ ShoppingRequestEditModal: () => null }));
vi.mock("../ShoppingRequestApprovedQtyModal", () => ({ ShoppingRequestApprovedQtyModal: () => null }));
vi.mock("../ShoppingRequestFinalApprovalModal", () => ({ ShoppingRequestFinalApprovalModal: () => null }));
vi.mock("@/features/suppliers/goods-purchases/components/GoodsPurchaseCreateModal", () => ({ GoodsPurchaseCreateModal: () => null }));
vi.mock("@/features/suppliers/goods-purchases/components/GoodsPurchaseApprovalModal", () => ({ GoodsPurchaseApprovalModal: () => null }));
vi.mock("@/features/suppliers/goods-purchases/components/GoodsPurchaseDetailModal", () => ({ GoodsPurchaseDetailModal: () => null }));
vi.mock("@/features/suppliers/goods-purchases/components/GoodsPurchaseRejectModal", () => ({ GoodsPurchaseRejectModal: () => null }));

import { ShoppingRequestList } from "../ShoppingRequestList";

function row(purchase: ShoppingRequestListItem["purchase"]): ShoppingRequestListItem {
  return {
    id: "request-1", number: "DPB-202610-006", name: "Belanja Kertas", status: "APPROVED",
    supplierId: "supplier-1", supplierName: "Data Print", requestedByName: "Rina", approvedByName: "Owner",
    itemCount: 1, decidedItemCount: 1, pendingItemCount: 0, totalRequestedQty: 10, totalApprovedQty: 10,
    createdAt: "2026-10-10T13:15:29Z", approvedAt: "2026-10-10T13:20:00Z", note: null, stockAppliedAt: null,
    purchase,
  };
}

function purchase(fulfillmentStatus: NonNullable<ShoppingRequestListItem["purchase"]>["fulfillmentStatus"], status: "PENDING" | "APPROVED" | "REJECTED" = "APPROVED") {
  return { id: "purchase-1", number: "PB-202610-006", totalAmount: 7600, status, fulfillmentStatus };
}

function render(onReceive = vi.fn()) {
  state.index = 0;
  return ShoppingRequestList({ onCreateClick: vi.fn(), onReceive, onCompare: vi.fn(), onViewReceiptHistory: vi.fn() });
}

function elements(node: unknown): ReactElement<any>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as ReactElement<any>;
  return [element, ...elements(element.props.children)];
}

describe("tindakan penerimaan", () => {
  beforeEach(() => { state.values = []; state.index = 0; vi.clearAllMocks(); listMock.mockReturnValue({ data: { data: [row(purchase("NOT_RECEIVED"))] }, isPending: false }); });
  it("keeps the receive action wired and gives it a descriptive icon", () => {
    const onReceive = vi.fn();
    const action = elements(render(onReceive)).find(node => node.props.children === "Catat Penerimaan")!;
    action.props.onClick();
    expect(onReceive).toHaveBeenCalledWith("purchase-1");
    expect(action.props.icon).toBeDefined();
    expect(action.props.className).toContain("emerald");
  });
  it("shows a keyboard focus treatment on secondary actions", () => {
    const actions = elements(render()).filter(node => node.type === "button" && typeof node.props.onClick === "function");
    expect(actions.length).toBeGreaterThan(0);
    for (const action of actions) expect(action.props.className).toContain("focus-visible");
  });
});
