"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Customer } from "@/hooks/useCustomers";
import { useCustomers } from "@/hooks/useCustomers";
import { useDebounce } from "@/hooks/useDebounce";
import { formatRupiah } from "@/lib/utils";
import {
  GENERAL_CUSTOMER_NAME,
  type CheckoutCustomerSelection,
} from "../customer-selection";

interface CustomerCheckoutSelectProps {
  value: CheckoutCustomerSelection;
  onChange: (value: CheckoutCustomerSelection) => void;
  error?: string | null;
  disabled?: boolean;
  onClearError?: () => void;
}

const TYPE_LABELS: Record<Customer["type"], string> = {
  UMUM: "UMUM",
  AGEN: "AGEN",
};

const TYPE_CLASSES: Record<Customer["type"], string> = {
  UMUM: "bg-slate-100 text-slate-700",
  AGEN: "bg-emerald-100 text-emerald-800",
};

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 21a8 8 0 0 0-16 0" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  );
}

function customerMeta(customer: Customer): string {
  return customer.phone ?? customer.company ?? customer.email ?? "Tanpa kontak";
}

function selectedLabel(value: CheckoutCustomerSelection): string {
  if (value.kind === "general") return GENERAL_CUSTOMER_NAME;
  if (value.kind === "existing") return value.customer.name;
  return value.name.trim() || "Pelanggan baru";
}

export function CustomerCheckoutSelect({
  value,
  onChange,
  error,
  disabled,
  onClearError,
}: CustomerCheckoutSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const debouncedSearch = useDebounce(search, 300);
  const queryParams = useMemo(
    () => ({
      search: debouncedSearch,
      page: 1,
      limit: 20,
    }),
    [debouncedSearch],
  );
  const { data, isFetching } = useCustomers(queryParams);
  const customers = data?.data ?? [];

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selectValue = (next: CheckoutCustomerSelection) => {
    onClearError?.();
    onChange(next);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <label
        id="checkout-customer-label"
        className="text-sm font-medium text-surface-700 mb-1.5 block"
      >
        Pelanggan
      </label>
      <button
        type="button"
        aria-labelledby="checkout-customer-label"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className={`w-full min-h-11 px-3 py-2.5 rounded-xl border bg-white text-left transition-colors duration-200 cursor-pointer
          focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400
          disabled:cursor-not-allowed disabled:bg-surface-50 disabled:opacity-70
          ${error ? "border-danger-400" : "border-surface-200 hover:border-surface-300"}`}
      >
        <span className="flex items-center justify-between gap-3">
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-surface-900 truncate">
              {selectedLabel(value)}
            </span>
            <span className="block text-xs text-surface-500 truncate">
              {value.kind === "general"
                ? "Transaksi tanpa data pelanggan"
                : value.kind === "existing"
                  ? customerMeta(value.customer as Customer)
                  : "Pelanggan baru akan disimpan"}
            </span>
          </span>
          <span className="text-surface-500">
            <ChevronIcon open={open} />
          </span>
        </span>
      </button>

      {open && (
        <div
          role="listbox"
          aria-labelledby="checkout-customer-label"
          className="absolute z-50 mt-2 w-full overflow-hidden rounded-xl border border-surface-200 bg-white shadow-lg"
        >
          <button
            type="button"
            role="option"
            aria-selected={value.kind === "general"}
            onMouseDown={(event) => {
              event.preventDefault();
              selectValue({ kind: "general" });
            }}
            className={`flex min-h-11 w-full items-center gap-3 px-3 py-2.5 text-left transition-colors duration-150 cursor-pointer
              ${value.kind === "general" ? "bg-brand-50 text-brand-900" : "hover:bg-surface-50 text-surface-900"}`}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-700">
              <UserIcon />
            </span>
            <span>
              <span className="block text-sm font-bold">{GENERAL_CUSTOMER_NAME}</span>
              <span className="block text-xs text-surface-500">
                Pilihan cepat untuk pelanggan walk-in
              </span>
            </span>
          </button>

          <div className="border-t border-surface-100 p-2">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari nama, WhatsApp, perusahaan..."
              className="w-full rounded-lg border border-surface-200 bg-surface-50 px-3 py-2 text-sm text-surface-900 placeholder:text-surface-400 transition-colors duration-200
                focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
            />
          </div>

          <div className="max-h-60 overflow-y-auto border-t border-surface-100">
            {customers.map((customer) => (
              <button
                key={customer.id}
                type="button"
                role="option"
                aria-selected={value.kind === "existing" && value.customer.id === customer.id}
                onMouseDown={(event) => {
                  event.preventDefault();
                  selectValue({ kind: "existing", customer });
                }}
                className={`flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors duration-150 cursor-pointer
                  ${
                    value.kind === "existing" && value.customer.id === customer.id
                      ? "bg-brand-50"
                      : "hover:bg-surface-50"
                  }`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-surface-900">
                    {customer.name}
                  </span>
                  <span className="block truncate text-xs text-surface-500">
                    {customerMeta(customer)}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {Number(customer.totalDebt) > 0 && (
                    <span className="rounded-md bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700">
                      {formatRupiah(Number(customer.totalDebt))}
                    </span>
                  )}
                  <span
                    className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${TYPE_CLASSES[customer.type]}`}
                  >
                    {TYPE_LABELS[customer.type]}
                  </span>
                </span>
              </button>
            ))}
            {customers.length === 0 && (
              <div className="px-3 py-4 text-sm text-surface-500">
                {isFetching ? "Memuat pelanggan..." : "Tidak ada pelanggan yang cocok"}
              </div>
            )}
          </div>

          <button
            type="button"
            role="option"
            aria-selected={value.kind === "new"}
            onMouseDown={(event) => {
              event.preventDefault();
              selectValue({
                kind: "new",
                name: search.trim(),
                phone: "",
              });
            }}
            className="flex min-h-11 w-full items-center gap-3 border-t border-surface-100 px-3 py-2.5 text-left text-brand-700 transition-colors duration-150 hover:bg-brand-50 cursor-pointer"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-100">
              <PlusIcon />
            </span>
            <span>
              <span className="block text-sm font-bold">Tambah pelanggan baru</span>
              <span className="block text-xs text-brand-600">
                Simpan ke database pelanggan saat checkout
              </span>
            </span>
          </button>
        </div>
      )}

      {value.kind === "new" && (
        <div className="mt-3 rounded-xl border border-brand-200 bg-brand-50/60 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-brand-800">
                Nama pelanggan
              </label>
              <input
                value={value.name}
                onChange={(event) => {
                  onClearError?.();
                  onChange({ ...value, name: event.target.value });
                }}
                disabled={disabled}
                className="w-full rounded-lg border border-brand-200 bg-white px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400 disabled:bg-surface-50"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-brand-800">
                No. WhatsApp
                <span className="ml-1 font-normal text-brand-600">(opsional)</span>
              </label>
              <input
                value={value.phone ?? ""}
                onChange={(event) => {
                  onClearError?.();
                  onChange({ ...value, phone: event.target.value });
                }}
                disabled={disabled}
                inputMode="tel"
                placeholder="08xx / +628xx"
                className="w-full rounded-lg border border-brand-200 bg-white px-3 py-2 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400 disabled:bg-surface-50"
              />
            </div>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-1.5 text-sm font-medium text-danger-500" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
