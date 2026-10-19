import type { ShoppingRequestActor } from "../types/shopping-request";
import { finalizeShoppingRequestRecord } from "../repositories/finalize-shopping-request-repository";
import { FinalApprovalError } from "./final-approval-error";
import { shoppingRequestPaymentSchema, type ShoppingRequestPaymentInput } from "../helpers/shopping-request-payment";
export { FinalApprovalError } from "./final-approval-error";

export type FinalApprovalItem = {
  shoppingRequestItemId: string;
  productId: string;
  approvedQty: number;
  latestUnitPrice: number;
  updateMasterHpp: boolean;
};

export type FinalApprovalExtraItem = {
  productId: string;
  quantity: number;
  latestUnitPrice: number;
  updateMasterHpp: boolean;
};

export type FinalizeShoppingRequestInput = ShoppingRequestPaymentInput & {
  items: FinalApprovalItem[];
  extraItems: FinalApprovalExtraItem[];
  confirmOverRequested?: boolean;
};

export function validateFinalApproval(
  requestItems: Array<{ id: string; productId: string; requestedQty: number; stockGroupId: string | null }>,
  products: Array<{ id: string; stockGroupId: string | null; isActive: boolean }>,
  input: FinalizeShoppingRequestInput,
): FinalizeShoppingRequestInput {
  const payment = shoppingRequestPaymentSchema.safeParse(input);
  if (!payment.success) throw new FinalApprovalError(payment.error.issues[0].message);
  if (input.items.length !== requestItems.length) {
    throw new FinalApprovalError("Semua barang pada daftar belanja harus ditinjau.");
  }
  const requestById = new Map(requestItems.map((item) => [item.id, item]));
  const productById = new Map(products.map((product) => [product.id, product]));
  const seenItems = new Set<string>();
  const seenProducts = new Set<string>();
  let positiveCount = 0;

  for (const item of input.items) {
    const requested = requestById.get(item.shoppingRequestItemId);
    if (!requested || seenItems.has(item.shoppingRequestItemId)) {
      throw new FinalApprovalError("Barang pada daftar belanja tidak cocok atau dipilih dua kali.");
    }
    seenItems.add(item.shoppingRequestItemId);
    const selected = productById.get(item.productId);
    if (!selected || (!selected.isActive &&
      (item.approvedQty !== 0 || item.productId !== requested.productId))) {
      throw new FinalApprovalError("Produk tidak aktif atau tidak ditemukan.");
    }
    if (item.productId !== requested.productId &&
      (!requested.stockGroupId || requested.stockGroupId !== selected.stockGroupId)) {
      throw new FinalApprovalError("Satuan pengganti harus berasal dari grup stok yang sama.");
    }
    if (!Number.isFinite(item.approvedQty) || item.approvedQty < 0 ||
      !Number.isFinite(item.latestUnitPrice) || item.latestUnitPrice < 0) {
      throw new FinalApprovalError("Jumlah dan harga beli harus berupa angka nol atau lebih.");
    }
    if (item.approvedQty > requested.requestedQty && !input.confirmOverRequested) {
      throw new FinalApprovalError("Jumlah yang disetujui melebihi kebutuhan. Konfirmasi jumlah tersebut.");
    }
    if (seenProducts.has(item.productId)) throw new FinalApprovalError("Produk tidak boleh dipilih dua kali.");
    seenProducts.add(item.productId);
    if (item.approvedQty > 0) positiveCount++;
  }

  for (const item of input.extraItems) {
    if (!productById.get(item.productId)?.isActive) throw new FinalApprovalError("Produk tambahan tidak aktif atau tidak ditemukan.");
    if (!Number.isFinite(item.quantity) || item.quantity <= 0 ||
      !Number.isFinite(item.latestUnitPrice) || item.latestUnitPrice < 0) {
      throw new FinalApprovalError("Jumlah barang tambahan harus lebih dari nol dan harganya tidak boleh negatif.");
    }
    if (seenProducts.has(item.productId)) throw new FinalApprovalError("Produk tidak boleh dipilih dua kali.");
    seenProducts.add(item.productId);
    positiveCount++;
  }
  if (positiveCount === 0) throw new FinalApprovalError("Setujui minimal satu barang untuk mencatat pembelian.");
  return input;
}

export function finalizeShoppingRequest(
  id: string,
  input: FinalizeShoppingRequestInput,
  actor: ShoppingRequestActor,
) {
  return finalizeShoppingRequestRecord(id, input, actor);
}
