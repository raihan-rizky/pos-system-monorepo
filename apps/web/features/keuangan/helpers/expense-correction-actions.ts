import type { ExpenseListItem } from "../hooks/useKeuangan";
import { expenseCorrectionPermission, type ExpenseCorrectionOperation, type ExpenseCorrectionSubject } from "./expense-correction-contract";

export type ExpenseCorrectionAction = {
  label: string;
  subject: ExpenseCorrectionSubject;
  operation: ExpenseCorrectionOperation;
};

export function getExpenseCorrectionActions(
  { source, paymentSource }: Pick<ExpenseListItem, "source" | "paymentSource">,
  canPerform: (resource: string, action: "update" | "delete") => boolean,
): ExpenseCorrectionAction[] {
  if (!("id" in source)) return [];
  const purchase = { type: source.type, id: source.id };
  const actions: ExpenseCorrectionAction[] = [];
  function collect(subject: ExpenseCorrectionSubject, label: string) {
    for (const operation of ["edit", "cancel"] as const) {
      const [resource, action] = expenseCorrectionPermission(subject, operation);
      if (canPerform("expense", action) && canPerform(resource, action)) {
        actions.push({ operation, subject, label: `${operation === "edit" ? "Ubah" : "Batalkan"} ${label}` });
      }
    }
  }
  if (source.type === "BACKDATED_PURCHASE" && paymentSource?.kind === "BACKDATED_PAYMENT") {
    collect({ type: source.type, id: source.id, payment: paymentSource }, "pembayaran");
  }
  const goodsPurchaseId = source.type === "GOODS_PURCHASE" ? source.id
    : source.type === "SHOPPING_REQUEST" ? source.goodsPurchaseId : undefined;
  if (goodsPurchaseId && paymentSource && paymentSource.kind !== "BACKDATED_PAYMENT") {
    collect({ type: "GOODS_PURCHASE", id: goodsPurchaseId, payment: paymentSource }, "pembayaran");
  }
  collect(purchase, source.type === "SHOPPING_REQUEST" ? "daftar belanja" : "pembelian");
  return actions;
}
