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
            draftNumber: true,
            subtotal: true,
            discount: true,
            tax: true,
            total: true,
            paymentMethod: true,
            amountPaid: true,
            change: true,
            customerId: true,
            customerName: true,
            customer: { select: { type: true } },
            salesName: true,
            salespersonId: true,
            salesperson: { select: { name: true } },
            note: true,
            status: true,
            createdAt: true,
            stockManagedBySuratJalan: true,
            payments: {
              select: { amount: true, method: true },
            },
            debtPaymentLogs: {
              select: { id: true, createdAt: true, amount: true, paymentMethod: true },
              orderBy: { createdAt: "desc" },
            },
            items: {
              select: {
                id: true,
                productId: true,
                printingServiceId: true,
                rawMaterialProductId: true,
                productName: true,
                size: true,
                material: true,
                serviceNote: true,
                rawMaterialQuantity: true,
                rawMaterialUnit: true,
                quantity: true,
                unitPrice: true,
                subtotal: true,
                product: {
                  select: {
                    unit: true,
                    imageUrl: true,
                    category: { select: { name: true } },
                  },
                },
                printingService: { select: { unit: true } },
              },
            },
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
      markingStatus: sj.markingStatus,
      markedByName: sj.markedByName,
      markedAt: sj.markedAt,
      markingNote: sj.markingNote,
      createdAt: sj.createdAt,
      confirmedAt: sj.confirmedAt,
      transaction: {
        id: sj.transaction.id,
        invoiceNumber: sj.transaction.invoiceNumber,
        draftNumber: sj.transaction.draftNumber ?? null,
        subtotal: Number(sj.transaction.subtotal ?? 0),
        discount: Number(sj.transaction.discount ?? 0),
        tax: Number(sj.transaction.tax ?? 0),
        total: Number(sj.transaction.total),
        paymentMethod: sj.transaction.paymentMethod,
        amountPaid: Number(sj.transaction.amountPaid),
        change: Number(sj.transaction.change),
        customerId: sj.transaction.customerId,
        customerName: sj.transaction.customerName,
        customerType: sj.transaction.customer?.type ?? null,
        salesName: sj.transaction.salesName,
        salespersonId: sj.transaction.salespersonId,
        salesperson: sj.transaction.salesperson,
        note: sj.transaction.note,
        status: sj.transaction.status,
        createdAt: sj.transaction.createdAt.toISOString(),
        stockManagedBySuratJalan: sj.transaction.stockManagedBySuratJalan,
        payments: sj.transaction.payments.map((payment) => ({
          amount: Number(payment.amount),
          method: payment.method,
        })),
        debtPaymentLogs: sj.transaction.debtPaymentLogs.map((payment) => ({
          id: payment.id,
          createdAt: payment.createdAt.toISOString(),
          amount: Number(payment.amount),
          paymentMethod: payment.paymentMethod,
        })),
        items: sj.transaction.items.map((item) => ({
          id: item.id,
          productId: item.productId,
          printingServiceId: item.printingServiceId,
          rawMaterialProductId: item.rawMaterialProductId,
          productName: item.productName,
          size: item.size,
          material: item.material,
          serviceNote: item.serviceNote,
          rawMaterialQuantity: item.rawMaterialQuantity === null || item.rawMaterialQuantity === undefined
            ? null
            : Number(item.rawMaterialQuantity),
          rawMaterialUnit: item.rawMaterialUnit,
          quantity: item.quantity,
          unit: item.product?.unit ?? item.printingService?.unit ?? item.rawMaterialUnit ?? null,
          unitPrice: Number(item.unitPrice),
          subtotal: Number(item.subtotal),
          product: item.product,
          printingService: item.printingService,
        })),
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
