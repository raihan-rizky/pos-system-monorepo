import React, { useState, useCallback, useMemo } from "react";
import Image from "next/image";
import { Edit2, Trash2 } from "lucide-react";
import type { Product } from "@/hooks/useProducts";
import { formatRupiah, getDefaultProductImage } from "@/lib/utils";
import { CategoryIcon } from "@/lib/category-icons";
import { formatCompoundStock } from "@/features/product-stock-groups/stock-display";
import { StockWarningBadge } from "@/features/product-stock-warnings/components";
import { useRole } from "@/components/providers/RoleProvider";
import { shouldShowDeleteAction } from "@/features/rbac/helpers/rbac-ui";
import { VariantSelector } from "./VariantSelector";
import { ProductDescriptionTooltip } from "./ProductDescriptionTooltip";
import { orderUnits } from "../helpers/unit-order";
import { priceCatalogVariantForCustomer } from "@/features/customer-category-pricing/helpers/product-pricing";
import { isSpecialCategoryPricing, type CategoryPricingRule, type CustomerType } from "@/features/customer-category-pricing/helpers/pricing-rules";
import { SpecialPriceBadge } from "@/features/customer-category-pricing/components/SpecialPriceBadge";

interface ProductCardProps {
  product: Product;
  onAddToCart: (product: Product, variantId?: string) => void;
  isEditMode?: boolean;
  onEditProduct?: (product: Product) => void;
  onDeleteProduct?: (product: Product) => void;
  showRegularPriceHint?: boolean;
  customerType?: CustomerType;
  categoryPricingRules?: CategoryPricingRule[];
}

const BLUR_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAEklEQVQImWNgYGD4z8BQDwAEgAF/QualIQAAAABJRU5ErkJggg==";

