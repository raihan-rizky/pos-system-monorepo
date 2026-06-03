import type { DraftCreateInput } from "@/features/transactions-draft/types/draft";
import { encodeDivisionInNote } from "./division-note";

export type QuotationRole = "OWNER" | "ADMIN" | "CASHIER" | "SALES" | string | null | undefined;

export type QuotationProductLine = {
  cartLineId: string;
  lineType: "PRODUCT";
  productId: string;
  name: string;
  price: number;
  quantity: number;
  unit: string;
  stock: number;
  size?: string | null;
  material?: string | null;
};

export type QuotationCartItem =
  | QuotationProductLine
  | {
      cartLineId: string;
      lineType: "PRINTING_SERVICE";
    };

export type QuotationCheckoutMode = "payment" | "quotation";

export function getCartCheckoutMode(items: QuotationCartItem[]): QuotationCheckoutMode {
  return items.some((item) => item.lineType === "PRODUCT" && item.stock <= 0)
    ? "quotation"
    : "payment";
}

export function canViewQuotationHpp(role: QuotationRole): boolean {
  return role === "OWNER" || role === "ADMIN" || role === "CASHIER";
}

export function updateQuoteLine(
  line: QuotationProductLine,
  changes: Partial<Pick<QuotationProductLine, "quantity" | "price">>,
): QuotationProductLine {
  const nextQuantity =
    changes.quantity === undefined
      ? line.quantity
      : Math.max(1, Math.floor(changes.quantity));
  const nextPrice =
    changes.price === undefined ? line.price : Math.max(0, changes.price);

  return {
    ...line,
    quantity: nextQuantity,
    price: nextPrice,
  };
}

export function buildNotaPenawaranDraftInput(input: {
  kepadaYth: string;
  note?: string;
  division?: string;
  lines: QuotationProductLine[];
}): DraftCreateInput {
  const customerName = input.kepadaYth.trim();
  if (!customerName) {
    throw new Error("Kepada Yth wajib diisi");
  }

  return {
    customerName,
    customerId: null,
    discount: 0,
    note: encodeDivisionInNote(input.note?.trim() || null, input.division ?? ""),
    salesName: "",
    salespersonId: "",
    isJobOrder: false,
    estimatedDoneAt: null,
    items: input.lines.map((line) => ({
      productId: line.productId,
      name: line.name,
      size: line.size ?? null,
      material: line.material ?? null,
      price: line.price,
      quantity: line.quantity,
    })),
  };
}
