import { createHash } from "node:crypto";
import { Prisma } from "@pos/db";
import { resolveGoodsPurchaseFulfillment } from "@/features/inventory-management/helpers/inbound-receipt-rules";
import { parseShoppingRequestCorrection } from "../helpers/shopping-request-correction-input";
import { ShoppingRequestCorrectionError } from "../services/shopping-request-correction-error";
import type { ShoppingRequestActor } from "../types/shopping-request";
import type { CorrectionPreview, CorrectionResult, ShoppingRequestCorrectionInput } from "../types/shopping-request-correction";
import { applyCorrectionFinance } from "./shopping-request-correction-finance";
import { planShoppingRequestCorrection } from "./shopping-request-correction-plan";
import { applyCorrectionStock } from "./shopping-request-correction-stock";
import { lockStockMutationRows } from "@/features/product-stock-groups/stock-group-lock";
import { loadCorrectionReceiptSources } from "./shopping-request-correction-receipt-sources";
import { resolveShoppingRequestName } from "../helpers/shopping-request-name";
import { prepareGroupPricingMutation } from "@/features/product-stock-groups/group-pricing-service";
import { applyCorrectionCatalog } from "./shopping-request-correction-catalog";

export async function commitShoppingRequestCorrectionRecord(
  tx: Prisma.TransactionClient,
  input: { requestId: string; actor: ShoppingRequestActor; data: ShoppingRequestCorrectionInput },
): Promise<CorrectionResult> {
  const storeId = input.actor.storeId;
  if (!storeId) throw new ShoppingRequestCorrectionError("Toko pengguna belum tersedia.", 403);
  const data = parseShoppingRequestCorrection(input.data);
  const fingerprint = createHash("sha256").update(JSON.stringify(data)).digest("hex");

  // Use the same store-first lock order as request creation so manual numbers
  // cannot race the monthly allocator.
  await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "pos_stores" WHERE "id" = ${storeId} FOR UPDATE
  `;
  // Serialize retries with corrections and deletion before looking for an audit.
  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "pos_shopping_requests"
    WHERE "id" = ${input.requestId} AND "storeId" = ${storeId} AND "status" <> 'CANCELLED'
    FOR UPDATE
  `;
  if (locked.length !== 1) throw new ShoppingRequestCorrectionError("Daftar belanja tidak tersedia di toko ini.", 404);
  const previous = await tx.shoppingRequestCorrection.findUnique({
    where: { storeId_shoppingRequestId_idempotencyKey: { storeId, shoppingRequestId: input.requestId, idempotencyKey: data.idempotencyKey } },
    select: { id: true, requestFingerprint: true, preview: true },
  });
  if (previous) {
    if (previous.requestFingerprint !== fingerprint) {
      throw new ShoppingRequestCorrectionError("Kunci koreksi sudah dipakai untuk perubahan lain.", 409);
    }
    return { requestId: input.requestId, correctionId: previous.id, preview: previous.preview as CorrectionPreview };
  }

  let plan = await planShoppingRequestCorrection(tx, { storeId, requestId: input.requestId, data });
  const productIds = [...new Set([...plan.editor.items, ...data.items].map((item) => item.productId))].sort();
  const hints = await tx.product.findMany({ where: { storeId, id: { in: productIds } }, select: { id: true, stockGroupId: true } });
  const stockGroupIds = [...new Set(hints.flatMap((product) => product.stockGroupId ? [product.stockGroupId] : []))].sort();
  const preparedPricing = data.catalog.length ? await prepareGroupPricingMutation(tx, { storeId, groupIds: stockGroupIds, extraProductIds: productIds }) : null;
  const locks = await lockStockMutationRows(tx, { storeId, productIds, stockGroupIds });
  const products = await tx.product.findMany({
    where: { storeId, id: { in: productIds } },
    select: { id: true, name: true, sku: true, unit: true, stock: true, stockGroupId: true, unitMultiplierToBase: true, costPrice: true },
  });
  if (locks.lockedProductIds.length !== productIds.length || locks.lockedStockGroupIds.length !== stockGroupIds.length ||
      products.some((product) => product.stockGroupId !== hints.find((hint) => hint.id === product.id)?.stockGroupId)) {
    throw new ShoppingRequestCorrectionError("Produk atau grup stok berubah. Muat ulang dan coba lagi.", 409);
  }
  // Recheck the editor version after waiting for stock locks, before writing any rows.
  plan = await planShoppingRequestCorrection(tx, { storeId, requestId: input.requestId, data });
  if (data.expectedPreviewVersion && data.expectedPreviewVersion !== plan.preview.version) {
    throw new ShoppingRequestCorrectionError("Data berubah setelah pratinjau. Tinjau dampak kembali sebelum menyimpan.", 409);
  }
  const productById = new Map(products.map((product) => [product.id, product]));
  const { editor } = plan;
  const itemWithoutReceipts = (item: ShoppingRequestCorrectionInput["items"][number]) => ({
    clientLineKey: item.clientLineKey, requestItemId: item.requestItemId, purchaseItemId: item.purchaseItemId,
    productId: item.productId, unit: item.unit,
  });
  const allocationKeys = (allocations: ShoppingRequestCorrectionInput["payment"]["allocations"]) =>
    allocations.map((entry) => JSON.stringify([entry.sourceKind, entry.paymentId, entry.method, entry.amount])).sort();
  const oldByKey = new Map(editor.items.map((item) => [item.clientLineKey, item]));
  const selectedKeys = new Set(data.items.map((item) => item.clientLineKey));
  if (data.items.some((item) => {
        const old = oldByKey.get(item.clientLineKey);
        if (!old) return Boolean(item.requestItemId || item.purchaseItemId) || item.unit !== productById.get(item.productId)?.unit;
        return JSON.stringify(itemWithoutReceipts(item)) !== JSON.stringify(itemWithoutReceipts(old)) ||
          (!item.requestItemId && (item.requestedQty !== old.requestedQty || item.approvedQty !== old.approvedQty));
      })) {
    throw new ShoppingRequestCorrectionError("Jenis perubahan ini belum dapat disimpan.", 409);
  }

  const audit = await tx.shoppingRequestCorrection.create({
    data: {
      storeId, shoppingRequestId: input.requestId, actorId: input.actor.id, actorName: input.actor.name,
      reason: data.reason, idempotencyKey: data.idempotencyKey, requestFingerprint: fingerprint,
      beforeSnapshot: editor as unknown as Prisma.InputJsonObject,
      afterSnapshot: { data: data as unknown as Prisma.InputJsonObject, paymentSnapshot: {
        sources: plan.paymentPlan.sources, allocations: plan.paymentPlan.allocations,
      } },
      preview: plan.preview as unknown as Prisma.InputJsonObject,
    },
    select: { id: true },
  });
  const resolvedName = resolveShoppingRequestName(data.header.name, data.header.number);
  if (data.header.number !== editor.header.number) {
    const occupied = await tx.shoppingRequest.findFirst({ where: { storeId, number: data.header.number, id: { not: input.requestId } }, select: { id: true } });
    if (occupied) throw new ShoppingRequestCorrectionError("Nomor daftar belanja sudah dipakai. Gunakan nomor lain.", 409);
  }
  const supplier = data.header.supplierId
    ? await tx.supplier.findFirst({ where: { id: data.header.supplierId, isActive: true }, select: { id: true, name: true } })
    : null;
  if (data.header.supplierId && !supplier) throw new ShoppingRequestCorrectionError("Pemasok tidak tersedia di toko ini.", 409);
  const updatedRequest = await tx.shoppingRequest.updateMany({
    where: { id: input.requestId, storeId, status: { not: "CANCELLED" } },
    data: { name: resolvedName.name, normalizedName: resolvedName.normalizedName, number: data.header.number,
      businessDate: new Date(`${data.header.businessDate}T00:00:00.000Z`), supplierId: supplier?.id ?? null,
      requestedByName: data.header.requestedByName, note: data.header.note },
  });
  if (updatedRequest.count !== 1) throw new ShoppingRequestCorrectionError("Daftar belanja berubah. Muat ulang dan coba lagi.", 409);
  const supplierName = data.header.supplierId !== editor.header.supplierId ? (supplier?.name ?? "Tanpa pemasok") : undefined;
  await tx.goodsPurchase.updateMany({ where: { id: editor.purchaseId, storeId, status: "APPROVED" }, data: { supplierId: supplier?.id ?? null, ...(supplierName !== undefined ? { supplierNameSnapshot: supplierName } : {}) } });
  await applyCorrectionCatalog(tx, { storeId, requestId: input.requestId, actor: input.actor, plan: plan.catalogPlan, prepared: preparedPricing });
  const addedIds = new Map<string, { requestItemId: string; purchaseItemId: string }>();
  for (const item of data.items.filter((entry) => !entry.purchaseItemId)) {
    const product = productById.get(item.productId)!;
    const previousItem = await tx.goodsPurchaseItem.findUnique({ where: { goodsPurchaseId_productId: { goodsPurchaseId: editor.purchaseId, productId: item.productId } } });
    if (previousItem && (!previousItem.removedAt || previousItem.unitSnapshot !== item.unit ||
        previousItem.unitMultiplierSnapshot !== (product.stockGroupId ? product.unitMultiplierToBase : 1))) {
      throw new ShoppingRequestCorrectionError("Barang atau konversi satuan berubah. Muat ulang dan coba lagi.", 409);
    }
    if (previousItem) {
      const sources = await loadCorrectionReceiptSources(tx, { storeId, purchaseId: editor.purchaseId });
      if (sources.find((source) => source.purchaseItemId === previousItem.id)?.receipts.some((receipt) => receipt.receivedQty !== 0)) {
        throw new ShoppingRequestCorrectionError("Penerimaan barang yang dihapus belum terselesaikan. Periksa riwayat barang.", 409);
      }
    }
    const historicalRequests = await tx.shoppingRequestItem.findMany({ where: { shoppingRequestId: input.requestId, productId: item.productId } });
    const requestItemId = previousItem?.shoppingRequestItemId ?? item.requestItemId;
    const requestItem = requestItemId ? historicalRequests.find((entry) => entry.id === requestItemId) : historicalRequests.length === 1 ? historicalRequests[0] : null;
    if ((requestItemId && !requestItem) || (!requestItemId && historicalRequests.length > 1) ||
        (requestItem && !requestItem.removedAt && requestItem.id !== item.requestItemId)) {
      throw new ShoppingRequestCorrectionError("Identitas barang daftar tidak dapat dipastikan. Muat ulang dan coba lagi.", 409);
    }
    const requestData = {
      productName: product.name, unit: item.unit, requestedQty: item.requestedQty, approvedQty: item.approvedQty,
      costPriceSnapshot: item.unitPrice, removedAt: null, decisionStatus: "APPROVED" as const,
      decidedById: input.actor.id, decidedByName: input.actor.name, decidedAt: new Date(),
    };
    const savedRequest = requestItem
      ? await tx.shoppingRequestItem.update({ where: { id: requestItem.id }, data: requestData })
      : await tx.shoppingRequestItem.create({ data: { ...requestData, shoppingRequestId: input.requestId, productId: product.id, stockOnHand: product.stock } });
    const purchaseData = {
      shoppingRequestItemId: savedRequest.id, quantity: item.orderedQty, latestUnitPrice: item.unitPrice,
      lineTotal: new Prisma.Decimal(item.unitPrice).mul(String(item.orderedQty)).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
      removedAt: null, reviewStatus: "APPROVED" as const, approvedById: input.actor.id, approvedByName: input.actor.name, approvedAt: new Date(),
    };
    const savedPurchase = previousItem
      ? await tx.goodsPurchaseItem.update({ where: { id: previousItem.id }, data: purchaseData })
      : await tx.goodsPurchaseItem.create({ data: {
        ...purchaseData, goodsPurchaseId: editor.purchaseId, productId: product.id,
        productNameSnapshot: product.name, skuSnapshot: product.sku, unitSnapshot: item.unit,
        unitMultiplierSnapshot: product.stockGroupId ? product.unitMultiplierToBase : 1, masterCostPriceSnapshot: product.costPrice,
      } });
    addedIds.set(item.clientLineKey, { requestItemId: savedRequest.id, purchaseItemId: savedPurchase.id });
  }
  for (const item of data.items.filter((entry) => entry.purchaseItemId)) {
    const old = oldByKey.get(item.clientLineKey)!;
    const priceChanged = !new Prisma.Decimal(item.unitPrice).equals(old.unitPrice);
    if (item.purchaseItemId && (priceChanged || item.orderedQty !== old.orderedQty)) {
      const updatedItem = await tx.goodsPurchaseItem.updateMany({
        where: { id: item.purchaseItemId, goodsPurchaseId: editor.purchaseId, productId: item.productId, removedAt: null },
        data: {
          latestUnitPrice: item.unitPrice, quantity: item.orderedQty,
          lineTotal: new Prisma.Decimal(item.unitPrice).mul(String(item.orderedQty)).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
        },
      });
      if (updatedItem.count !== 1) throw new ShoppingRequestCorrectionError("Barang pembelian berubah. Muat ulang dan coba lagi.", 409);
    }
    if (item.requestItemId && (priceChanged || item.requestedQty !== old.requestedQty || item.approvedQty !== old.approvedQty)) {
      const updatedItem = await tx.shoppingRequestItem.updateMany({
        where: { id: item.requestItemId, shoppingRequestId: input.requestId, productId: item.productId, removedAt: null },
        data: { requestedQty: item.requestedQty, approvedQty: item.approvedQty, ...(priceChanged ? { costPriceSnapshot: item.unitPrice } : {}) },
      });
      if (updatedItem.count !== 1) throw new ShoppingRequestCorrectionError("Barang daftar berubah. Muat ulang dan coba lagi.", 409);
    }
  }
  await applyCorrectionStock(tx, {
    storeId, requestId: input.requestId, correctionId: audit.id, actor: input.actor, reason: data.reason,
    changes: [...plan.receiptChanges.existing.map((change) => ({
      productId: change.productId, shoppingRequestItemId: change.requestItemId, goodsPurchaseItemId: change.purchaseItemId,
      receiptLineId: change.receiptLineId, oldReceivedQty: change.oldReceivedQty, newReceivedQty: change.newReceivedQty,
    })), ...plan.receiptChanges.added.map((change) => ({
      productId: change.productId, shoppingRequestItemId: addedIds.get(change.clientLineKey)!.requestItemId,
      goodsPurchaseItemId: addedIds.get(change.clientLineKey)!.purchaseItemId, receiptLineId: null,
      oldReceivedQty: 0, newReceivedQty: change.receivedQty,
    }))],
  });
  const removedAt = new Date();
  for (const item of editor.items.filter((entry) => !selectedKeys.has(entry.clientLineKey))) {
    if (item.purchaseItemId) {
      const updatedItem = await tx.goodsPurchaseItem.updateMany({
        where: { id: item.purchaseItemId, goodsPurchaseId: editor.purchaseId, productId: item.productId, removedAt: null }, data: { removedAt },
      });
      if (updatedItem.count !== 1) throw new ShoppingRequestCorrectionError("Barang pembelian berubah. Muat ulang dan coba lagi.", 409);
    }
    if (item.requestItemId) {
      const updatedItem = await tx.shoppingRequestItem.updateMany({
        where: { id: item.requestItemId, shoppingRequestId: input.requestId, productId: item.productId, removedAt: null }, data: { removedAt },
      });
      if (updatedItem.count !== 1) throw new ShoppingRequestCorrectionError("Barang daftar berubah. Muat ulang dan coba lagi.", 409);
    }
  }
  const receivedLines = data.items.map((item) => ({
    orderedQty: item.orderedQty,
    receivedQty: item.receipts.reduce((sum, receipt) => sum.plus(String(receipt.receivedQty)), new Prisma.Decimal(0)).toNumber(),
    unitPrice: item.unitPrice,
  }));
  await applyCorrectionFinance(tx, {
    storeId, purchaseId: editor.purchaseId, correctionId: audit.id, actorId: input.actor.id,
    lines: receivedLines.map(line => ({ ...line, receivedQty: plan.useReceived ? line.receivedQty : line.orderedQty })),
    totalBasis: plan.useReceived ? "RECEIVED" : "ORDERED", schedule: plan.data.payment.schedule,
    allocations: data.payment.allocations, corrections: data.payment.corrections,
    method: data.payment.method, dueDate: data.payment.dueDate ? new Date(`${data.payment.dueDate}T00:00:00.000Z`) : null,
    ...(data.header.businessDate !== editor.header.businessDate ? { businessDate: data.header.businessDate } : {}),
    ...(supplierName !== undefined ? { supplierName } : {}),
  });
  const fulfillmentStatus = resolveGoodsPurchaseFulfillment(receivedLines.map((line) => ({
    orderedQuantity: line.orderedQty, approvedReceivedQuantity: line.receivedQty,
  })));
  const updated = await tx.goodsPurchase.updateMany({
    where: { id: editor.purchaseId, storeId, status: "APPROVED" }, data: { fulfillmentStatus },
  });
  if (updated.count !== 1) throw new ShoppingRequestCorrectionError("Pembelian berubah. Muat ulang dan coba lagi.", 409);
  return { requestId: input.requestId, correctionId: audit.id, preview: plan.preview };
}
