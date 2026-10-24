import type { StockGroupDetail } from "./api/stock-group-api";
import { decimalToRatio, exactRatio, type PricingMode } from "./automatic-pricing";
import type { GroupPricingChanges } from "./group-pricing-service";

export type Adjustment = "none" | "discount" | "markup";
export type PricingMemberDraft = { mode: PricingMode; price: string; costPrice: string; adjustment: Adjustment; percent: string; adjustmentEdited: boolean };
export type PricingDraft = { sourceProductId: string; members: Record<string, PricingMemberDraft> };

export function adjustmentFactor(kind: Adjustment, percent: string) {
  if (kind === "none") return exactRatio("1", "1");
  const value = decimalToRatio(percent);
  const whole = BigInt(value.denominator) * BigInt(100);
  const numerator = kind === "discount" ? whole - BigInt(value.numerator) : whole + BigInt(value.numerator);
  if (numerator < BigInt(0)) throw new Error("Diskon maksimal 100%.");
  return exactRatio(String(numerator), String(whole));
}
export function createPricingDraft(detail: StockGroupDetail): PricingDraft {
  const pricing = detail.pricing;
  return { sourceProductId: pricing?.config.sourceProductId ?? "", members: Object.fromEntries((pricing?.members ?? []).map(member => {
    const config = pricing!.config.members[member.productId];
    const factor = config?.factor;
    const value = factor ? Number(factor.numerator) / Number(factor.denominator) : 1;
    return [member.productId, { mode: config?.mode ?? "AUTO", price: member.price, costPrice: member.costPrice ?? "",
      adjustment: value < 1 ? "discount" : value > 1 ? "markup" : "none", percent: String(Number((Math.abs(1 - value) * 100).toFixed(6))), adjustmentEdited: false }];
  })) };
}
export function selectPricingSource(detail: StockGroupDetail, draft: PricingDraft, sourceProductId: string): PricingDraft {
  const defaults = createPricingDraft(detail);
  const members = { ...draft.members };
  // A source selection is its own intent: neither old source inputs nor the new
  // source's follower adjustment are an explicit edit to its anchor money.
  if (members[draft.sourceProductId]) members[draft.sourceProductId] = defaults.members[draft.sourceProductId];
  if (members[sourceProductId]) members[sourceProductId] = defaults.members[sourceProductId];
  return { sourceProductId, members };
}
export function rebasePricingDraft(previous: StockGroupDetail, latest: StockGroupDetail, draft: PricingDraft): PricingDraft {
  const before = createPricingDraft(previous), defaults = createPricingDraft(latest);
  return { sourceProductId: draft.sourceProductId === before.sourceProductId ? defaults.sourceProductId : defaults.members[draft.sourceProductId] ? draft.sourceProductId : defaults.sourceProductId,
    members: Object.fromEntries(Object.entries(defaults.members).map(([id, value]) => {
      const current = draft.members[id], old = before.members[id];
      if (!current || !old) return [id, value];
      return [id, { ...value,
        ...(current.mode !== old.mode ? { mode: current.mode } : {}),
        ...(current.price !== old.price ? { price: current.price } : {}),
        ...(current.costPrice !== old.costPrice ? { costPrice: current.costPrice } : {}),
        ...(current.adjustmentEdited ? { adjustment: current.adjustment, percent: current.percent, adjustmentEdited: true } : {}),
      }];
    })) };
}
export function pricingChanges(detail: StockGroupDetail, draft: PricingDraft): GroupPricingChanges {
  const defaults = createPricingDraft(detail);
  return { ...(draft.sourceProductId !== defaults.sourceProductId ? { sourceProductId: draft.sourceProductId } : {}), members: detail.variants.flatMap(member => {
    const current = draft.members[member.id], baseline = defaults.members[member.id];
    if (!current || !baseline) return [];
    const source = member.id === draft.sourceProductId;
    const change: NonNullable<GroupPricingChanges["members"]>[number] = { productId: member.id };
    if (!source && current.mode !== baseline.mode) change.mode = current.mode;
    if (!source && current.mode === "AUTO" && current.adjustmentEdited) change.factor = adjustmentFactor(current.adjustment, current.percent);
    if (source || current.mode === "MANUAL") {
      if (current.price !== baseline.price) change.price = current.price;
      if (current.costPrice !== baseline.costPrice) change.costPrice = current.costPrice.trim() || null;
    }
    return Object.keys(change).length > 1 ? [change] : [];
  }) };
}
