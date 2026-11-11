import type { CartItem } from "@/hooks/useCart";

export type CartOwner = { userId: string; storeId: string | null };
export type CartSnapshotV2 = { version: 2; owner: CartOwner; items: CartItem[]; savedAt: string };

export function cartStorageKey(owner: CartOwner) {
  return `pos_cart_v2:${JSON.stringify([owner.userId, owner.storeId])}`;
}

export function readOwnedCart(storage: Pick<Storage, "getItem">, owner: CartOwner): CartItem[] {
  try {
    const raw = storage.getItem(cartStorageKey(owner));
    if (!raw) return [];
    const snapshot = JSON.parse(raw) as Partial<CartSnapshotV2> | null;
    if (snapshot?.version !== 2 || snapshot.owner?.userId !== owner.userId
        || snapshot.owner.storeId !== owner.storeId || !Array.isArray(snapshot.items)) return [];
    return snapshot.items.filter(item => item && typeof item.cartLineId === "string"
      && (item.lineType === "PRODUCT" || item.lineType === "PRINTING_SERVICE")
      && Number.isFinite(item.price) && Number.isFinite(item.quantity) && item.quantity > 0);
  } catch {
    return [];
  }
}

export function writeOwnedCart(
  storage: Pick<Storage, "setItem">,
  owner: CartOwner,
  items: CartItem[],
): { ok: true } | { ok: false; reason: "storage-unavailable" } {
  try {
    const snapshot: CartSnapshotV2 = { version: 2, owner, items, savedAt: new Date().toISOString() };
    storage.setItem(cartStorageKey(owner), JSON.stringify(snapshot));
    return { ok: true };
  } catch {
    return { ok: false, reason: "storage-unavailable" };
  }
}

export function clearOwnedCart(storage: Pick<Storage, "removeItem">, owner: CartOwner): void {
  storage.removeItem(cartStorageKey(owner));
}
