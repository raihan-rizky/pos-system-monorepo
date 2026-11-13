import type { DebtBalanceInput } from "./payment-terms";
import { isActiveDebt } from "./payment-terms";
import { normalizeCustomerDebtName } from "./customer-debt-summary";

export interface ReceivableSnapshot extends DebtBalanceInput {
  customerId: string | null;
  customerName: string | null;
}

export interface ReceivableAccess {
  canView: boolean;
  canEdit: boolean;
}

export class ReceivableAuthorizationError extends Error {
  readonly status = 403;
  constructor() {
    super("Anda memerlukan izin melihat dan mengubah piutang untuk perubahan ini.");
    this.name = "ReceivableAuthorizationError";
  }
}

export function effectiveReceivable(input: ReceivableSnapshot): { amountCents: number; attribution: string | null } {
  const amountCents = isActiveDebt(input) ? Math.max(0, Math.round((input.total - input.amountPaid + Number.EPSILON) * 100)) : 0;
  return {
    amountCents,
    attribution: amountCents === 0 ? null : input.customerId ? `id:${input.customerId}` : `name:${normalizeCustomerDebtName(input.customerName)}`,
  };
}

export function assertReceivableChangeAllowed(before: ReceivableSnapshot, after: ReceivableSnapshot, canView: boolean, canEdit: boolean): void {
  const oldDebt = effectiveReceivable(before);
  const newDebt = effectiveReceivable(after);
  if ((oldDebt.amountCents !== newDebt.amountCents || oldDebt.attribution !== newDebt.attribution) && !(canView && canEdit)) {
    throw new ReceivableAuthorizationError();
  }
}
