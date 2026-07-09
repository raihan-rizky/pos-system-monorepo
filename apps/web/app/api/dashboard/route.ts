import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";

import { getLogger } from "@/lib/logger";

const log = getLogger("api:dashboard");
export const dynamic = 'force-dynamic';

type DashboardItem = {
  quantity: number;
  unitCost: unknown;
  subtotal: unknown;
};

type LowStockProduct = {
  id: string;
  name: string;
  sku: string;
  stock: number;
  minStock: number;
  imageUrl: string | null;
  categoryId: string;
};

const jakartaDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jakarta",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function jakartaDateKey(date: Date) {
  return jakartaDateFormatter.format(date);
}

// GET /api/dashboard - Dashboard statistics optimized for serverless performance
export async function GET() {
  try {
    const user = await requirePermission("transaction", "read");
    const storeId = user.storeId || "store-main";

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const last7Days = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
    const last30Days = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);

    // Parallel execution of all queries to prevent timeouts
    const [
      todayStats,
      monthlyStats,
      totalProducts,
      lowStockProducts,
      revenueChartRaw,
      topSalespersonsRaw,
      topCustomersRaw,
      topProductsRaw,
      productionStatusCountsRaw,
      dpTransactionsRaw,
      totalOutstandingDPRaw,
      paymentMixTodayRaw,
    ] = await Promise.all([
      // 1. Today's Revenue & Profit
      db.transaction.findMany({
        where: {
          storeId,
          invoiceDate: { gte: today },
          status: { in: ["COMPLETED", "DP"] },
        },
        select: { total: true, status: true, amountPaid: true, items: { select: { quantity: true, unitCost: true, subtotal: true } } },
      }),
      // 2. Monthly Revenue & Profit
      db.transaction.findMany({
        where: {
          storeId,
          invoiceDate: { gte: firstDayOfMonth },
          status: { in: ["COMPLETED", "DP"] },
        },
        select: { total: true, status: true, amountPaid: true, items: { select: { quantity: true, unitCost: true, subtotal: true } } },
      }),
      // 3. Total Products
      db.product.count({
        where: { storeId, isActive: true },
      }),
      // 4. Low Stock (Respecting dynamic minStock)
      db.$queryRaw<LowStockProduct[]>`
        SELECT id, name, sku, stock, "minStock", "imageUrl", "categoryId"
        FROM pos_products
        WHERE "storeId" = ${storeId}
          AND "isActive" = true
          AND stock <= "minStock"
        ORDER BY stock ASC
        LIMIT 5
      `,
      // 5. Chart Data (Last 7 Days)
      db.transaction.findMany({
        where: {
          storeId,
          invoiceDate: { gte: last7Days },
          status: { in: ["COMPLETED", "DP"] },
        },
        select: { invoiceDate: true, total: true, status: true, amountPaid: true, items: { select: { quantity: true, unitCost: true, subtotal: true } } },
      }),
      // 6. Top Sales (Last 30 Days)
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
      // 7. Top Customers (Last 30 Days)
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
      // 8. Top Products (All Time)
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
      // 9. Production Status
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
      // 10. Active DP (Include Items for Modal)
      db.transaction.findMany({
        where: { storeId, status: "DP" },
        include: { items: true },
        take: 5,
        orderBy: { invoiceDate: "desc" },
      }),
      // 11. Outstanding DP
      db.transaction.aggregate({
        where: { storeId, status: "DP" },
        _sum: { total: true, amountPaid: true },
      }),
      // 12. Payment Mix Today (group by paymentMethod, exclude voided/refunded)
      db.transaction.findMany({
        where: {
          storeId,
          invoiceDate: { gte: today },
          status: { in: ["COMPLETED", "DP"] },
        },
        select: { total: true, amountPaid: true, status: true, paymentMethod: true },
      }),
    ]);

    // Calculate exact profit helper
    const calculateProfit = (items: DashboardItem[]) => {
      let profit = 0;
      items.forEach(i => {
         if (i.unitCost === null || i.unitCost === undefined) return;
         const cost = Number(i.unitCost);
         const sub = Number(i.subtotal || 0);
         profit += sub - (cost * i.quantity);
      });
      return profit;
    };

    let todayRevenue = 0;
    let todayProfit = 0;
    todayStats.forEach(t => {
      todayRevenue += Number(t.status === "DP" ? t.amountPaid : t.total || 0);
      todayProfit += calculateProfit(t.items);
    });

    let monthlyRevenue = 0;
    let monthlyProfit = 0;
    monthlyStats.forEach(t => {
      monthlyRevenue += Number(t.status === "DP" ? t.amountPaid : t.total || 0);
      monthlyProfit += calculateProfit(t.items);
    });

    // Process Chart Data (Timezone safe: UTC+7)
    const dailyData: Record<string, { revenue: number; profit: number }> = {};
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = jakartaDateKey(d);
      dailyData[dateStr] = { revenue: 0, profit: 0 };
    }

    revenueChartRaw.forEach((item) => {
      const dateStr = jakartaDateKey(item.invoiceDate);
      if (dailyData[dateStr]) {
        dailyData[dateStr].revenue += Number(item.status === "DP" ? item.amountPaid : item.total || 0);
        dailyData[dateStr].profit += calculateProfit(item.items);
      }
    });

    const revenueChart = Object.entries(dailyData)
      .map(([date, data]) => ({
        name: new Intl.DateTimeFormat("id-ID", {
          weekday: "short",
          timeZone: "Asia/Jakarta",
        }).format(new Date(`${date}T00:00:00+07:00`)),
        date,
        ...data,
      }))
      .reverse();

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
      paymentMixToday: (() => {
        const mixMap = new Map<string, { revenue: number; txCount: number }>();
        paymentMixTodayRaw.forEach((t) => {
          const rev = Number(t.status === "DP" ? t.amountPaid : t.total || 0);
          const existing = mixMap.get(t.paymentMethod) || { revenue: 0, txCount: 0 };
          existing.revenue += rev;
          existing.txCount += 1;
          mixMap.set(t.paymentMethod, existing);
        });
        return Array.from(mixMap.entries()).map(([method, data]) => ({
          method,
          revenue: data.revenue,
          transactionCount: data.txCount,
        }));
      })(),
    });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    log.error("Dashboard Error:", error);
    return NextResponse.json({ message: "Failed to load dashboard" }, { status: 500 });
  }
}
