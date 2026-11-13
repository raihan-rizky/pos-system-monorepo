import type { PrintingServiceCartItem } from "@/hooks/useCart";
import type { PrintingReceiptDocument, PrintingReceiptLine, PrintingSubcategory } from "./types";

export function applyPrintingReceiptCheckoutNames(
  document: PrintingReceiptDocument,
  subcategory: PrintingSubcategory,
  selection: { customerName: string; customerId: string | null; salesName?: string | null },
): PrintingReceiptDocument {
  return {
    ...document,
    customerName: selection.customerName,
    customerId: selection.customerId,
    receiver: subcategory === "SPANDUK" ? selection.customerName : document.receiver,
    signatory: selection.salesName?.trim() || document.signatory,
  };
}

export function buildPrintingReceiptCartItems(lines: PrintingReceiptLine[]): PrintingServiceCartItem[] {
  const items: PrintingServiceCartItem[] = [];
  lines.forEach((line, index) => {
    if (!line.name.trim() && !line.material.trim() && line.quantity === null && line.price === null && !line.stockLink) return;
    if (!line.name.trim() || line.quantity === null || line.price === null || !Number.isFinite(line.quantity) || !Number.isFinite(line.price) || line.quantity <= 0 || line.price < 0) {
      throw new Error(`Lengkapi nama, jumlah, dan harga pada baris ${index + 1}.`);
    }
    if (!Number.isInteger(line.quantity)) throw new Error(`Jumlah pada baris ${index + 1} harus bilangan bulat positif.`);
    items.push({ cartLineId: line.id, lineType: "PRINTING_SERVICE", printingServiceId: null, name: line.name.trim(), material: line.material,
      quantity: line.quantity, price: line.price, unit: "pcs", needsMaterial: Boolean(line.stockLink),
      rawMaterialProductId: line.stockLink?.productId ?? null, rawMaterialQuantity: line.stockLink?.quantity ?? null, rawMaterialUnit: line.stockLink?.unit ?? null });
  });
  if (!items.length) throw new Error("Isi minimal satu baris nota sebelum pembayaran.");
  return items;
}
