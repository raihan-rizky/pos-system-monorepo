import type { CartItem, CartUnitOption, ProductCartItem } from "@/hooks/useCart";

function buildProductCartLineId(option: CartUnitOption) {
  return `PRODUCT:${option.productId}:${option.size || ""}:${option.material || ""}`;
}

export function changeCartUnit(
  items: CartItem[],
  lineId: string,
  target: CartUnitOption,
): CartItem[] {
  const source = items.find((item) => item.cartLineId === lineId);
  if (!source || source.lineType !== "PRODUCT") return items;
  if (source.productId === target.productId) return items;

  const verifiedTarget = source.unitOptions?.find(
    (option) => option.productId === target.productId,
  );
  if (
    !verifiedTarget ||
    !source.stockGroup?.id ||
    verifiedTarget.stockGroup?.id !== source.stockGroup.id
  ) {
    throw new Error("Pilihan satuan tidak tersedia untuk produk ini.");
  }

  const nextLineId = buildProductCartLineId(verifiedTarget);
  const existingTarget = items.find(
    (item): item is ProductCartItem =>
      item.lineType === "PRODUCT" && item.cartLineId === nextLineId,
  );

  if (existingTarget) {
    return items
      .filter((item) => item.cartLineId !== lineId)
      .map((item) =>
        item.lineType === "PRODUCT" && item.cartLineId === nextLineId
          ? { ...item, quantity: item.quantity + source.quantity }
          : item,
      );
  }

  const replacement: ProductCartItem = {
    ...source,
    ...verifiedTarget,
    cartLineId: nextLineId,
    lineType: "PRODUCT",
    price: verifiedTarget.catalogPrice,
    quantity: source.quantity,
    transactionPrice: null,
    appliedPricing: null,
    unitOptions: source.unitOptions,
  };

  return items.map((item) => (item.cartLineId === lineId ? replacement : item));
}
