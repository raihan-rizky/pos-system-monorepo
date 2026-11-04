import { randomUUID } from "node:crypto";
import { db, Prisma } from "@pos/db";
import {
  lockProductRow,
  lockProductStockGroupRow,
  lockStockMutationRows,
} from "@/features/product-stock-groups/stock-group-lock";
import { applyProductStockDelta } from "@/features/product-stock-groups/stock-mutations";
import {
  prepareGroupPricingMutation,
  synchronizeGroupPricingMutation,
} from "@/features/product-stock-groups/group-pricing-service";
import {
  decimalToRatio,
  divideRatios,
  initializeGroupPricing,
  multiplyRatios,
  roundMoney,
  type GroupPricingConfig,
} from "@/features/product-stock-groups/automatic-pricing";
import { buildProductPriceLogEntries } from "@/lib/product-price-logs/price-log-entries";
import {
  calculateInboundAvailability,
  getInboundStockQuantity,
} from "../helpers/inbound-receipt-rules";
import type {
  CreateInboundReceiptStockBundleInput,
  CreateInboundReceiptDraftInput,
  FinalizableInboundReceipt,
  GoodsPurchaseReceivingComparison,
  InboundReceiptStatus,
  InboundReceiptForApproval,
  InboundReceiptLineStatus,
  InboundPricingSnapshot,
  InboundPricingSingleSnapshot,
  InboundPricingCollectionUnit,
  InboundPricingUnit,
  InventoryInboundReceiptRepository as InventoryInboundReceiptRepositoryContract,
  LockedInboundStockGroup,
  LockedSubmittedInboundReceipt,
  ReceivingQueueRepositoryRow,
} from "../types/inventory-management";

type Tx = Prisma.TransactionClient;

const pricingUnitSelect = {
  id: true,
  storeId: true,
  unit: true,
  unitMultiplierToBase: true,
  conversionNeedsReview: true,
  isActive: true,
  costPrice: true,
  price: true,
  hargaAgen: true,
  hargaDinas: true,
} satisfies Prisma.ProductSelect;

const pricingProductSelect = {
  ...pricingUnitSelect,
  stockGroupId: true,
  imageUrl: true,
  stockGroup: {
    select: {
      baseUnit: true,
      pricingConfig: true,
      products: {
        orderBy: { id: "asc" },
        select: pricingUnitSelect,
      },
    },
  },
} satisfies Prisma.ProductSelect;

type PricingProduct = Prisma.ProductGetPayload<{ select: typeof pricingProductSelect }>;

function pricingUnitsForProduct(product: PricingProduct | null): InboundPricingUnit[] {
  if (!product) return [];
  const candidates = product.stockGroupId ? product.stockGroup?.products ?? [] : [product];
  let config: GroupPricingConfig | null = null;
  let invalidConfig = false;
  if (product.stockGroupId && product.stockGroup?.baseUnit) {
    try {
      config = initializeGroupPricing({
        groupId: product.stockGroupId,
        storeId: product.storeId,
        baseUnit: product.stockGroup.baseUnit,
        config: product.stockGroup.pricingConfig as GroupPricingConfig | null,
        members: candidates.filter((candidate) => candidate.storeId === product.storeId).map((candidate) => ({
          id: candidate.id, groupId: product.stockGroupId!, storeId: candidate.storeId,
          unit: candidate.unit, unitMultiplierToBase: candidate.unitMultiplierToBase,
          price: candidate.price.toString(), costPrice: candidate.costPrice?.toString() ?? null,
          isActive: candidate.isActive, conversionNeedsReview: candidate.conversionNeedsReview,
        })),
      }).config;
    } catch {
      invalidConfig = true;
    }
  }
  const automaticSource = candidates.find((candidate) => candidate.id === config?.sourceProductId && candidate.isActive &&
    !candidate.conversionNeedsReview && Number.isFinite(candidate.unitMultiplierToBase) && candidate.unitMultiplierToBase > 0);
  return candidates
    .filter((candidate) => candidate.storeId === product.storeId)
    .map((candidate) => ({
      productId: candidate.id,
      unit: candidate.unit,
      unitMultiplierToBase: candidate.unitMultiplierToBase,
      ...(automaticSource && candidate.id !== automaticSource.id && config?.members[candidate.id]?.mode === "AUTO" ? {
        autoCostSource: { productId: automaticSource.id, unit: automaticSource.unit, unitMultiplierToBase: automaticSource.unitMultiplierToBase },
      } : {}),
      costPrice: candidate.costPrice === null ? null : Number(candidate.costPrice.toString()),
      price: Number(candidate.price.toString()),
      hargaAgen: candidate.hargaAgen === null ? null : Number(candidate.hargaAgen.toString()),
      hargaDinas: candidate.hargaDinas === null ? null : Number(candidate.hargaDinas.toString()),
      isActive: candidate.isActive,
      conversionNeedsReview: invalidConfig || candidate.conversionNeedsReview,
      pricingMode: config?.members[candidate.id]?.mode ?? "MANUAL",
      pricingSourceProductId: config?.sourceProductId ?? null,
      pricingFactor: config?.members[candidate.id]?.factor ?? null,
      pricingConfigRevision: (product.stockGroup?.pricingConfig as GroupPricingConfig | null)?.revision ?? null,
    }));
}

