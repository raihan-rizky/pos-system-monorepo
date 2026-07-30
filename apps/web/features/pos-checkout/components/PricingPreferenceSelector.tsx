"use client";

import type {
  CustomerType,
  PricingPreference,
} from "@/features/customer-category-pricing/helpers/pricing-rules";

export type PricingPreferenceAction =
  | { type: "SELECT"; value: PricingPreference }
  | { type: "RESET" };

export function pricingPreferenceReducer(
  state: PricingPreference,
  action: PricingPreferenceAction,
): PricingPreference {
  if (action.type === "RESET") return "SPECIAL";
  return action.value;
}

interface PricingPreferenceSelectorProps {
  customerType: CustomerType;
  value: PricingPreference;
  onChange: (value: PricingPreference) => void;
}

const options: Array<{
  value: PricingPreference;
  label: string;
  description: string;
}> = [
  {
    value: "SPECIAL",
    label: "Harga Khusus (Default)",
    description: "Utamakan aturan Harga Khusus yang cocok.",
  },
  {
    value: "MEMBER",
    label: "Harga Agen/Dinas",
    description: "Utamakan harga member produk.",
  },
];

export function PricingPreferenceSelector({
  customerType,
  value,
  onChange,
}: PricingPreferenceSelectorProps) {
  if (customerType !== "AGEN" && customerType !== "PEMERINTAH") {
    return null;
  }

  return (
    <fieldset className="rounded-xl border border-surface-200 bg-surface-50 p-3">
      <legend className="px-1 text-sm font-semibold text-surface-800">
        Prioritas Harga
      </legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => (
          <label
            key={option.value}
            className={`flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors ${
              value === option.value
                ? "border-brand-400 bg-brand-50"
                : "border-surface-200 bg-white hover:border-surface-300"
            }`}
          >
            <input
              type="radio"
              name="pricing-preference"
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="mt-0.5 h-4 w-4 border-surface-300 text-brand-600 focus:ring-brand-500"
            />
            <span>
              <span className="block text-sm font-semibold text-surface-900">
                {option.label}
              </span>
              <span className="block text-xs text-surface-600">
                {option.description}
              </span>
            </span>
          </label>
        ))}
      </div>
      <p className="mt-2 text-xs text-surface-600">
        Pilihan ini berlaku untuk seluruh transaksi.
      </p>
    </fieldset>
  );
}
