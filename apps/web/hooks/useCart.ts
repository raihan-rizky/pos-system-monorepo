"use client";

import { useState, useCallback, useEffect, useMemo, type SetStateAction } from "react";
import type {
  CategoryCustomerPricingMode,
  CustomerType,
} from "@/features/customer-category-pricing/helpers/pricing-rules";
import { changeCartUnit } from "@/features/pos-checkout/helpers/cart-unit-change";
import { cartStorageKey, clearOwnedCart, readOwnedCart, writeOwnedCart, type CartOwner } from "@/features/pos-checkout/helpers/cart-session-storage";
import type { PriceRoundingResult } from "@/features/product-price-rounding/rounding";

export interface ProductCartItem {
  cartLineId: string;
  lineType: "PRODUCT";
  productId: string;
  name: string;
  description?: string | null;
  price: number;
  catalogPrice: number;
  automaticPrice?: number;
  transactionPrice?: number | null;
  customerManualPrice?: number | null;
  priceRounding?: PriceRoundingResult | null;
  priceError?: string | null;
  costPrice?: number | null;
  baseCostPrice?: number | null;
  baseCostUnit?: string | null;
  hargaDinas?: number | null;
  hargaAgen?: number | null;
  /** Total monetary discount for this cart line. */
  discount?: number;
  quantity: number;
  unit: string;
  stock: number;
  unitMultiplierToBase?: number | null;
  stockGroup?: {
    id?: string | null;
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
    discountPercent?: number;
    originalUnitPrice: number;
    appliedUnitPrice: number;
  } | null;
  unitOptions?: CartUnitOption[];
}

export type CartUnitOption = Pick<
  ProductCartItem,
  | "productId"
  | "name"
  | "description"
  | "price"
  | "catalogPrice"
  | "costPrice"
  | "baseCostPrice"
  | "baseCostUnit"
  | "hargaAgen"
  | "hargaDinas"
  | "unit"
  | "stock"
  | "unitMultiplierToBase"
  | "stockGroup"
  | "brandId"
  | "brandName"
  | "categoryId"
  | "categoryName"
  | "size"
  | "material"
  | "appliedPricing"
  | "priceRounding"
  | "priceError"
>;

