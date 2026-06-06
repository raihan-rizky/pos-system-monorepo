export const SUPPLIER_TYPES = [
  "DISTRIBUTOR",
  "MARKETPLACE",
  "INDIVIDUAL",
  "MANUFACTURER",
  "OTHER",
] as const;

export type SupplierType = (typeof SUPPLIER_TYPES)[number];

export type SupplierWarning = {
  code: "DuplicateSupplierName";
  message: string;
  matchedSupplierIds: string[];
};

export type SupplierListItem = {
  id: string;
  name: string;
  type: SupplierType;
  phone: string | null;
  contactPerson: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type SupplierInput = {
  name: string;
  type: SupplierType;
  phone?: string | null;
  contactPerson?: string | null;
  address?: string | null;
  notes?: string | null;
};
