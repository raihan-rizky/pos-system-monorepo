import type { StockGroupDetail } from "../../api/stock-group-api";

export const treeDetail: StockGroupDetail = {
  id: "contoh-pohon-persediaan",
  displayName: "Kertas A4 (contoh)",
  baseUnit: "lembar",
  baseStock: 2500,
  hasNegativeStock: false,
  conversionPairs: [{
    fromProductId: "dus", fromUnit: "dus", fromQuantity: 1,
    toProductId: "rim", toUnit: "rim", toQuantity: 5,
    label: "1 dus = 5 rim",
  }],
  variants: [
    { id: "lembar", name: "Kertas A4", sku: "CONTOH-A4-LBR", unit: "lembar", unitMultiplierToBase: 1, conversionNeedsReview: false, stock: 2500, price: 250 },
    { id: "rim", name: "Kertas A4", sku: "CONTOH-A4-RIM", unit: "rim", unitMultiplierToBase: 500, conversionNeedsReview: false, stock: 5, price: 110000 },
    { id: "dus", name: "Kertas A4", sku: "CONTOH-A4-DUS", unit: "dus", unitMultiplierToBase: 2500, conversionNeedsReview: false, stock: 1, price: 520000 },
  ],
};
