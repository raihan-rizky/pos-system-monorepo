import type { CorrectionLine } from "../types/shopping-request-correction";

export type ExistingCorrectionReceiptLine = {
  requestItemId: string | null;
  purchaseItemId: string;
  productId: string;
  receipts: Array<{ receiptLineId: string | null; receivedQty: number }>;
};

export function planCorrectionReceiptChanges(
  existing: ExistingCorrectionReceiptLine[],
  proposed: CorrectionLine[],
): {
  existing: Array<{ requestItemId: string | null; purchaseItemId: string; productId: string; receiptLineId: string | null; oldReceivedQty: number; newReceivedQty: number }>;
  added: Array<{ clientLineKey: string; productId: string; receivedQty: number }>;
} {
  const oldById = new Map<string, ExistingCorrectionReceiptLine>();
  const receiptIds = new Set<string>();
  for (const item of existing) {
    if (!item.purchaseItemId || oldById.has(item.purchaseItemId)) throw new Error("Barang pembelian ganda atau tidak tersedia.");
    oldById.set(item.purchaseItemId, item);
    const sources = new Set<string | null>();
    for (const receipt of item.receipts) {
      if (!Number.isFinite(receipt.receivedQty) || receipt.receivedQty < 0 || sources.has(receipt.receiptLineId) ||
          (receipt.receiptLineId !== null && receiptIds.has(receipt.receiptLineId))) {
        throw new Error("Sumber penerimaan tidak valid atau tercatat ganda.");
      }
      sources.add(receipt.receiptLineId);
      if (receipt.receiptLineId !== null) receiptIds.add(receipt.receiptLineId);
    }
  }

  const newById = new Map<string, CorrectionLine>();
  const added: Array<{ clientLineKey: string; productId: string; receivedQty: number }> = [];
  const clientKeys = new Set<string>();
  const productIds = new Set<string>();
  for (const item of proposed) {
    if (!item.clientLineKey || clientKeys.has(item.clientLineKey) || productIds.has(item.productId)) {
      throw new Error("Barang koreksi tidak valid atau tercatat ganda.");
    }
    clientKeys.add(item.clientLineKey);
    productIds.add(item.productId);
    const sources = new Set<string | null>();
    for (const receipt of item.receipts) {
      if (!Number.isFinite(receipt.receivedQty) || receipt.receivedQty < 0 || sources.has(receipt.receiptLineId)) {
        throw new Error("Jumlah atau sumber penerimaan tidak valid.");
      }
      sources.add(receipt.receiptLineId);
    }
    if (!item.purchaseItemId) {
      if (item.receipts.some((receipt) => receipt.receiptLineId !== null)) throw new Error("Penerimaan asal tidak cocok dengan barang baru.");
      added.push({ clientLineKey: item.clientLineKey, productId: item.productId, receivedQty: item.receipts[0]?.receivedQty ?? 0 });
      continue;
    }
    const old = oldById.get(item.purchaseItemId);
    if (!old || newById.has(item.purchaseItemId) || old.productId !== item.productId || old.requestItemId !== item.requestItemId) {
      throw new Error("Barang pembelian berubah. Muat ulang dan coba lagi.");
    }
    newById.set(item.purchaseItemId, item);
  }

  const changes: Array<{ requestItemId: string | null; purchaseItemId: string; productId: string; receiptLineId: string | null; oldReceivedQty: number; newReceivedQty: number }> = [];
  for (const old of existing) {
    const item = newById.get(old.purchaseItemId);
    const oldSources = new Map(old.receipts.map((receipt) => [receipt.receiptLineId, receipt.receivedQty]));
    const newSources = new Map(item?.receipts.map((receipt) => [receipt.receiptLineId, receipt.receivedQty]) ?? []);
    if (item) {
      for (const id of oldSources.keys()) {
        if (!newSources.has(id)) throw new Error("Penerimaan asal belum disertakan. Muat ulang dan coba lagi.");
      }
      for (const id of newSources.keys()) {
        if (id !== null && !oldSources.has(id)) throw new Error("Penerimaan asal tidak cocok dengan barang.");
      }
    }
    const ids = new Set([...oldSources.keys(), ...newSources.keys()]);
    for (const id of ids) {
      const oldReceivedQty = oldSources.get(id) ?? 0;
      const newReceivedQty = item ? newSources.get(id) ?? 0 : 0;
      if (oldReceivedQty === newReceivedQty) continue;
      changes.push({ requestItemId: old.requestItemId, purchaseItemId: old.purchaseItemId, productId: old.productId, receiptLineId: id, oldReceivedQty, newReceivedQty });
    }
  }
  return { existing: changes, added };
}
