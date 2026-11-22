import { createHash } from "node:crypto";
import type { Prisma } from "@pos/db";
import { parsePayable } from "../helpers/supplier-payable-input";
import { authorizeInTransaction, type requirePermission } from "@/lib/rbac/guard";

export const isPayableRequestKey = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export type PayableAttempt = { version: string; key: string | null; body: string | null; completedAt: Date | null };
export type PayableAttemptActor = { storeId: string; id: string };
export const payableFingerprint = (input: NonNullable<ReturnType<typeof parsePayable>>) =>
  createHash("sha256").update(JSON.stringify(input)).digest("hex");
export const payableRequestScope = (actor: PayableAttemptActor, key: string) => JSON.stringify([actor.storeId, actor.id, key.toLowerCase()]);

export async function reauthorizePayableActor(tx: Prisma.TransactionClient, user: Awaited<ReturnType<typeof requirePermission>>, withPayment: boolean) {
  const actions = withPayment ? ["create", "read", "update"] as const : ["create"] as const;
  return authorizeInTransaction(tx, user, { resources: actions.map(action => ({ resource: "expense.payable", action })), page: "/keuangan" });
}

export async function lockPayableAttempt(tx: Prisma.TransactionClient, actor: PayableAttemptActor) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify([actor.storeId, actor.id, "manual-payable-attempt"])}, 0))`;
  const [row] = await tx.$queryRaw<PayableAttempt[]>`
    SELECT "version", "key", "body", "completedAt" FROM "pos_manual_payable_attempts"
    WHERE "storeId" = ${actor.storeId} AND "userId" = ${actor.id}
  `;
  return row ?? null;
}
