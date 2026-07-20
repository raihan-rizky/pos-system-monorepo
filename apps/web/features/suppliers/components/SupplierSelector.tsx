"use client";

import React, { useEffect, useId, useMemo, useState } from "react";

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
  const [selectedLabel, setSelectedLabel] = useState("");
  const [isOpen, setIsOpen] = useState(false);
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
  const inputId = useId();
  const listboxId = `${inputId}-options`;

  const supplierOptions = useMemo(
    () => suppliers.data?.data ?? [],
    [suppliers.data?.data],
  );

  useEffect(() => {
    if (!value) {
      setSelectedLabel("");
      return;
    }

    const selectedSupplier = supplierOptions.find((supplier) => supplier.id === value);
    if (selectedSupplier) setSelectedLabel(formatSupplierOption(selectedSupplier));
  }, [supplierOptions, value]);

  const selectSupplier = (supplier: (typeof supplierOptions)[number]) => {
    onChange(supplier.id);
    setSelectedLabel(formatSupplierOption(supplier));
    setQuery("");
    setIsOpen(false);
  };

  const handleQuickCreate = async () => {
    if (!quickName.trim() || create.isPending) return;
    setWarning(null);
    const result = await create.mutateAsync({
      name: quickName.trim(),
      type: quickType,
    });
    onChange(result.data.id);
    setSelectedLabel(formatSupplierOption(result.data));
    setQuickName("");
    setWarning(result.warnings[0]?.message ?? null);
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <label htmlFor={inputId} className="mb-1 block text-sm font-bold text-slate-700">
        Supplier <span className="text-red-500">*</span>
      </label>
      <div
        className="relative"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setIsOpen(false);
        }}
      >
        <input
          id={inputId}
          role="combobox"
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={isOpen}
          value={isOpen ? query : selectedLabel}
          onFocus={() => {
            setQuery("");
            setIsOpen(true);
          }}
          onChange={(event) => {
            if (value) onChange("");
            setSelectedLabel("");
            setQuery(event.target.value);
            setIsOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && supplierOptions[0]) {
              event.preventDefault();
              selectSupplier(supplierOptions[0]);
            }
            if (event.key === "Escape") setIsOpen(false);
          }}
          className="min-h-11 w-full rounded-xl border border-slate-200 px-3 pr-10 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
          placeholder="Cari kode atau nama supplier"
        />
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute right-3 top-[14px] text-xs text-slate-500 transition-transform ${isOpen ? "rotate-180" : ""}`}
        >
          ▼
        </span>

        {isOpen && (
          <div
            id={listboxId}
            role="listbox"
            className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg"
          >
            {suppliers.isLoading ? (
              <p className="px-3 py-2 text-sm text-slate-500">Mencari supplier...</p>
            ) : supplierOptions.length === 0 ? (
              <p className="px-3 py-2 text-sm text-slate-500">Supplier tidak ditemukan.</p>
            ) : (
              supplierOptions.map((supplier) => (
                <button
                  key={supplier.id}
                  type="button"
                  role="option"
                  aria-selected={supplier.id === value}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectSupplier(supplier)}
                  className="block w-full cursor-pointer rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-cyan-50 hover:text-cyan-800"
                >
                  {formatSupplierOption(supplier)}
                </button>
              ))
            )}
          </div>
        )}
      </div>
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

function formatSupplierOption(supplier: {
  code: string | null;
  name: string;
  type: SupplierInput["type"];
}) {
  return `${supplier.code ? `${supplier.code} - ` : ""}${supplier.name} - ${supplier.type}`;
}
