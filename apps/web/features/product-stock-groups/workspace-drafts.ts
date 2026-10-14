import type {
  AddVariantPayload,
  StockGroupDetail,
  UpdateConversionRatePayload,
} from "./api/stock-group-api";
import { resolveConversionEdit } from "./bulk-stock-groups";
import type { StockGroupWorkspaceContentProps } from "./components/StockGroupWorkspace";
export type ConversionDraft = NonNullable<
  StockGroupWorkspaceContentProps["conversionDraft"]
>;
export type AdditionDraft = NonNullable<
  StockGroupWorkspaceContentProps["newVariantDraft"]
>;
export type PriceDraft = { price: string; costPrice: string; note: string };

export function parseNumber(value: string): number | null {
  if (!value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
export function stockInUnit(
  value: string,
  oldMultiplier: number,
  nextMultiplier: number,
) {
  const amount = parseNumber(value);
  return amount === null ||
    !Number.isFinite(oldMultiplier) ||
    !Number.isFinite(nextMultiplier) ||
    oldMultiplier <= 0 ||
    nextMultiplier <= 0
    ? ""
    : String((amount * oldMultiplier) / nextMultiplier);
}
export function priceValid(draft: PriceDraft) {
  const price = parseNumber(draft.price),
    cost = parseNumber(draft.costPrice);
  return (
    price !== null &&
    price >= 0 &&
    (!draft.costPrice.trim() || (cost !== null && cost >= 0))
  );
}
export function conversionResult(
  detail: StockGroupDetail,
  draft?: ConversionDraft,
) {
  const invalid = {
    payload: null,
    resolved: null,
    error: "Pilih satuan berbeda dan isi jumlah positif untuk konversi.",
  };
  if (!draft) return invalid;
  const base = detail.variants.find((v) => v.id === draft.baseProductId);
  const currentBase =
    detail.variants.find(
      (v) =>
        v.unit.trim().toLowerCase() === detail.baseUnit.trim().toLowerCase(),
    ) ?? detail.variants.find((v) => v.unitMultiplierToBase === 1);
  if (!base || !currentBase) return invalid;
  const payload: UpdateConversionRatePayload = {
    mode: draft.mode,
    baseProductId: base.id,
    sourceProductId: draft.fromProductId,
  };
  if (draft.editMode === "DIRECT") {
    payload.directMultipliers = detail.variants.map((v) => ({
      productId: v.id,
      unitMultiplierToBase:
        v.id === base.id
          ? 1
          : (parseNumber(draft.directMultipliers[v.id] ?? "") ?? NaN),
    }));
    if (
      payload.directMultipliers.some(
        (v) =>
          !Number.isFinite(v.unitMultiplierToBase) ||
          v.unitMultiplierToBase <= 0,
      )
    )
      return invalid;
  } else {
    const from = parseNumber(draft.fromQuantity),
      to = parseNumber(draft.toQuantity);
    if (
      from === null ||
      to === null ||
      from <= 0 ||
      to <= 0 ||
      draft.fromProductId === draft.toProductId ||
      !detail.variants.some((v) => v.id === draft.fromProductId) ||
      !detail.variants.some((v) => v.id === draft.toProductId)
    )
      return invalid;
    // Keep a spanning graph: retain current relationships except the edited source's
    // edge, then connect that source through the user's equation.
    const anchor =
      draft.fromProductId === currentBase.id
        ? draft.toProductId
        : draft.fromProductId;
    payload.conversionPairs = detail.variants
      .filter((v) => v.id !== currentBase.id && v.id !== anchor)
      .map((v) => ({
        fromProductId: v.id,
        fromQuantity: 1,
        toProductId: currentBase.id,
        toQuantity: v.unitMultiplierToBase,
      }));
    payload.conversionPairs.push({
      fromProductId: draft.fromProductId,
      fromQuantity: from,
      toProductId: draft.toProductId,
      toQuantity: to,
    });
  }
  try {
    const resolved = resolveConversionEdit({
      ...payload,
      currentBaseStock: detail.baseStock,
      currentBaseProductId: currentBase.id,
      variants: detail.variants,
    });
    return { payload, resolved, error: null };
  } catch {
    return {
      ...invalid,
      error:
        "Konversi belum menghubungkan semua satuan. Periksa hubungan dan jumlah positifnya.",
    };
  }
}
export function additionResult(
  detail: StockGroupDetail,
  draft?: AdditionDraft,
): {
  payload: AddVariantPayload | null;
  stock: number | null;
  error: string | null;
} {
  if (!draft)
    return {
      payload: null,
      stock: null,
      error: "Isi satuan baru dan konversinya.",
    };
  const from = parseNumber(draft.conversionFromQuantity),
    to = parseNumber(draft.conversionToQuantity);
  const target = detail.variants.find(
    (v) => v.id === draft.conversionToProductId,
  );
  const stock =
    from !== null &&
    to !== null &&
    from > 0 &&
    to > 0 &&
    target &&
    target.unitMultiplierToBase > 0
      ? detail.baseStock / ((to / from) * target.unitMultiplierToBase)
      : null;
  const duplicate = detail.variants.some(
    (v) => v.unit.trim().toLowerCase() === draft.unit.trim().toLowerCase(),
  );
  const min = parseNumber(draft.minStock);
  const error = duplicate
    ? "Satuan sudah ada di grup ini."
    : !draft.unit.trim()
      ? "Isi nama satuan baru."
      : stock === null
        ? "Isi jumlah positif dan pilih satuan konversi."
        : !priceValid(draft)
          ? "Isi harga jual dan HPP opsional dengan angka nol atau lebih."
          : min === null || min < 0
            ? "Isi batas stok minimum dengan angka nol atau lebih."
            : null;
  return {
    stock,
    error,
    payload: error
      ? null
      : {
          unit: draft.unit.trim(),
          price: Number(draft.price),
          costPrice: draft.costPrice.trim() ? Number(draft.costPrice) : null,
          stock: stock!,
          minStock: min!,
          conversionPair: {
            fromQuantity: from!,
            toProductId: target!.id,
            toQuantity: to!,
          },
          note: draft.note.trim() || undefined,
        },
  };
}
