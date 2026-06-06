"use client";

import React, { useMemo, useState } from "react";

import { useDebounce } from "@/hooks/useDebounce";
import { useCreateSupplier, useSuppliers } from "@/features/suppliers/hooks/useSuppliers";
import { SUPPLIER_TYPES, type SupplierInput } from "@/features/suppliers/types/supplier";

type SupplierSelectorProps = {
  value: string;
  onChange: (supplierId: string) => void;
  error?: string | null;
};

export function SupplierSelector({ value, onChange, error }: SupplierSelectorProps) {
  const [query, setQuery] = useState("");
  const [quickName, setQuickName] = useState("");
  const [quickType, setQuickType] = useState<SupplierInput["type"]>("DISTRIBUTOR");
  const [warning, setWarning] = useState<string | null>(null);
  const debouncedQuery = useDebounce(query.trim(), 300);
  const suppliers = useSuppliers({
    q: debouncedQuery || undefined,
    isActive: true,
    limit: 50,
  });
  const create = useCreateSupplier();

  const supplierOptions = useMemo(
    () => suppliers.data?.data ?? [],
    [suppliers.data?.data],
  );

  const handleQuickCreate = async () => {
    if (!quickName.trim() || create.isPending) return;
    setWarning(null);
    const result = await create.mutateAsync({
      name: quickName.trim(),
      type: quickType,
    });
    onChange(result.data.id);
    setQuickName("");
    setWarning(result.warnings[0]?.message ?? null);
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <label className="mb-1 block text-sm font-bold text-slate-700">
        Supplier <span className="text-red-500">*</span>
      </label>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className="mb-2 min-h-10 w-full rounded-xl border border-slate-200 px-3 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
        placeholder="Cari supplier"
      />
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
      >
        <option value="">Pilih supplier</option>
        {supplierOptions.map((supplier) => (
          <option key={supplier.id} value={supplier.id}>
            {supplier.name} - {supplier.type}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 text-xs font-semibold text-red-600">{error}</p>}
      {warning && <p className="mt-1 text-xs font-semibold text-amber-700">{warning}</p>}
      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_160px_auto]">
        <input
          value={quickName}
          onChange={(event) => setQuickName(event.target.value)}
          className="min-h-10 rounded-xl border border-slate-200 px-3 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
          placeholder="Tambah supplier cepat"
        />
        <select
          value={quickType}
          onChange={(event) => setQuickType(event.target.value as SupplierInput["type"])}
          className="min-h-10 rounded-xl border border-slate-200 px-3 text-sm"
        >
          {SUPPLIER_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleQuickCreate}
          disabled={!quickName.trim() || create.isPending}
          className="min-h-10 cursor-pointer rounded-xl bg-slate-950 px-3 text-sm font-bold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Tambah
        </button>
      </div>
    </div>
  );
}
