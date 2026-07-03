"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import type {
  CategoryCustomerPricingMode,
  CustomerType,
} from "@/features/customer-category-pricing/helpers/pricing-rules";

export interface ProductCartItem {
  cartLineId: string;
  lineType: "PRODUCT";
  productId: string;
  name: string;
  price: number;
  catalogPrice: number;
  costPrice?: number | null;
  hargaDinas?: number | null;
  hargaAgen?: number | null;
  quantity: number;
  unit: string;
  stock: number;
  unitMultiplierToBase?: number | null;
  stockGroup?: {
    baseUnit?: string | null;
  } | null;
  brandId?: string | null;
  brandName?: string | null;
  categoryId: string;
  categoryName: string;
  size?: string;
  material?: string;
  appliedPricing?: {
    ruleId: string;
    customerType: CustomerType;
    categoryId: string;
    categoryName: string | null;
    unit?: string | null;
    brandId?: string | null;
    brandName?: string | null;
    mode: CategoryCustomerPricingMode;
    value: number;
    originalUnitPrice: number;
    appliedUnitPrice: number;
  } | null;
}

export interface PrintingServiceCartItem {
  cartLineId: string;
  lineType: "PRINTING_SERVICE";
  printingServiceId: string;
  name: string;
  price: number;
  quantity: number;
  unit: string;
  size?: string;
  material?: string;
  serviceNote?: string;
  needsMaterial: boolean;
  rawMaterialProductId?: string | null;
  rawMaterialQuantity?: number | null;
  rawMaterialUnit?: string | null;
}

export type CartItem = ProductCartItem | PrintingServiceCartItem;

const CART_STORAGE_KEY = "pos_cart_v1";

function loadCartFromStorage(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(CART_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as CartItem[]) : [];
    return parsed.map((item) => {
      if (item.lineType === "PRINTING_SERVICE") {
        return {
          ...item,
          cartLineId: item.cartLineId || `PRINTING_SERVICE:${item.printingServiceId}:${Date.now()}`,
        };
      }
      const product = item as ProductCartItem;
      return {
        ...product,
        lineType: "PRODUCT",
        catalogPrice: product.catalogPrice ?? product.price,
        categoryId: product.categoryId ?? "",
        categoryName: product.categoryName ?? "",
        brandId: product.brandId ?? null,
        brandName: product.brandName ?? null,
        cartLineId:
          product.cartLineId ||
          buildProductCartLineId(product.productId, product.size, product.material),
      };
    });
  } catch {
    return [];
  }
}

function saveCartToStorage(items: CartItem[]) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Storage quota exceeded or private mode — fail silently
  }
}

function buildProductCartLineId(
  productId: string,
  size?: string,
  material?: string,
) {
  return `PRODUCT:${productId}:${size || ""}:${material || ""}`;
}

export function useCart() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hasLoadedStorage, setHasLoadedStorage] = useState(false);

  useEffect(() => {
    setItems(loadCartFromStorage());
    setHasLoadedStorage(true);
  }, []);

  // Persist to sessionStorage whenever items change
  useEffect(() => {
    if (!hasLoadedStorage) return;
    saveCartToStorage(items);
  }, [hasLoadedStorage, items]);

  const addItem = useCallback(
    (product: { id: string; name: string; price: number; costPrice?: number | null; hargaDinas?: number | null; hargaAgen?: number | null; unit: string; stock: number; unitMultiplierToBase?: number | null; stockGroup?: { baseUnit?: string | null } | null; brandId?: string | null; brandName?: string | null; categoryId: string; categoryName: string; size?: string; material?: string }) => {
      setItems((prev) => {
        const existing = prev.find(
          (item) =>
            item.lineType === "PRODUCT" &&
            item.productId === product.id &&
            item.size === product.size &&
            item.material === product.material,
        );
        if (existing) {
          return prev.map((item) =>
            item.lineType === "PRODUCT" && item.productId === product.id && item.size === product.size && item.material === product.material
              ? { ...item, quantity: item.quantity + 1 }
              : item
          );
        }
        return [
          ...prev,
          {
            cartLineId: buildProductCartLineId(product.id, product.size, product.material),
            lineType: "PRODUCT",
            productId: product.id,
            name: product.name,
            price: product.price,
            catalogPrice: product.price,
            costPrice: product.costPrice ?? null,
            hargaDinas: product.hargaDinas ?? null,
            hargaAgen: product.hargaAgen ?? null,
            quantity: 1,
            unit: product.unit,
            stock: product.stock,
            unitMultiplierToBase: product.unitMultiplierToBase ?? null,
            stockGroup: product.stockGroup ?? null,
            brandId: product.brandId ?? null,
            brandName: product.brandName ?? null,
            categoryId: product.categoryId,
            categoryName: product.categoryName,
            size: product.size,
            material: product.material,
            appliedPricing: null,
          },
        ];
      });
    },
    []
  );

  const addServiceItem = useCallback(
    (service: Omit<PrintingServiceCartItem, "cartLineId" | "lineType">) => {
      setItems((prev) => [
        ...prev,
        {
          ...service,
          cartLineId: `PRINTING_SERVICE:${service.printingServiceId}:${Date.now()}:${prev.length}`,
          lineType: "PRINTING_SERVICE",
        },
      ]);
    },
    [],
  );

  const removeItem = useCallback((cartLineId: string) => {
    setItems((prev) => prev.filter((item) => item.cartLineId !== cartLineId));
  }, []);

  const updateQuantity = useCallback((cartLineId: string, quantity: number) => {
    if (quantity <= 0) {
      setItems((prev) => prev.filter((item) => item.cartLineId !== cartLineId));
      return;
    }
    setItems((prev) =>
      prev.map((item) =>
        item.cartLineId === cartLineId
          ? {
              ...item,
              quantity,
            }
          : item
      )
    );
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
    if (typeof window !== "undefined") {
      sessionStorage.removeItem(CART_STORAGE_KEY);
    }
  }, []);

  const { subtotal, totalItems } = useMemo(() => {
    const sub = items.reduce(
      (sum: number, item: CartItem) => sum + item.price * item.quantity,
      0
    );
    const total = items.reduce((sum: number, item: CartItem) => sum + item.quantity, 0);
    return { subtotal: sub, totalItems: total };
  }, [items]);

  return {
    items,
    addItem,
    addServiceItem,
    removeItem,
    updateQuantity,
    clearCart,
    subtotal,
    totalItems,
  };
}