export class InventoryInboundReceiptRepository
  implements InventoryInboundReceiptRepositoryContract
{
  async settleGoodsPurchasePayment(
    tx: Tx,
    input: {
      storeId: string;
      goodsPurchaseId: string;
      paymentMethod: "TRANSFER" | "GIRO" | null;
      paymentDueDate: Date | null;
      actor: { id: string; name?: string | null };
      now: Date;
    },
  ): Promise<void> {
    const purchase = await tx.goodsPurchase.findFirst({
      where: { id: input.goodsPurchaseId, storeId: input.storeId, status: "APPROVED" },
      select: {
        id: true, number: true, shoppingRequestId: true, supplierNameSnapshot: true,
        totalAmount: true, paymentMethod: true, paymentDueDate: true,
        expense: { select: { id: true } },
        shoppingRequest: { select: { expense: { select: { id: true } } } },
        _count: { select: { items: true } },
      },
    });
    if (!purchase) throw new Error("Pembelian Barang tidak tersedia.");
    const existingExpense = purchase.expense ?? purchase.shoppingRequest?.expense;
    const isNewGiro = !existingExpense && !purchase.paymentMethod && input.paymentMethod === "GIRO";
    if (!input.paymentMethod && !purchase.paymentMethod && !existingExpense) {
      throw new Error("Metode pembayaran belum diisi pada penerimaan barang.");
    }
    if (purchase.paymentMethod && input.paymentMethod &&
      (purchase.paymentMethod !== input.paymentMethod ||
        (purchase.paymentMethod === "GIRO" &&
          purchase.paymentDueDate?.toISOString().slice(0, 10) !== input.paymentDueDate?.toISOString().slice(0, 10)))) {
      throw new Error("Metode pembayaran pembelian telah berubah. Tolak penerimaan ini dan buat kembali dengan metode terbaru.");
    }
    if (!purchase.paymentMethod && input.paymentMethod) {
      await tx.goodsPurchase.update({
        where: { id: purchase.id },
        data: { paymentMethod: input.paymentMethod, paymentDueDate: input.paymentDueDate },
      });
    }
    if (!existingExpense) {
      await tx.expense.create({
        data: {
          storeId: input.storeId, recordedById: input.actor.id,
          shoppingRequestId: purchase.shoppingRequestId, goodsPurchaseId: purchase.id,
          applicantName: purchase.supplierNameSnapshot, category: "SUPPLIES",
          description: `Pembelian Barang ${purchase.number} - ${purchase._count.items} produk`,
          amount: purchase.totalAmount, changeAmount: 0, occurredAt: input.now,
          hasMissingCostSnapshot: false,
        },
      });
      if (isNewGiro) {
        const receiptDate = new Date(input.now.getTime() + 7 * 60 * 60 * 1000)
          .toISOString().slice(0, 10);
        await tx.supplierPayable.create({
          data: {
            id: randomUUID(),
            storeId: input.storeId,
            goodsPurchaseId: purchase.id,
            giroHistoryVerifiedAt: input.now,
            supplierName: purchase.supplierNameSnapshot,
            amount: purchase.totalAmount,
            debtDate: new Date(`${receiptDate}T00:00:00.000Z`),
            dueDate: input.paymentDueDate,
            createdById: input.actor.id,
          },
        });
      }
    }
  }

  runInTransaction<T>(callback: (tx: Tx) => Promise<T>): Promise<T> {
    return db.$transaction((tx) => callback(tx), { timeout: 60_000 });
  }

  async lockSubmittedReceipt(
    tx: Tx,
    input: { storeId: string; receiptId: string },
  ): Promise<LockedSubmittedInboundReceipt | null> {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "pos_inventory_inbound_receipts"
      WHERE "id" = ${input.receiptId}
        AND "storeId" = ${input.storeId}
        AND "status" = 'SUBMITTED'::"InventoryInboundReceiptStatus"
      FOR UPDATE
    `;
    if (locked.length !== 1) return null;

    return this.findReceiptForFinalization(tx, input);
  }

  async findReceiptForFinalization(
    tx: Tx,
    input: { storeId: string; receiptId: string },
  ): Promise<FinalizableInboundReceipt | null> {
    const receipt = await tx.inventoryInboundReceipt.findFirst({
      where: {
        id: input.receiptId,
        storeId: input.storeId,
        status: "SUBMITTED",
      },
      select: {
        id: true,
        storeId: true,
        status: true,
        goodsPurchaseId: true,
        paymentMethod: true,
        paymentDueDate: true,
        stockBundleId: true,
        supplierId: true,
        supplier: { select: { name: true } },
        goodsPurchase: {
          select: {
            number: true,
            supplierNameSnapshot: true,
          },
        },
        lines: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            updatedAt: true,
            productId: true,
            status: true,
            expectedQuantity: true,
            receivedQuantity: true,
            matchStatus: true,
            reviewStatus: true,
            approvedById: true,
            approvedByName: true,
            approvedAt: true,
            note: true,
            costPriceSnapshot: true,
            supplierCostPrice: true,
            pricingSnapshot: true,
            product: { include: { stockGroup: { select: { id: true, storeId: true, baseUnit: true, pricingConfig: true, products: { select: pricingUnitSelect } } } } },
            goodsPurchaseItem: {
              select: {
                id: true,
                goodsPurchaseId: true,
                productId: true,
                quantity: true,
                latestUnitPrice: true,
                inboundReceiptLines: {
                  where: {
                    receiptId: { not: input.receiptId },
                    receipt: {
                      storeId: input.storeId,
                      status: "APPROVED",
                    },
                  },
                  select: {
                    status: true,
                    receivedQuantity: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!receipt) return null;

    return {
      id: receipt.id,
      storeId: receipt.storeId,
      status: "SUBMITTED",
      goodsPurchaseId: receipt.goodsPurchaseId,
      paymentMethod: receipt.paymentMethod,
      paymentDueDate: receipt.paymentDueDate,
      goodsPurchaseNumber: receipt.goodsPurchase?.number ?? null,
      stockBundleId: receipt.stockBundleId,
      supplierId: receipt.supplierId,
      supplierName:
        receipt.goodsPurchase?.supplierNameSnapshot ??
        receipt.supplier?.name ??
        "Supplier",
      lines: receipt.lines.map((line) => ({
        id: line.id,
        updatedAt: line.updatedAt,
        productId: line.productId,
        status: line.status,
        expectedQuantity: line.expectedQuantity,
        receivedQuantity: line.receivedQuantity,
        matchStatus: line.matchStatus,
        reviewStatus: line.reviewStatus,
        approvedById: line.approvedById,
        approvedByName: line.approvedByName,
        approvedAt: line.approvedAt,
        note: line.note,
        costPriceSnapshot:
          line.costPriceSnapshot === null
            ? null
            : Number(line.costPriceSnapshot.toString()),
        supplierCostPrice:
          line.supplierCostPrice === null
            ? null
            : Number(line.supplierCostPrice.toString()),
        pricingSnapshot: line.pricingSnapshot as unknown as InboundPricingSnapshot | null,
        pricingUnits: pricingUnitsForProduct(line.product),
        product: line.product,
        stockGroupId: line.product.stockGroupId,
        unitMultiplierToBase: line.product.unitMultiplierToBase,
        conversionNeedsReview: line.product.conversionNeedsReview,
        goodsPurchaseItem: line.goodsPurchaseItem
          ? {
              id: line.goodsPurchaseItem.id,
              goodsPurchaseId: line.goodsPurchaseItem.goodsPurchaseId,
              productId: line.goodsPurchaseItem.productId,
              quantity: line.goodsPurchaseItem.quantity,
              latestUnitPrice: Number(
                line.goodsPurchaseItem.latestUnitPrice.toString(),
              ),
            }
          : null,
        approvedReceivedExcludingCurrentReceipt:
          line.goodsPurchaseItem?.inboundReceiptLines.reduce(
            (sum, approvedLine) =>
              sum +
              getInboundStockQuantity({
                status: approvedLine.status,
                receivedQuantity: approvedLine.receivedQuantity,
              }),
            0,
          ) ?? 0,
      })),
    };
  }

  async approveReceiptLine(
    tx: Tx,
    input: {
      storeId: string;
      receiptId: string;
      itemId: string;
      reviewStatus: "APPROVED";
      approvedById: string;
      approvedByName: string | null;
      approvedAt: Date;
    },
  ): Promise<void> {
    const updated = await tx.inventoryInboundReceiptLine.updateMany({
      where: {
        id: input.itemId,
        receiptId: input.receiptId,
        receipt: {
          storeId: input.storeId,
          status: "SUBMITTED",
        },
      },
      data: {
        reviewStatus: input.reviewStatus,
        approvedById: input.approvedById,
        approvedByName: input.approvedByName,
        approvedAt: input.approvedAt,
      },
    });
    if (updated.count !== 1) {
      throw new Error("INBOUND_RECEIPT_CONFLICT");
    }
  }

  async updateReceiptLine(
    tx: Tx,
    input: {
      storeId: string;
      receiptId: string;
      itemId: string;
      matchStatus: "MATCHED" | "MISMATCHED";
      receivedQuantity: number;
      note: string | null;
      supplierCostPrice?: number | null;
      pricingSnapshot?: InboundPricingSnapshot | null;
      reviewStatus: "PENDING";
      approvedById: null;
      approvedByName: null;
      approvedAt: null;
    },
  ): Promise<void> {
    const updated = await tx.inventoryInboundReceiptLine.updateMany({
      where: {
        id: input.itemId,
        receiptId: input.receiptId,
        receipt: {
          storeId: input.storeId,
          status: "SUBMITTED",
        },
      },
      data: {
        matchStatus: input.matchStatus,
        receivedQuantity: input.receivedQuantity,
        receivedQuantitySnapshot: input.receivedQuantity,
        note: input.note,
        ...(input.supplierCostPrice !== undefined
          ? { supplierCostPrice: input.supplierCostPrice }
          : {}),
        ...(input.pricingSnapshot !== undefined
          ? { pricingSnapshot: input.pricingSnapshot === null ? Prisma.DbNull : input.pricingSnapshot as unknown as Prisma.InputJsonValue }
          : {}),
        reviewStatus: input.reviewStatus,
        approvedById: input.approvedById,
        approvedByName: input.approvedByName,
        approvedAt: input.approvedAt,
      },
    });
    if (updated.count !== 1) {
      throw new Error("INBOUND_RECEIPT_CONFLICT");
    }
  }

  async applyInboundPricing(
    tx: Tx,
    input: {
      storeId: string;
      receiptId: string;
      actor: { id: string; name?: string | null };
      lines: Array<{ productId: string; stockGroupId: string | null; pricing: InboundPricingSnapshot }>;
    },
  ): Promise<void> {
    await tx.$executeRaw`SET LOCAL lock_timeout = '2s'`;
    const groupedIds = [...new Set(input.lines.flatMap((line) => line.stockGroupId ? [line.stockGroupId] : []))].sort();
    const standaloneIds = input.lines.filter((line) => !line.stockGroupId).map((line) => line.productId);
    const prepared = await prepareGroupPricingMutation(tx, {
      storeId: input.storeId,
      groupIds: groupedIds,
      extraProductIds: standaloneIds,
    });
    type Entry = { productId: string; stockGroupId: string | null; pricing: InboundPricingSingleSnapshot; collection?: InboundPricingCollectionUnit };
    const entries: Entry[] = [];
    for (const line of input.lines) {
      if (line.pricing.version === 1) {
        entries.push({ ...line, pricing: line.pricing });
        continue;
      }
      const group = line.stockGroupId ? prepared.before.get(line.stockGroupId) : null;
      const expected = group ? group.members.filter((member) => member.isActive && !member.conversionNeedsReview && Number(member.unitMultiplierToBase) > 0).map((member) => member.id) : [line.productId];
      const actual = line.pricing.units.map((unit) => unit.productId);
      if (actual.length !== expected.length || new Set(actual).size !== actual.length || expected.some((id) => !actual.includes(id))) {
        throw new Error("Daftar satuan produk berubah. Periksa kembali penerimaan ini.");
      }
      for (const unit of line.pricing.units) entries.push({
        productId: line.productId, stockGroupId: line.stockGroupId, collection: unit,
        pricing: { version: 1, ...unit, orderedUnitMultiplierToBase: line.pricing.orderedUnitMultiplierToBase },
      });
    }

    const selected = new Map<string, Entry>();
    const groupIntents = new Map<string, Map<string, { productId: string; price?: string; costPrice?: string | null }>>();
    const orderedLines = entries.sort((left, right) => {
      const isSource = (line: Entry) => {
        const group = line.stockGroupId ? prepared.before.get(line.stockGroupId) : null;
        return group && initializeGroupPricing(group).config.sourceProductId === line.pricing.productId ? 0 : 1;
      };
      return isSource(left) - isSource(right);
    });
    for (const line of orderedLines) {
      const { pricing, collection } = line;
      if (!pricing.productId || pricing.price === null || pricing.unitMultiplierToBase === null ||
        (!collection && (pricing.costPrice === null || pricing.hargaAgen === null || pricing.hargaDinas === null))) {
        throw new Error("Satuan dan harga produk belum lengkap.");
      }

      const before = await tx.product.findFirst({ where: { id: pricing.productId, storeId: input.storeId, isActive: true } });
      if (!before) throw new Error("Satuan produk sudah tidak tersedia.");
      const money = (value: unknown) => value === null ? null : Number(value);
      if (collection && (money(before.costPrice) !== collection.original.costPrice || money(before.price) !== collection.original.price ||
        money(before.hargaAgen) !== collection.original.hargaAgen || money(before.hargaDinas) !== collection.original.hargaDinas)) {
        throw new Error("Harga produk berubah. Periksa kembali penerimaan ini.");
      }

      if (!line.stockGroupId) {
        if (before.stockGroupId || pricing.productId !== line.productId || pricing.unitMultiplierToBase !== pricing.orderedUnitMultiplierToBase ||
          before.unit !== pricing.unit || before.conversionNeedsReview || before.unitMultiplierToBase !== pricing.unitMultiplierToBase) {
          throw new Error("Satuan atau konversi produk berubah. Periksa kembali penerimaan ini.");
        }
      } else {
        const group = prepared.before.get(line.stockGroupId);
        const ordered = group?.members.find((member) => member.id === line.productId);
        const member = group?.members.find((candidate) => candidate.id === pricing.productId);
        if (!group || !ordered || !ordered.isActive || ordered.conversionNeedsReview || !member || !member.isActive || member.conversionNeedsReview ||
          Number(member.unitMultiplierToBase) !== pricing.unitMultiplierToBase ||
          Number(ordered.unitMultiplierToBase) !== pricing.orderedUnitMultiplierToBase || member.unit !== pricing.unit) {
          throw new Error("Satuan atau konversi produk berubah. Periksa kembali penerimaan ini.");
        }
        const config = initializeGroupPricing(group).config;
        const isFollower = config.sourceProductId !== member.id && config.members[member.id]?.mode === "AUTO";
        if (collection && (collection.pricingConfigRevision !== (group.config?.revision ?? null) ||
          collection.pricingMode !== (config.members[member.id]?.mode ?? "MANUAL") || collection.pricingSourceProductId !== config.sourceProductId)) {
          throw new Error("Aturan harga produk berubah. Periksa kembali penerimaan ini.");
        }
        const source = group.members.find((candidate) => candidate.id === config.sourceProductId && candidate.isActive);
        const costProduct = isFollower ? source : member;
        if (!costProduct || costProduct.conversionNeedsReview || Number(costProduct.unitMultiplierToBase) <= 0) {
          throw new Error("Acuan HPP otomatis perlu ditinjau sebelum penerimaan disetujui.");
        }
        const intents = groupIntents.get(group.groupId) ?? new Map();
        if (!collection || (!isFollower && collection.costPrice !== collection.original.costPrice)) {
          const costPrice = pricing.costPrice === null ? null : isFollower
            ? roundMoney(multiplyRatios(decimalToRatio(pricing.costPrice), divideRatios(decimalToRatio(costProduct.unitMultiplierToBase), decimalToRatio(member.unitMultiplierToBase))))
            : pricing.costPrice.toFixed(2);
          const costIntent = intents.get(costProduct.id) ?? { productId: costProduct.id };
          if (costIntent.costPrice !== undefined && costIntent.costPrice !== costPrice) throw new Error("HPP satuan otomatis pada penerimaan ini saling berbeda.");
          costIntent.costPrice = costPrice;
          intents.set(costProduct.id, costIntent);
        }
        if (!collection || collection.priceEdited) {
          const memberIntent = intents.get(member.id) ?? { productId: member.id };
          memberIntent.price = pricing.price.toFixed(2);
          intents.set(member.id, memberIntent);
        }
        if (intents.size) groupIntents.set(group.groupId, intents);
      }
      const existing = selected.get(pricing.productId);
      if (existing && (existing.pricing.costPrice !== pricing.costPrice || existing.pricing.price !== pricing.price ||
        existing.pricing.hargaAgen !== pricing.hargaAgen || existing.pricing.hargaDinas !== pricing.hargaDinas ||
        existing.collection?.priceEdited !== collection?.priceEdited)) {
        throw new Error("Harga untuk satu satuan berbeda pada penerimaan ini.");
      }
      selected.set(pricing.productId, line);
    }

    const note = `Penerimaan barang ${input.receiptId}`;
    if (groupIntents.size) {
      await synchronizeGroupPricingMutation(tx, {
        prepared: { ...prepared, before: new Map([...prepared.before].filter(([id]) => groupIntents.has(id))) },
        changes: Object.fromEntries([...groupIntents].map(([groupId, intents]) => [groupId, { members: [...intents.values()] }])),
        actor: input.actor,
        source: "SYSTEM",
        note,
      });
    }

    for (const [productId, selectedLine] of selected) {
      const pricing = selectedLine.pricing;
      const before = await tx.product.findFirst({ where: { id: productId, storeId: input.storeId, isActive: true } });
      if (!before) throw new Error("Satuan produk sudah tidak tersedia.");
      if (!before.stockGroupId && (before.unit !== pricing.unit || before.conversionNeedsReview ||
        before.unitMultiplierToBase !== pricing.unitMultiplierToBase)) {
        throw new Error("Satuan atau konversi produk berubah. Periksa kembali penerimaan ini.");
      }
      if (before.stockGroupId) {
        if ((before.costPrice === null ? null : Number(before.costPrice)) !== pricing.costPrice) {
          throw new Error("HPP satuan tidak dapat diwakili tepat oleh aturan harga otomatis. Periksa kembali nilainya.");
        }
        if (Number(before.price) !== pricing.price) {
          throw new Error("Harga jual tidak dapat diwakili tepat oleh aturan harga otomatis. Periksa kembali nilainya.");
        }
      }
      const after = await tx.product.update({
        where: { id: productId },
        data: {
          ...(!before.stockGroupId ? { costPrice: pricing.costPrice, price: pricing.price! } : {}),
          hargaAgen: pricing.hargaAgen,
          hargaDinas: pricing.hargaDinas,
        },
      });
      const logs = buildProductPriceLogEntries({
        productId,
        storeId: input.storeId,
        before,
        after,
        actor: input.actor,
        source: "SYSTEM",
        note,
      }).filter((entry) => !before.stockGroupId || entry.field === "HARGA_AGEN" || entry.field === "HARGA_DINAS");
      if (logs.length) await tx.productPriceLog.createMany({ data: logs });
    }
  }

  async removeReceiptLine(
    tx: Tx,
    input: { storeId: string; receiptId: string; itemId: string },
  ): Promise<void> {
    const deleted = await tx.inventoryInboundReceiptLine.deleteMany({
      where: {
        id: input.itemId,
        receiptId: input.receiptId,
        receipt: {
          storeId: input.storeId,
          status: "SUBMITTED",
        },
      },
    });
    if (deleted.count !== 1) {
      throw new Error("INBOUND_RECEIPT_CONFLICT");
    }
  }

  async findReceiptForApproval(
    tx: Tx,
    input: { storeId: string; receiptId: string },
  ): Promise<InboundReceiptForApproval | null> {
    const receipt = await tx.inventoryInboundReceipt.findFirst({
      where: { id: input.receiptId, storeId: input.storeId },
      select: {
        id: true,
        storeId: true,
        supplierId: true,
        goodsPurchaseId: true,
        status: true,
        lines: {
          select: {
            id: true,
            productId: true,
            status: true,
            receivedQuantity: true,
            product: {
              select: {
                isActive: true,
                costPrice: true,
              },
            },
          },
        },
      },
    });
    if (!receipt) return null;

    return {
      id: receipt.id,
      storeId: receipt.storeId,
      supplierId: receipt.supplierId,
      goodsPurchaseId: receipt.goodsPurchaseId,
      status: receipt.status,
      lines: receipt.lines.map((line) => ({
        id: line.id,
        productId: line.productId,
        status: line.status,
        receivedQuantity: line.receivedQuantity,
        latestCostPrice:
          line.product.costPrice === null
            ? null
            : Number(line.product.costPrice.toString()),
        productIsActive: line.product.isActive,
      })),
    };
  }

  async createInboundStockLog(
    tx: Tx,
    input: {
      productId: string;
      quantity: number;
      unitCost: number;
      supplierId?: string | null;
      createdBy: string;
      person: string | null;
      note: string | null;
    },
  ): Promise<{ id: string }> {
    return tx.inventoryLog.create({
      data: {
        productId: input.productId,
        type: "IN",
        reason: "RESTOCK",
        supplierId: input.supplierId ?? null,
        quantity: input.quantity,
        unitCost: input.unitCost,
        note: input.note,
        createdBy: input.createdBy,
        person: input.person,
        status: "APPROVED",
        approvedBy: input.createdBy,
        approverName: input.person,
        decidedAt: new Date(),
      },
      select: { id: true },
    });
  }

  applyProductStockDelta(
    tx: Tx,
    input: { storeId: string; productId: string; delta: number },
  ): Promise<unknown> {
    return applyProductStockDelta(tx, input);
  }

  async lockStockGroup(
    tx: Tx,
    input: { storeId: string; stockGroupId: string },
  ): Promise<LockedInboundStockGroup | null> {
    const locked = await lockProductStockGroupRow(tx, input);
    if (!locked) return null;

    const groupHint = await tx.productStockGroup.findFirst({
      where: {
        id: input.stockGroupId,
        storeId: input.storeId,
      },
      include: {
        products: {
          where: {
            storeId: input.storeId,
            isActive: true,
          },
          orderBy: { id: "asc" },
        },
      },
    });
    if (!groupHint) return null;

    const candidateProductIds = groupHint.products
      .map((product) => product.id)
      .sort((left, right) => left.localeCompare(right));
    const locks = await lockStockMutationRows(tx, {
      storeId: input.storeId,
      stockGroupIds: [],
      productIds: candidateProductIds,
    });
    if (locks.lockedProductIds.length !== candidateProductIds.length) {
      return null;
    }

    const group = await tx.productStockGroup.findFirst({
      where: {
        id: input.stockGroupId,
        storeId: input.storeId,
      },
      include: {
        products: {
          where: {
            storeId: input.storeId,
            isActive: true,
          },
          orderBy: { id: "asc" },
        },
      },
    });
    if (!group) return null;

    const currentProductIds = group.products
      .map((product) => product.id)
      .sort((left, right) => left.localeCompare(right));
    if (
      currentProductIds.length !== candidateProductIds.length ||
      currentProductIds.some(
        (productId, index) => productId !== candidateProductIds[index],
      ) ||
      group.products.some(
        (product) => product.stockGroupId !== input.stockGroupId,
      )
    ) {
      return null;
    }

    return {
      id: group.id,
      storeId: group.storeId,
      baseStock: group.baseStock,
      variants: group.products,
    };
  }

  async incrementStockGroupBase(
    tx: Tx,
    input: {
      storeId: string;
      stockGroupId: string;
      baseDelta: number;
    },
  ): Promise<void> {
    const updated = await tx.productStockGroup.updateMany({
      where: {
        id: input.stockGroupId,
        storeId: input.storeId,
      },
      data: {
        baseStock: { increment: input.baseDelta },
      },
    });
    if (updated.count !== 1) {
      throw new Error("INBOUND_RECEIPT_CONFLICT");
    }
  }

  async incrementStandaloneProductStock(
    tx: Tx,
    input: {
      storeId: string;
      productId: string;
      quantity: number;
    },
  ) {
    const locked = await lockProductRow(tx, input);
    if (!locked) {
      throw new Error("INBOUND_RECEIPT_CONFLICT");
    }

    const product = await tx.product.findFirst({
      where: {
        id: input.productId,
        storeId: input.storeId,
        stockGroupId: null,
        isActive: true,
      },
    });
    if (!product) {
      throw new Error("INBOUND_RECEIPT_CONFLICT");
    }

    const mutation = await applyProductStockDelta(tx, {
      storeId: input.storeId,
      productId: input.productId,
      delta: input.quantity,
      productInfo: {
        id: product.id,
        stock: product.stock,
        stockGroupId: null,
        unitMultiplierToBase: product.unitMultiplierToBase,
        conversionNeedsReview: product.conversionNeedsReview,
        stockGroup: null,
      },
    });

    return {
      product,
      beforeStock: mutation.beforeStock,
      afterStock: mutation.afterStock,
    };
  }

  async createCanonicalInventoryLog(
    tx: Tx,
    input: {
      productId: string;
      supplierId: string | null;
      type: "IN";
      reason: "RESTOCK";
      quantity: number;
      unitCost: number;
      note: string;
      createdBy: string;
      person: string | null;
      status: "APPROVED";
      approvedBy: string;
      approverName: string | null;
      decidedAt: Date;
    },
  ): Promise<{ id: string }> {
    return tx.inventoryLog.create({
      data: input,
      select: { id: true },
    });
  }

  async createReceiptStockBundle(
    tx: Tx,
    input: CreateInboundReceiptStockBundleInput,
  ): Promise<{ id: string }> {
    const stockGroupIds = Array.from(
      new Set(
        input.variantImpacts.flatMap((impact) =>
          impact.stockGroupId ? [impact.stockGroupId] : [],
        ),
      ),
    );
    const batch = await tx.batchOperation.create({
      data: {
        type: input.type,
        status: input.status,
        storeId: input.storeId,
        createdBy: input.createdBy,
        summary: {
          source: "INBOUND_RECEIPT",
          title: input.title,
          receiptId: input.receiptId,
          goodsPurchaseId: input.goodsPurchaseId,
          goodsPurchaseNumber: input.goodsPurchaseNumber,
          supplierId: input.supplierId,
          supplierName: input.supplierName,
          type: "IN",
          totalCount: input.canonicalImpacts.length,
          approvedCount: input.canonicalImpacts.length,
          pendingCount: 0,
          rejectedCount: 0,
          stockGroupCount: stockGroupIds.length,
          variantImpactCount: input.variantImpacts.length,
          approvedByName: input.approvedByName,
          approvedAt: input.approvedAt.toISOString(),
        },
      },
      select: { id: true },
    });

    const items: Prisma.BatchOperationItemCreateManyInput[] = [
      ...input.canonicalImpacts.map((impact) => ({
        batchOperationId: batch.id,
        productId: impact.productId,
        sku: impact.sku,
        action: "STOCK_IN" as const,
        beforeSnapshot:
          impact.beforeSnapshot as unknown as Prisma.InputJsonValue,
        afterSnapshot:
          impact.afterSnapshot as unknown as Prisma.InputJsonValue,
        inventoryLogId: impact.inventoryLogId,
      })),
      ...input.variantImpacts.map((impact) => ({
        batchOperationId: batch.id,
        productId: impact.productId,
        sku: impact.sku,
        action: "STOCK_IN" as const,
        beforeSnapshot:
          impact.beforeSnapshot as unknown as Prisma.InputJsonValue,
        afterSnapshot:
          impact.afterSnapshot as unknown as Prisma.InputJsonValue,
        inventoryLogId: null,
      })),
    ];
    if (items.length > 0) {
      await tx.batchOperationItem.createMany({ data: items });
    }

    return batch;
  }

  async listGoodsPurchaseFulfillmentItems(
    tx: Tx,
    input: { storeId: string; goodsPurchaseId: string },
  ) {
    const items = await tx.goodsPurchaseItem.findMany({
      where: {
        goodsPurchaseId: input.goodsPurchaseId,
        goodsPurchase: {
          storeId: input.storeId,
          status: "APPROVED",
        },
      },
      select: {
        quantity: true,
        inboundReceiptLines: {
          where: {
            receipt: {
              storeId: input.storeId,
              goodsPurchaseId: input.goodsPurchaseId,
              status: "APPROVED",
            },
          },
          select: {
            status: true,
            receivedQuantity: true,
          },
        },
      },
    });

    return items.map((item) => ({
      orderedQuantity: item.quantity,
      approvedReceivedQuantity: item.inboundReceiptLines.reduce(
        (sum, line) =>
          sum +
          getInboundStockQuantity({
            status: line.status,
            receivedQuantity: line.receivedQuantity,
          }),
        0,
      ),
    }));
  }

  async updateGoodsPurchaseFulfillment(
    tx: Tx,
    input: {
      storeId: string;
      goodsPurchaseId: string;
      fulfillmentStatus: "NOT_RECEIVED" | "PARTIALLY_RECEIVED" | "RECEIVED";
    },
  ): Promise<void> {
    const updated = await tx.goodsPurchase.updateMany({
      where: {
        id: input.goodsPurchaseId,
        storeId: input.storeId,
        status: "APPROVED",
      },
      data: {
        fulfillmentStatus: input.fulfillmentStatus,
      },
    });
    if (updated.count !== 1) {
      throw new Error("INBOUND_RECEIPT_CONFLICT");
    }
  }

  async markReceiptApproved(
    tx: Tx,
    input: {
      storeId: string;
      receiptId: string;
      approvedBy: string;
      approvedAt: Date;
      stockBundleId?: string;
      zeroQuantityGoodsPurchaseId?: string;
      legacyOnly?: boolean;
      lineLogIds: Array<{
        lineId: string;
        inventoryLogId: string;
        unitCost?: number;
      }>;
    },
  ) {
    const updated = await tx.inventoryInboundReceipt.updateMany({
      where: {
        id: input.receiptId,
        storeId: input.storeId,
        status: "SUBMITTED",
        ...(input.legacyOnly || (!input.stockBundleId && !input.zeroQuantityGoodsPurchaseId)
          ? { goodsPurchaseId: null }
          : !input.stockBundleId && input.zeroQuantityGoodsPurchaseId
            ? {
                goodsPurchaseId: input.zeroQuantityGoodsPurchaseId,
                stockBundleId: null,
                lines: { some: {}, every: { receivedQuantity: 0 } },
              }
            : {}),
      },
      data: {
        status: "APPROVED",
        approvedBy: input.approvedBy,
        approvedAt: input.approvedAt,
        ...(input.stockBundleId
          ? { stockBundleId: input.stockBundleId }
          : {}),
      },
    });
    if (updated.count !== 1) {
      throw new Error("INBOUND_RECEIPT_CONFLICT");
    }

    for (const line of input.lineLogIds) {
      const updatedLine = await tx.inventoryInboundReceiptLine.updateMany({
        where: {
          id: line.lineId,
          receiptId: input.receiptId,
        },
        data: {
          inventoryLogId: line.inventoryLogId,
          ...(line.unitCost === undefined
            ? {}
            : { costPriceApplied: line.unitCost }),
        },
      });
      if (updatedLine.count !== 1) {
        throw new Error("INBOUND_RECEIPT_CONFLICT");
      }
    }

    return { id: input.receiptId, status: "APPROVED" as const };
  }

  async markReceiptRejected(
    tx: Tx,
    input: {
      storeId: string;
      receiptId: string;
      rejectedBy: string;
      rejectionReason: string;
    },
  ) {
    const updated = await tx.inventoryInboundReceipt.updateMany({
      where: {
        id: input.receiptId,
        storeId: input.storeId,
        status: "SUBMITTED",
      },
      data: {
        status: "REJECTED",
        approvedBy: input.rejectedBy,
        approvedAt: new Date(),
        rejectionReason: input.rejectionReason,
      },
    });
    if (updated.count !== 1) {
      throw new Error("INBOUND_RECEIPT_CONFLICT");
    }
    return { id: input.receiptId, status: "REJECTED" as const };
  }

  async markReceiptNeedsRevision(
    tx: Tx,
    input: {
      storeId: string;
      receiptId: string;
      revisedBy: string;
      revisionReason: string;
    },
  ) {
    const updated = await tx.inventoryInboundReceipt.updateMany({
      where: {
        id: input.receiptId,
        storeId: input.storeId,
        status: "SUBMITTED",
        goodsPurchaseId: null,
      },
      data: {
        status: "NEEDS_REVISION",
        approvedBy: input.revisedBy,
        approvedAt: new Date(),
        revisionReason: input.revisionReason,
      },
    });
    if (updated.count !== 1) {
      throw new Error("INBOUND_RECEIPT_CONFLICT");
    }
    return { id: input.receiptId, status: "NEEDS_REVISION" as const };
  }

  async markReceiptSubmitted(
    tx: Tx,
    input: {
      storeId: string;
      receiptId: string;
      submittedBy: string;
      submittedAt: Date;
    },
  ) {
    const updated = await tx.inventoryInboundReceipt.updateMany({
      where: {
        id: input.receiptId,
        storeId: input.storeId,
        status: { in: ["DRAFT", "NEEDS_REVISION"] },
        goodsPurchaseId: null,
      },
      data: {
        status: "SUBMITTED",
        submittedBy: input.submittedBy,
        submittedAt: input.submittedAt,
      },
    });
    if (updated.count !== 1) {
      throw new Error("INBOUND_RECEIPT_CONFLICT");
    }
    return { id: input.receiptId, status: "SUBMITTED" as const };
  }

  async findReceiptForEdit(
    tx: Tx,
    input: { storeId: string; receiptId: string },
  ) {
    const receipt = await tx.inventoryInboundReceipt.findFirst({
      where: { id: input.receiptId, storeId: input.storeId },
      select: {
        id: true,
        storeId: true,
        status: true,
        submittedBy: true,
        goodsPurchaseId: true,
      },
    });
    if (!receipt) return null;
    return receipt;
  }

  async updateReceiptDraft(
    tx: Tx,
    input: {
      storeId: string;
      receiptId: string;
      note?: string | null;
      lines: Array<{
        id: string;
        productId: string;
        expectedQuantity: number;
        receivedQuantity: number;
        status: InboundReceiptLineStatus;
        note?: string | null;
      }>;
    },
  ) {
    const updatedReceipt = await tx.inventoryInboundReceipt.updateMany({
      where: {
        id: input.receiptId,
        storeId: input.storeId,
        status: { in: ["DRAFT", "NEEDS_REVISION"] },
        goodsPurchaseId: null,
      },
      data: {
        note: input.note ?? null,
      },
    });
    if (updatedReceipt.count !== 1) {
      throw new Error("INBOUND_RECEIPT_CONFLICT");
    }

    for (const line of input.lines) {
      const updatedLine = await tx.inventoryInboundReceiptLine.updateMany({
        where: {
          id: line.id,
          receiptId: input.receiptId,
          productId: line.productId,
        },
        data: {
          status: line.status,
          expectedQuantity: line.expectedQuantity,
          receivedQuantity: line.receivedQuantity,
          expectedQuantitySnapshot: line.expectedQuantity,
          receivedQuantitySnapshot: line.receivedQuantity,
          note: line.note ?? null,
        },
      });
      if (updatedLine.count !== 1) {
        throw new Error("INBOUND_RECEIPT_CONFLICT");
      }
    }

    return { id: input.receiptId, status: "NEEDS_REVISION" as const };
  }

  async createInboundReceiptDraft(
    tx: Tx,
    input: CreateInboundReceiptDraftInput,
  ) {
    const productIds = Array.from(new Set(input.lines.map((line) => line.productId)));
    const products = await tx.product.findMany({
      where: {
        id: { in: productIds },
        storeId: input.storeId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        sku: true,
        unit: true,
        costPrice: true,
      },
    });
    const productById = new Map(products.map((product) => [product.id, product]));
    if (productById.size !== productIds.length) {
      throw new Error("INBOUND_RECEIPT_PRODUCT_NOT_FOUND");
    }

    const supplier = input.supplierId
      ? await tx.supplier.findFirst({
          where: { id: input.supplierId },
          select: { name: true },
        })
      : null;

    const receipt = await tx.inventoryInboundReceipt.create({
      data: {
        storeId: input.storeId,
        supplierId: input.supplierId ?? null,
        shoppingRequestId: input.shoppingRequestId ?? null,
        status: "DRAFT",
        note: input.note ?? null,
        submittedBy: input.createdBy,
        lines: {
          create: input.lines.map((line) => {
            const product = productById.get(line.productId);
            if (!product) throw new Error("INBOUND_RECEIPT_PRODUCT_NOT_FOUND");
            const costPrice =
              product.costPrice === null
                ? null
                : Number(product.costPrice.toString());
            return {
              productId: line.productId,
              shoppingRequestItemId: line.shoppingRequestItemId ?? null,
              status: line.status,
              expectedQuantity: line.expectedQuantity,
              receivedQuantity: line.receivedQuantity,
              expectedQuantitySnapshot: line.expectedQuantity,
              receivedQuantitySnapshot: line.receivedQuantity,
              productNameSnapshot: product.name,
              skuSnapshot: product.sku,
              unitSnapshot: product.unit,
              costPriceSnapshot: costPrice,
              supplierNameSnapshot: supplier?.name ?? null,
              invoiceNumberSnapshot: input.shoppingRequestId ?? null,
              note: line.note ?? null,
            };
          }),
        },
      },
      select: { id: true, status: true },
    });

    return { id: receipt.id, status: receipt.status };
  }

  async lockGoodsPurchase(
    tx: Tx,
    input: { storeId: string; goodsPurchaseId: string },
  ): Promise<boolean> {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "pos_goods_purchases"
      WHERE "id" = ${input.goodsPurchaseId}
        AND "storeId" = ${input.storeId}
      FOR UPDATE
    `;
    return locked.length === 1;
  }

  async findGoodsPurchaseForReceipt(
    tx: Tx,
    input: { storeId: string; goodsPurchaseId: string },
  ) {
    const purchase = await tx.goodsPurchase.findFirst({
      where: {
        id: input.goodsPurchaseId,
        storeId: input.storeId,
        status: "APPROVED",
      },
      select: {
        id: true,
        number: true,
        shoppingRequestId: true,
        supplierId: true,
        supplierNameSnapshot: true,
        paymentMethod: true,
        paymentDueDate: true,
        items: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            shoppingRequestItemId: true,
            productId: true,
            productNameSnapshot: true,
            skuSnapshot: true,
            unitSnapshot: true,
            latestUnitPrice: true,
            product: { select: pricingProductSelect },
            quantity: true,
            inboundReceiptLines: {
              where: {
                receipt: {
                  storeId: input.storeId,
                  status: { in: ["APPROVED", "SUBMITTED"] },
                },
              },
              select: {
                status: true,
                receivedQuantity: true,
                receipt: { select: { status: true } },
              },
            },
          },
        },
      },
    });
    if (!purchase) return null;

    return {
      ...purchase,
      items: purchase.items.map((item) => ({
        ...item,
        latestUnitPrice: Number(item.latestUnitPrice.toString()),
        currentCostPrice:
          item.product?.costPrice == null
            ? null
            : Number(item.product.costPrice.toString()),
        unitMultiplierToBase: item.product?.unitMultiplierToBase ?? 1,
        pricingUnits: pricingUnitsForProduct(item.product),
      })),
    };
  }

  async createSubmittedGoodsPurchaseReceipt(
    tx: Tx,
    input: {
      storeId: string;
      goodsPurchaseId: string;
      shoppingRequestId: string;
      supplierId: string | null;
      paymentMethod: "TRANSFER" | "GIRO";
      paymentDueDate: Date | null;
      submittedBy: string;
      submittedAt: Date;
      note: string | null;
      lines: Array<{
        goodsPurchaseItemId: string;
        shoppingRequestItemId: string | null;
        productId: string;
        productNameSnapshot: string;
        skuSnapshot: string;
        unitSnapshot: string | null;
        costPriceSnapshot: number;
        supplierCostPrice: number | null;
        pricingSnapshot: InboundPricingSnapshot;
        supplierNameSnapshot: string;
        invoiceNumberSnapshot: string;
        expectedQuantity: number;
        receivedQuantity: number;
        status: "RECEIVED";
        matchStatus: "MATCHED" | "MISMATCHED";
        reviewStatus: "PENDING";
        note: string | null;
      }>;
    },
  ) {
    const receipt = await tx.inventoryInboundReceipt.create({
      data: {
        storeId: input.storeId,
        goodsPurchaseId: input.goodsPurchaseId,
        shoppingRequestId: input.shoppingRequestId,
        supplierId: input.supplierId,
        paymentMethod: input.paymentMethod,
        paymentDueDate: input.paymentDueDate,
        status: "SUBMITTED",
        submittedBy: input.submittedBy,
        submittedAt: input.submittedAt,
        note: input.note,
        lines: {
          create: input.lines.map((line) => ({
            goodsPurchaseItemId: line.goodsPurchaseItemId,
            shoppingRequestItemId: line.shoppingRequestItemId,
            productId: line.productId,
            productNameSnapshot: line.productNameSnapshot,
            skuSnapshot: line.skuSnapshot,
            unitSnapshot: line.unitSnapshot,
            costPriceSnapshot: line.costPriceSnapshot,
            supplierCostPrice: line.supplierCostPrice,
            pricingSnapshot: line.pricingSnapshot as unknown as Prisma.InputJsonValue,
            supplierNameSnapshot: line.supplierNameSnapshot,
            invoiceNumberSnapshot: line.invoiceNumberSnapshot,
            status: line.status,
            matchStatus: line.matchStatus,
            reviewStatus: line.reviewStatus,
            expectedQuantity: line.expectedQuantity,
            receivedQuantity: line.receivedQuantity,
            expectedQuantitySnapshot: line.expectedQuantity,
            receivedQuantitySnapshot: line.receivedQuantity,
            note: line.note,
          })),
        },
      },
      select: { id: true, status: true },
    });

    return { id: receipt.id, status: receipt.status };
  }

  async listInboundReceipts(
    storeId: string,
    input: {
      status?: InboundReceiptStatus;
      goodsPurchaseId?: string | null;
      supplierId?: string | null;
    },
  ) {
    const receipts = await db.inventoryInboundReceipt.findMany({
      where: {
        storeId,
        ...(input.status ? { status: input.status } : {}),
        ...(input.goodsPurchaseId
          ? { goodsPurchaseId: input.goodsPurchaseId }
          : {}),
        ...(input.supplierId ? { supplierId: input.supplierId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        supplier: { select: { id: true, name: true } },
        goodsPurchase: { select: { number: true } },
        stockBundle: { select: { status: true } },
        lines: {
          orderBy: { createdAt: "asc" },
          take: 100,
          include: { product: { select: pricingProductSelect } },
        },
      },
    });
    return receipts.map(({ goodsPurchase, stockBundle, ...receipt }) => ({
      ...receipt,
      goodsPurchaseNumber: goodsPurchase?.number ?? null,
      stockReversed: stockBundle?.status === "UNDONE",
      lines: receipt.lines.map(({ product, ...line }) => ({
        ...line,
        imageUrl: product?.imageUrl ?? null,
        pricingUnits: pricingUnitsForProduct(product),
        costPriceSnapshot:
          line.costPriceSnapshot === null
            ? null
            : Number(line.costPriceSnapshot.toString()),
        supplierCostPrice:
          line.supplierCostPrice === null
            ? null
            : Number(line.supplierCostPrice.toString()),
      })),
    }));
  }

  async listReceivingQueue(
    storeId: string,
    input: {
      search?: string | null;
      take?: number;
      goodsPurchaseId?: string | null;
      supplierId?: string | null;
    },
  ): Promise<ReceivingQueueRepositoryRow[]> {
    const take = Math.min(Math.max(input.take ?? 50, 1), 100);
    const search = input.search?.trim();
    const purchases = await db.goodsPurchase.findMany({
      where: {
        storeId,
        status: "APPROVED",
        fulfillmentStatus: { not: "RECEIVED" },
        ...(input.goodsPurchaseId ? { id: input.goodsPurchaseId } : {}),
        ...(input.supplierId ? { supplierId: input.supplierId } : {}),
        ...(search
          ? {
              OR: [
                { number: { contains: search, mode: "insensitive" } },
                {
                  supplierNameSnapshot: {
                    contains: search,
                    mode: "insensitive",
                  },
                },
                {
                  items: {
                    some: {
                      OR: [
                        {
                          productNameSnapshot: {
                            contains: search,
                            mode: "insensitive",
                          },
                        },
                        {
                          skuSnapshot: {
                            contains: search,
                            mode: "insensitive",
                          },
                        },
                      ],
                    },
                  },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ approvedAt: "asc" }, { createdAt: "asc" }],
      take,
      select: {
        id: true,
        number: true,
        paymentMethod: true,
        paymentDueDate: true,
        deferMasterHppToReceipt: true,
        supplierId: true,
        supplierNameSnapshot: true,
        shoppingRequest: { select: { name: true } },
        fulfillmentStatus: true,
        items: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            productId: true,
            productNameSnapshot: true,
            skuSnapshot: true,
            unitSnapshot: true,
            quantity: true,
            latestUnitPrice: true,
            updateMasterHpp: true,
            product: { select: pricingProductSelect },
            inboundReceiptLines: {
              where: {
                receipt: {
                  storeId,
                  status: { in: ["APPROVED", "SUBMITTED"] },
                },
              },
              select: {
                status: true,
                receivedQuantity: true,
                matchStatus: true,
                receipt: { select: { id: true, status: true } },
              },
            },
          },
        },
      },
    });

    return purchases.flatMap((purchase) =>
      purchase.items.map((item) => {
        const approvedReceivedQuantity = item.inboundReceiptLines
          .filter((line) => line.receipt.status === "APPROVED")
          .reduce(
            (sum, line) =>
              sum +
              getInboundStockQuantity({
                status: line.status,
                receivedQuantity: line.receivedQuantity,
              }),
            0,
          );
        const pendingLines = item.inboundReceiptLines.filter(
          (line) => line.receipt.status === "SUBMITTED",
        );
        const hasReceivedMatchingItem = item.inboundReceiptLines.some((line) =>
          line.receipt.status === "APPROVED" && line.matchStatus === "MATCHED" &&
          getInboundStockQuantity({ status: line.status, receivedQuantity: line.receivedQuantity }) > 0,
        );
        const pendingReservedQuantity = pendingLines.reduce(
          (sum, line) =>
            sum +
            getInboundStockQuantity({
              status: line.status,
              receivedQuantity: line.receivedQuantity,
            }),
          0,
        );

        return {
          goodsPurchaseId: purchase.id,
          goodsPurchaseNumber: purchase.number,
          shoppingRequestName: purchase.shoppingRequest.name,
          supplierId: purchase.supplierId,
          supplierName: purchase.supplierNameSnapshot,
          paymentMethod: purchase.paymentMethod,
          paymentDueDate: purchase.paymentDueDate?.toISOString().slice(0, 10) ?? null,
          fulfillmentStatus: purchase.fulfillmentStatus,
          itemId: item.id,
          productId: item.productId,
          productName: item.productNameSnapshot,
          sku: item.skuSnapshot,
          unit: item.unitSnapshot,
          currentCostPrice:
            item.product?.costPrice == null
              ? null
              : Number(item.product.costPrice.toString()),
          suggestedCostPrice: purchase.deferMasterHppToReceipt && item.updateMasterHpp && !hasReceivedMatchingItem
            ? Number(item.latestUnitPrice.toString()) : null,
          pricingUnits: pricingUnitsForProduct(item.product),
          orderedQuantity: item.quantity,
          approvedReceivedQuantity,
          pendingReservedQuantity,
          pendingReceiptIds: Array.from(
            new Set(pendingLines.map((line) => line.receipt.id)),
          ),
        };
      }),
    );
  }

  async getGoodsPurchaseReceivingComparison(
    storeId: string,
    goodsPurchaseId: string,
  ): Promise<GoodsPurchaseReceivingComparison | null> {
    const purchase = await db.goodsPurchase.findFirst({
      where: { id: goodsPurchaseId, storeId },
      select: {
        id: true,
        number: true,
        supplierNameSnapshot: true,
        fulfillmentStatus: true,
        items: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            productNameSnapshot: true,
            skuSnapshot: true,
            unitSnapshot: true,
            quantity: true,
            inboundReceiptLines: {
              where: {
                receipt: {
                  storeId,
                  status: { in: ["APPROVED", "SUBMITTED"] },
                },
              },
              select: {
                status: true,
                receivedQuantity: true,
                receipt: { select: { status: true } },
              },
            },
          },
        },
        inboundReceipts: {
          where: { storeId },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            createdAt: true,
            status: true,
            approvedAt: true,
            approver: { select: { name: true } },
            stockBundle: { select: { status: true } },
            lines: {
              where: {
                goodsPurchaseItemId: { not: null },
                matchStatus: { not: null },
                goodsPurchaseItem: {
                  goodsPurchase: { storeId },
                },
              },
              orderBy: { createdAt: "asc" },
              select: {
                goodsPurchaseItemId: true,
                status: true,
                receivedQuantity: true,
                matchStatus: true,
                note: true,
              },
            },
          },
        },
      },
    });
    if (!purchase) return null;

    return {
      goodsPurchaseId: purchase.id,
      goodsPurchaseNumber: purchase.number,
      supplierName: purchase.supplierNameSnapshot,
      fulfillmentStatus: purchase.fulfillmentStatus,
      items: purchase.items.map((item) => {
        const approvedReceivedQuantity = item.inboundReceiptLines
          .filter((line) => line.receipt.status === "APPROVED")
          .reduce(
            (sum, line) =>
              sum +
              getInboundStockQuantity({
                status: line.status,
                receivedQuantity: line.receivedQuantity,
              }),
            0,
          );
        const pendingReservedQuantity = item.inboundReceiptLines
          .filter((line) => line.receipt.status === "SUBMITTED")
          .reduce(
            (sum, line) =>
              sum +
              getInboundStockQuantity({
                status: line.status,
                receivedQuantity: line.receivedQuantity,
              }),
            0,
          );
        const availability = calculateInboundAvailability({
          orderedQuantity: item.quantity,
          approvedReceivedQuantity,
          pendingReservedQuantity,
        });

        return {
          goodsPurchaseItemId: item.id,
          productName: item.productNameSnapshot,
          sku: item.skuSnapshot,
          unit: item.unitSnapshot,
          orderedQuantity: availability.orderedQuantity,
          approvedReceivedQuantity: availability.approvedReceivedQuantity,
          pendingReservedQuantity: availability.pendingReservedQuantity,
          remainingQuantity: availability.availableQuantity,
        };
      }),
      receipts: purchase.inboundReceipts.map((receipt) => ({
        id: receipt.id,
        createdAt: receipt.createdAt.toISOString(),
        status: receipt.status,
        stockReversed: receipt.stockBundle?.status === "UNDONE",
        approvedAt: receipt.approvedAt?.toISOString() ?? null,
        approverName: receipt.approver?.name ?? null,
        lines: receipt.lines.flatMap((line) =>
          line.goodsPurchaseItemId && line.matchStatus
            ? [
                {
                  goodsPurchaseItemId: line.goodsPurchaseItemId,
                  receivedQuantity: getInboundStockQuantity({
                    status: line.status,
                    receivedQuantity: line.receivedQuantity,
                  }),
                  matchStatus: line.matchStatus,
                  note: line.note,
                },
              ]
            : [],
        ),
      })),
    };
  }
}
