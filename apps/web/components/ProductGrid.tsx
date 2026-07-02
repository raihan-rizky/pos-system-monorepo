"use client";

import React, { useCallback } from "react";
import { Search } from "lucide-react";
import type { Product } from "@/hooks/useProducts";
import { ProductCard } from "@/features/pos-product-variants";
import { useRole } from "@/components/providers/RoleProvider";
import { shouldShowDeleteAction } from "@/features/rbac/helpers/rbac-ui";
import {
  isRegularPriceFallback,
  type CategoryPricingRule,
  type CustomerType,
  priceProductForCustomerType,
} from "@/features/customer-category-pricing/helpers/pricing-rules";

interface ProductGridProps {
  products: Product[];
  onAddToCart: (product: Product, variantId?: string) => void;
  isLoading?: boolean;
  isEditMode?: boolean;
  onEditProduct?: (product: Product) => void;
  onDeleteProduct?: (product: Product) => void;
  customerType?: CustomerType;
  categoryPricingRules?: CategoryPricingRule[];
}

export function ProductGrid({
  products,
  onAddToCart,
  isLoading,
  isEditMode = false,
  onEditProduct,
  onDeleteProduct,
  customerType,
  categoryPricingRules,
}: ProductGridProps) {
  const { canPerform } = useRole();
  const canDeleteProducts = shouldShowDeleteAction("product", canPerform);

  const handleAddToCart = useCallback(
    (product: Product, variantId?: string) => {
      onAddToCart(product, variantId);
    },
    [onAddToCart]
  );

  const showRegularPriceHintFor = useCallback(
    (product: Product) => {
      if (!customerType || !categoryPricingRules) return false;
      const priced = priceProductForCustomerType(
        {
          categoryId: product.category.id,
          categoryName: product.category.name,
          price: product.price,
          hargaDinas: product.hargaDinas,
          hargaAgen: product.hargaAgen,
        },
        customerType,
        categoryPricingRules,
      );
      return isRegularPriceFallback({
        appliedPricing: priced.appliedPricing,
        customerType,
      });
    },
    [customerType, categoryPricingRules],
  );

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3 items-stretch">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="min-h-[220px] rounded-2xl bg-surface-100 animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-surface-400">
        <Search className="h-12 w-12" strokeWidth={1.5} aria-hidden="true" />
        <p className="mt-3 text-sm">Produk tidak ditemukan</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3 items-stretch">
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          onAddToCart={handleAddToCart}
          isEditMode={isEditMode}
          onEditProduct={onEditProduct}
          onDeleteProduct={onDeleteProduct}
          showRegularPriceHint={showRegularPriceHintFor(product)}
        />
      ))}
    </div>
  );
}
