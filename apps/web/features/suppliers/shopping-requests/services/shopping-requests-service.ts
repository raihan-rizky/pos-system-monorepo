import { db } from "@pos/db";
import {
  buildShoppingRequestNumber,
  defaultApprovedQty,
  sanitizeShoppingRequestItems,
} from "../helpers/shopping-requests-core";
import {
  countShoppingRequests,
  createShoppingRequestWithItems,
  findShoppingRequestById,
  listShoppingRequests,
  updateShoppingRequestItems,
  updateShoppingRequestStatus,
  type ShoppingRequestListFilters,
} from "../repositories/shopping-requests-repository";
import type {
  ApproveShoppingRequestInput,
  CreateShoppingRequestInput,
  ShoppingRequestActor,
  ShoppingRequestDetail,
} from "../types/shopping-request";

export type ProductSnapshot = {
  id: string;
  name: string;
  sku: string;
  unit: string | null;
  stock: number;
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
  loadProducts: (productIds: string[]) => Promise<ProductSnapshot[]> | ProductSnapshot[] = findProductSnapshots,
): Promise<ShoppingRequestDetail> {
  const items = sanitizeShoppingRequestItems(input.items);
  if (items.length === 0) {
    throw new ShoppingRequestValidationError("Shopping request must contain at least one item");
  }

  const products = await loadProducts(items.map((item) => item.productId));
  const productById = new Map(products.map((product) => [product.id, product]));
  const missingProduct = items.find((item) => !productById.has(item.productId));
  if (missingProduct) {
    throw new ShoppingRequestValidationError("Product was not found");
  }

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  return db.$transaction(async (tx) => {
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
        supplierId: input.supplierId ?? null,
        requestedByName: input.requestedByName || actor.name || null,
        note: input.note || null,
        items: items.map((item) => {
          const product = productById.get(item.productId)!;
          return {
            productId: item.productId,
            productName: product.name,
            unit: product.unit,
            stockOnHand: product.stock,
            requestedQty: item.requestedQty,
          };
        }),
      },
      tx,
    );
  });
}

export async function getShoppingRequestOrThrow(
  id: string,
): Promise<ShoppingRequestDetail> {
  const request = await findShoppingRequestById(id);
  if (!request) throw new ShoppingRequestNotFoundError();
  return request;
}

export async function approveShoppingRequest(
  id: string,
  input: ApproveShoppingRequestInput,
  actor: ShoppingRequestActor,
): Promise<ShoppingRequestDetail> {
  const request = await getShoppingRequestOrThrow(id);
  if (request.status !== "DRAFT") {
    throw new ShoppingRequestValidationError("Shopping request is not DRAFT");
  }

  const approvedById = new Map(input.items.map((item) => [item.id, item.approvedQty]));
  const approvedItems = request.items.map((item) => ({
    id: item.id,
    approvedQty: approvedById.get(item.id) ?? defaultApprovedQty(item.requestedQty),
  }));

  if (approvedItems.some((item) => item.approvedQty < 0)) {
    throw new ShoppingRequestValidationError("Approved quantity cannot be negative");
  }

  await updateShoppingRequestItems(id, approvedItems);
  return updateShoppingRequestStatus(id, {
    status: "APPROVED",
    approvedById: actor.id,
    approvedByName: actor.name,
    approvedAt: new Date(),
    cancelledAt: null,
  });
}

export async function cancelShoppingRequest(
  id: string,
  actor: ShoppingRequestActor,
): Promise<ShoppingRequestDetail> {
  await getShoppingRequestOrThrow(id);
  return updateShoppingRequestStatus(id, {
    status: "CANCELLED",
    approvedById: null,
    approvedByName: actor.name,
    approvedAt: null,
    cancelledAt: new Date(),
  });
}

async function findProductSnapshots(productIds: string[]): Promise<ProductSnapshot[]> {
  return db.product.findMany({
    where: { id: { in: productIds }, isActive: true },
    select: { id: true, name: true, sku: true, unit: true, stock: true },
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