const ProductCardComponent: React.FC<ProductCardProps> = ({
  product,
  onAddToCart,
  isEditMode = false,
  onEditProduct,
  onDeleteProduct,
  showRegularPriceHint = false,
  customerType = "UMUM",
  categoryPricingRules = [],
}) => {
  const { canPerform } = useRole();
  const canDeleteProducts = shouldShowDeleteAction("product", canPerform);

  const [selectedVariantId, setSelectedVariantId] = useState(
    product.defaultVariant?.id ?? ""
  );
  const orderedVariants = useMemo(
    () => orderUnits(product.variants || [], product.stockGroup?.baseUnit),
    [product.variants, product.stockGroup?.baseUnit],
  );

  const selectedVariant = useMemo(() => {
    return (
      (product.variants || []).find((v) => v.id === selectedVariantId) ||
      product.defaultVariant || {
        id: "",
        unit: product.unit,
        price: product.price,
        stock: product.stock,
        sku: product.sku,
        hargaDinas: product.hargaDinas,
        hargaAgen: product.hargaAgen,
      }
    );
  }, [product, selectedVariantId]);

  const catalogVariant = product.variants?.find(v => v.id === selectedVariant.id);
  const selectedStockGroup = catalogVariant?.stockGroup ?? product.stockGroup;
  const selectedMultiplier = catalogVariant?.unitMultiplierToBase ?? (
    selectedVariant.unit.trim().toLowerCase() === product.unit.trim().toLowerCase()
      ? product.unitMultiplierToBase
      : undefined
  );
  const selectedStockLabel = formatCompoundStock({
    stock: selectedVariant.stock,
    unit: selectedVariant.unit,
    unitMultiplierToBase: selectedMultiplier,
    stockGroup: selectedStockGroup,
  });
  const baseUnit = selectedStockGroup?.baseUnit?.trim();
  const conversionLabel = baseUnit &&
    baseUnit.toLowerCase() !== selectedVariant.unit.trim().toLowerCase() &&
    typeof selectedMultiplier === "number" &&
    Number.isFinite(selectedMultiplier) && selectedMultiplier > 0
    ? `1 ${selectedVariant.unit} = ${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 20 }).format(selectedMultiplier)} ${baseUnit}`
    : undefined;
  const agenPrice = priceCatalogVariantForCustomer(product, catalogVariant, "AGEN", categoryPricingRules);
  const dinasPrice = priceCatalogVariantForCustomer(product, catalogVariant, "PEMERINTAH", categoryPricingRules);
  const hasSpecialAgenPrice = isSpecialCategoryPricing(agenPrice.appliedPricing);
  const hasSpecialDinasPrice = isSpecialCategoryPricing(dinasPrice.appliedPricing);
  const hargaAgen = agenPrice.unitPrice;
  const hargaDinas = dinasPrice.unitPrice;
  const description = product.description;
  const priceVariant = (variantId: string) => priceCatalogVariantForCustomer(product, product.variants?.find(v => v.id === variantId), customerType, categoryPricingRules);
  const selectedPrice = priceVariant(selectedVariant.id);
  const hasSpecialPrice = isSpecialCategoryPricing(selectedPrice.appliedPricing);
  const pricedVariants = orderedVariants.map(v => {
    const priced = priceVariant(v.id);
    return { ...v, displayPrice: priced.unitPrice, appliedPricing: priced.appliedPricing };
  });

  const isOutOfStock = Math.floor(selectedVariant.stock ?? 0) <= 0;
  const isLowStock = Math.floor(selectedVariant.stock ?? 0) <= 5;
  const showVariantDropdown = (product.variants || []).length >= 3;

  const handleAddToCart = useCallback(() => {
    if (isEditMode) return;
    onAddToCart(product, selectedVariantId || undefined);
  }, [product, selectedVariantId, onAddToCart, isEditMode]);

  return (
    <div
      onClick={handleAddToCart}
      className={`
        relative flex h-full flex-col items-start p-3.5
        rounded-2xl border text-left
        transition-all duration-200
        ${isEditMode
          ? "bg-white border-brand-300 ring-2 ring-brand-100 ring-opacity-50"
          : isOutOfStock
            ? "bg-amber-50/70 border-amber-200 hover:border-amber-300 hover:shadow-md active:translate-y-0 cursor-pointer"
            : "bg-white border-surface-200 hover:border-brand-300 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
        }
      `}
    >
      {/* Edit Mode Overlays */}
      {isEditMode && (
        <div className="absolute top-2 right-2 flex items-center gap-1 z-10 bg-white/90 backdrop-blur rounded-lg p-1 shadow-sm border border-surface-200">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEditProduct?.(product);
            }}
            className="p-1.5 text-surface-400 hover:text-brand-600 hover:bg-brand-50 rounded-md transition-colors"
          >
            <Edit2 className="h-4 w-4" aria-hidden="true" />
          </button>
          {canDeleteProducts && (
            <>
              <div className="w-px h-4 bg-surface-200"></div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteProduct?.(product);
                }}
                className="p-1.5 text-danger-400 hover:text-danger-600 hover:bg-danger-50 rounded-md transition-colors"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </>
          )}
        </div>
      )}

      {/* Image */}
      <div className="relative w-full aspect-square bg-surface-100 rounded-xl mb-3 overflow-hidden flex items-center justify-center">
        <Image
          src={product.imageUrl || getDefaultProductImage(product.category?.name)}
          alt={product.name}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
          className="object-cover transition-transform duration-300 hover:scale-105"
          placeholder="blur"
          blurDataURL={BLUR_DATA_URL}
          loading="lazy"
        />
      </div>

      {/* Category and selected unit */}
      <div className="w-full mb-2">
        <div className="flex flex-wrap items-center gap-1">
          <div
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${isEditMode ? "pr-16" : ""}`}
            style={{
              backgroundColor: `${product.category.color}15`,
              color: product.category.color || "#64748b",
            }}
          >
            <CategoryIcon value={product.category.icon} className="h-3 w-3" />
            <span>{product.category.name}</span>
          </div>
          <span
            aria-label="Satuan terpilih"
            className="inline-flex max-w-full items-center break-words px-2 py-0.5 rounded-full bg-surface-100 text-[10px] font-semibold text-surface-600"
          >
            {selectedStockLabel}
          </span>
        </div>
        {conversionLabel && (
          <p aria-label="Konversi satuan" className="mt-1 break-words text-[10px] text-surface-500">
            {conversionLabel}
          </p>
        )}
      </div>

      {/* Product name */}
      <div className="mb-auto w-full">
        <h3
          className="text-sm font-semibold text-surface-900 leading-snug break-words w-full"
          title={product.name}
        >
          {product.name}
        </h3>
        <ProductDescriptionTooltip key={selectedVariant.id} description={description} />
      </div>

      {/* Price + Stock */}
      <div className="w-full mt-2.5">
        <div className="flex items-center gap-2">
          <p className={`text-base font-bold ${hasSpecialPrice ? "text-emerald-800" : "text-brand-600"}`}>
            {formatRupiah(selectedPrice.unitPrice)}
          </p>
          {hasSpecialPrice && <SpecialPriceBadge />}
        </div>
        <div className="mt-1 space-y-0.5 text-[11px] leading-snug">
          <p className="flex flex-wrap items-center gap-1">
            <span className="font-medium text-surface-500">Agen:</span>
            <span className={`font-semibold ${hasSpecialAgenPrice ? "text-emerald-800" : "text-surface-600"}`}>
              {formatRupiah(hargaAgen)}
            </span>
            {hasSpecialAgenPrice ? <SpecialPriceBadge /> : <span className="text-surface-500">· Mengikuti harga jual</span>}
          </p>
          <p className="flex flex-wrap items-center gap-1">
            <span className="font-medium text-surface-500">Dinas:</span>
            <span className={`font-semibold ${hasSpecialDinasPrice ? "text-emerald-800" : "text-surface-600"}`}>
              {formatRupiah(hargaDinas)}
            </span>
            {hasSpecialDinasPrice ? <SpecialPriceBadge /> : <span className="text-surface-500">· Mengikuti harga jual</span>}
          </p>
        </div>
        {(showRegularPriceHint || (customerType !== "UMUM" && !selectedPrice.appliedPricing)) && (
          <span
            className="inline-block mt-1 text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-md"
            title="Tidak ada Harga Dinas atau Harga Khusus — menggunakan harga reguler"
          >
            Harga Reguler
          </span>
        )}
        <div className="flex items-center justify-between mt-1 gap-1 flex-wrap">
          <span className="text-[10px] text-surface-400">
            /{selectedVariant.unit}
          </span>
          <span
            className={`text-[10px] font-medium ${isOutOfStock
                ? "text-danger-500"
                : isLowStock
                  ? "text-amber-500"
                  : "text-surface-400"
              }`}
          >
            <div className="flex items-center gap-2">
              {isOutOfStock ? (
                "Habis"
              ) : (
                `Stok: ${selectedStockLabel}`
              )}
              <StockWarningBadge
                stock={selectedVariant.stock}
                minStock={product.minStock}
                productName={product.name}
              />
            </div>
          </span>
        </div>
      </div>

      {/* 2 Variants Selection */}
      {(product.variants || []).length === 2 && (
        <div className="w-full mt-2 flex gap-1.5" onClick={(e) => e.stopPropagation()}>
          {orderedVariants.map((variant) => {
            const isSelected = selectedVariantId === variant.id;
            const isVariantOutOfStock = Math.floor(variant.stock ?? 0) <= 0;
            return (
              <button
                key={variant.id}
                onClick={() => setSelectedVariantId(variant.id)}
                className={`flex-1 flex flex-col justify-center px-2 py-1.5 border rounded-xl transition-all min-w-0 ${isSelected
                    ? "bg-brand-50 border-brand-400 shadow-sm ring-1 ring-brand-400/50"
                    : "bg-surface-50 border-surface-200 hover:border-brand-300 hover:bg-surface-100 opacity-90"
                  }`}
              >
                <div className="flex w-full items-center justify-between gap-1 mb-0.5">
                  <span className={`text-[11px] font-bold truncate ${isSelected ? "text-brand-700" : "text-surface-700"}`}>
                    {variant.unit}
                  </span>
                  {isVariantOutOfStock && (
                    <span className="text-[9px] font-bold text-danger-500 uppercase shrink-0">Habis</span>
                  )}
                </div>
                <span className={`text-[10px] font-medium text-left truncate ${isSelected ? "text-brand-600" : "text-surface-500"}`}>
                  {formatRupiah(priceVariant(variant.id).unitPrice)}
                </span>
                {isSpecialCategoryPricing(priceVariant(variant.id).appliedPricing) && <SpecialPriceBadge />}
              </button>
            );
          })}
        </div>
      )}

      {/* Variant Selector Dropdown (3 or more) */}
      {showVariantDropdown && (
        <div className="w-full mt-2" onClick={(e) => e.stopPropagation()}>
          <VariantSelector
            variants={pricedVariants}
            selected={selectedVariantId}
            onChange={setSelectedVariantId}
          />
        </div>
      )}

      {/* Low stock indicator */}
      {isLowStock && !isOutOfStock && !isEditMode && (
        <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-amber-400" />
      )}
    </div>
  );
};

export const ProductCard = React.memo(ProductCardComponent);

export default ProductCard;
