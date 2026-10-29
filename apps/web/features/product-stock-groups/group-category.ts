import { normalizeStockGroupKey } from "./stock-grouping";

type GroupMember = {
  name: string;
  categoryId: string;
  material: string | null;
  size: string | null;
};

export function stockGroupKeyForCategory(
  groupKey: string,
  members: readonly GroupMember[],
  categoryId: string,
): string {
  if (groupKey.startsWith("manual:")) return groupKey;
  const representative = members.find(member => normalizeStockGroupKey(member) === groupKey) ?? members[0];
  if (!representative) throw new Error("Grup stok tidak memiliki produk");
  return normalizeStockGroupKey({ ...representative, categoryId });
}
