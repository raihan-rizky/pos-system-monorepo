import { db } from "@pos/db";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import {
  computeNetExpense,
  validateExpensePayload,
} from "@/features/keuangan/helpers/keuangan-core";
import { getLogger } from "@/lib/logger";
import { apiError } from "@/lib/api/responses";
import { NextResponse } from "next/server";

const log = getLogger("api:finance:expenses:id");
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission("expense", "update");
    const storeId = user.storeId || "store-main";
    const { id } = await params;

    const existing = await db.expense.findFirst({
      where: { id, recordedBy: { storeId } },
      select: { id: true, deletedAt: true },
    });
    if (!existing || existing.deletedAt) {
      return apiError("Expense not found", 404, { code: "NotFound" });
    }

    const body = await request.json();
    const result = validateExpensePayload(body, { now: new Date() });
    if (!result.success) {
      const errors: Record<string, string[]> = {};
      for (const err of result.errors) {
        errors[err.path] = errors[err.path] ?? [];
        errors[err.path].push(err.message);
      }
      return apiError("Invalid expense payload", 422, {
        code: "ValidationError",
        errors,
      });
    }
    if (
      body.transactionId &&
      typeof body.transactionId === "string" &&
      body.transactionId.length > 0
    ) {
      const exists = await db.transaction.findFirst({
        where: { id: body.transactionId, storeId },
        select: { id: true },
      });
      if (!exists) {
        return apiError("Linked transaction not found", 422, {
          code: "ValidationError",
          errors: { transactionId: ["Linked transaction not found"] },
        });
      }
    }

    const data = result.data;
    const occurredAt = new Date(`${data.occurredAt}T00:00:00+07:00`);
    const updated = await db.expense.update({
      where: { id },
      data: {
        applicantName: data.applicantName.trim(),
        category: data.category,
        description: data.description?.trim() || null,
        amount: data.amount,
        changeAmount: data.changeAmount,
        occurredAt,
        transactionId: data.transactionId || null,
        attachmentUrl: data.attachmentUrl || null,
      },
      select: {
        id: true,
        applicantName: true,
        category: true,
        description: true,
        amount: true,
        changeAmount: true,
        occurredAt: true,
        createdAt: true,
        transactionId: true,
        attachmentUrl: true,
      },
    });

    const amount = Number(updated.amount.toString());
    const changeAmount = Number(updated.changeAmount.toString());
    return NextResponse.json({
      data: {
        ...updated,
        amount,
        changeAmount,
        netAmount: computeNetExpense(amount, changeAmount),
      },
    });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    log.error("Failed to update expense", error);
    return apiError("Failed to update expense", 500, { code: "InternalError" });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission("expense", "delete");
    const storeId = user.storeId || "store-main";
    const { id } = await params;
    const existing = await db.expense.findFirst({
      where: { id, recordedBy: { storeId } },
      select: { id: true, deletedAt: true },
    });
    if (!existing) {
      return apiError("Expense not found", 404, { code: "NotFound" });
    }
    if (existing.deletedAt) {
      return NextResponse.json({
        data: { id, deletedAt: existing.deletedAt },
      });
    }
    const updated = await db.expense.update({
      where: { id },
      data: { deletedAt: new Date() },
      select: { id: true, deletedAt: true },
    });
    return NextResponse.json({
      data: { id: updated.id, deletedAt: updated.deletedAt },
    });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    log.error("Failed to delete expense", error);
    return apiError("Failed to delete expense", 500, { code: "InternalError" });
  }
}
