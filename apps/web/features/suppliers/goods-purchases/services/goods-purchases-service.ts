import {
  countGoodsPurchases,
  createGoodsPurchaseRecord,
  findGoodsPurchaseById,
  GoodsPurchaseRepositoryError,
  listEligibleShoppingRequests as listEligibleShoppingRequestsRepo,
  listGoodsPurchases,
  listLargeUnitProducts as listLargeUnitProductsRepo,
  type GoodsPurchaseListFilters,
} from "../repositories/goods-purchases-repository";
import type {
  CreateGoodsPurchaseInput,
  EligibleShoppingRequest,
  GoodsPurchaseActor,
  GoodsPurchaseDetail,
  GoodsPurchaseListItem,
  LargeUnitProductOption,
} from "../types/goods-purchase";

export async function listGoodsPurchasesPage(
  filters: GoodsPurchaseListFilters,
): Promise<{ total: number; purchases: GoodsPurchaseListItem[] }> {
  const [total, purchases] = await Promise.all([
    countGoodsPurchases(filters),
    listGoodsPurchases(filters),
  ]);
  return { total, purchases };
}

export async function getGoodsPurchaseOrThrow(
  id: string,
  storeId: string,
): Promise<GoodsPurchaseDetail> {
  const purchase = await findGoodsPurchaseById(id, storeId);
  if (!purchase) throw new GoodsPurchaseNotFoundError();
  return purchase;
}

export function listEligibleShoppingRequests(
  storeId: string,
  q?: string,
): Promise<EligibleShoppingRequest[]> {
  return listEligibleShoppingRequestsRepo(storeId, q);
}

export function listLargeUnitProducts(
  storeId: string,
  q?: string,
): Promise<LargeUnitProductOption[]> {
  return listLargeUnitProductsRepo(storeId, q);
}

export async function createGoodsPurchase(
  input: CreateGoodsPurchaseInput,
  actor: GoodsPurchaseActor,
  now = new Date(),
): Promise<GoodsPurchaseDetail> {
  validateCreateInput(input);
  try {
    return await createGoodsPurchaseRecord(input, actor, now);
  } catch (error) {
    throw translateRepositoryError(error);
  }
}

function validateCreateInput(input: CreateGoodsPurchaseInput): void {
  if (!input.shoppingRequestId.trim()) {
    throw new GoodsPurchaseValidationError("Daftar Belanja wajib dipilih");
  }
  if (input.items.length === 0) {
    throw new GoodsPurchaseValidationError("Minimal satu produk wajib diisi");
  }

  const productIds = new Set<string>();
  const shoppingRequestItemIds = new Set<string>();
  for (const item of input.items) {
    if (productIds.has(item.productId)) {
      throw new GoodsPurchaseValidationError(
        "Produk yang sama tidak boleh dipilih dua kali",
      );
    }
    if (shoppingRequestItemIds.has(item.shoppingRequestItemId)) {
      throw new GoodsPurchaseValidationError(
        "Item Daftar Belanja tidak boleh dipilih dua kali",
      );
    }
    productIds.add(item.productId);
    shoppingRequestItemIds.add(item.shoppingRequestItemId);
    if (item.quantity <= 0 || !Number.isFinite(item.quantity)) {
      throw new GoodsPurchaseValidationError(
        "Jumlah produk harus lebih dari 0",
      );
    }
    if (item.latestUnitPrice < 0 || !Number.isFinite(item.latestUnitPrice)) {
      throw new GoodsPurchaseValidationError(
        "Harga produk tidak boleh negatif",
      );
    }
  }
}

function translateRepositoryError(error: unknown): Error {
  if (!(error instanceof GoodsPurchaseRepositoryError)) {
    return error instanceof Error ? error : new Error("Terjadi kesalahan");
  }
  switch (error.code) {
    case "NOT_FOUND":
      return new GoodsPurchaseNotFoundError();
    case "ACTIVE_REQUEST_CONFLICT":
      return new GoodsPurchaseValidationError(
        "Daftar Belanja ini sedang atau sudah memiliki Pembelian Barang aktif",
        true,
      );
    case "REQUEST_NOT_ELIGIBLE":
      return new GoodsPurchaseValidationError(
        "Daftar Belanja tidak tersedia untuk Pembelian Barang",
        true,
      );
    case "ITEM_SET_MISMATCH":
      return new GoodsPurchaseValidationError(
        "Semua produk yang disetujui dari Daftar Belanja wajib disertakan",
      );
    case "PRODUCT_NOT_FOUND":
      return new GoodsPurchaseValidationError(
        "Produk tidak aktif atau tidak ditemukan",
      );
  }
}

export class GoodsPurchaseValidationError extends Error {
  constructor(
    message: string,
    public readonly isConflict = false,
  ) {
    super(message);
    this.name = "GoodsPurchaseValidationError";
  }
}

export class GoodsPurchaseNotFoundError extends Error {
  constructor() {
    super("Pembelian Barang tidak ditemukan");
    this.name = "GoodsPurchaseNotFoundError";
  }
}
