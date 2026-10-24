import type { StockGroupDetail } from "../api/stock-group-api";
const review = { price: [], costPrice: [] };
export const snowman: StockGroupDetail = {
  id: "snowman", displayName: "Snowman", baseUnit: "pcs", baseStock: 120, hasNegativeStock: false,
  variants: [
    { id: "pcs", name: "Snowman", sku: "SN-PCS", unit: "pcs", price: 3000, costPrice: 2000, stock: 120, unitMultiplierToBase: 1, conversionNeedsReview: false },
    { id: "pak", name: "Snowman", sku: "SN-PAK", unit: "pak", price: 32400, costPrice: 21000, stock: 10, unitMultiplierToBase: 12, conversionNeedsReview: false },
  ],
  pricing: { initialized: true, config: { sourceProductId: "pcs", revision: 1, initializationVersion: 1, members: {
    pcs: { mode: "AUTO", factor: { numerator: "1", denominator: "1" }, review },
    pak: { mode: "AUTO", factor: { numerator: "9", denominator: "10" }, review },
  } }, members: [{ productId: "pcs", price: "3000.00", costPrice: "2000.00", review }, { productId: "pak", price: "32400.00", costPrice: "21000.00", review }] },
};
