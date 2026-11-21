import type { Prisma } from "@pos/db";

/** Allow unkeyed internal payment events only until this transaction ends. */
export async function permitSystemPayablePayment(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SELECT set_config('pos.payable_system_payment', '1', true)`;
}
