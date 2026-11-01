export type AutomaticExpenseClassification =
  | { automatic: true; label: "Pembelian Barang" | "Daftar Belanja (Legacy)" | "Belanja Terdahulu" }
  | { automatic: false; label: "Manual" };

export function classifyAutomaticExpense(input: {
  goodsPurchaseId: string | null | undefined;
  shoppingRequestId: string | null | undefined;
  backdatedPurchaseDueId?: string | null;
  backdatedPurchasePaymentId?: string | null;
}): AutomaticExpenseClassification {
  if (input.backdatedPurchaseDueId || input.backdatedPurchasePaymentId) {
    return { automatic: true, label: "Belanja Terdahulu" };
  }
  if (input.goodsPurchaseId) {
    return { automatic: true, label: "Pembelian Barang" };
  }
  if (input.shoppingRequestId) {
    return { automatic: true, label: "Daftar Belanja (Legacy)" };
  }
  return { automatic: false, label: "Manual" };
}
