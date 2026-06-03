"use client";

import React from "react";
import Image from "next/image";
import { formatRupiah, getDefaultProductImage } from "@/lib/utils";
import type { Product } from "@/hooks/useProducts";
import { useRole } from "@/components/providers/RoleProvider";
import { shouldShowDeleteAction } from "@/features/rbac/helpers/rbac-ui";
import { StockWarningBadge } from "@/features/product-stock-warnings/components";

// Tiny 4×4 neutral grey pixel — used as blur placeholder (no external request)
const BLUR_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAEklEQVQImWNgYGD4z8BQDwAEgAF/QualIQAAAABJRU5ErkJggg==";

interface ProductGridProps {
  products: Product[];
  onAddToCart: (product: Product) => void;
  isLoading?: boolean;
  isEditMode?: boolean;
  onEditProduct?: (product: Product) => void;
  onDeleteProduct?: (product: Product) => void;
}

export function ProductGrid({
  products,
  onAddToCart,
  isLoading,
  isEditMode = false,
  onEditProduct,
  onDeleteProduct,
}: ProductGridProps) {
  const { canPerform } = useRole();
  const canDeleteProducts = shouldShowDeleteAction("product", canPerform);

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
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
        <p className="mt-3 text-sm">Produk tidak ditemukan</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3 items-stretch">
      {products.map((product, index) => {
        const isLowStock = product.stock <= 5;
        const isOutOfStock = product.stock <= 0;
        const isPriority = index < 4;

        return (
          <div
            key={product.id}
            onClick={() => {
              if (isEditMode) return;
              onAddToCart(product);
            }}
            className={`
              relative flex h-full flex-col items-start p-3.5
              rounded-2xl border text-left
              transition-all duration-200
              animate-fade-in
              ${
                isEditMode
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
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
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
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </>
                )}
              </div>
            )}

            {(() => {
              const imgSrc = product.imageUrl || getDefaultProductImage(product.category?.name);
              return (
                <div className="relative w-full aspect-square bg-surface-100 rounded-xl mb-3 overflow-hidden flex items-center justify-center">
                  <Image
                    src={imgSrc}
                    alt={product.name}
                    fill
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                    className="object-cover transition-transform duration-300 hover:scale-105"
                    placeholder="blur"
                    blurDataURL={BLUR_DATA_URL}
                    priority={isPriority}
                    loading={isPriority ? "eager" : "lazy"}
                  />
                </div>
              );
            })()}

            {/* Category badge */}
            <div
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold mb-2 ${isEditMode ? "pr-16" : ""}`}
              style={{
                backgroundColor: `${product.category.color}15`,
                color: product.category.color || "#64748b",
              }}
            >
              <span>{product.category.icon}</span>
              <span>{product.category.name}</span>
            </div>

            {/* Product name */}
            <h3
              className="text-sm font-semibold text-surface-900 leading-snug break-words mb-auto"
              title={product.name}
            >
              {product.name}
            </h3>

            {/* Price + Stock */}
            <div className="w-full mt-2.5">
              <p className="text-base font-bold text-brand-600">
                {formatRupiah(Number(product.price))}
              </p>
              <div className="flex items-center justify-between mt-1">
                <span className="text-[10px] text-surface-400">
                  /{product.unit}
                </span>
                <span
                  className={`text-[10px] font-medium ${
                    isOutOfStock
                      ? "text-danger-500"
                      : isLowStock
                        ? "text-amber-500"
                        : "text-surface-400"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {isOutOfStock ? "Habis" : `Stok: ${product.stock}`}
                    <StockWarningBadge stock={product.stock} minStock={product.minStock} productName={product.name} />
                  </div>
                </span>
              </div>
            </div>

            {/* Low stock indicator */}
            {isLowStock && !isOutOfStock && !isEditMode && (
              <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            )}
          </div>
        );
      })}
    </div>
  );
}
