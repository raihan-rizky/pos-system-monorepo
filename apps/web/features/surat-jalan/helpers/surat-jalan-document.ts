import type { SuratJalanItemRecord, SuratJalanStatus, TransactionStockDeductionSource } from "../types/surat-jalan";

export interface SuratJalanDocumentChanges {
  recipientName: string;
  quantities: Record<string, number>;
  documentNames: Record<string, string>;
  keterangan: Record<string, string>;
}

type Delivery = { id: string; status: string; items: ReadonlyArray<{ transactionItemId: string; quantity: number }> };
type InvoiceLine = { id: string; productId?: string | null; productName: string; quantity: number };
export interface DocumentStockProof {
  productId: string;
  type: string;
  quantity: number;
  stockBaseDelta: number | null;
  stockGroupIdSnapshot: string | null;
  unitMultiplierSnapshot: number | null;
}
export interface DocumentStockProduct {
  id: string;
  stockGroupId: string | null;
  unitMultiplierToBase: number | null;
}

export class SuratJalanDocumentError extends Error {
  constructor(message: string, public readonly status = 422) { super(message); }
}

export function getDocumentQuantityLimits(
  invoiceItems: ReadonlyArray<InvoiceLine>,
  records: ReadonlyArray<Delivery>,
  excludeId?: string,
): Record<string, number> {
  return Object.fromEntries(invoiceItems.filter(item => item.productId).map(item => {
    const reserved = records.filter(record => record.id !== excludeId && ["PENDING", "CONFIRMED"].includes(record.status))
      .reduce((total, record) => total + record.items.filter(row => row.transactionItemId === item.id).reduce((sum, row) => sum + row.quantity, 0), 0);
    return [item.id, Math.max(0, item.quantity - reserved)];
  }));
}

export interface SuratJalanDocumentPlan {
  recipientName: string;
  items: SuratJalanItemRecord[];
  stockDeltas: Array<{ productId: string; delta: number }>;
}

export function planSuratJalanDocumentUpdate(input: {
  record: { id: string; status: SuratJalanStatus; recipientName: string; items: SuratJalanItemRecord[] };
  invoiceItems: ReadonlyArray<InvoiceLine>;
  otherRecords: ReadonlyArray<Delivery>;
  stockDeductionSource: TransactionStockDeductionSource;
  changes: SuratJalanDocumentChanges;
  stockProof?: ReadonlyArray<DocumentStockProof>;
  stockProducts?: ReadonlyArray<DocumentStockProduct>;
}): SuratJalanDocumentPlan {
  if (!["PENDING", "CONFIRMED"].includes(input.record.status)) {
    throw new SuratJalanDocumentError("Status surat jalan ini tidak dapat diubah.", 409);
  }
  const recipientName = input.changes.recipientName.trim();
  if (!recipientName || recipientName.length > 200) throw new SuratJalanDocumentError("Nama penerima wajib diisi, maksimal 200 karakter.");
  const allowedIds = new Set(input.record.items.map(item => item.transactionItemId));
  for (const values of [input.changes.quantities, input.changes.documentNames, input.changes.keterangan]) {
    if (Object.keys(values).some(id => !allowedIds.has(id))) throw new SuratJalanDocumentError("Barang tidak termasuk dalam surat jalan ini.");
  }
  const limits = getDocumentQuantityLimits(input.invoiceItems, input.otherRecords, input.record.id);
  const items: SuratJalanItemRecord[] = [];
  for (const item of input.record.items) {
    const invoiceItem = input.invoiceItems.find(line => line.id === item.transactionItemId && line.productId === item.productId);
    if (!invoiceItem) throw new SuratJalanDocumentError("Barang surat jalan tidak ditemukan pada invoice.");
    const quantity = input.changes.quantities[item.transactionItemId] ?? item.quantity;
    if (!Number.isFinite(quantity) || quantity < 0) throw new SuratJalanDocumentError("Jumlah barang harus berupa angka nol atau lebih.");
    if (quantity > (limits[item.transactionItemId] ?? 0) + 1e-8) throw new SuratJalanDocumentError(`Jumlah ${invoiceItem.productName} melebihi sisa barang yang dapat dikirim.`);
    if (quantity === 0) continue;
    const productName = (input.changes.documentNames[item.transactionItemId] ?? item.productName).trim();
    const keterangan = (input.changes.keterangan[item.transactionItemId] ?? item.keterangan ?? "").trim();
    if (!productName || productName.length > 300) throw new SuratJalanDocumentError("Nama barang wajib diisi, maksimal 300 karakter.");
    if (keterangan.length > 500) throw new SuratJalanDocumentError("Keterangan maksimal 500 karakter.");
    items.push({ ...item, quantity, productName, keterangan });
  }
  if (!items.length) throw new SuratJalanDocumentError("Pilih sedikitnya satu barang untuk dikirim.");

  const stockDeltas: SuratJalanDocumentPlan["stockDeltas"] = [];
  if (input.stockDeductionSource === "SURAT_JALAN" && input.record.status === "CONFIRMED") {
    const oldTotals = totalsByProduct(input.record.items);
    const newTotals = totalsByProduct(items);
    for (const [productId, quantity] of oldTotals) {
      const delta = quantity - (newTotals.get(productId) ?? 0);
      if (Math.abs(delta) < 1e-8) continue;
      assertDocumentStockProof(productId, quantity, input.stockProof ?? [], input.stockProducts ?? []);
      stockDeltas.push({ productId, delta });
    }
    stockDeltas.sort((a, b) => a.productId.localeCompare(b.productId));
  }
  return { recipientName, items, stockDeltas };
}

function totalsByProduct(items: ReadonlyArray<SuratJalanItemRecord>): Map<string, number> {
  const totals = new Map<string, number>();
  for (const item of items) totals.set(item.productId, (totals.get(item.productId) ?? 0) + item.quantity);
  return totals;
}

function assertDocumentStockProof(productId: string, quantity: number, proof: ReadonlyArray<DocumentStockProof>, products: ReadonlyArray<DocumentStockProduct>): void {
  const invalid = () => new SuratJalanDocumentError("Riwayat stok lama belum dapat diverifikasi. Jumlah belum bisa diubah; isi teks dan cetak ulang tetap tersedia.", 409);
  const product = products.find(row => row.id === productId);
  const rows = proof.filter(row => row.productId === productId);
  if (!product || !rows.length) throw invalid();
  const multiplier = product.stockGroupId ? Number(product.unitMultiplierToBase) : 1;
  if (!Number.isFinite(multiplier) || multiplier <= 0) throw invalid();
  let provenQuantity = 0;
  let provenBase = 0;
  for (const row of rows) {
    const sign = row.type === "OUT" ? -1 : row.type === "IN" ? 1 : 0;
    if (!sign || !Number.isFinite(row.quantity) || row.quantity <= 0 || row.stockGroupIdSnapshot !== product.stockGroupId ||
      row.stockBaseDelta === null || !Number.isFinite(row.stockBaseDelta) || row.stockBaseDelta * sign <= 0 ||
      row.unitMultiplierSnapshot === null || !Number.isFinite(row.unitMultiplierSnapshot) || Math.abs(row.unitMultiplierSnapshot - multiplier) > 1e-8 ||
      Math.abs(row.stockBaseDelta - sign * row.quantity * multiplier) > 1e-8) throw invalid();
    provenQuantity -= sign * row.quantity;
    provenBase += row.stockBaseDelta;
  }
  if (Math.abs(provenQuantity - quantity) > 1e-8 || Math.abs(provenBase + quantity * multiplier) > 1e-8) throw invalid();
}
