import type { ReactElement } from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ values: [] as any[], index: 0 }));
const preview = vi.hoisted(() => vi.fn()); const save = vi.hoisted(() => vi.fn());
vi.mock("react", async () => ({ ...await vi.importActual<typeof import("react")>("react"), useEffect: () => {}, useRef: () => ({ current: null }), useState: (initial: any) => {
  const i = state.index++; if (!(i in state.values)) state.values[i] = typeof initial === "function" ? initial() : initial;
  return [state.values[i], (value: any) => { state.values[i] = typeof value === "function" ? value(state.values[i]) : value; }];
} }));
vi.mock("../../hooks/useShoppingRequestCorrection", () => ({ usePreviewCorrection: () => ({ mutateAsync: preview, isPending: false }), useSaveCorrection: () => ({ mutateAsync: save, isPending: false }) }));
vi.mock("@pos/ui", () => ({ Button: () => null, Modal: () => null }));
vi.mock("@/features/suppliers/components/SupplierSelector", () => ({ SupplierSelector: () => null }));
vi.mock("../ProductAutocomplete", () => ({ ProductAutocomplete: () => null }));
import { CorrectionImpact, ShoppingRequestCorrectionForm } from "../ShoppingRequestCorrectionModal";
import { InboundPaymentFields } from "@/features/inventory-management/components/InboundPaymentFields";
const editor = { requestId: "r1", purchaseId: "p1", totalAmount: "700.00", version: "v1", header: { name: "Kertas", number: "DB-1", businessDate: "2026-11-01", supplierId: null, requestedByName: "Rina", note: null }, items: [{ clientLineKey: "line1", requestItemId: "ri1", purchaseItemId: "pi1", productId: "pr1", productName: "Kertas A4", sku: "A4", unit: "rim", requestedQty: 10, approvedQty: 10, orderedQty: 10, unitPrice: "100.00", receipts: [{ receiptLineId: "receipt1", receivedQty: 7 }], catalogCostPrice: "100.00", catalogSalePrice: "120.00", catalogUpdatedAt: "2026-11-01T00:00:00Z" }], payment: { method: "TRANSFER" as const, dueDate: null, sources: [{ paymentId: "pay1", sourceKind: "TRANSFER_EXPENSE" as const, amount: "700.00", paidAt: "2026-11-01" }], allocations: [{ paymentId: "pay1", sourceKind: "TRANSFER_EXPENSE" as const, amount: "700.00", method: "TRANSFER" as const }] }, pendingReceipts: [] };
function nodes(node: unknown): ReactElement<any>[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const n = node as ReactElement<any>; return [n, ...nodes(n.props.children)];
}
function text(n: any): string { return typeof n === "string" ? n : Array.isArray(n) ? n.map(text).join("") : n?.props ? text(n.props.children) : ""; }
function render(data = editor, initialSection: "details" | "payment" = "details", onReload?: () => Promise<typeof editor>) { state.index = 0; return nodes(ShoppingRequestCorrectionForm({ editor: data, onClose: vi.fn(), initialSection, onReload })); }
function input(label: string) { return render().find(n => n.props["aria-label"] === label)!; }
async function submit() { await render().find(n => n.type === "form")!.props.onSubmit({ preventDefault() {} }); }
beforeEach(() => { state.values = []; preview.mockReset(); save.mockReset(); preview.mockResolvedValue({ version: "v1", oldTotal: "700.00", newTotal: "500.00", paid: "700.00", overpaid: "200.00", stock: [{ productId: "pr1", baseDelta: -2, unit: "rim" }], affectedDates: ["2026-11-01"], changes: [{ field: "receivedQty", before: 7, after: 5 }] }); });
it("pintasan pembayaran menampilkan ringkasan tanpa mencampurkan formulir barang", () => {
  const data = { ...editor, payment: { ...editor.payment, schedule: [{ method: "TRANSFER" as const, amount: "700.00", dueDate: null, note: null }] } };
  const tree = render(data, "payment");
  expect(tree.some(n => n.props["aria-label"] === "Nama daftar")).toBe(false);
  expect(tree.map(text).join(" ")).toContain("Ringkasan perubahan");
  expect(tree.some(n => n.type === InboundPaymentFields)).toBe(true);
});
it("memperingatkan nilai pengeluaran historis yang tidak sama dengan total pembelian", () => {
  const data = { ...editor, expenseMismatch: true };
  expect(render(data, "payment").map(text).join(" ")).toMatch(/pengeluaran.*tidak sesuai.*laporan/i);
});
it("memuat data terbaru saat konflik tanpa membuang jadwal dan alasan yang sedang diedit", async () => {
  const data = { ...editor, payment: { ...editor.payment, schedule: [{ method: "TRANSFER" as const, amount: "700.00", dueDate: null, note: null }] } };
  const latest = { ...data, version: "v2", payment: { ...data.payment, sources: [{ ...data.payment.sources[0], amount: "800.00" }], allocations: [{ ...data.payment.allocations[0], amount: "800.00" }] } };
  const reload = vi.fn().mockResolvedValue(latest);
  preview.mockRejectedValueOnce(Object.assign(new Error("Data berubah. Muat ulang."), { status: 409 }));
  let tree = render(data, "payment", reload);
  tree.find(n => n.type === InboundPaymentFields)!.props.onChange([{ method: "TRANSFER", amount: 200, dueDate: null, note: null }, { method: "GIRO", amount: 500, dueDate: "2026-12-05", note: null }]);
  tree = render(data, "payment", reload);
  tree.find(n => n.props["aria-label"] === "Alasan perubahan")!.props.onChange({ target: { value: "Kesepakatan baru" } });
  tree = render(data, "payment", reload);
  await tree.find(n => n.type === "form")!.props.onSubmit({ preventDefault() {} });
  tree = render(data, "payment", reload);
  await tree.find(n => n.type === "button" && text(n) === "Muat data terbaru")!.props.onClick();
  tree = render(data, "payment", reload);
  expect(tree.find(n => n.type === InboundPaymentFields)!.props.payments).toMatchObject([{ amount: 200 }, { amount: 500, dueDate: "2026-12-05" }]);
  expect(tree.find(n => n.props["aria-label"] === "Alasan perubahan")!.props.value).toBe("Kesepakatan baru");
  expect(tree.find(n => n.props["aria-label"] === "Alokasi TRANSFER pembayaran 1")!.props.value).toBe("800.00");
  await tree.find(n => n.type === "form")!.props.onSubmit({ preventDefault() {} });
  expect(preview).toHaveBeenLastCalledWith(expect.objectContaining({ expectedVersion: "v2" }));
});
it("memuat jadwal terbaru saat pengguna belum mengubah jadwal yang lama", async () => {
  const data = { ...editor, payment: { ...editor.payment, schedule: [{ method: "TRANSFER" as const, amount: "700.00", dueDate: null, note: null }] } };
  const latest = { ...data, version: "v2", payment: { ...data.payment, method: "GIRO" as const, dueDate: "2026-12-05", schedule: [{ method: "GIRO" as const, amount: "700.00", dueDate: "2026-12-05", note: null }] } };
  const reload = vi.fn().mockResolvedValue(latest);
  preview.mockRejectedValueOnce(Object.assign(new Error("Data berubah. Muat ulang."), { status: 409 }));
  let tree = render(data, "payment", reload);
  tree.find(n => n.props["aria-label"] === "Alasan perubahan")!.props.onChange({ target: { value: "Periksa pembayaran" } });
  tree = render(data, "payment", reload);
  await tree.find(n => n.type === "form")!.props.onSubmit({ preventDefault() {} });
  tree = render(data, "payment", reload);
  await tree.find(n => n.type === "button" && text(n) === "Muat data terbaru")!.props.onClick();
  tree = render(data, "payment", reload);
  expect(tree.find(n => n.type === InboundPaymentFields)!.props.payments).toMatchObject([{ method: "GIRO", amount: 700, dueDate: "2026-12-05" }]);
  expect(tree.some(n => n.type === "button" && text(n) === "Gunakan kembali jadwal saya")).toBe(false);
});
it("menampilkan jadwal terbaru dan meminta pilihan sebelum menerapkan jadwal yang diedit bersamaan", async () => {
  const data = { ...editor, payment: { ...editor.payment, schedule: [{ method: "TRANSFER" as const, amount: "700.00", dueDate: null, note: null }] } };
  const latest = { ...data, version: "v2", payment: { ...data.payment, method: "GIRO" as const, dueDate: "2026-12-10", schedule: [{ method: "GIRO" as const, amount: "700.00", dueDate: "2026-12-10", note: null }] } };
  const reload = vi.fn().mockResolvedValue(latest);
  preview.mockRejectedValueOnce(Object.assign(new Error("Data berubah. Muat ulang."), { status: 409 }));
  let tree = render(data, "payment", reload);
  tree.find(n => n.type === InboundPaymentFields)!.props.onChange([{ method: "TRANSFER", amount: 200, dueDate: null, note: null }, { method: "GIRO", amount: 500, dueDate: "2026-12-05", note: null }]);
  tree = render(data, "payment", reload);
  tree.find(n => n.props["aria-label"] === "Alasan perubahan")!.props.onChange({ target: { value: "Kesepakatan baru" } });
  tree = render(data, "payment", reload);
  await tree.find(n => n.type === "form")!.props.onSubmit({ preventDefault() {} });
  tree = render(data, "payment", reload);
  await tree.find(n => n.type === "button" && text(n) === "Muat data terbaru")!.props.onClick();
  tree = render(data, "payment", reload);
  expect(tree.find(n => n.type === InboundPaymentFields)!.props.payments).toMatchObject([{ method: "GIRO", amount: 700, dueDate: "2026-12-10" }]);
  expect(tree.map(text).join(" ")).toContain("5 Desember 2026");
  tree.find(n => n.type === "button" && text(n) === "Gunakan kembali jadwal saya")!.props.onClick();
  tree = render(data, "payment", reload);
  expect(tree.find(n => n.type === InboundPaymentFields)!.props.payments).toMatchObject([{ method: "TRANSFER", amount: 200 }, { method: "GIRO", amount: 500, dueDate: "2026-12-05" }]);
});
it("meminta pilihan eksplisit sebelum menerapkan kembali koreksi pembayaran aktual setelah konflik", async () => {
  const data = { ...editor, payment: { ...editor.payment, schedule: [{ method: "TRANSFER" as const, amount: "700.00", dueDate: null, note: null }] } };
  const latest = { ...data, version: "v2", payment: { ...data.payment, sources: [{ ...data.payment.sources[0], amount: "800.00" }], allocations: [{ ...data.payment.allocations[0], amount: "800.00" }] } };
  const reload = vi.fn().mockResolvedValue(latest);
  preview.mockRejectedValueOnce(Object.assign(new Error("Data berubah. Muat ulang."), { status: 409 }));
  let tree = render(data, "payment", reload);
  const checkbox = nodes(tree.find(n => n.type === "label" && text(n).includes("Koreksi nominal atau tanggal"))).find(n => n.type === "input")!;
  checkbox.props.onChange({ target: { checked: true } });
  tree = render(data, "payment", reload);
  nodes(tree.find(n => n.type === "label" && text(n) === "Nominal")).find(n => n.type === "input")!.props.onChange({ target: { value: "600" } });
  tree = render(data, "payment", reload);
  tree.find(n => n.props["aria-label"] === "Alokasi TRANSFER pembayaran 1")!.props.onChange({ target: { value: "600" } });
  tree.find(n => n.props["aria-label"] === "Alasan perubahan")!.props.onChange({ target: { value: "Koreksi nominal" } });
  tree = render(data, "payment", reload);
  await tree.find(n => n.type === "form")!.props.onSubmit({ preventDefault() {} });
  tree = render(data, "payment", reload);
  await tree.find(n => n.type === "button" && text(n) === "Muat data terbaru")!.props.onClick();
  tree = render(data, "payment", reload);
  expect(tree.find(n => n.props["aria-label"] === "Alokasi TRANSFER pembayaran 1")!.props.value).toBe("800.00");
  expect(tree.map(text).join(" ")).toContain("600");
  tree.find(n => n.type === "button" && text(n) === "Gunakan kembali koreksi saya")!.props.onClick();
  tree = render(data, "payment", reload);
  expect(tree.find(n => n.props["aria-label"] === "Alokasi TRANSFER pembayaran 1")!.props.value).toBe("600");
  await tree.find(n => n.type === "form")!.props.onSubmit({ preventDefault() {} });
  expect(preview).toHaveBeenLastCalledWith(expect.objectContaining({ expectedVersion: "v2", payment: expect.objectContaining({ corrections: [expect.objectContaining({ amount: "600" })] }) }));
});
it("memakai total pembelian tersimpan saat hanya jadwal diubah pada penerimaan sebagian", async () => {
  const data = {
    ...editor, totalAmount: "8936156.00",
    items: [{ ...editor.items[0], orderedQty: 20, unitPrice: "446807.80", receipts: [{ receiptLineId: "receipt1", receivedQty: 10 }] }],
    payment: { ...editor.payment, sources: [], allocations: [], schedule: [
      { method: "TRANSFER" as const, amount: "4947500.00", dueDate: null, note: null },
      { method: "GIRO" as const, amount: "3988656.00", dueDate: "2026-12-05", note: null },
    ] },
    pendingReceipts: [{ id: "pending", status: "SUBMITTED", itemIds: ["pi1"] }],
  };
  let tree = render(data as unknown as typeof editor);
  expect(tree.find(n => n.type === InboundPaymentFields)!.props.totalAmount).toBe(8936156);
  expect(tree.map(text).join(" ")).toMatch(/penerimaan.*menunggu.*tetap dapat mengubah pembayaran/i);
  tree.find(n => n.props["aria-label"] === "Alasan perubahan")!.props.onChange({ target: { value: "Menyesuaikan pembayaran" } });
  tree = render(data as unknown as typeof editor);
  await tree.find(n => n.type === "form")!.props.onSubmit({ preventDefault() {} });
  expect(preview).toHaveBeenCalledWith(expect.objectContaining({ payment: expect.objectContaining({ schedule: expect.arrayContaining([
    expect.objectContaining({ method: "TRANSFER", amount: "4947500.00" }),
    expect.objectContaining({ method: "GIRO", amount: "3988656.00", dueDate: "2026-12-05" }),
  ]) }) }));
});
it("mengedit nominal, tanggal, dan catatan beberapa jadwal pembayaran", async () => {
  const schedule = [{ method: "TRANSFER" as const, amount: "200.00", dueDate: null, note: "DP" }, { method: "GIRO" as const, amount: "500.00", dueDate: "2026-12-01", note: "Sisa" }];
  const data = { ...editor, payment: { ...editor.payment, schedule } };
  const fields = render(data).find(n => n.type === InboundPaymentFields);
  expect(fields).toBeDefined();
  expect(render(data).map(text).join(" ")).toMatch(/alokasi pembayaran tercatat berbeda dari jadwal/i);
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
  expect(markup).toContain("1 November 2026");
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

it("menampilkan jadwal campuran dan alokasi dengan kolom yang terbaca", () => {
  const markup = renderToStaticMarkup(createElement(CorrectionImpact, { preview: {
    version: "v2", oldTotal: "8936156.00", newTotal: "8816156.00", paid: "0.00", overpaid: "0.00", stock: [], affectedDates: ["2026-11-12", "2026-11-17"],
    changes: [
      { field: "pembayaran.metode", before: "TRANSFER", after: null },
      { field: "pembayaran.jadwal", before: [{ method: "TRANSFER", amount: "8936156.00", dueDate: null, note: null }], after: [
        { method: "TRANSFER", amount: "4947500.00", dueDate: null, note: null },
        { method: "GIRO", amount: "3868656.00", dueDate: "2026-12-05", note: "Sisa belanja" },
      ] },
      { field: "pembayaran.alokasi", before: [{ sourceKind: "TRANSFER_EXPENSE", paymentId: "internal-id", method: "TRANSFER", amount: "8936156.00" }], after: [] },
    ],
  } })).replaceAll("\u00a0", " ");
  expect(markup).toContain("Transfer + Giro");
  expect(markup).toContain("Nominal");
  expect(markup).toContain("4.947.500");
  expect(markup).toContain("3.868.656");
  expect(markup).toContain("5 Desember 2026");
  expect(markup).toContain("Sisa belanja");
  expect(markup).toContain("Pembayaran Transfer");
  expect(markup).not.toContain("Rincian perubahan:");
  expect(markup).not.toContain("TRANSFER_EXPENSE");
  expect(markup).not.toContain("internal-id");
});

it("tidak menebak metode campuran untuk riwayat lama yang tidak memiliki jadwal", () => {
  const markup = renderToStaticMarkup(createElement(CorrectionImpact, { preview: {
    version: "old", oldTotal: "100.00", newTotal: "100.00", paid: "0.00", overpaid: "0.00", stock: [], affectedDates: [],
    changes: [{ field: "pembayaran.metode", before: "TRANSFER", after: null }],
  } }));
  expect(markup).toContain("Belum ditentukan");
  expect(markup).not.toContain("Transfer + Giro");
});

it("menjelaskan jadwal kosong dan pembayaran nol secara terpisah", () => {
  const markup = renderToStaticMarkup(createElement(CorrectionImpact, { preview: {
    version: "empty", oldTotal: "0.00", newTotal: "0.00", paid: "0.00", overpaid: "0.00", stock: [], affectedDates: [], changes: [],
  } }));
  expect(markup).toContain("Belum ada pembayaran tercatat");
});

it("menolak total jadwal yang tidak sesuai tanpa mengirim preview dan mempertahankan alasan", async () => {
  const data = { ...editor, payment: { ...editor.payment, schedule: [{ method: "TRANSFER" as const, amount: "700.00", dueDate: null, note: null }] } };
  render(data).find(n => n.type === InboundPaymentFields)!.props.onChange([{ method: "TRANSFER", amount: 600, dueDate: null, note: null }]);
  input("Alasan perubahan").props.onChange({ target: { value: "Perbaiki rincian" } });
  await submit();
  expect(preview).not.toHaveBeenCalled();
  expect(render().map(text).join(" ")).toMatch(/total jadwal.*sesuai/i);
  expect(input("Alasan perubahan").props.value).toBe("Perbaiki rincian");
});

it("menolak alokasi yang tidak mencakup sumber pembayaran tanpa menghapus isian", async () => {
  input("Alokasi TRANSFER pembayaran 1").props.onChange({ target: { value: "600" } });
  input("Alasan perubahan").props.onChange({ target: { value: "Perbaiki alokasi" } });
  await submit();
  expect(preview).not.toHaveBeenCalled();
  expect(render().map(text).join(" ")).toMatch(/alokasi.*sama.*pembayaran/i);
  expect(input("Alokasi TRANSFER pembayaran 1").props.value).toBe("600");
});

it("mengulang simpan dengan payload dan kunci sama setelah gangguan jaringan", async () => {
  save.mockRejectedValueOnce(new Error("Koneksi terputus. Coba lagi."));
  input("Alasan perubahan").props.onChange({ target: { value: "Koreksi tanggal" } });
  await submit();
  const saveButton = () => render().find(n => n.type === "button" && text(n) === "Simpan perubahan")!;
  await saveButton().props.onClick();
  expect(render().map(text).join(" ")).toContain("Koneksi terputus");
  await saveButton().props.onClick();
  expect(save.mock.calls).toHaveLength(2);
  expect(save.mock.calls[1][0]).toEqual(save.mock.calls[0][0]);
});
