import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { requireRole, handleAuthError } from "@/lib/rbac/guard";

export const dynamic = 'force-dynamic';

// GET /api/dashboard - Dashboard statistics optimized for serverless performance
export async function GET() {
  try {
    const user = await requireRole("OWNER", "ADMIN", "CASHIER", "SALES");
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
      totalOutstandingDPRaw
    ] = await Promise.all([
      // 1. Today's Revenue
      db.transaction.aggregate({
        where: {
          storeId,
          createdAt: { gte: today },
          status: { notIn: ["VOIDED", "REFUNDED"] },
        },
        _sum: { total: true },
      }),
      // 2. Monthly Revenue
      db.transaction.aggregate({
        where: {
          storeId,
          createdAt: { gte: firstDayOfMonth },
          status: { notIn: ["VOIDED", "REFUNDED"] },
        },
        _sum: { total: true },
      }),
      // 3. Total Products
      db.product.count({
        where: { storeId, isActive: true },
      }),
      // 4. Low Stock
      db.product.findMany({
        where: {
          storeId,
          isActive: true,
          stock: { lte: 5 },
        },
        take: 5,
        orderBy: { stock: "asc" },
      }),
      // 5. Chart Data (Last 7 Days)
      db.transaction.findMany({
        where: {
          storeId,
          createdAt: { gte: last7Days },
          status: { notIn: ["VOIDED", "REFUNDED"] },
        },
        select: { createdAt: true, total: true },
      }),
      // 6. Top Sales (Last 30 Days)
      db.transaction.groupBy({
        by: ["salespersonId", "salesName"],
        where: {
          storeId,
          createdAt: { gte: last30Days },
          status: { notIn: ["VOIDED", "REFUNDED"] },
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
          createdAt: { gte: last30Days },
          status: { notIn: ["VOIDED", "REFUNDED"] },
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
            status: { notIn: ["VOIDED", "REFUNDED"] },
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
          status: { notIn: ["VOIDED", "REFUNDED"] },
          productionStatus: { not: null },
        },
        _count: { id: true },
      }),
      // 10. Active DP (Include Items for Modal)
      db.transaction.findMany({
        where: { storeId, status: "DP" },
        include: { items: true },
        take: 5,
        orderBy: { createdAt: "desc" },
      }),
      // 11. Outstanding DP
      db.transaction.aggregate({
        where: { storeId, status: "DP" },
        _sum: { total: true, amountPaid: true },
      }),
    ]);

    // Process Chart Data
    const dailyData: Record<string, { revenue: number; profit: number }> = {};
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      dailyData[dateStr] = { revenue: 0, profit: 0 };
    }

    revenueChartRaw.forEach((item) => {
      const dateStr = item.createdAt.toISOString().slice(0, 10);
      if (dailyData[dateStr]) {
        const rev = Number(item.total || 0);
        dailyData[dateStr].revenue += rev;
        dailyData[dateStr].profit += rev * 0.3; // 30% margin estimate
      }
    });

    const revenueChart = Object.entries(dailyData)
      .map(([date, data]) => ({
        name: new Date(date).toLocaleDateString("id-ID", { weekday: "short" }),
        date,
        ...data,
      }))
      .reverse();

    return NextResponse.json({
      todayRevenue: Number(todayStats._sum.total || 0),
      todayProfit: Number(todayStats._sum.total || 0) * 0.3,
      monthlyRevenue: Number(monthlyStats._sum.total || 0),
      monthlyProfit: Number(monthlyStats._sum.total || 0) * 0.3,
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
      topSalespersons: topSalespersonsRaw.map(sp => ({
        id: sp.salespersonId || "manual",
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
    });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("Dashboard Error:", error);
    return NextResponse.json({ message: "Failed to load dashboard" }, { status: 500 });
  }
}
