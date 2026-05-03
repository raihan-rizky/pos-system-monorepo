import { NextResponse } from "next/server";
import { db } from "@pos/db";

export const dynamic = 'force-dynamic';

// GET /api/job-orders — Fetch all active job orders for the Kanban board
export async function GET() {
  try {
    const jobOrders = await db.transaction.findMany({
      where: {
        isJobOrder: true,
        productionStatus: { not: "DELIVERED" },
      },
      include: {
        items: {
          include: {
            product: {
              select: { id: true, name: true, imageUrl: true },
            },
          },
        },
        salesperson: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(jobOrders);
  } catch (error) {
    console.error("Failed to fetch job orders:", error);
    return NextResponse.json(
      { message: "Failed to fetch job orders" },
      { status: 500 }
    );
  }
}
