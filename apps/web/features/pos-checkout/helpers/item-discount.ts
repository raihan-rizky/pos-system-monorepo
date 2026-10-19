export interface ItemDiscountInput {
  mode: "RP" | "PERCENT";
  value: number;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** A manual discount is deducted once from the whole line, not each unit. */
export function discountedLineSubtotal(price: number, quantity: number, discount = 0): number {
  const gross = roundMoney(price * quantity);
  if (!Number.isFinite(gross) || gross < 0 || !Number.isFinite(discount) || discount < 0 || discount > gross) {
    throw new Error("ITEM_DISCOUNT_INVALID");
  }
  return roundMoney(gross - discount);
}

/** Re-evaluate local edits against current customer prices and quantities. */
export function applyCartItemDiscounts<T extends { cartLineId: string; price: number; quantity: number; discount?: number }>(
  items: T[],
  discounts: Readonly<Record<string, ItemDiscountInput>>,
): (T & { discount: number })[] {
  return items.map(item => {
    const input = discounts[item.cartLineId];
    const gross = Math.max(0, roundMoney(item.price * item.quantity));
    if (input && (!Number.isFinite(input.value) || input.value < 0 || (input.mode === "PERCENT" && input.value > 100))) {
      throw new Error("ITEM_DISCOUNT_INVALID");
    }
    const requested = input
      ? input.mode === "PERCENT" ? gross * input.value / 100 : input.value
      : item.discount ?? 0;
    return { ...item, discount: roundMoney(Math.min(gross, Math.max(0, requested))) };
  });
}
