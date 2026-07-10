export type ProductPriceLogField =
  | "PRICE"
  | "COST_PRICE"
  | "HARGA_AGEN"
  | "HARGA_DINAS";
export type ProductPriceLogSource = "MANUAL" | "IMPORT" | "API" | "SYSTEM";

type PriceValue = number | string | { toString(): string } | null | undefined;

export type ProductPriceSnapshot = {
  price: PriceValue;
  costPrice: PriceValue;
  hargaAgen?: PriceValue;
  hargaDinas?: PriceValue;
};

export type ProductPriceLogEntry = {
  productId: string;
  storeId: string;
  field: ProductPriceLogField;
  oldValue: string | null;
  newValue: string | null;
  source: ProductPriceLogSource;
  note: string | null;
  changedBy: string | null;
  changedByName: string | null;
};

export function buildProductPriceLogEntries({
  productId,
  storeId,
  before,
  after,
  actor,
  source,
  note,
}: {
  productId: string;
  storeId: string;
  before: ProductPriceSnapshot | null;
  after: ProductPriceSnapshot;
  actor?: { id?: string | null; name?: string | null } | null;
  source: ProductPriceLogSource;
  note?: string | null;
}): ProductPriceLogEntry[] {
  const fields: Array<{
    field: ProductPriceLogField;
    beforeValue: PriceValue;
    afterValue: PriceValue;
  }> = [
    { field: "PRICE", beforeValue: before?.price, afterValue: after.price },
    {
      field: "COST_PRICE",
      beforeValue: before?.costPrice,
      afterValue: after.costPrice,
    },
    {
      field: "HARGA_AGEN",
      beforeValue: before?.hargaAgen,
      afterValue: after.hargaAgen,
    },
    {
      field: "HARGA_DINAS",
      beforeValue: before?.hargaDinas,
      afterValue: after.hargaDinas,
    },
  ];

  return fields.flatMap(({ field, beforeValue, afterValue }) => {
    const oldValue = normalizePriceValue(beforeValue);
    const newValue = normalizePriceValue(afterValue);

    if (before && oldValue === newValue) return [];
    if (!before && newValue === null && (field === "HARGA_AGEN" || field === "HARGA_DINAS")) {
      return [];
    }

    return [
      {
        productId,
        storeId,
        field,
        oldValue,
        newValue,
        source,
        note: note?.trim() || null,
        changedBy: actor?.id ?? null,
        changedByName: actor?.name ?? null,
      },
    ];
  });
}

function normalizePriceValue(value: PriceValue): string | null {
  if (value === null || value === undefined || value === "") return null;

  const numeric = Number(value.toString());
  if (!Number.isFinite(numeric)) return null;

  return numeric.toFixed(2);
}
