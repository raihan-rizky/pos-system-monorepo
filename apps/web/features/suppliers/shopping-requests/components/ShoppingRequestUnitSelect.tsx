"use client";

import { useQuery } from "@tanstack/react-query";

export type ShoppingUnitVariant = {
  id: string;
  name: string;
  sku: string;
  unit: string;
  stock: number;
  costPrice: number | null;
  imageUrl: string | null;
  stockGroupId: string | null;
  unitMultiplierToBase: number;
  stockGroup: { id: string; displayName: string; baseUnit: string | null; baseStock: number } | null;
};

export function ShoppingRequestUnitSelect({
  productId, unit, stockGroupId, onChange,
}: {
  productId: string;
  unit: string;
  stockGroupId?: string | null;
  onChange: (variant: ShoppingUnitVariant) => void;
}) {
  const variants = useQuery({
    queryKey: ["shopping-request-unit-variants", productId],
    enabled: Boolean(stockGroupId),
    queryFn: async (): Promise<ShoppingUnitVariant[]> => {
      const response = await fetch(`/api/suppliers/shopping-requests/unit-variants?productId=${encodeURIComponent(productId)}`);
      if (!response.ok) throw new Error("Pilihan satuan belum bisa dimuat");
      const payload = await response.json() as { data: ShoppingUnitVariant[] };
      return payload.data;
    },
    staleTime: 60_000,
  });

  if (!stockGroupId) return <span className="text-xs text-slate-500">Satuan: {unit}</span>;
  return (
    <label className="block min-w-[110px] text-xs font-bold text-slate-600">
      Satuan
      <select
        value={productId}
        disabled={variants.isPending || variants.isError}
        onChange={(event) => {
          const variant = variants.data?.find((candidate) => candidate.id === event.target.value);
          if (variant) onChange(variant);
        }}
        className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm font-semibold text-slate-900 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-50"
      >
        {!variants.data?.some((variant) => variant.id === productId) && <option value={productId}>{unit}</option>}
        {variants.data?.map((variant) => <option key={variant.id} value={variant.id}>{variant.unit} · {variant.sku}</option>)}
      </select>
      {variants.isError && <span role="alert" className="mt-1 block font-normal text-rose-600">Satuan belum bisa dimuat.</span>}
    </label>
  );
}
