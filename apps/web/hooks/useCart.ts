"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import type {
  CategoryCustomerPricingMode,
  CustomerType,
} from "@/features/customer-category-pricing/helpers/pricing-rules";
import { changeCartUnit } from "@/features/pos-checkout/helpers/cart-unit-change";

export interface ProductCartItem {
  cartLineId: string;
  lineType: "PRODUCT";
  productId: string;
  name: string;
  description?: string | null;
  price: number;
  catalogPrice: number;
  transactionPrice?: number | null;
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

const CART_STORAGE_KEY = "pos_cart_v1";

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

function loadCartFromStorage(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(CART_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as CartItem[]) : [];
    return normalizeStoredCartItems(parsed);
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

  const changeUnit = useCallback(
    (cartLineId: string, target: CartUnitOption) => {
      setItems((current) => changeCartUnit(current, cartLineId, target));
    },
    [],
  );

  const syncUnitOptions = useCallback((groups: CartUnitOption[][]) => {
    setItems((current) => applyProductUnitOptionUpdates(current, groups));
  }, []);

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
  }, []);

  const updateTransactionPrice = useCallback(
    (cartLineId: string, price: number | null) => {
      setItems((current) => applyTransactionPrice(current, cartLineId, price));
    },
    [],
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
    [],
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
    [],
  );

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
    hasLoadedStorage,
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
