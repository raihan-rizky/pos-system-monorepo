import { db } from "@pos/db";
import {
  buildShoppingRequestNumber,
  sanitizeShoppingRequestItems,
} from "../helpers/shopping-requests-core";
import { resolveProductDisplayStock } from "@/features/product-stock-groups/stock-display";
import {
  countShoppingRequests,
  approveShoppingRequestItemsWithStock,
  cancelShoppingRequestIfUndecided,
  createShoppingRequestWithItems,
  findShoppingRequestById,
  listShoppingRequests,
  saveShoppingRequestApprovedQuantities as saveApprovedQuantitiesRepo,
  updateShoppingRequestWithItems,
  type ShoppingRequestListFilters,
} from "../repositories/shopping-requests-repository";
import type {
  ApproveShoppingRequestInput,
  ApproveShoppingRequestIndividualItemInput,
  CreateShoppingRequestInput,
  SaveShoppingRequestApprovedQuantitiesInput,
  ShoppingRequestActor,
  ShoppingRequestDetail,
  UpdateShoppingRequestInput,
} from "../types/shopping-request";

export type ProductSnapshot = {
  id: string;
  name: string;
  sku: string;
  unit: string | null;
  stock: number;
  unitMultiplierToBase?: number | null;
  stockGroup?: { baseStock: number } | null;
};

export async function listShoppingRequestsPage(
  filters: ShoppingRequestListFilters,
): Promise<{ total: number; requests: Awaited<ReturnType<typeof listShoppingRequests>> }> {
  const [total, requests] = await Promise.all([
    countShoppingRequests(filters),
    listShoppingRequests(filters),
  ]);
  return { total, requests };
}

export async function createShoppingRequest(
  input: CreateShoppingRequestInput,
  actor: ShoppingRequestActor,
  loadProducts?: (productIds: string[]) => Promise<ProductSnapshot[]> | ProductSnapshot[],
): Promise<ShoppingRequestDetail> {
  if (!input.supplierId?.trim()) {
    throw new ShoppingRequestValidationError("Supplier wajib dipilih");
  }
  const items = sanitizeShoppingRequestItems(input.items);
  if (items.length === 0) {
    throw new ShoppingRequestValidationError("Shopping request must contain at least one item");
  }

  const productIds = items.map((item) => item.productId);
  const products = await (loadProducts
    ? loadProducts(productIds)
    : findProductSnapshots(productIds, actor.storeId));
  const productById = new Map(products.map((product) => [product.id, product]));
  const missingProduct = items.find((item) => !productById.has(item.productId));
  if (missingProduct) {
    throw new ShoppingRequestValidationError("Product was not found");
  }

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  return db.$transaction(async (tx) => {
    const supplier = await tx.supplier.findFirst({
      where: { id: input.supplierId, isActive: true },
      select: { id: true },
    });
    if (!supplier) {
      throw new ShoppingRequestValidationError(
        "Supplier tidak aktif atau tidak ditemukan",
      );
    }
    const monthlyCount = await tx.shoppingRequest.count({
      where: {
        storeId: actor.storeId,
        createdAt: { gte: monthStart, lt: nextMonth },
      },
    });
    const sequence = monthlyCount + 1;
    const number = buildShoppingRequestNumber(now, sequence);
    return createShoppingRequestWithItems(
      {
        storeId: actor.storeId,
        number,
        sequence,
        supplierId: input.supplierId,
        requestedByName: input.requestedByName || actor.name || null,
        note: input.note || null,
        items: items.map((item) => {
          const product = productById.get(item.productId)!;
          return {
            productId: item.productId,
            productName: product.name,
            unit: product.unit,
            stockOnHand: resolveProductDisplayStock(product),
            requestedQty: item.requestedQty,
            stockMode: item.stockMode,
          };
        }),
      },
      tx,
    );
  });
}

export async function getShoppingRequestOrThrow(
  id: string,
  storeId?: string,
): Promise<ShoppingRequestDetail> {
  const request = await findShoppingRequestById(id, storeId);
  if (!request) throw new ShoppingRequestNotFoundError();
  return request;
}

