import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { requireRole, handleAuthError } from "@/lib/rbac/guard";

// GET /api/dashboard - Dashboard statistics
export async function GET() {
  try {
    const user = await requireRole("OWNER", "ADMIN");
    const now = new Date();
    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const sevenDaysAgo = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - 6,
    );

    // Run all independent queries in parallel (~3-4x faster than sequential)
    const [
      todayTransactions,
      allTransactions,
      weekTransactions,
      monthlyTransactions,
      lowStockProducts,
      totalProducts,
      topCustomers,
      productionStatusCounts,
      dpTransactions,
      totalDPTxn,
    ] = await Promise.all([
      // Today's transactions
      db.transaction.findMany({
        where: {
          createdAt: { gte: startOfDay },
          status: { in: ["COMPLETED", "DP"] },
        },
        include: {
          items: {
            include: { product: { select: { name: true } } },
          },
        },
      }),

      // All transactions for Top Products (excluding VOIDED)
      db.transaction.findMany({
        where: {
          status: { not: "VOIDED" },
        },
        select: {
          items: {
            select: {
              productId: true,
              productName: true,
              quantity: true,
              subtotal: true,
            }
          }
        }
      }),

      // Last 7 days transactions for chart
      db.transaction.findMany({
        where: {
          createdAt: { gte: sevenDaysAgo },
          status: { in: ["COMPLETED", "DP"] },
        },
        include: {
          items: {
            select: {
              quantity: true,
              unitCost: true,
              subtotal: true,
            }
          }
        },
      }),

      // Monthly transactions (for revenue and top salespersons)
      db.transaction.findMany({
        where: {
          createdAt: { gte: startOfMonth },
          status: { in: ["COMPLETED", "DP"] },
        },
        select: {
          total: true,
          salespersonId: true,
          salesperson: { select: { name: true } },
        }
      }),

      // Low stock products
      db.product.findMany({
        where: {
          isActive: true,
          stock: { lte: db.product.fields.minStock || 5 },
        },
        select: {
          id: true,
          name: true,
          stock: true,
          minStock: true,
          unit: true,
        },
        take: 10,
        orderBy: { stock: "asc" },
      }),

      // Total products
      db.product.count({ where: { isActive: true } }),

      // Top Customers by total spent
      db.customer.findMany({
        orderBy: { totalSpent: "desc" },
        take: 5,
        select: { id: true, name: true, totalSpent: true, type: true },
      }),

      // Production Status Overview
      db.transaction.groupBy({
        by: ["productionStatus"],
        where: { isJobOrder: true },
        _count: { id: true },
      }),

      // Recent DP transactions
      db.transaction.findMany({
        where: { status: "DP" },
        include: {
          items: {
            include: { product: { select: { name: true } } },
          },
          customer: { select: { name: true } },
          salesperson: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),

      // Total Outstanding DP
      db.transaction.aggregate({
        where: { status: "DP" },
        _sum: { total: true, amountPaid: true },
      }),
    ]);
    
    // Calculate stats
    const todayRevenue: number = todayTransactions.reduce(
      (sum: number, t: (typeof todayTransactions)[number]) => sum + Number(t.total),
      0,
    );
    const monthlyRevenue: number = monthlyTransactions.reduce(
      (sum: number, t: (typeof monthlyTransactions)[number]) => sum + Number(t.total),
      0,
    );

    // Top products (All Time)
    const productSalesMap = new Map<
      string,
      { name: string; quantity: number; revenue: number }
    >();
    for (const txn of allTransactions) {
      for (const item of txn.items) {
        const existing = productSalesMap.get(item.productId);
        if (existing) {
          existing.quantity += item.quantity;
          existing.revenue += Number(item.subtotal);
        } else {
          productSalesMap.set(item.productId, {
            name: item.productName,
            quantity: item.quantity,
            revenue: Number(item.subtotal),
          });
        }
      }
    }
    const topProducts = Array.from(productSalesMap.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    // Format chart data (group by day) - Revenue vs Cost
    const revenueByDayMap = new Map<string, { revenue: number, cost: number }>();
    for (let i = 0; i < 7; i++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      revenueByDayMap.set(
        d.toISOString().slice(0, 10),
        { revenue: 0, cost: 0 } // start with 0 instead of random data for accurate P&L
      );
    }

    weekTransactions.forEach((tx) => {
      const dateStr = tx.createdAt.toISOString().slice(0, 10);
      if (revenueByDayMap.has(dateStr)) {
        const current = revenueByDayMap.get(dateStr)!;
        
        let txCost = 0;
        for (const item of tx.items) {
          txCost += Number(item.unitCost || 0) * item.quantity;
        }

        revenueByDayMap.set(dateStr, {
          revenue: current.revenue + Number(tx.total),
          cost: current.cost + txCost,
        });
      }
    });

    const revenueChart = Array.from(revenueByDayMap.entries())
      .map(([date, data]) => {
        const d = new Date(date);
        return {
          name: d.toLocaleDateString("id-ID", { weekday: "short" }),
          date: d.toLocaleDateString("id-ID", {
            day: "numeric",
            month: "short",
          }),
          revenue: data.revenue,
          cost: data.cost,
          profit: data.revenue - data.cost,
        };
      })
      .reverse();

    // Top Salespersons this month
    const salespersonMap = new Map<string, { name: string, revenue: number }>();
    monthlyTransactions.forEach(tx => {
      if (tx.salespersonId && tx.salesperson) {
        const current = salespersonMap.get(tx.salespersonId) || { name: tx.salesperson.name, revenue: 0 };
        current.revenue += Number(tx.total);
        salespersonMap.set(tx.salespersonId, current);
      }
    });
    const topSalespersons = Array.from(salespersonMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    // Format production status for widget
    const formattedProductionStatus = productionStatusCounts.map((ps) => ({
      status: ps.productionStatus || "PENDING",
      count: ps._count.id,
    }));

    // Format DP transactions for widget
    const formattedDPTransactions = dpTransactions.map((dp) => ({
      ...dp,
      customerName: dp.customer?.name || dp.customerName || "Pelanggan",
      total: Number(dp.total),
      paidAmount: Number(dp.amountPaid),
      items: dp.items?.map(item => ({
        ...item,
        productName: item.product?.name || "Produk",
      })) || [],
    }));

    // Outstanding DP Calculation
    const totalOutstandingDP = Number(totalDPTxn._sum.total || 0) - Number(totalDPTxn._sum.amountPaid || 0);

    const res = NextResponse.json({
      todayRevenue,
      todayTransactionCount: todayTransactions.length,
      monthlyRevenue,
      monthlyTransactionCount: monthlyTransactions.length,
      topProducts,
      lowStockProducts,
      totalProducts,
      revenueChart,
      topCustomers,
      productionStatusCounts: formattedProductionStatus,
      topSalespersons,
      dpTransactions: formattedDPTransactions,
      totalOutstandingDP,
    });
    res.headers.set(
      "Cache-Control",
      "private, max-age=10, stale-while-revalidate=30",
    );
    return res;
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    
    console.error("Failed to fetch dashboard:", error);
    return NextResponse.json(
      { message: "Failed to fetch dashboard data" },
      { status: 500 },
    );
  }
}
