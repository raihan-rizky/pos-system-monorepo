export interface ProductVariant {
  id: string;
  unit: string;
  price: number;
  costPrice: number | null;
  stock: number;
  sku: string;
  unitMultiplierToBase?: number;
  stockGroup?: {
    id: string;
    displayName: string;
    baseUnit: string;
    baseStock: number;
  } | null;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  price: number;
  costPrice: number | null;
  hargaDinas: number | null;
  stock: number;
  minStock: number;
  unit: string;
  size: string | null;
  material: string | null;
  imageUrl: string | null;
  isActive: boolean;
  stockGroupId?: string | null;
  unitMultiplierToBase?: number;
  conversionNeedsReview?: boolean;
  stockGroup?: {
    id: string;
    displayName: string;
    baseUnit: string;
    baseStock: number;
  } | null;
  category: {
    id: string;
    name: string;
    icon: string | null;
    color: string | null;
  };
  
  // Variant grouping fields
  defaultVariant?: {
    id: string;
    unit: string;
    price: number;
    stock: number;
    sku: string;
  };
  variants?: ProductVariant[];
}
