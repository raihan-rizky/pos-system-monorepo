import React, { useCallback } from 'react';
import type { ProductVariant } from '@/hooks/useProducts';
import { formatRupiah } from '@/lib/utils';

interface VariantSelectorProps {
  variants: ProductVariant[];
  selected: string;
  onChange: (variantId: string) => void;
}

export const VariantSelector: React.FC<VariantSelectorProps> = ({
  variants,
  selected,
  onChange,
}) => {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onChange(e.target.value);
    },
    [onChange]
  );

  return (
    <div className="relative w-full group">
      <select
        value={selected}
        onChange={handleChange}
        onClick={(e) => e.stopPropagation()}
        className="w-full pl-3 pr-8 py-2 bg-surface-50 border border-surface-200 rounded-xl text-xs font-semibold text-surface-700 outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-400 hover:border-brand-300 hover:bg-surface-100 cursor-pointer transition-all duration-200 appearance-none shadow-sm truncate"
        style={{
          backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e")`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 0.75rem center',
          backgroundSize: '1rem',
          textOverflow: 'ellipsis',
        }}
      >
        {variants.map((variant) => {
          const suffix = Math.floor(variant.stock ?? 0) <= 0 ? ' (Stok Habis)' : '';
          return (
            <option key={variant.id} value={variant.id}>
              {variant.unit} • {formatRupiah(variant.price)}{suffix}
            </option>
          );
        })}
      </select>
    </div>
  );
};

export default VariantSelector;
