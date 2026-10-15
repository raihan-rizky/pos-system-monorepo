import type { BulkStockGroupProduct } from "./components/BulkStockGroupDrawer";
import type { StockGroupDetail } from "./api/stock-group-api";
import {
  resolveConfirmedGroupStock,
  type ConversionPairInput,
} from "./bulk-stock-groups";

export function targetBaseProduct(target: StockGroupDetail) {
  return target.variants.find(
    (product) =>
      product.unit.trim().toLowerCase() ===
        target.baseUnit.trim().toLowerCase() &&
      product.unitMultiplierToBase === 1,
  );
}

export function creationMembers(
  products: BulkStockGroupProduct[],
  target?: StockGroupDetail | null,
): BulkStockGroupProduct[] {
  // The endpoint resolves existing members followed by selected incoming products.
  return [
    ...(target?.variants.filter(
      (member) => !products.some((product) => product.id === member.id),
    ) ?? []),
    ...products.map(
      (product) =>
        target?.variants.find((member) => member.id === product.id) ?? product,
    ),
  ];
}

export function initialCreationQuantities(
  products: BulkStockGroupProduct[],
  sourceId: string,
) {
  const source = products.find((product) => product.id === sourceId);
  const sourceMultiplier = source?.unitMultiplierToBase ?? 1;
  return Object.fromEntries(
    products
      .filter((product) => product.id !== sourceId)
      .map((product) => [
        product.id,
        String(
          (product.unitMultiplierToBase ?? 1) /
            (sourceMultiplier > 0 ? sourceMultiplier : 1),
        ),
      ]),
  );
}

export function rebaseCreationQuantities(
  products: BulkStockGroupProduct[],
  oldSourceId: string,
  newSourceId: string,
  quantities: Record<string, string>,
) {
  const divisor = Number(quantities[newSourceId]);
  return Object.fromEntries(
    products
      .filter((product) => product.id !== newSourceId)
      .map((product) => [
        product.id,
        Number.isFinite(divisor) &&
        divisor > 0 &&
        (product.id === oldSourceId || Number(quantities[product.id]) > 0)
          ? String(
              (product.id === oldSourceId
                ? 1
                : Number(quantities[product.id])) / divisor,
            )
          : "",
      ]),
  );
}

export interface CreationPreviewRow {
  id: string;
  name: string;
  unit: string;
  before: number;
  after: number;
  quantity: number;
  changed: boolean;
}

export function buildGroupCreationPreview(input: {
  products: BulkStockGroupProduct[];
  target?: StockGroupDetail | null;
  sourceProductId: string;
  quantities: Record<string, string>;
}) {
  const { products, target, sourceProductId, quantities } = input;
  const members = creationMembers(products, target);
  const errors: Record<string, string> = {};
  const empty = {
    errors,
    rows: [] as CreationPreviewRow[],
    conversionPairs: [] as ConversionPairInput[],
    baseStock: null as number | null,
    baseUnit: target?.baseUnit ?? "",
  };
  if (products.length < 2)
    errors.group = "Pilih minimal dua produk dengan satuan berbeda.";
  const base = target ? targetBaseProduct(target) : null;
  if (target && (!base || sourceProductId !== base.id))
    errors.group =
      "Satuan acuan grup tujuan belum sesuai. Tinjau Satuan di grup tersebut sebelum menggabungkan.";
  for (const product of members) {
    if (!product.unit.trim())
      errors[product.id] = "Isi satuan produk terlebih dahulu.";
    if (
      members.some(
        (other) =>
          other.id !== product.id &&
          other.unit.trim().toLowerCase() === product.unit.trim().toLowerCase(),
      )
    )
      errors[product.id] =
        `Satuan ${product.unit.trim()} sudah digunakan anggota lain. Pilih produk dengan satuan berbeda.`;
  }
  const source = members.find((product) => product.id === sourceProductId);
  if (!source || !Number.isFinite(source.stock))
    errors.source = "Pilih sumber dengan stok yang valid.";
  const conversionPairs = members
    .filter((product) => product.id !== sourceProductId)
    .map((product) => {
      const oldMember = target?.variants.find(
        (member) => member.id === product.id,
      );
      const quantity = oldMember
        ? oldMember.unitMultiplierToBase
        : Number(quantities[product.id]);
      if (!Number.isFinite(quantity) || quantity <= 0)
        errors[product.id] ??= "Isi jumlah konversi yang valid, lebih dari 0.";
      return {
        fromProductId: product.id,
        fromQuantity: 1,
        toProductId: sourceProductId,
        toQuantity: quantity,
      };
    });
  if (Object.keys(errors).length) return empty;
  try {
    const resolved = resolveConfirmedGroupStock({
      products: members,
      assignments: products.map((product) => ({ productId: product.id })),
      sourceProductId,
      conversionPairs,
    });
    const rows = members.map((product) => {
      const variant = resolved.variants.find(
        (member) => member.id === product.id,
      )!;
      const after = resolved.baseStock / variant.unitMultiplierToBase;
      return {
        id: product.id,
        name: product.name,
        unit: product.unit,
        before: product.stock,
        after,
        quantity: variant.unitMultiplierToBase,
        changed: Math.abs(after - product.stock) > 0.0001,
      };
    });
    return {
      errors,
      rows,
      conversionPairs,
      baseStock: resolved.baseStock,
      baseUnit: target?.baseUnit ?? resolved.baseUnit ?? "",
    };
  } catch {
    errors.group =
      "Hubungan satuan belum lengkap atau tidak valid. Periksa konversi semua anggota.";
    return empty;
  }
}