export interface PrintingServiceCartItem {
  cartLineId: string;
  lineType: "PRINTING_SERVICE";
  printingServiceId: string | null;
  name: string;
  price: number;
  /** Total monetary discount for this cart line. */
  discount?: number;
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

export function applyTransactionPrice(
  items: CartItem[],
  cartLineId: string,
  price: number | null,
): CartItem[] {
  return items.map((item) =>
    item.lineType === "PRODUCT" && item.cartLineId === cartLineId
      ? {
          ...item,
          transactionPrice: price,
          price: price ?? item.catalogPrice,
        }
      : item,
  );
}

export function applyProductPriceUpdate(
  items: CartItem[],
  productId: string,
  prices: {
    price: number;
    hargaAgen: number | null;
    hargaDinas: number | null;
  },
): CartItem[] {
  return items.map((item) =>
    item.lineType === "PRODUCT" && item.productId === productId
      ? {
          ...item,
          catalogPrice: prices.price,
          hargaAgen: prices.hargaAgen,
          hargaDinas: prices.hargaDinas,
          price: item.transactionPrice ?? prices.price,
          unitOptions: item.unitOptions?.map((option) =>
            option.productId === productId
              ? {
                  ...option,
                  price: prices.price,
                  catalogPrice: prices.price,
                  hargaAgen: prices.hargaAgen,
                  hargaDinas: prices.hargaDinas,
                }
              : option,
          ),
        }
      : item,
  );
}

export function applyProductGroupMetadataUpdate(
  items: CartItem[],
  productIds: string[],
  metadata: {
    name: string;
    description?: string | null;
    categoryId: string;
    categoryName: string;
    brandId: string | null;
    brandName: string | null;
  },
): CartItem[] {
  const updatedProductIds = new Set(productIds);
  return items.map((item) =>
    item.lineType === "PRODUCT" && updatedProductIds.has(item.productId)
      ? {
          ...item,
          ...metadata,
          unitOptions: item.unitOptions?.map((option) =>
            updatedProductIds.has(option.productId)
              ? { ...option, ...metadata }
              : option,
          ),
        }
      : item,
  );
}

const EMPTY_CART: CartItem[] = [];

export function normalizeStoredCartItems(items: CartItem[]): CartItem[] {
  return items.map((item) => {
    if (item.lineType === "PRINTING_SERVICE") {
      return {
        ...item,
        cartLineId: item.cartLineId || `PRINTING_SERVICE:${item.printingServiceId}:${Date.now()}`,
      };
    }
    const product = item as ProductCartItem;
    const transactionPrice = product.transactionPrice ?? null;
    return {
      ...product,
      lineType: "PRODUCT",
      price: transactionPrice ?? product.price,
      catalogPrice: product.catalogPrice ?? product.price,
      hargaAgen: product.hargaAgen == null ? product.hargaAgen : Number(product.hargaAgen),
      hargaDinas: product.hargaDinas == null ? product.hargaDinas : Number(product.hargaDinas),
      unitOptions: product.unitOptions?.map((option) => ({
        ...option,
        hargaAgen: option.hargaAgen == null ? option.hargaAgen : Number(option.hargaAgen),
        hargaDinas: option.hargaDinas == null ? option.hargaDinas : Number(option.hargaDinas),
      })),
      transactionPrice,
      categoryId: product.categoryId ?? "",
      categoryName: product.categoryName ?? "",
      brandId: product.brandId ?? null,
      brandName: product.brandName ?? null,
      cartLineId:
        product.cartLineId ||
        buildProductCartLineId(product.productId, product.size, product.material),
    };
  });
}

export function applyProductUnitOptionUpdates(
  items: CartItem[],
  groups: CartUnitOption[][],
): CartItem[] {
  const optionsByProductId = new Map<string, CartUnitOption[]>();

  for (const group of groups) {
    const groupId = group.find((option) => option.stockGroup?.id)?.stockGroup?.id;
    if (!groupId) continue;
    const verifiedOptions = group.filter(
      (option) => option.stockGroup?.id === groupId,
    );
    if (verifiedOptions.length < 2) continue;
    for (const option of verifiedOptions) {
      optionsByProductId.set(option.productId, verifiedOptions);
    }
  }

  return items.map((item) => {
    if (item.lineType !== "PRODUCT") return item;
    const unitOptions = optionsByProductId.get(item.productId);
    if (!unitOptions) return item;
    const catalogGroupId = unitOptions[0]?.stockGroup?.id;
    if (item.stockGroup?.id && item.stockGroup.id !== catalogGroupId) return item;
    return {
      ...item,
      stockGroup: item.stockGroup ?? unitOptions[0]?.stockGroup ?? null,
      unitOptions,
    };
  });
}

function loadCartFromStorage(owner: CartOwner): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    return normalizeStoredCartItems(readOwnedCart(window.sessionStorage, owner));
  } catch {
    return [];
  }
}

function saveCartToStorage(owner: CartOwner, items: CartItem[]): boolean {
  try {
    if (items.length) return writeOwnedCart(window.sessionStorage, owner, items).ok;
    clearOwnedCart(window.sessionStorage, owner);
    return true;
  } catch {
    return false;
  }
}

function buildProductCartLineId(
  productId: string,
  size?: string,
  material?: string,
) {
  return `PRODUCT:${productId}:${size || ""}:${material || ""}`;
}

