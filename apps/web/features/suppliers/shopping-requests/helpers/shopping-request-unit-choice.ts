export type UnitChoiceProduct = { id: string; unit: string; stockGroupId?: string | null };

export function chooseUnitVariant<T extends UnitChoiceProduct>(
  items: Array<{ product: T; requestedQty: number }>,
  currentId: string,
  nextVariant: T,
): Array<{ product: T; requestedQty: number }> {
  const current = items.find((item) => item.product.id === currentId);
  if (!current) throw new Error("Barang tidak ditemukan di daftar belanja.");
  if (!current.product.stockGroupId || current.product.stockGroupId !== nextVariant.stockGroupId) {
    throw new Error("Pilih satuan dari grup stok yang sama.");
  }
  if (nextVariant.id !== currentId && items.some((item) => item.product.id === nextVariant.id)) {
    throw new Error("Barang dengan satuan ini sudah ada di daftar belanja.");
  }
  return items.map((item) => item.product.id === currentId
    ? { ...item, product: nextVariant, requestedQty: item.requestedQty }
    : item);
}
