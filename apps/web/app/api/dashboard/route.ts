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
      db.transaction.findMany({
        where: {
          storeId,
          invoiceDate: { gte: statsRangeStart },
          status: { in: ["COMPLETED", "DP"] },
        },
        select: {
          invoiceDate: true,
          total: true,
          status: true,
          amountPaid: true,
          paymentMethod: true,
          items: {
            select: { quantity: true, unitCost: true, subtotal: true },
          },
        },
      }),
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

    // Process all overlapping transaction buckets in one pass.
    let todayRevenue = 0;
    let todayProfit = 0;
    let monthlyRevenue = 0;
    let monthlyProfit = 0;
    const dailyData: Record<string, { revenue: number; profit: number }> = {};
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = jakartaDateKey(d);
      dailyData[dateStr] = { revenue: 0, profit: 0 };
    }
    const paymentMixMap = new Map<string, { revenue: number; txCount: number }>();

    transactionStats.forEach((transaction) => {
      const revenue = Number(
        transaction.status === "DP"
          ? transaction.amountPaid
          : transaction.total || 0,
      );
      const profit = calculateProfit(transaction.items);
      const invoiceTime = transaction.invoiceDate.getTime();

      if (invoiceTime >= firstDayOfMonth.getTime()) {
        monthlyRevenue += revenue;
        monthlyProfit += profit;
      }

      if (invoiceTime >= today.getTime()) {
        todayRevenue += revenue;
        todayProfit += profit;

        const payment = paymentMixMap.get(transaction.paymentMethod) || {
          revenue: 0,
          txCount: 0,
        };
        payment.revenue += revenue;
        payment.txCount += 1;
        paymentMixMap.set(transaction.paymentMethod, payment);
      }

      const dateStr = jakartaDateKey(transaction.invoiceDate);
      if (dailyData[dateStr]) {
        dailyData[dateStr].revenue += revenue;
        dailyData[dateStr].profit += profit;
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
    const paymentMixToday = Array.from(paymentMixMap.entries()).map(
      ([method, data]) => ({
        method,
        revenue: data.revenue,
        transactionCount: data.txCount,
      }),
    );

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