export async function approveShoppingRequest(
  id: string,
  input: ApproveShoppingRequestInput,
  actor: ShoppingRequestActor,
): Promise<ShoppingRequestDetail> {
  const request = await getShoppingRequestOrThrow(id, actor.storeId);
  assertRequested(request);

  const inputIds = new Set<string>();
  for (const item of input.items) {
    if (inputIds.has(item.id)) {
      throw new ShoppingRequestValidationError("Item approval tidak boleh duplikat");
    }
    inputIds.add(item.id);
    if (!request.items.some((requestItem) => requestItem.id === item.id)) {
      throw new ShoppingRequestValidationError("Item approval tidak ditemukan");
    }
  }
  const pendingItems = request.items.filter(
    (item) => item.decisionStatus === "PENDING",
  );
  if (
    input.items.length !== pendingItems.length ||
    pendingItems.some((item) => !inputIds.has(item.id))
  ) {
    throw new ShoppingRequestValidationError(
      "Semua item yang masih menunggu harus disertakan",
    );
  }
  assertPreparedQuantities(
    pendingItems,
    Boolean(input.confirmOverRequested),
  );
  const modes = new Map(input.items.map((item) => [item.id, item.stockMode]));

  try {
    return await approveShoppingRequestItemsWithStock({
      id,
      actor,
      items: pendingItems.map((item) => ({
        id: item.id,
        stockMode: modes.get(item.id) ?? item.stockMode,
      })),
      approveAllPending: true,
    });
  } catch (error) {
    throw translateShoppingRequestError(error);
  }
}

export async function saveShoppingRequestApprovedQuantities(
  id: string,
  input: SaveShoppingRequestApprovedQuantitiesInput,
  actor: ShoppingRequestActor,
): Promise<ShoppingRequestDetail> {
  const request = await getShoppingRequestOrThrow(id, actor.storeId);
  assertRequested(request);
  const seen = new Set<string>();
  for (const row of input.items) {
    if (seen.has(row.id)) {
      throw new ShoppingRequestValidationError(
        "Item Jumlah yang Di-ACC tidak boleh duplikat",
      );
    }
    seen.add(row.id);
    const item = request.items.find((candidate) => candidate.id === row.id);
    if (!item) {
      throw new ShoppingRequestValidationError("Item permohonan tidak ditemukan");
    }
    if (item.decisionStatus !== "PENDING") {
      throw new ShoppingRequestValidationError(
        "Jumlah item yang sudah diproses tidak dapat diubah",
      );
    }
    if (!Number.isFinite(row.approvedQty) || row.approvedQty < 0) {
      throw new ShoppingRequestValidationError(
        "Jumlah yang Di-ACC harus berupa angka nol atau lebih",
      );
    }
    if (
      row.approvedQty > item.requestedQty &&
      !input.confirmOverRequested
    ) {
      throw new ShoppingRequestValidationError(
        "Jumlah yang Di-ACC melebihi Jumlah Kebutuhan dan perlu dikonfirmasi",
      );
    }
  }

  try {
    return await saveApprovedQuantitiesRepo({
      id,
      actor,
      items: input.items,
    });
  } catch (error) {
    throw translateShoppingRequestError(error);
  }
}

export async function approveShoppingRequestItem(
  requestId: string,
  itemId: string,
  input: ApproveShoppingRequestIndividualItemInput,
  actor: ShoppingRequestActor,
): Promise<ShoppingRequestDetail> {
  const request = await getShoppingRequestOrThrow(requestId, actor.storeId);
  assertRequested(request);
  const item = request.items.find((candidate) => candidate.id === itemId);
  if (!item) {
    throw new ShoppingRequestValidationError("Item permohonan tidak ditemukan");
  }
  if (item.decisionStatus !== "PENDING") {
    throw new ShoppingRequestValidationError("Item sudah diproses");
  }
  assertPreparedQuantities([item], Boolean(input.confirmOverRequested));

  try {
    return await approveShoppingRequestItemsWithStock({
      id: requestId,
      actor,
      items: [{ id: itemId, stockMode: input.stockMode ?? item.stockMode }],
      approveAllPending: false,
    });
  } catch (error) {
    throw translateShoppingRequestError(error);
  }
}