export function useCart(owner: CartOwner | null) {
  const userId = owner?.userId;
  const storeId = owner?.storeId ?? null;
  const identity = useMemo(() => userId ? { userId, storeId } : null, [userId, storeId]);
  const key = identity ? cartStorageKey(identity) : null;
  const [cart, setCart] = useState<{ key: string | null; items: CartItem[] }>({ key: null, items: EMPTY_CART });
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const hasLoadedStorage = cart.key === key;
  const items = hasLoadedStorage ? cart.items : EMPTY_CART;
  const persistenceError = key !== null && key === failedKey
    ? "Keranjang belum dapat disimpan di browser. Selesaikan transaksi sebelum menutup halaman."
    : null;

  useEffect(() => {
    setCart({ key, items: identity ? loadCartFromStorage(identity) : EMPTY_CART });
  }, [identity, key]);

  useEffect(() => {
    if (!identity || !hasLoadedStorage) return;
    setFailedKey(saveCartToStorage(identity, items) ? null : key);
  }, [hasLoadedStorage, identity, items, key]);

  const setItems = useCallback((update: SetStateAction<CartItem[]>) => {
    setCart(current => current.key === key && key !== null
      ? { key, items: typeof update === "function" ? update(current.items) : update }
      : current);
  }, [key]);

  const addItem = useCallback(
    (product: { id: string; name: string; description?: string | null; price: number; costPrice?: number | null; baseCostPrice?: number | null; baseCostUnit?: string | null; hargaDinas?: number | null; hargaAgen?: number | null; unit: string; stock: number; unitMultiplierToBase?: number | null; stockGroup?: { id?: string | null; baseUnit?: string | null } | null; brandId?: string | null; brandName?: string | null; categoryId: string; categoryName: string; size?: string; material?: string; unitOptions?: CartUnitOption[] }) => {
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
              ? {
                  ...item,
                  quantity: item.quantity + 1,
                  description: product.description,
                  unitOptions: product.unitOptions ?? item.unitOptions,
                  stockGroup: product.stockGroup ?? item.stockGroup,
                }
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
            description: product.description,
            price: product.price,
            catalogPrice: product.price,
            costPrice: product.costPrice ?? null,
            baseCostPrice: product.baseCostPrice ?? null,
            baseCostUnit: product.baseCostUnit ?? null,
            hargaDinas: product.hargaDinas ?? null,
            hargaAgen: product.hargaAgen ?? null,
            quantity: 1,
            unit: product.unit,
            stock: product.stock,
            unitMultiplierToBase: product.unitMultiplierToBase ?? null,
            stockGroup: product.stockGroup ?? null,
            unitOptions: product.unitOptions,
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
    [setItems]
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
    [setItems],
  );

  const removeItem = useCallback((cartLineId: string) => {
    setItems((prev) => prev.filter((item) => item.cartLineId !== cartLineId));
  }, [setItems]);

  const changeUnit = useCallback(
    (cartLineId: string, target: CartUnitOption) => {
      setItems((current) => changeCartUnit(current, cartLineId, target));
    },
    [setItems],
  );

  const syncUnitOptions = useCallback((groups: CartUnitOption[][]) => {
    setItems((current) => applyProductUnitOptionUpdates(current, groups));
  }, [setItems]);

  const updateQuantity = useCallback((cartLineId: string, quantity: number) => {
    if (!Number.isFinite(quantity)) return;
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
  }, [setItems]);

  const updateTransactionPrice = useCallback(
    (cartLineId: string, price: number | null) => {
      setItems((current) => applyTransactionPrice(current, cartLineId, price));
    },
    [setItems],
  );

  const syncProductPrices = useCallback(
    (
      productId: string,
      prices: {
        price: number;
        hargaAgen: number | null;
        hargaDinas: number | null;
      },
    ) => {
      setItems((current) => applyProductPriceUpdate(current, productId, prices));
    },
    [setItems],
  );

  const syncProductGroupMetadata = useCallback(
    (
      productIds: string[],
      metadata: {
        name: string;
        description?: string | null;
        categoryId: string;
        categoryName: string;
        brandId: string | null;
        brandName: string | null;
      },
    ) => {
      setItems((current) =>
        applyProductGroupMetadataUpdate(current, productIds, metadata),
      );
    },
    [setItems],
  );

  const clearCart = useCallback(() => {
    setItems([]);
  }, [setItems]);

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
    hasLoadedStorage,
    persistenceError,
    addItem,
    addServiceItem,
    removeItem,
    changeUnit,
    syncUnitOptions,
    updateQuantity,
    updateTransactionPrice,
    syncProductPrices,
    syncProductGroupMetadata,
    clearCart,
    subtotal,
    totalItems,
  };
}
