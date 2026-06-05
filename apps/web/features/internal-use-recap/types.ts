export type InternalUseRecapPeriod = "daily" | "weekly" | "monthly";

export interface InternalUseRecapRange {
  start: string;
  end: string;
  label: string;
}

export interface InternalUseRecapSummary {
  entryCount: number;
  productCount: number;
  unitGroupCount: number;
  totalQuantity: number;
  totalValue: number;
  missingUnitCostCount: number;
  hasIncompleteValue: boolean;
}

export interface InternalUseRecapProduct {
  productId: string;
  name: string;
  sku: string;
  unit: string;
  quantity: number;
  value: number;
  entryCount: number;
  missingUnitCostCount: number;
}

export interface InternalUseRecapEntry {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  unit: string;
  quantity: number;
  unitCost: number | null;
  value: number | null;
  note: string | null;
  person: string | null;
  createdAt: string;
}

export interface InternalUseRecap {
  period: InternalUseRecapPeriod;
  anchorDate: string;
  range: InternalUseRecapRange;
  summary: InternalUseRecapSummary;
  products: InternalUseRecapProduct[];
  entries: InternalUseRecapEntry[];
}

export interface InternalUseRecapResponse {
  data: InternalUseRecap;
}
