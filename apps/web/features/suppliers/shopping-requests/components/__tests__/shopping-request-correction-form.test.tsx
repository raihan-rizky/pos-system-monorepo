import type { ReactElement } from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ values: [] as any[], index: 0 }));
const preview = vi.hoisted(() => vi.fn()); const save = vi.hoisted(() => vi.fn());
vi.mock("react", async () => ({ ...await vi.importActual<typeof import("react")>("react"), useState: (initial: any) => {
  const i = state.index++; if (!(i in state.values)) state.values[i] = typeof initial === "function" ? initial() : initial;
  return [state.values[i], (value: any) => { state.values[i] = typeof value === "function" ? value(state.values[i]) : value; }];
} }));
vi.mock("../../hooks/useShoppingRequestCorrection", () => ({ usePreviewCorrection: () => ({ mutateAsync: preview, isPending: false }), useSaveCorrection: () => ({ mutateAsync: save, isPending: false }) }));
vi.mock("@pos/ui", () => ({ Button: () => null, Modal: () => null }));
vi.mock("@/features/suppliers/components/SupplierSelector", () => ({ SupplierSelector: () => null }));
vi.mock("../ProductAutocomplete", () => ({ ProductAutocomplete: () => null }));
import { CorrectionImpact, ShoppingRequestCorrectionForm } from "../ShoppingRequestCorrectionModal";
import { InboundPaymentFields } from "@/features/inventory-management/components/InboundPaymentFields";
const editor = { requestId: "r1", purchaseId: "p1", version: "v1", header: { name: "Kertas", number: "DB-1", businessDate: "2026-11-01", supplierId: null, requestedByName: "Rina", note: null }, items: [{ clientLineKey: "line1", requestItemId: "ri1", purchaseItemId: "pi1", productId: "pr1", productName: "Kertas A4", sku: "A4", unit: "rim", requestedQty: 10, approvedQty: 10, orderedQty: 10, unitPrice: "100.00", receipts: [{ receiptLineId: "receipt1", receivedQty: 7 }], catalogCostPrice: "100.00", catalogSalePrice: "120.00", catalogUpdatedAt: "2026-11-01T00:00:00Z" }], payment: { method: "TRANSFER" as const, dueDate: null, sources: [{ paymentId: "pay1", sourceKind: "TRANSFER_EXPENSE" as const, amount: "700.00", paidAt: "2026-11-01" }], allocations: [{ paymentId: "pay1", sourceKind: "TRANSFER_EXPENSE" as const, amount: "700.00", method: "TRANSFER" as const }] }, pendingReceipts: [] };
function nodes(node: unknown): ReactElement<any>[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const n = node as ReactElement<any>; return [n, ...nodes(n.props.children)];
}
function text(n: any): string { return typeof n === "string" ? n : Array.isArray(n) ? n.map(text).join("") : n?.props ? text(n.props.children) : ""; }
function render(data = editor) { state.index = 0; return nodes(ShoppingRequestCorrectionForm({ editor: data, onClose: vi.fn() })); }
function input(label: string) { return render().find(n => n.props["aria-label"] === label)!; }
async function submit() { await render().find(n => n.type === "form")!.props.onSubmit({ preventDefault() {} }); }
beforeEach(() => { state.values = []; preview.mockReset(); save.mockReset(); preview.mockResolvedValue({ version: "v1", oldTotal: "700.00", newTotal: "500.00", paid: "700.00", overpaid: "200.00", stock: [{ productId: "pr1", baseDelta: -2, unit: "rim" }], affectedDates: ["2026-11-01"], changes: [{ field: "receivedQty", before: 7, after: 5 }] }); });
it("mengedit nominal, tanggal, dan catatan beberapa jadwal pembayaran", async () => {
  const schedule = [{ method: "TRANSFER" as const, amount: "200.00", dueDate: null, note: "DP" }, { method: "GIRO" as const, amount: "500.00", dueDate: "2026-12-01", note: "Sisa" }];
  const data = { ...editor, payment: { ...editor.payment, schedule } };
  const fields = render(data).find(n => n.type === InboundPaymentFields);
  expect(fields).toBeDefined();
  fields!.props.onChange([{ method: "TRANSFER", amount: 200, dueDate: null, note: "DP" }, { method: "GIRO", amount: 500, dueDate: "2026-12-20", note: "Koreksi" }]);
  input("Alasan perubahan").props.onChange({ target: { value: "Jatuh tempo berubah" } });
  await submit();
  expect(preview.mock.calls[0][0].payment.schedule[1]).toEqual({ method: "GIRO", amount: "500.00", dueDate: "2026-12-20", note: "Koreksi" });
});
it("memisahkan kebutuhan, pesanan dan penerimaan serta mempertahankan pembayaran saat preview", async () => {
  input("Diterima Kertas A4 penerimaan 1").props.onChange({ target: { value: "5" } });
  input("Alasan perubahan").props.onChange({ target: { value: "Salah jumlah" } });
  await submit();
  expect(preview).toHaveBeenCalledWith(expect.objectContaining({ expectedVersion: "v1", reason: "Salah jumlah", items: [expect.objectContaining({ requestedQty: 10, orderedQty: 10, receipts: [{ receiptLineId: "receipt1", receivedQty: 5 }] })], payment: expect.objectContaining({ corrections: [], allocations: editor.payment.allocations }), catalog: [] }));
  const result = render();
  state.index = 0;
  const markup = renderToStaticMarkup(createElement(ShoppingRequestCorrectionForm, { editor, onClose: vi.fn() }));
  expect(markup.match(/Kelebihan pembayaran/g)).toHaveLength(1);
  expect(markup).toContain("2026-11-01");
  expect(save).not.toHaveBeenCalled();
  await result.find(n => n.type === "button" && text(n) === "Simpan perubahan")!.props.onClick();
  expect(save).toHaveBeenCalledWith({ ...preview.mock.calls[0][0], expectedPreviewVersion: "v1" });
});
it("menanyakan HPP dan harga jual secara terpisah setelah harga beli berubah", async () => {
  input("Harga beli Kertas A4").props.onChange({ target: { value: "90" } });
  input("Alasan perubahan").props.onChange({ target: { value: "Harga benar" } });
  await submit();
  expect(preview).not.toHaveBeenCalled();
  expect(render().some(n => n.type === "input" && n.props.type === "checkbox" && n.props["aria-label"] === "Ubah HPP Kertas A4")).toBe(true);
  input("Ubah HPP Kertas A4").props.onChange({ target: { checked: true } });
  await render().find(n => n.type === "button" && text(n) === "Lanjutkan tinjau dampak")!.props.onClick();
  expect(preview).toHaveBeenCalledWith(expect.objectContaining({ catalog: [{ productId: "pr1", costPrice: "90", salePrice: null, expectedUpdatedAt: editor.items[0].catalogUpdatedAt }] }));
});
it("menghapus barang diterima dan tetap mengirim koreksi penerimaan melalui backend", async () => {
  render().find(n => n.type === "button" && text(n) === "Hapus barang")!.props.onClick();
  expect(render().map(text).join(" ")).not.toContain("Harga beli Kertas A4");
  expect(render().map(text).join(" ")).toContain("Tambah barang");
});
it("menggunakan satuan produk katalog saat mengganti barang", () => {
  expect(input("Satuan Kertas A4").props.readOnly).toBe(true);
  expect(render().map(text).join(" ")).toContain("Untuk mengganti produk atau satuan");
});
it("menahan penyimpanan ketika preview gagal dan mempertahankan alasan", async () => {
  preview.mockRejectedValueOnce(new Error("Stok tidak cukup. Muat ulang."));
  input("Alasan perubahan").props.onChange({ target: { value: "Salah jumlah" } }); await submit();
  expect(render().map(text).join(" ")).toContain("Stok tidak cukup");
  expect(input("Alasan perubahan").props.value).toBe("Salah jumlah");
  expect(render().some(n => n.type === "button" && text(n) === "Simpan perubahan")).toBe(false);
});

it("menamai barang dan kolom harga pada pratinjau dan riwayat", () => {
  const previewData = { version: "v1", oldTotal: "1000.00", newTotal: "700.00", paid: "1000.00", overpaid: "300.00", stock: [], affectedDates: [], changes: [
    { field: "barang.Kertas A4.unitPrice", before: "100.00", after: "70.00" },
    { field: "katalog.Kertas A4.HPP", before: "100.00", after: "70.00" },
    { field: "daftar.businessDate", before: "2026-11-01", after: "2026-11-02" },
  ] };
  const markup = renderToStaticMarkup(createElement(CorrectionImpact, { preview: previewData }));
  expect(markup).toContain("Kertas A4 · Harga beli");
  expect(markup).toContain("Kertas A4 · HPP");
  expect(markup).toContain("Tanggal usaha");
  expect(markup).toContain("100.00");
  expect(markup).toContain("70.00");
});
