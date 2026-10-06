export interface CustomerDebtPaymentCandidate {
  id: string;
  total: number | string;
  amountPaid: number | string;
  status: string;
  paymentMethod: string;
}

export interface CustomerDebtPaymentAllocation {
  transactionId: string;
  amount: number;
  amountPaid: number;
  status: "DP" | "COMPLETED";
}

function toCents(value: number | string): number | null {
  const parsed = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
}

export function allocateCustomerDebtPayment(input: {
  amount: number;
  transactions: ReadonlyArray<CustomerDebtPaymentCandidate>;
}): CustomerDebtPaymentAllocation[] {
  const requestedCents = toCents(input.amount);
  if (requestedCents === null || requestedCents <= 0) {
    throw new Error("Jumlah pembayaran harus lebih dari 0.");
  }

  let unallocatedCents = requestedCents;
  const allocations: CustomerDebtPaymentAllocation[] = [];

  for (const transaction of input.transactions) {
    if (unallocatedCents <= 0) break;

    const isDp = transaction.status === "DP";
    const isTempo =
      transaction.status === "COMPLETED" && transaction.paymentMethod === "TEMPO";
    if (!isDp && !isTempo) continue;

    const totalCents = toCents(transaction.total);
    const paidCents = toCents(transaction.amountPaid);
    if (
      totalCents === null ||
      paidCents === null ||
      totalCents < 0 ||
      paidCents < 0
    ) {
      continue;
    }
    const balanceCents = Math.max(0, totalCents - paidCents);
    if (balanceCents <= 0) continue;

    const allocatedCents = Math.min(unallocatedCents, balanceCents);
    const nextPaidCents = paidCents + allocatedCents;
    allocations.push({
      transactionId: transaction.id,
      amount: allocatedCents / 100,
      amountPaid: nextPaidCents / 100,
      status: isTempo
        ? "COMPLETED"
        : nextPaidCents < totalCents
          ? "DP"
          : "COMPLETED",
    });
    unallocatedCents -= allocatedCents;
  }

  if (unallocatedCents > 0) {
    throw new Error("Jumlah pembayaran melebihi total piutang aktif.");
  }

  return allocations;
}
