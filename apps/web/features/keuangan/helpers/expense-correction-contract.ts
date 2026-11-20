export type ExpensePaymentSource =
  | { kind: "GOODS_INITIAL_TRANSFER"; id: string }
  | { kind: "SUPPLIER_PAYABLE_PAYMENT"; id: string }
  | { kind: "BACKDATED_PAYMENT"; id: string };

export type ExpenseCorrectionSubject =
  | { type: "SHOPPING_REQUEST"; id: string }
  | {
      type: "GOODS_PURCHASE";
      id: string;
      payment?: Exclude<ExpensePaymentSource, { kind: "BACKDATED_PAYMENT" }>;
    }
  | {
      type: "BACKDATED_PURCHASE";
      id: string;
      payment?: Extract<ExpensePaymentSource, { kind: "BACKDATED_PAYMENT" }>;
    };

export type ExpenseCorrectionOperation = "edit" | "cancel";

export function expenseCorrectionPermission(
  subject: ExpenseCorrectionSubject,
  operation: ExpenseCorrectionOperation,
): [resource: string, action: "update" | "delete"] {
  const action = operation === "edit" ? "update" : "delete";
  switch (subject.type) {
    case "SHOPPING_REQUEST":
      return operation === "edit"
        ? ["supplier.shopping_request.correct_processed", "update"]
        : ["supplier.shopping_request.delete", "delete"];
    case "GOODS_PURCHASE":
      return ["supplier.goods_purchase.correction", action];
    case "BACKDATED_PURCHASE":
      return [
        subject.payment ? "supplier.backdated_payment.correction" : "supplier.backdated_purchase.correction",
        action,
      ];
  }
}
