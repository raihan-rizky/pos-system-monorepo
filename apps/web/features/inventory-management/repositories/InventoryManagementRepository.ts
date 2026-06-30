import { db } from "@pos/db";
import type { InventorySummaryRepository } from "../types/inventory-management";
import { unresolvedOutLogVerificationWhere } from "../helpers/inventory-management-rules";

function jakartaDayBounds(dateKey: string): { start: Date; end: Date } {
  const [year, month, day] = dateKey.split("-").map(Number);
  const startUtc = Date.UTC(year, month - 1, day, -7, 0, 0, 0);
  const endUtc = Date.UTC(year, month - 1, day + 1, -7, 0, 0, 0);
  return { start: new Date(startUtc), end: new Date(endUtc) };
}

export class InventoryManagementRepository implements InventorySummaryRepository {
  async countPendingStockRequests(storeId: string): Promise<number> {
    return db.inventoryLog.count({
      where: {
        status: "PENDING",
        product: { storeId },
      },
    });
  }

  async countUnverifiedOutLogs(storeId: string, dateKey: string): Promise<number> {
    const { start, end } = jakartaDayBounds(dateKey);
    return db.inventoryLog.count({
      where: {
        type: "OUT",
        status: "APPROVED",
        createdAt: { gte: start, lt: end },
        product: { storeId },
        ...unresolvedOutLogVerificationWhere(),
      },
    });
  }

  async countSubmittedInboundReceipts(storeId: string): Promise<number> {
    return db.inventoryInboundReceipt.count({
      where: { storeId, status: "SUBMITTED" },
    });
  }

  async isWeeklyProofMissing(storeId: string, weekKey: string): Promise<boolean> {
    const task = await db.inventoryTask.findUnique({
      where: {
        storeId_type_periodKey: {
          storeId,
          type: "WEEKLY_CLEANING_PROOF",
          periodKey: weekKey,
        },
      },
      select: { status: true },
    });
    return task?.status !== "SUBMITTED";
  }

  async isDailyMatchingIncomplete(storeId: string, dateKey: string): Promise<boolean> {
    const task = await db.inventoryTask.findUnique({
      where: {
        storeId_type_periodKey: {
          storeId,
          type: "DAILY_STOCK_MATCHING",
          periodKey: dateKey,
        },
      },
      select: { status: true },
    });
    return task?.status !== "SUBMITTED";
  }

  async countPendingDamagedReports(storeId: string): Promise<number> {
    return db.inventoryLog.count({
      where: {
        status: "PENDING",
        reason: "WASTE",
        product: { storeId },
      },
    });
  }

  async countNeedsRevisionReceipts(storeId: string): Promise<number> {
    return db.inventoryInboundReceipt.count({
      where: { storeId, status: "NEEDS_REVISION" },
    });
  }

  async countRejectedRequestsForUser(storeId: string, userId: string): Promise<number> {
    return db.inventoryLog.count({
      where: {
        status: "REJECTED",
        createdBy: userId,
        product: { storeId },
      },
    });
  }

  async countPendingSuratJalan(storeId: string): Promise<number> {
    return db.suratJalan.count({
      where: { storeId, status: "PENDING" },
    });
  }

  async countUnmarkedSuratJalan(storeId: string): Promise<number> {
    return db.suratJalan.count({
      where: { storeId, markingStatus: "UNMARKED" },
    });
  }

  async countNegativeStockProducts(storeId: string): Promise<number> {
    return db.product.count({
      where: { storeId, isActive: true, stock: { lt: 0 } },
    });
  }

  async countOutOfStockProducts(storeId: string): Promise<number> {
    return db.product.count({
      where: { storeId, isActive: true, stock: 0 },
    });
  }

  async countLowStockProducts(storeId: string): Promise<number> {
    const products = await db.product.findMany({
      where: { storeId, isActive: true, stock: { gt: 0 } },
      select: { stock: true, minStock: true },
    });

    return products.filter((product) => product.stock <= product.minStock).length;
  }

  async countDailyChecklistRemaining(storeId: string, dateKey: string): Promise<number> {
    return db.inventoryTaskChecklistItem.count({
      where: {
        storeId,
        periodType: "DAILY",
        periodKey: dateKey,
        isCompleted: false,
      },
    });
  }

