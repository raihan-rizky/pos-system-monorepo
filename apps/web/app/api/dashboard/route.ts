import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";
import {
  buildDashboardRevenueBuckets,
  type DashboardRevenueRow,
} from "@/features/dashboard/helpers/dashboard-revenue-buckets";

import { getLogger } from "@/lib/logger";

const log = getLogger("api:dashboard");
export const dynamic = 'force-dynamic';

type LowStockProduct = {
  id: string;
  name: string;
  sku: string;
  stock: number;
  minStock: number;
  imageUrl: string | null;
  categoryId: string;
};

// GET /api/dashboard - Dashboard statistics optimized for serverless performance
export async function GET() {
  try {
    const user = await requirePermission("transaction", "read");
    const storeId = user.storeId || "store-main";

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const firstChartDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
    const last30Days = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
    const statsRangeStart = new Date(
      Math.min(firstDayOfMonth.getTime(), firstChartDay.getTime()),
    );

    // Parallel execution of all queries to prevent timeouts
    const [
      transactionStats,
      totalProducts,
      lowStockProducts,
      topSalespersonsRaw,
      topCustomersRaw,
      topProductsRaw,
      productionStatusCountsRaw,
      dpTransactionsRaw,
      totalOutstandingDPRaw,
    ] = await Promise.all([
      // 1. Revenue, profit, chart, and payment mix share one transaction range.
      // Profit is summed per transaction in SQL: fetching every line item just
      // to add it up in JS moved ~30k rows per request over the wire.
      db.$queryRaw<DashboardRevenueRow[]>`
        SELECT
          t."invoiceDate",
          t."status"::text AS status,
          t."total",
          t."amountPaid",
          t."paymentMethod"::text AS "paymentMethod",
          COALESCE(
            SUM(i."subtotal" - i."unitCost" * i."quantity")
              FILTER (WHERE i."unitCost" IS NOT NULL),
            0
          ) AS profit
        FROM pos_transactions t
        LEFT JOIN pos_transaction_items i ON i."transactionId" = t."id"
        WHERE t."storeId" = ${storeId}
          AND t."invoiceDate" >= ${statsRangeStart}
          AND t."status" IN ('COMPLETED', 'DP')
        GROUP BY
          t."id", t."invoiceDate", t."status",
          t."total", t."amountPaid", t."paymentMethod"
      `,
      // 2. Total Products
      db.product.count({
        where: { storeId, isActive: true },
      }),
      // 3. Low Stock (Respecting dynamic minStock)
      db.$queryRaw<LowStockProduct[]>`
        SELECT id, name, sku, stock, "minStock", "imageUrl", "categoryId"
        FROM pos_products
        WHERE "storeId" = ${storeId}
          AND "isActive" = true
          AND stock <= "minStock"
        ORDER BY stock ASC
        LIMIT 5
      `,
      // 4. Top Sales (Last 30 Days)
      db.transaction.groupBy({
        by: ["salespersonId", "salesName"],
        where: {
          storeId,
          invoiceDate: { gte: last30Days },
          status: { in: ["COMPLETED", "DP"] },
        },
        _sum: { total: true },
        _count: { id: true },
        orderBy: { _sum: { total: "desc" } },
        take: 5,
      }),
      // 5. Top Customers (Last 30 Days)
      db.transaction.groupBy({
        by: ["customerId", "customerName"],
        where: {
          storeId,
          invoiceDate: { gte: last30Days },
          status: { in: ["COMPLETED", "DP"] },
          customerId: { not: null },
        },
        _sum: { total: true },
        orderBy: { _sum: { total: "desc" } },
        take: 5,
      }),
      // 6. Top Products (All Time)
      db.transactionItem.groupBy({
        by: ["productId", "productName"],
        where: {
          transaction: {
            storeId,
            status: { in: ["COMPLETED", "DP"] },
          },
        },
        _sum: { quantity: true, subtotal: true },
        orderBy: { _sum: { quantity: "desc" } },
        take: 5,
      }),
      // 7. Production Status
      db.transaction.groupBy({
        by: ["productionStatus"],
        where: {
          storeId,
          isJobOrder: true,
          status: { in: ["COMPLETED", "DP"] },
          productionStatus: { not: null },
        },
        _count: { id: true },
      }),
      // 8. Active DP (Include Items for Modal)
      db.transaction.findMany({
        where: { storeId, status: "DP" },
        include: { items: true },
        take: 5,
        orderBy: { invoiceDate: "desc" },
      }),
      // 9. Outstanding DP
      db.transaction.aggregate({
        where: { storeId, status: "DP" },
        _sum: { total: true, amountPaid: true },
      }),
    ]);

    const {
      todayRevenue,
      todayProfit,
      monthlyRevenue,
      monthlyProfit,
      revenueChart,
      paymentMixToday,
    } = buildDashboardRevenueBuckets(transactionStats, {
      now,
      todayStart: today,
      monthStart: firstDayOfMonth,
    });

    return NextResponse.json({
      todayRevenue,
      todayProfit,
      monthlyRevenue,
      monthlyProfit,
      totalProducts,
      topProducts: topProductsRaw.map(tp => ({
        name: tp.productName,
        quantity: tp._sum.quantity || 0,
        revenue: Number(tp._sum.subtotal || 0),
      })),
      lowStockProducts: lowStockProducts.map(p => ({
        ...p,
        minStock: p.minStock || 5,
      })),
      revenueChart,
      topSalespersons: topSalespersonsRaw.map((sp) => ({
        id: sp.salespersonId || `manual:${sp.salesName || "sales"}`,
        name: sp.salesName || "Sales",
        revenue: Number(sp._sum.total || 0),
        txCount: sp._count.id,
      })),
      topCustomers: topCustomersRaw.map(c => ({
        id: c.customerId,
        name: c.customerName,
        totalSpent: Number(c._sum.total || 0),
      })),
      productionStatusCounts: productionStatusCountsRaw.map(ps => ({
        status: ps.productionStatus,
        count: ps._count.id,
      })),
      dpTransactions: dpTransactionsRaw,
      totalOutstandingDP: Number(totalOutstandingDPRaw._sum.total || 0) - Number(totalOutstandingDPRaw._sum.amountPaid || 0),
      paymentMixToday,
    });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    log.error("Dashboard Error:", error);
    return NextResponse.json({ message: "Failed to load dashboard" }, { status: 500 });
  }
}
