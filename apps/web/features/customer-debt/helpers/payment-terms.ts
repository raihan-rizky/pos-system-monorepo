export interface DebtBalanceInput {
  status: string;
  paymentMethod: string;
  total: number;
  amountPaid: number;
}

export function isActiveDebt(input: DebtBalanceInput): boolean {
  const remaining = input.total - input.amountPaid;
  if (!Number.isFinite(remaining) || remaining <= 0) return false;

  return (
    input.status === "DP" ||
    (input.status === "COMPLETED" && input.paymentMethod === "TEMPO")
  );
}

export function assertTempoCustomer(
  paymentMethod: string,
  customerId: string | null | undefined,
): void {
  if (paymentMethod === "TEMPO" && !customerId?.trim()) {
    throw new Error("Pilih pelanggan untuk transaksi Tempo.");
  }
}