  async findDailyTasks(
    storeId: string,
    input: { dateKey: string; limit: number },
  ) {
    const { start, end } = jakartaDayBounds(input.dateKey);
    const productSelect = {
      id: true,
      name: true,
      sku: true,
      stock: true,
      minStock: true,
      costPrice: true,
    };

    const [
      negativeStock,
      outOfStock,
      lowStock,
      missingSupplierOrCost,
      verificationCandidates,
    ] = await Promise.all([
      db.product.findMany({
        where: { storeId, isActive: true, stock: { lt: 0 } },
        select: productSelect,
        orderBy: { stock: "asc" },
        take: input.limit,
      }),
      db.product.findMany({
        where: { storeId, isActive: true, stock: 0 },
        select: productSelect,
        orderBy: { name: "asc" },
        take: input.limit,
      }),
      db.product.findMany({
        where: {
          storeId,
          isActive: true,
          stock: { gt: 0 },
        },
        select: productSelect,
        orderBy: { stock: "asc" },
        take: input.limit * 5,
      }),
      db.product.findMany({
        where: {
          storeId,
          isActive: true,
          OR: [{ costPrice: null }, { costPrice: { lte: 0 } }],
        },
        select: productSelect,
        orderBy: { name: "asc" },
        take: input.limit,
      }),
      db.inventoryLog.findMany({
        where: {
          type: "OUT",
          status: "APPROVED",
          createdAt: { gte: start, lt: end },
          product: { storeId },
          ...unresolvedOutLogVerificationWhere(),
        },
        include: {
          product: { select: { id: true, name: true, sku: true } },
        },
        orderBy: { createdAt: "desc" },
        take: input.limit,
      }),
    ]);

    return {
      negativeStock,
      outOfStock,
      lowStock: lowStock
        .filter((product) => product.stock <= product.minStock)
        .slice(0, input.limit),
      missingSupplierOrCost,
    };
  }

  async getChartData(storeId: string, dateKey: string) {
    const { end } = jakartaDayBounds(dateKey);
    // 7 days ago
    const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);

    // 1. Inbound/Outbound Data (last 7 days)
    const logs = await db.inventoryLog.findMany({
      where: {
        product: { storeId },
        status: "APPROVED",
        createdAt: { gte: start, lt: end },
      },
      select: {
        type: true,
        quantity: true,
        createdAt: true,
      },
    });

    const inboundOutboundMap = new Map<string, { inbound: number; outbound: number; day: string }>();
    
    // Initialize map with last 7 days
    for (let i = 6; i >= 0; i--) {
      const d = new Date(end.getTime() - (i + 1) * 24 * 60 * 60 * 1000 + 12 * 60 * 60 * 1000);
      const dayName = d.toLocaleDateString("id-ID", { weekday: 'long', timeZone: 'Asia/Jakarta' });
      const dayKey = d.toISOString().split("T")[0]; // Just as a unique key
      inboundOutboundMap.set(dayKey, { inbound: 0, outbound: 0, day: dayName });
    }

    for (const log of logs) {
      // Map UTC createdAt to Jakarta Date string
      const logDate = new Date(log.createdAt.getTime() + 7 * 60 * 60 * 1000);
      const dayKey = logDate.toISOString().split("T")[0];
      
      const entry = inboundOutboundMap.get(dayKey);
      if (entry) {
        if (log.type === "IN") {
          entry.inbound += log.quantity;
        } else if (log.type === "OUT") {
          entry.outbound += log.quantity;
        }
      }
    }
    
    const inboundOutbound = Array.from(inboundOutboundMap.values()).map(v => ({
      day: v.day,
      inbound: v.inbound,
      outbound: v.outbound
    }));

    // 2. Health Metrics

    // Availability
    const activeProducts = await db.product.count({
      where: { storeId, isActive: true },
    });
    
    let availability = 100;
    if (activeProducts > 0) {
      // Cannot compare Float field vs Int field directly in standard where, using Prisma raw or casting
      // Instead, fetch active products and filter in memory, or use raw query.
      // Since we want availability efficiently, we can fetch stock and minStock
      const products = await db.product.findMany({
        where: { storeId, isActive: true },
        select: { stock: true, minStock: true },
      });
      const availableProducts = products.filter(p => p.stock > p.minStock).length;
      availability = Math.round((availableProducts / activeProducts) * 100);
    }

    // Accuracy (Proxy: 100 - % of products that had a MANUAL_ADJUSTMENT today)
    const { start: todayStart, end: todayEnd } = jakartaDayBounds(dateKey);
    let accuracy = 100;
    if (activeProducts > 0) {
      const adjustedProductsCount = await db.inventoryLog.groupBy({
        by: ['productId'],
        where: {
          product: { storeId, isActive: true },
          reason: "MANUAL_ADJUSTMENT",
          createdAt: { gte: todayStart, lt: todayEnd }
        },
      });
      const adjustedCount = adjustedProductsCount.length;
      accuracy = Math.round(((activeProducts - adjustedCount) / activeProducts) * 100);
    }

    // Fulfillment
    // Combine SuratJalan and Usage Logs
    const pendingSuratJalan = await db.suratJalan.count({
      where: { storeId, status: "PENDING" }
    });
    const completedSuratJalan = await db.suratJalan.count({
      where: { storeId, status: "CONFIRMED" }
    });
    const pendingUsageLogs = await db.inventoryLog.count({
      where: { product: { storeId }, reason: "USAGE", status: "PENDING" }
    });
    const completedUsageLogs = await db.inventoryLog.count({
      where: { product: { storeId }, reason: "USAGE", status: "APPROVED" }
    });

    const totalFulfillmentRequests = pendingSuratJalan + completedSuratJalan + pendingUsageLogs + completedUsageLogs;
    let fulfillment = 100;
    if (totalFulfillmentRequests > 0) {
      const totalCompleted = completedSuratJalan + completedUsageLogs;
      fulfillment = Math.round((totalCompleted / totalFulfillmentRequests) * 100);
    }

    return {
      inboundOutbound,
      health: {
        accuracy,
        availability,
        fulfillment
      }
    };
  }
}