export async function updateShoppingRequest(
  id: string,
  input: UpdateShoppingRequestInput,
  actor: ShoppingRequestActor,
): Promise<ShoppingRequestDetail> {
  if (!input.supplierId?.trim()) {
    throw new ShoppingRequestValidationError("Supplier wajib dipilih");
  }
  const request = await getShoppingRequestOrThrow(id, actor.storeId);
  assertRequested(request);
  if (request.items.some((item) => item.decisionStatus !== "PENDING")) {
    throw new ShoppingRequestValidationError(
      "Permohonan tidak dapat diedit setelah item pertama diproses",
    );
  }
  const items = sanitizeShoppingRequestItems(input.items);
  if (items.length === 0) {
    throw new ShoppingRequestValidationError(
      "Permohonan belanja harus memiliki minimal satu item",
    );
  }
  const productIds = items.map((item) => item.productId);
  const products = await findProductSnapshots(productIds, actor.storeId);
  const productById = new Map(products.map((product) => [product.id, product]));
  if (items.some((item) => !productById.has(item.productId))) {
    throw new ShoppingRequestValidationError(
      "Produk tidak ditemukan atau sudah tidak aktif",
    );
  }
  const supplier = await db.supplier.findFirst({
    where: { id: input.supplierId, isActive: true },
    select: { id: true },
  });
  if (!supplier) {
    throw new ShoppingRequestValidationError(
      "Supplier tidak aktif atau tidak ditemukan",
    );
  }

  try {
    return await updateShoppingRequestWithItems({
      id,
      actor,
      supplierId: input.supplierId,
      note: input.note ?? null,
      items: items.map((item) => {
        const product = productById.get(item.productId)!;
        return {
          productId: item.productId,
          productName: product.name,
          unit: product.unit,
          stockOnHand: resolveProductDisplayStock(product),
          requestedQty: item.requestedQty,
          stockMode: item.stockMode,
        };
      }),
    });
  } catch (error) {
    throw translateShoppingRequestError(error);
  }
}

export async function cancelShoppingRequest(
  id: string,
  actor: ShoppingRequestActor,
): Promise<ShoppingRequestDetail> {
  const request = await getShoppingRequestOrThrow(id, actor.storeId);
  assertRequested(request);
  if (request.items.some((item) => item.decisionStatus !== "PENDING")) {
    throw new ShoppingRequestValidationError(
      "Permohonan tidak dapat dibatalkan setelah item pertama diproses",
    );
  }
  try {
    return await cancelShoppingRequestIfUndecided({ id, actor });
  } catch (error) {
    throw translateShoppingRequestError(error);
  }
}

function assertRequested(request: ShoppingRequestDetail) {
  if (request.status !== "REQUESTED") {
    throw new ShoppingRequestValidationError(
      "Permohonan belanja belum berstatus Diajukan",
    );
  }
}

function assertPreparedQuantities(
  items: ShoppingRequestDetail["items"],
  confirmOverRequested: boolean,
) {
  if (items.some((item) => item.approvedQty === null)) {
    throw new ShoppingRequestValidationError(
      "Jumlah yang Di-ACC wajib diisi sebelum persetujuan",
    );
  }
  if (
    items.some((item) => (item.approvedQty ?? 0) > item.requestedQty) &&
    !confirmOverRequested
  ) {
    throw new ShoppingRequestValidationError(
      "Jumlah yang Di-ACC melebihi Jumlah Kebutuhan dan perlu dikonfirmasi",
    );
  }
}

function translateShoppingRequestError(error: unknown): Error {
  if (!(error instanceof Error)) return new Error("Gagal memproses permohonan");
  if (error.message === "NOT_FOUND") return new ShoppingRequestNotFoundError();
  const messages: Record<string, string> = {
    ALREADY_DECIDED: "Permohonan atau item sudah diproses oleh pengguna lain",
    SUPPLIER_INACTIVE:
      "Supplier tidak aktif. Aktifkan supplier sebelum menyetujui permohonan",
    RECEIPT_CONFLICT:
      "Permohonan sudah memiliki proses Penerimaan Barang dan tidak dapat menambah stok kembali",
    INVALID_ITEMS: "Daftar item approval tidak sesuai dengan permohonan",
    APPROVED_QTY_REQUIRED: "Jumlah yang Di-ACC wajib diisi sebelum persetujuan",
    INVALID_CONVERSION:
      "Konversi unit perlu ditinjau sebelum memakai Stok Bersama",
    GROUP_NOT_FOUND: "Grup stok produk tidak ditemukan",
    PRODUCT_NOT_FOUND: "Produk tidak ditemukan atau sudah tidak aktif",
  };
  return messages[error.message]
    ? new ShoppingRequestValidationError(messages[error.message])
    : error;
}

async function findProductSnapshots(
  productIds: string[],
  storeId: string,
): Promise<ProductSnapshot[]> {
  return db.product.findMany({
    where: { id: { in: productIds }, storeId, isActive: true },
    select: {
      id: true,
      name: true,
      sku: true,
      unit: true,
      stock: true,
      unitMultiplierToBase: true,
      stockGroup: { select: { baseStock: true } },
    },
  });
}

export class ShoppingRequestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShoppingRequestValidationError";
  }
}

export class ShoppingRequestNotFoundError extends Error {
  constructor() {
    super("Shopping request not found");
    this.name = "ShoppingRequestNotFoundError";
  }
}
