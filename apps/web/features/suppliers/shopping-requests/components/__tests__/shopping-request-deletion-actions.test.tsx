import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShoppingRequestListItem } from "../../types/shopping-request";

const state = vi.hoisted(() => ({ values: [] as unknown[], index: 0, permitted: true }));
const listMock = vi.hoisted(() => vi.fn());
const previewMock = vi.hoisted(() => vi.fn());
const deleteMock = vi.hoisted(() => vi.fn());
vi.mock("react", async () => ({
  ...await vi.importActual<typeof import("react")>("react"),
  useState: (initial: unknown) => {
    const index = state.index++;
    if (!(index in state.values)) state.values[index] = initial;
    return [state.values[index], (value: unknown) => { state.values[index] = value; }];
  },
  useEffect: () => {},
  useRef: () => ({ current: null }),
}));
vi.mock("../../hooks/useShoppingRequests", () => ({
  useShoppingRequests: listMock,
  useShoppingRequestSummary: () => ({ data: undefined, isPending: false, isError: false }),
  useCancelShoppingRequest: () => ({ isPending: false, mutate: vi.fn() }),
}));
vi.mock("../../hooks/useShoppingRequestDeletion", () => ({
  useShoppingRequestDeletionPreview: previewMock,
  useDeleteShoppingRequest: () => ({ mutateAsync: deleteMock, isPending: false, error: null }),
}));
vi.mock("@/components/providers/RoleProvider", () => ({
  useRole: () => ({ canPerform: (resource: string) => resource === "supplier.shopping_request.delete" ? state.permitted : true }),
}));
vi.mock("@pos/ui", () => ({ Button: () => null, Modal: () => null }));

import { ShoppingRequestList } from "../ShoppingRequestList";

function row(): ShoppingRequestListItem {
  return {
    id: "request-1", number: "DPB-1", name: "Kertas", status: "APPROVED",
    supplierId: "supplier-1", supplierName: "Toko", requestedByName: "Rina", approvedByName: "Owner",
    itemCount: 1, decidedItemCount: 1, pendingItemCount: 0, totalRequestedQty: 4, totalApprovedQty: 4,
    createdAt: "2026-11-01T00:00:00Z", approvedAt: "2026-11-01T01:00:00Z", note: null, stockAppliedAt: null,
    purchase: { id: "purchase-1", number: "PB-1", status: "APPROVED", fulfillmentStatus: "RECEIVED", totalAmount: 100 },
  };
}
function elements(node: unknown): ReactElement<any>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as ReactElement<any>;
  return [element, ...elements(element.props.children)];
}
function render() {
  state.index = 0;
  return elements(ShoppingRequestList({ onCreateClick: vi.fn(), onReceive: vi.fn(), onCompare: vi.fn(), onViewReceiptHistory: vi.fn() }));
}
function text(node: unknown): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
  if (node && typeof node === "object" && "props" in node) return text((node as ReactElement<any>).props.children);
  return "";
}

describe("tindakan hapus daftar", () => {
  beforeEach(() => {
    state.values = [];
    state.permitted = true;
    deleteMock.mockReset();
    previewMock.mockReturnValue({ isPending: false, isError: false, data: { number: "DPB-1", name: "Kertas", movements: [{ productId: "p1", productName: "Kertas", baseQuantity: 4, unit: "lembar" }] } });
    listMock.mockReturnValue({ data: { data: [row()] }, isPending: false });
  });
  it("menawarkan hapus pada daftar disetujui bagi pengguna yang memiliki izin", () => {
    const action = render().find((node) => node.type === "button" && text(node).includes("Hapus daftar"));
    expect(action).toBeDefined();
    action!.props.onClick();
    expect(state.values).toContainEqual(expect.objectContaining({ id: "request-1" }));
  });
  it("tidak menawarkan hapus tanpa izin atau pada daftar yang sudah dibatalkan", () => {
    state.permitted = false;
    expect(render().some((node) => node.type === "button" && text(node).includes("Hapus daftar"))).toBe(false);
    state.permitted = true;
    listMock.mockReturnValue({ data: { data: [{ ...row(), status: "CANCELLED" }] }, isPending: false });
    expect(render().some((node) => node.type === "button" && text(node).includes("Hapus daftar"))).toBe(false);
  });
  it("menampilkan metadata pembatalan serta riwayat penerimaan pada daftar arsip", () => {
    const history = vi.fn();
    listMock.mockReturnValue({ data: { data: [{ ...row(), status: "CANCELLED", deletion: { actorName: "Rina", reason: "Salah catat", createdAt: "2026-11-01T02:00:00Z" }, purchase: { ...row().purchase!, status: "CANCELLED" } }] }, isPending: false });
    state.index = 0;
    const nodes = elements(ShoppingRequestList({ onCreateClick: vi.fn(), onReceive: vi.fn(), onCompare: vi.fn(), onViewReceiptHistory: history }));
    expect(nodes.map(text).join(" ")).toContain("Salah catat");
    expect(nodes.map(text).join(" ")).toContain("Rina");
    const action = nodes.find((node) => node.type === "button" && text(node).includes("Riwayat penerimaan"));
    expect(action).toBeDefined();
    action!.props.onClick();
    expect(history).toHaveBeenCalledWith("purchase-1");
  });
  it("meminta alasan dan menjelaskan dampak sebelum mengirim penghapusan", async () => {
    const action = render().find((node) => node.type === "button" && text(node).includes("Hapus daftar"));
    expect(action).toBeDefined();
    action!.props.onClick();
    const modal = render().find((node) => typeof node.type === "function" && node.type.name === "ShoppingRequestDeletionDialog");
    expect(modal).toBeDefined();
    state.values = [];
    state.index = 0;
    let nodes = elements((modal!.type as any)(modal!.props));
    expect(nodes.map(text).join(" ")).toMatch(/Kertas.*4.*lembar/);
    expect(nodes.map(text).join(" ")).toMatch(/pengeluaran/i);
    expect(nodes.map(text).join(" ")).toMatch(/HPP/i);
    const reason = nodes.find((node) => node.type === "textarea");
    expect(reason?.props.required).toBe(true);
    reason!.props.onChange({ target: { value: "Salah catat" } });
    state.index = 0;
    nodes = elements((modal!.type as any)(modal!.props));
    const submit = nodes.find((node) => node.type === "form");
    expect(submit).toBeDefined();
    deleteMock.mockResolvedValue({ id: "request-1" });
    await submit!.props.onSubmit({ preventDefault() {} });
    expect(deleteMock).toHaveBeenCalledWith({ id: "request-1", reason: "Salah catat" });
  });
  it("menahan konfirmasi ketika pemeriksaan stok terbaru gagal", () => {
    const action = render().find((node) => node.type === "button" && text(node).includes("Hapus daftar"));
    action!.props.onClick();
    const modal = render().find((node) => typeof node.type === "function" && node.type.name === "ShoppingRequestDeletionDialog")!;
    previewMock.mockReturnValue({ isPending: false, isError: true, error: new Error("Stok berubah"), data: { movements: [] } });
    state.values = ["Salah catat"];
    state.index = 0;
    const nodes = elements((modal.type as any)(modal.props));
    expect(nodes.map(text).join(" ")).toContain("Stok berubah");
    expect(nodes.find((node) => node.type === "button" && node.props.type === "submit")?.props.disabled).toBe(true);
  });
});
