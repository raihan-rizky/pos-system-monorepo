import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { z } from "zod";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import {
  buildDraftDocumentNumber,
  buildInvoiceDocumentNumber,
  chooseDocumentSequence,
  jakartaDateKey,
  parseDocumentSequence,
  resolveInvoiceDateTime,
} from "@/features/invoice-date/helpers/invoice-date-core";
import { getLogger } from "@/lib/logger";

const log = getLogger("api:transactions:id:invoice-date");

const updateInvoiceDateSchema = z.object({
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  invoiceTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional().nullable(),
  regenerateNumber: z.literal(true),
  reason: z.string().trim().min(1, "Alasan wajib diisi"),
});

const SAFE_NOTE_PREFIXES = [
  "Penjualan ",
  "Approve Penjualan ",
  "Offline sync ",
  "Approve Draft ",
] as const;

function isSafeSystemNote(note: string, oldDocumentNumber: string) {
  return (
    note.includes(oldDocumentNumber) &&
    SAFE_NOTE_PREFIXES.some((prefix) => note.startsWith(prefix))
  );
}

function documentPrefix(documentNumber: string) {
  return documentNumber.slice(0, documentNumber.lastIndexOf("-") + 1);
}

function toResponsePayload<T extends { invoiceDate?: Date | string | null }>(
  transaction: T,
) {
  return {
    ...transaction,
    invoiceDate:
      transaction.invoiceDate instanceof Date
        ? transaction.invoiceDate.toISOString()
        : transaction.invoiceDate,
  };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission("transaction", "update");
    if (user.role !== "OWNER" && user.role !== "ADMIN") {
      return NextResponse.json(
        { message: "Hanya Owner atau Admin yang boleh mengatur tanggal invoice." },
        { status: 403 },
      );
    }

    const storeId = user.storeId || "store-main";
    const { id } = await params;
    const parsed = updateInvoiceDateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Validation error", errors: parsed.error.flatten() },
        { status: 422 },
      );
    }

    const updated = await db.$transaction(async (tx) => {
      const existing = await tx.transaction.findFirst({
        where: { id, storeId },
        select: {
          id: true,
          storeId: true,
          status: true,
          invoiceNumber: true,
          draftNumber: true,
          invoiceDate: true,
        },
      });

      if (!existing) {
        throw new Error("TRANSACTION_NOT_FOUND");
      }

      const newInvoiceDate = resolveInvoiceDateTime({
        mode: "edit",
        date: parsed.data.invoiceDate,
        time: parsed.data.invoiceTime,
        now: new Date(),
        previousInvoiceDate: existing.invoiceDate,
      });
      const isDraft = existing.status === "DRAFT";
      const oldDocumentNumber = isDraft
        ? existing.draftNumber
        : existing.invoiceNumber;
      const buildNumber = isDraft
        ? buildDraftDocumentNumber
        : buildInvoiceDocumentNumber;
      const targetPrefix = documentPrefix(buildNumber(newInvoiceDate, 0));
      const siblingDocuments = await tx.transaction.findMany({
        where: {
          storeId,
          ...(isDraft
            ? { draftNumber: { startsWith: targetPrefix } }
            : { invoiceNumber: { startsWith: targetPrefix } }),
          id: { not: id },
        },
        select: { invoiceNumber: true, draftNumber: true },
      });
      const existingSequences = siblingDocuments
        .map((row) =>
          parseDocumentSequence(isDraft ? row.draftNumber : row.invoiceNumber),
        )
        .filter((sequence): sequence is number => sequence !== null);
      const currentSequence = parseDocumentSequence(oldDocumentNumber) ?? 1;
      const newDocumentNumber = buildNumber(
        newInvoiceDate,
        chooseDocumentSequence({
          currentSequence,
          existingSequencesForDate: existingSequences,
        }),
      );

      const transaction = await tx.transaction.update({
        where: { id },
        data: {
          invoiceDate: newInvoiceDate,
          ...(isDraft
            ? { draftNumber: newDocumentNumber }
            : { invoiceNumber: newDocumentNumber }),
        },
      });

      if (!isDraft) {
        await tx.productionActivityLog.updateMany({
          where: { storeId, transactionId: id },
          data: { invoiceNumber: newDocumentNumber },
        });
      }

      if (oldDocumentNumber) {
        const inventoryLogs = await tx.inventoryLog.findMany({
          where: {
            transactionId: id,
            note: { contains: oldDocumentNumber },
          },
          select: { id: true, note: true },
        });

        await Promise.all(
          inventoryLogs
            .filter(
              (log): log is { id: string; note: string } =>
                typeof log.note === "string" &&
                isSafeSystemNote(log.note, oldDocumentNumber),
            )
            .map((log) =>
              tx.inventoryLog.update({
                where: { id: log.id },
                data: {
                  note: log.note.replaceAll(oldDocumentNumber, newDocumentNumber),
                },
              }),
            ),
        );
      }

      await tx.invoiceDateChangeLog.create({
        data: {
          transactionId: id,
          storeId,
          oldInvoiceDate: existing.invoiceDate,
          newInvoiceDate,
          oldDocumentNumber,
          newDocumentNumber,
          reason: parsed.data.reason,
          actorId: user.id,
          actorName: user.name ?? "User",
          actorRole: user.role,
        },
      });

      return transaction;
    });

    return NextResponse.json(toResponsePayload(updated), { status: 200 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    if (error instanceof Error && error.message === "TRANSACTION_NOT_FOUND") {
      return NextResponse.json(
        { message: "Transaksi tidak ditemukan" },
        { status: 404 },
      );
    }

    log.error("Failed to update invoice date:", error);
    return NextResponse.json(
      { message: "Gagal mengubah tanggal invoice" },
      { status: 500 },
    );
  }
}
