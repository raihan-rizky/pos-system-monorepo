import { decimalToRatio, initializeGroupPricing, roundMoney, type GroupPricingInput } from "@/features/product-stock-groups/automatic-pricing";
import { previewGroupPricingSnapshot, type GroupPricingChanges } from "@/features/product-stock-groups/group-pricing-service";

export type ImportPricingIntent = { productId: string; rowNumber?: number; price: number; costPrice?: number | null };
export type ImportPricingConflict = { rowNumber?: number; productId: string; field: "costPrice"; expected: string | null; message: string };

/** Blank import HPP means inherit for Auto followers; explicit numeric HPP is an assertion. */
export function projectImportGroupPricing(before: GroupPricingInput, current: GroupPricingInput, intents: ImportPricingIntent[]) {
  const config = initializeGroupPricing(before).config;
  const automaticFollower = (id: string) => id !== config.sourceProductId && config.members[id]?.mode !== "MANUAL";
  const changes: GroupPricingChanges = { members: intents.map(intent => ({
    productId: intent.productId, price: intent.price,
    ...(!automaticFollower(intent.productId) ? { costPrice: intent.costPrice ?? null } : {}),
  })) };
  const projection = previewGroupPricingSnapshot(before, current, changes).after;
  const conflicts: ImportPricingConflict[] = [];
  for (const intent of intents) {
    if (!automaticFollower(intent.productId) || intent.costPrice == null) continue;
    const expected = projection.members.find(member => member.productId === intent.productId)!.costPrice;
    if (roundMoney(decimalToRatio(intent.costPrice)) !== expected) conflicts.push({
      rowNumber: intent.rowNumber, productId: intent.productId, field: "costPrice", expected,
      message: `HPP satuan Otomatis mengikuti acuan (${expected ?? "belum tersedia"}). Kosongkan HPP impor, ubah HPP acuan, atau pilih mode Manual sebelum mengimpor.`,
    });
  }
  return { changes, projection, conflicts };
}

/** Cursor bounds select work; a connected old/target group always commits as a whole. */
export function expandImportGroupRows<T extends { cursorIndex: number; keys: string[] }>(rows: T[], cursor: number, chunkSize: number): T[] {
  const selected = new Set(importGroupComponents(rows).filter(group => group.some(row => row.cursorIndex >= cursor && row.cursorIndex < cursor + chunkSize)).flat());
  return rows.filter(row => selected.has(row));
}

export type AtomicImportGroup = { cursor: number; rowNumbers: number[] };
export function importGroupComponents<T extends { keys: string[] }>(rows: T[]): T[][] {
  const byKey = new Map<string, T[]>();
  for (const row of rows) for (const key of row.keys) {
    const peers = byKey.get(key) ?? [];
    peers.push(row); byKey.set(key, peers);
  }
  const visited = new Set<T>(); const visitedKeys = new Set<string>(); const components: T[][] = [];
  for (const row of rows) {
    if (visited.has(row)) continue;
    const queue = [row]; visited.add(row);
    for (let i = 0; i < queue.length; i++) for (const key of queue[i].keys) {
      if (visitedKeys.has(key)) continue;
      visitedKeys.add(key);
      for (const peer of byKey.get(key) ?? []) if (!visited.has(peer)) { visited.add(peer); queue.push(peer); }
    }
    components.push(queue);
  }
  return components;
}
