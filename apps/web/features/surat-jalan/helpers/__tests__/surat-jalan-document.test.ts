import { describe, expect, it } from "vitest";
import { planSuratJalanDocumentUpdate, getDocumentQuantityLimits } from "../surat-jalan-document";
import type { SuratJalanItemRecord } from "../../types/surat-jalan";

const item: SuratJalanItemRecord = { id: "sj-item", transactionItemId: "line-1", productId: "paper", productName: "Kertas", quantity: 4, unit: "rim", keterangan: "", stockBefore: null, stockAfter: null };
const record = { id: "sj-1", status: "CONFIRMED" as const, recipientName: "Pelanggan", items: [item] };
const invoiceItems = [{ id: "line-1", productId: "paper", productName: "Kertas POS", quantity: 10 }];
const otherRecords = [{ id: "sj-2", status: "PENDING" as const, items: [{ ...item, id: "other", quantity: 3 }] }];
const base = { record, invoiceItems, otherRecords, stockDeductionSource: "TRANSACTION" as const, changes: { recipientName: "  Gudang  ", quantities: { "line-1": 6 }, documentNames: { "line-1": "  Kertas pesanan  " }, keterangan: { "line-1": "  Lantai 2  " } } };

describe("surat jalan document updates", () => {
  it("saves actual shipment quantities and document names without changing product identity", () => {
    const plan = planSuratJalanDocumentUpdate(base);
    expect(plan.recipientName).toBe("Gudang");
    expect(plan.items).toEqual([expect.objectContaining({ id: "sj-item", transactionItemId: "line-1", productId: "paper", productName: "Kertas pesanan", quantity: 6, keterangan: "Lantai 2" })]);
    expect(plan.stockDeltas).toEqual([]);
    expect(item.productName).toBe("Kertas");
    expect(item.quantity).toBe(4);
  });

  it("reserves pending quantities and excludes the edited document from its own limit", () => {
    expect(getDocumentQuantityLimits(invoiceItems, [record, ...otherRecords], record.id)).toEqual({ "line-1": 7 });
    expect(() => planSuratJalanDocumentUpdate({ ...base, changes: { ...base.changes, quantities: { "line-1": 8 } } })).toThrow(/sisa/i);
  });

  it("ignores cancelled deliveries when determining a new shipment limit", () => {
    expect(getDocumentQuantityLimits(invoiceItems, [{ ...record, status: "CANCELLED" }])).toEqual({ "line-1": 10 });
    expect(getDocumentQuantityLimits(invoiceItems, [record, ...otherRecords])).toEqual({ "line-1": 3 });
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])("rejects invalid quantity %s", quantity => {
    expect(() => planSuratJalanDocumentUpdate({ ...base, changes: { ...base.changes, quantities: { "line-1": quantity } } })).toThrow(/jumlah/i);
  });

  it("rejects foreign rows, blank names, empty recipients and all-zero shipments", () => {
    expect(() => planSuratJalanDocumentUpdate({ ...base, changes: { ...base.changes, quantities: { foreign: 1 } } })).toThrow(/barang/i);
    expect(() => planSuratJalanDocumentUpdate({ ...base, changes: { ...base.changes, documentNames: { "line-1": " " } } })).toThrow(/nama/i);
    expect(() => planSuratJalanDocumentUpdate({ ...base, changes: { ...base.changes, recipientName: " " } })).toThrow(/penerima/i);
    expect(() => planSuratJalanDocumentUpdate({ ...base, changes: { ...base.changes, quantities: { "line-1": 0 } } })).toThrow(/barang/i);
  });

  it("removes zero-quantity rows while retaining other shipped rows", () => {
    const second = { ...item, id: "sj-item-2", transactionItemId: "line-2", productId: "pen", quantity: 1 };
    const plan = planSuratJalanDocumentUpdate({ ...base, record: { ...record, items: [item, second] }, invoiceItems: [...invoiceItems, { id: "line-2", productId: "pen", productName: "Pulpen", quantity: 2 }], changes: { ...base.changes, quantities: { "line-1": 0, "line-2": 1 } } });
    expect(plan.items.map(row => row.id)).toEqual(["sj-item-2"]);
    expect(plan.stockDeltas).toEqual([]);
  });

  it.each(["CANCELLED", "REJECTED"] as const)("rejects edits of %s documents", status => {
    expect(() => planSuratJalanDocumentUpdate({ ...base, record: { ...record, status } })).toThrow(/status|dibatalkan|ditolak/i);
  });

  it("returns only the proven legacy stock difference", () => {
    const plan = planSuratJalanDocumentUpdate({ ...base, stockDeductionSource: "SURAT_JALAN", changes: { ...base.changes, quantities: { "line-1": 2 } }, stockProducts: [{ id: "paper", stockGroupId: "group-paper", unitMultiplierToBase: 5 }], stockProof: [{ productId: "paper", type: "OUT", quantity: 4, stockBaseDelta: -20, stockGroupIdSnapshot: "group-paper", unitMultiplierSnapshot: 5 }] });
    expect(plan.stockDeltas).toEqual([{ productId: "paper", delta: 2 }]);
  });

  it("recognizes previous correction journals before editing legacy quantities again", () => {
    const plan = planSuratJalanDocumentUpdate({ ...base, stockDeductionSource: "SURAT_JALAN", stockProducts: [{ id: "paper", stockGroupId: null, unitMultiplierToBase: 1 }], stockProof: [{ productId: "paper", type: "OUT", quantity: 6, stockBaseDelta: -6, stockGroupIdSnapshot: null, unitMultiplierSnapshot: 1 }, { productId: "paper", type: "IN", quantity: 2, stockBaseDelta: 2, stockGroupIdSnapshot: null, unitMultiplierSnapshot: 1 }] });
    expect(plan.stockDeltas).toEqual([{ productId: "paper", delta: -2 }]);
  });

  it("rejects legacy quantity changes without complete and compatible stock proof", () => {
    expect(() => planSuratJalanDocumentUpdate({ ...base, stockDeductionSource: "SURAT_JALAN" })).toThrow(/stok/i);
    expect(() => planSuratJalanDocumentUpdate({ ...base, stockDeductionSource: "SURAT_JALAN", stockProducts: [{ id: "paper", stockGroupId: "new-group", unitMultiplierToBase: 1 }], stockProof: [{ productId: "paper", type: "OUT", quantity: 4, stockBaseDelta: -4, stockGroupIdSnapshot: null, unitMultiplierSnapshot: 1 }] })).toThrow(/stok/i);
  });

  it("permits text-only legacy edits and pending edits without touching stock", () => {
    expect(planSuratJalanDocumentUpdate({ ...base, stockDeductionSource: "SURAT_JALAN", changes: { ...base.changes, quantities: { "line-1": 4 } } }).stockDeltas).toEqual([]);
    expect(planSuratJalanDocumentUpdate({ ...base, stockDeductionSource: "SURAT_JALAN", record: { ...record, status: "PENDING" } }).stockDeltas).toEqual([]);
  });
});
