import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
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

function render() {
  state.index = 0;
  return ShoppingRequestList({ onCreateClick: vi.fn(), onReceive: vi.fn(), onCompare: vi.fn(), onViewReceiptHistory: vi.fn() });
}

function elements(node: unknown): ReactElement<any>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as ReactElement<any>;
  return [element, ...elements(element.props.children)];
}

describe("status penerimaan di Daftar Belanja", () => {
  it.each(["GIRO", "TRANSFER"] as const)("shows the recorded %s payment badge on an approved purchase", (paymentMethod) => {
    listMock.mockReturnValue({ data: { data: [row({ ...purchase("NOT_RECEIVED"), paymentMethod })] } });
    expect(renderToStaticMarkup(render())).toContain(`aria-label="Metode pembayaran: ${paymentMethod === "GIRO" ? "Giro" : "Transfer"}"`);
  });

  it.each([null, "PENDING", "REJECTED"] as const)("does not invent a payment badge for legacy or %s purchases", (status) => {
    listMock.mockReturnValue({ data: { data: [row(status === null
      ? purchase("NOT_RECEIVED")
      : { ...purchase("NOT_RECEIVED", status), paymentMethod: "GIRO" })] } });
    expect(renderToStaticMarkup(render())).not.toContain('aria-label="Metode pembayaran:');
  });

  beforeEach(() => {
    state.values = []; state.index = 0; vi.clearAllMocks();
    listMock.mockReturnValue({ data: { data: [row(purchase("NOT_RECEIVED"))] }, isPending: false });
  });

  it("shows an unreceived badge alongside approval for an approved purchase", () => {
    const html = renderToStaticMarkup(render());
    expect(html).toContain("Disetujui");
    expect(html).toContain("BARANG BELUM DITERIMA");
  });

  it.each(["PENDING", "REJECTED", "NONE"] as const)("does not mark %s purchases as unreceived", (status) => {
    listMock.mockReturnValue({ data: { data: [row(status === "NONE" ? null : purchase("NOT_RECEIVED", status))] } });
    expect(renderToStaticMarkup(render())).not.toContain("BARANG BELUM DITERIMA");
  });

  it.each([
    ["PARTIALLY_RECEIVED", "BARANG DITERIMA SEBAGIAN"],
    ["RECEIVED", "BARANG SUDAH DITERIMA"],
  ] as const)("shows the %s badge without the unreceived badge", (status, label) => {
    listMock.mockReturnValue({ data: { data: [row(purchase(status))] } });
    const html = renderToStaticMarkup(render());
    expect(html).toContain(label);
    expect(html).not.toContain("BARANG BELUM DITERIMA");
    if (status === "RECEIVED") expect(html).toContain("bg-purple-50");
  });

  it("sends the receiving filter to the query and resets pagination while keeping search and approval filters", () => {
    let tree = render();
    const controls = elements(tree);
    const search = controls.find((node) => node.type === "input")!;
    const approval = controls.find((node) => node.type === "select")!;
    search.props.onChange({ target: { value: "Data Print" } });
    approval.props.onChange({ target: { value: "APPROVED" } });
    state.values[0] = 3;
    tree = render();
    const receiving = elements(tree).find((node) => node.type === "select" && node.props["aria-label"] === "Status penerimaan barang");
    expect(receiving).toBeDefined();
    const options = elements(receiving).filter((node) => node.type === "option");
    expect(options.map((node) => [node.props.value, node.props.children])).toEqual([
      ["", "Semua penerimaan"], ["NOT_RECEIVED", "Belum diterima"],
      ["PARTIALLY_RECEIVED", "Diterima sebagian"], ["RECEIVED", "Sudah diterima"],
    ]);
    for (const value of ["NOT_RECEIVED", "PARTIALLY_RECEIVED", "RECEIVED", ""]) {
      receiving!.props.onChange({ target: { value } });
      render();
      expect(listMock).toHaveBeenLastCalledWith(expect.objectContaining({
        page: 1, q: "Data Print", status: "APPROVED", fulfillmentStatus: value || undefined,
      }));
    }
  });
});
