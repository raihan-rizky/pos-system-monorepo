import { NextResponse } from "next/server";
import { db } from "@pos/db";
import {
  handleAuthError,
  requirePermission,
} from "@/lib/rbac/guard";

export async function GET(request: Request) {
  try {
    const user = await requirePermission("surat_jalan", "read");
    const storeId = user.storeId || "store-main";


    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const suratJalan = await db.suratJalan.findMany({
      where: {
        storeId: storeId,
      },
      include: {
        transaction: {
          select: {
            id: true,
            invoiceNumber: true,
            customerName: true,
          }
        },
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                sku: true,
                unit: true,
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: "desc",
      },
      take: limit,
      skip: offset,
    });

    const totalCount = await db.suratJalan.count({
      where: { storeId: storeId },
    });

    const mappedSuratJalan = suratJalan.map((sj) => ({
      id: sj.id,
      number: sj.number,
      status: sj.status,
      recipientName: sj.recipientName,
      sequence: sj.sequence,
      requestedByName: sj.requestedByName,
      approvedByName: sj.approvedByName,
      createdAt: sj.createdAt,
      confirmedAt: sj.confirmedAt,
      transaction: {
        id: sj.transaction.id,
        invoiceNumber: sj.transaction.invoiceNumber,
        customerName: sj.transaction.customerName,
      },
      items: sj.items.map((item) => ({
        id: item.id,
        transactionItemId: item.transactionItemId,
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        unit: item.unit,
        keterangan: item.keterangan,
        stockBefore: item.stockBefore,
        stockAfter: item.stockAfter,
      })),
    }));

    return NextResponse.json({
      data: mappedSuratJalan,
      metadata: {
        total: totalCount,
        limit,
        offset,
      }
    });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    console.error("Error fetching global surat jalan:", error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
