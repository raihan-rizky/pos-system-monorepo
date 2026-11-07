import type { ReactElement } from "react";
import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ values: [] as unknown[], index: 0, correct: true, draft: false, row: {} as any }));
vi.mock("react", async () => ({ ...await vi.importActual<typeof import("react")>("react"), useState: (initial: unknown) => {
  const i = state.index++; if (!(i in state.values)) state.values[i] = initial;
  return [state.values[i], (value: unknown) => { state.values[i] = value; }];
} }));
vi.mock("../../hooks/useShoppingRequests", () => ({
  useShoppingRequests: () => ({ data: { data: [state.row] }, isPending: false }),
  useShoppingRequestSummary: () => ({}), useCancelShoppingRequest: () => ({}),
}));
vi.mock("@/components/providers/RoleProvider", () => ({ useRole: () => ({ canPerform: (resource: string) => resource === "supplier.shopping_request.correct_processed" ? state.correct : resource === "supplier.shopping_request.edit" ? state.draft : false }) }));
vi.mock("@pos/ui", () => ({ Button: () => null, Modal: () => null }));
import { ShoppingRequestList } from "../ShoppingRequestList";
function nodes(node: unknown): ReactElement<any>[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as ReactElement<any>; return [element, ...nodes(element.props.children)];
}
function text(node: any): string { return typeof node === "string" ? node : Array.isArray(node) ? node.map(text).join("") : node?.props ? text(node.props.children) : ""; }
function render(initialCorrectionHistoryId?: string) { state.index = 0; return nodes(ShoppingRequestList({ onCreateClick: vi.fn(), onReceive: vi.fn(), onCompare: vi.fn(), onViewReceiptHistory: vi.fn(), initialCorrectionHistoryId })); }
beforeEach(() => {
  state.values = []; state.correct = true; state.draft = false;
  state.row = { id: "r1", name: "Kertas", number: "DB-1", status: "APPROVED", decidedItemCount: 1, itemCount: 1, totalRequestedQty: 10, totalApprovedQty: 10, createdAt: "2026-11-01", purchase: { id: "p1", number: "PB-1", status: "APPROVED", fulfillmentStatus: "RECEIVED", totalAmount: 100 }, correctionCount: 2, correctionStockChanged: true };
});
it("membuka koreksi setelah seluruh barang diterima dengan izin khusus", () => {
  const action = render().find(n => n.type === "button" && text(n) === "Edit daftar");
  expect(action).toBeDefined(); action!.props.onClick();
  expect(render().some(n => typeof n.type === "function" && n.type.name === "ShoppingRequestCorrectionModal")).toBe(true);
});
it("izin draft tidak memberikan akses koreksi dan arsip tetap terkunci", () => {
  state.correct = false; state.draft = true;
  expect(render().some(n => n.type === "button" && text(n) === "Edit daftar")).toBe(false);
  state.correct = true; state.row.status = "CANCELLED";
  expect(render().some(n => n.type === "button" && text(n) === "Edit daftar")).toBe(false);
});
it("badge perubahan dan stok membuka riwayat yang dapat diakses pembaca", () => {
  state.correct = false;
  const actions = render().filter(n => n.type === "button");
  expect(actions.some(n => text(n) === "Diubah")).toBe(true);
  const stock = actions.find(n => text(n) === "Stok berubah"); expect(stock).toBeDefined();
  stock!.props.onClick();
  expect(render().some(n => typeof n.type === "function" && n.type.name === "ShoppingRequestCorrectionHistoryModal")).toBe(true);
});
it("membuka riwayat dari notifikasi dan tetap tertutup setelah ditutup", () => {
  const modal = render("r-notification").find(n => typeof n.type === "function" && n.type.name === "ShoppingRequestCorrectionHistoryModal");
  expect(modal?.props.requestId).toBe("r-notification");
  modal!.props.onClose();
  expect(render("r-notification").some(n => typeof n.type === "function" && n.type.name === "ShoppingRequestCorrectionHistoryModal")).toBe(false);
});
