/** Match the transaction endpoint: only Owner/Admin may change payment status. */
export function canSelectTransactionStatus(
  role: string | null,
  currentStatus: string,
  optionStatus: string,
  allowedTransitions: readonly string[],
): boolean {
  return optionStatus === currentStatus || (
    (role === "OWNER" || role === "ADMIN") && allowedTransitions.includes(optionStatus)
  );
}
