import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";

const log = getLogger("api:customers:id:dp-transactions");
export const dynamic = "force-dynamic";

// GET /api/customers/[id]/dp-transactions
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission("customer", "read");
    const storeId = user.storeId || "store-main";
    const { id } = await params;

    const customer = await db.customer.findFirst({
      where: { id, storeId },
      select: { id: true, name: true },
    });

    if (!customer) {
      return NextResponse.json(
        { message: "Customer not found" },
        { status: 404 }
      );
    }

    const transactions = await db.transaction.findMany({
      where: {
        storeId,
        OR: [
          { status: "DP" },
          {
            status: "COMPLETED",
            debtPaymentLogs: { some: { customerId: id } },
          },
        ],
        AND: [
          {
            OR: [
              { customerId: id },
              {
                customerId: null,
                customerName: { equals: customer.name, mode: "insensitive" },
              },
            ],
          },
        ],
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        invoiceNumber: true,
        total: true,
        amountPaid: true,
        paymentMethod: true,
        status: true,
        createdAt: true,
        items: {
          select: {
            productName: true,
            quantity: true,
            subtotal: true,
          },
        },
      },
    });

    return NextResponse.json(transactions);
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    log.error("[GET /api/customers/[id]/dp-transactions]", error);
    return NextResponse.json(
      { message: "Failed to fetch DP transactions" },
      { status: 500 }
    );
  }
}
