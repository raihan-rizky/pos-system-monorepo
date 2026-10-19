import { db, Prisma } from "@pos/db";
import { resolveProductDisplayStock } from "@/features/product-stock-groups/stock-display";
import { finalizeGoodsPurchaseIfReady } from "@/features/suppliers/goods-purchases/repositories/goods-purchases-repository";
import { hasMasterHppDifference } from "@/features/suppliers/goods-purchases/helpers/goods-purchase-core";
import type { ShoppingRequestActor } from "../types/shopping-request";
import type { FinalizeShoppingRequestInput } from "../services/finalize-shopping-request";
import { validateFinalApproval } from "../services/finalize-shopping-request";
import { FinalApprovalError } from "../services/final-approval-error";
import { shoppingRequestPaymentSchema } from "../helpers/shopping-request-payment";

export async function finalizeShoppingRequestRecord(
  id: string,
  input: FinalizeShoppingRequestInput,
  actor: ShoppingRequestActor,
  now = new Date(),
): Promise<{ shoppingRequestId: string; goodsPurchaseId: string }> {
  const payment = shoppingRequestPaymentSchema.safeParse(input);
  if (!payment.success) throw new FinalApprovalError(payment.error.issues[0].message);
  try {
    return await db.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "pos_shopping_requests"
        WHERE "id" = ${id} AND "storeId" = ${actor.storeId}
          AND "status" = 'REQUESTED'::"ShoppingRequestStatus"
          AND "approvalFlowVersion" = 2
        FOR UPDATE
      `;
      if (locked.length !== 1) throw new FinalApprovalError("Daftar belanja sudah diproses. Muat ulang data terbaru.", 409);

      const request = await tx.shoppingRequest.findFirst({
        where: { id, storeId: actor.storeId, status: "REQUESTED", approvalFlowVersion: 2 },
        include: {
          supplier: { select: { id: true, name: true, isActive: true } },
          items: { include: { product: { select: { stockGroupId: true } } } },
        },
      });
      if (!request?.supplier?.isActive || !request.supplierId) {
        throw new FinalApprovalError("Supplier tidak aktif atau daftar belanja tidak ditemukan.");
      }

      const selectedProductIds = [...new Set([
        ...input.items.map((item) => item.productId),
        ...input.extraItems.map((item) => item.productId),
      ])];
      const products = await tx.product.findMany({
        where: { id: { in: selectedProductIds }, storeId: actor.storeId },
        select: {
          id: true, name: true, sku: true, unit: true, stock: true, isActive: true,
          stockGroupId: true, stockGroup: { select: { baseStock: true } },
          unitMultiplierToBase: true, costPrice: true,
        },
      });
      validateFinalApproval(
        request.items.map((item) => ({
          id: item.id, productId: item.productId,
          requestedQty: item.requestedQty,
          stockGroupId: item.product.stockGroupId,
        })),
        products,
        input,
      );
      const productsById = new Map(products.map((product) => [product.id, product]));

      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "pos_stores" WHERE "id" = ${actor.storeId} FOR UPDATE
      `;
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
      const sequence = (await tx.goodsPurchase.count({
        where: { storeId: actor.storeId, createdAt: { gte: monthStart, lt: nextMonth } },
      })) + 1;
      const number = `PB-${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(sequence).padStart(3, "0")}`;

      const purchaseItems: Array<{
        shoppingRequestItemId?: string;
        productId: string;
        quantity: number;
        latestUnitPrice: number;
        updateMasterHpp: boolean;
      }> = [];
      for (const decision of input.items) {
        const product = productsById.get(decision.productId)!;
        await tx.shoppingRequestItem.update({
          where: { id: decision.shoppingRequestItemId },
          data: {
            productId: product.id,
            productName: product.name,
            unit: product.unit,
            stockOnHand: resolveProductDisplayStock(product),
            approvedQty: decision.approvedQty,
            decisionStatus: decision.approvedQty > 0 ? "APPROVED" : "REJECTED",
            decidedById: actor.id,
            decidedByName: actor.name,
            decidedAt: now,
            costPriceSnapshot: decision.approvedQty > 0 ? new Prisma.Decimal(String(decision.latestUnitPrice)) : null,
          },
        });
        if (decision.approvedQty > 0) purchaseItems.push({
          shoppingRequestItemId: decision.shoppingRequestItemId,
          productId: product.id,
          quantity: decision.approvedQty,
          latestUnitPrice: decision.latestUnitPrice,
          updateMasterHpp: decision.updateMasterHpp,
        });
      }
      purchaseItems.push(...input.extraItems);

      let totalAmount = new Prisma.Decimal(0);
      const createItems = purchaseItems.map((item) => {
        const product = productsById.get(item.productId)!;
        const latestUnitPrice = new Prisma.Decimal(String(item.latestUnitPrice))
          .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
        const lineTotal = latestUnitPrice.mul(new Prisma.Decimal(String(item.quantity)))
          .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
        totalAmount = totalAmount.add(lineTotal);
        const currentHpp = product.costPrice === null ? null : Number(product.costPrice.toString());
        return {
          shoppingRequestItemId: item.shoppingRequestItemId ?? null,
          productId: product.id,
          productNameSnapshot: product.name,
          skuSnapshot: product.sku,
          unitSnapshot: product.unit,
          unitMultiplierSnapshot: product.unitMultiplierToBase,
          quantity: item.quantity,
          masterCostPriceSnapshot: product.costPrice,
          latestUnitPrice,
          lineTotal,
          updateMasterHpp: item.updateMasterHpp && hasMasterHppDifference(currentHpp, item.latestUnitPrice),
          reviewStatus: "APPROVED" as const,
          approvedById: actor.id,
          approvedByName: actor.name,
          approvedAt: now,
        };
      });
      const claimed = await tx.shoppingRequest.updateMany({
        where: { id, storeId: actor.storeId, status: "REQUESTED", approvalFlowVersion: 2 },
        data: { status: "APPROVED", approvedById: actor.id, approvedByName: actor.name, approvedAt: now },
      });
      if (claimed.count !== 1) throw new FinalApprovalError("Daftar belanja sudah diproses. Muat ulang data terbaru.", 409);

      const purchase = await tx.goodsPurchase.create({
        data: {
          storeId: actor.storeId,
          number,
          sequence,
          shoppingRequestId: id,
          activeShoppingRequestKey: id,
          supplierId: request.supplierId,
          supplierNameSnapshot: request.supplier.name,
          totalAmount: totalAmount.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
          paymentMethod: payment.data.paymentMethod,
          paymentDueDate: payment.data.paymentDueDate ? new Date(`${payment.data.paymentDueDate}T00:00:00.000Z`) : null,
          createdById: actor.id,
          createdByName: actor.name,
          items: { create: createItems },
        },
        select: { id: true },
      });
      await finalizeGoodsPurchaseIfReady(tx, purchase.id, actor, now);
      return { shoppingRequestId: id, goodsPurchaseId: purchase.id };
    }, { timeout: 15_000 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new FinalApprovalError("Daftar belanja sudah diproses. Muat ulang data terbaru.", 409);
    }
    throw error;
  }
}
