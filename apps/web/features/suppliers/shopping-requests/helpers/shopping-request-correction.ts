import { Prisma } from "@pos/db";

export type CorrectionTotalLine = { receivedQty: number; unitPrice: string };
export type CorrectionStockLine = {
  productId: string;
  stockGroupId: string | null;
  oldQty: number;
  newQty: number;
  baseMultiplier: number;
  availableBaseStock: number;
};
export type CorrectionStockDelta = { productId: string; stockGroupId: string | null; baseDelta: number };

function readMoney(value: string): Prisma.Decimal {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) {
    throw new Error("Nominal harus berupa angka tidak negatif dengan maksimal dua angka desimal.");
  }
  return new Prisma.Decimal(value);
}

function readQuantity(value: number): Prisma.Decimal {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("Jumlah barang harus berupa angka yang tidak negatif.");
  }
  return new Prisma.Decimal(String(value));
}

export function calculateCorrectionTotal(lines: CorrectionTotalLine[]): string {
  const total = lines.reduce((sum, line) => {
    const amount = readMoney(line.unitPrice).mul(readQuantity(line.receivedQty))
      .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    return sum.add(amount);
  }, new Prisma.Decimal(0));
  return total.toFixed(2);
}

export function planCorrectionStock(lines: CorrectionStockLine[]): CorrectionStockDelta[] {
  const groups = new Map<string, {
    productId: string;
    stockGroupId: string | null;
    available: Prisma.Decimal;
    delta: Prisma.Decimal;
  }>();

  for (const line of lines) {
    const oldQty = readQuantity(line.oldQty);
    const newQty = readQuantity(line.newQty);
    const available = readQuantity(line.availableBaseStock);
    if (!Number.isFinite(line.baseMultiplier) || line.baseMultiplier <= 0 ||
        (!line.stockGroupId && line.baseMultiplier !== 1)) {
      throw new Error("Konversi satuan stok tidak dapat dipastikan.");
    }
    const key = line.stockGroupId ? `group:${line.stockGroupId}` : `product:${line.productId}`;
    const group = groups.get(key);
    if (group && !group.available.equals(available)) {
      throw new Error("Stok kelompok berubah. Muat ulang sebelum menyimpan.");
    }
    const current = group ?? { productId: line.productId, stockGroupId: line.stockGroupId, available, delta: new Prisma.Decimal(0) };
    current.delta = current.delta.add(newQty.minus(oldQty).mul(String(line.baseMultiplier)));
    groups.set(key, current);
  }

  return [...groups.values()].flatMap((group) => {
    if (group.available.add(group.delta).isNegative()) {
      throw new Error("Stok tidak cukup untuk menyimpan koreksi.");
    }
    if (group.delta.isZero()) return [];
    return [{ productId: group.productId, stockGroupId: group.stockGroupId, baseDelta: group.delta.toNumber() }];
  });
}

export function summarizeCorrectionPayment(total: string, paid: string): { remaining: string; overpaid: string } {
  const difference = readMoney(total).minus(readMoney(paid));
  return {
    remaining: Prisma.Decimal.max(difference, 0).toFixed(2),
    overpaid: Prisma.Decimal.max(difference.negated(), 0).toFixed(2),
  };
}

export type CorrectionPaymentSource = {
  paymentId: string;
  sourceKind: "TRANSFER_EXPENSE" | "PAYABLE_PAYMENT";
  amount: string;
  paidAt: string;
};

export type CorrectionPaymentAllocation = Pick<CorrectionPaymentSource, "paymentId" | "sourceKind" | "amount"> & {
  method: "TRANSFER" | "GIRO";
};

function correctionPaymentKey(source: Pick<CorrectionPaymentSource, "sourceKind" | "paymentId">): string {
  if (!source.paymentId || !["TRANSFER_EXPENSE", "PAYABLE_PAYMENT"].includes(source.sourceKind)) {
    throw new Error("Sumber pembayaran tidak valid.");
  }
  return JSON.stringify([source.sourceKind, source.paymentId]);
}

function correctionPaymentDate(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error("Tanggal pembayaran tidak valid.");
  }
  return value;
}

export function planCorrectionPayments(
  sources: CorrectionPaymentSource[],
  allocations: CorrectionPaymentAllocation[],
  corrections: CorrectionPaymentSource[],
): { sources: CorrectionPaymentSource[]; allocations: CorrectionPaymentAllocation[]; paid: string; byMethod: { TRANSFER: string; GIRO: string } } {
  const current = new Map<string, CorrectionPaymentSource>();
  for (const source of sources) {
    const key = correctionPaymentKey(source);
    if (current.has(key)) throw new Error("Sumber pembayaran ganda tidak diperbolehkan.");
    current.set(key, { ...source, amount: readMoney(source.amount).toFixed(2), paidAt: correctionPaymentDate(source.paidAt) });
  }
  const edited = new Set<string>();
  for (const correction of corrections) {
    const key = correctionPaymentKey(correction);
    if (!current.has(key)) throw new Error("Sumber pembayaran yang dikoreksi tidak tersedia.");
    if (edited.has(key)) throw new Error("Koreksi pembayaran ganda tidak diperbolehkan.");
    edited.add(key);
    current.set(key, { ...correction, amount: readMoney(correction.amount).toFixed(2), paidAt: correctionPaymentDate(correction.paidAt) });
  }

  const allocated = new Map<string, Prisma.Decimal>();
  const pairs = new Set<string>();
  const byMethod = { TRANSFER: new Prisma.Decimal(0), GIRO: new Prisma.Decimal(0) };
  const normalized = allocations.map((allocation) => {
    const key = correctionPaymentKey(allocation);
    if (!current.has(key)) throw new Error("Sumber alokasi pembayaran tidak tersedia.");
    if (allocation.method !== "TRANSFER" && allocation.method !== "GIRO") throw new Error("Metode alokasi pembayaran tidak valid.");
    const pair = JSON.stringify([key, allocation.method]);
    if (pairs.has(pair)) throw new Error("Alokasi pembayaran ganda tidak diperbolehkan.");
    pairs.add(pair);
    const amount = readMoney(allocation.amount);
    allocated.set(key, (allocated.get(key) ?? new Prisma.Decimal(0)).add(amount));
    byMethod[allocation.method] = byMethod[allocation.method].add(amount);
    return { ...allocation, amount: amount.toFixed(2) };
  });
  let paid = new Prisma.Decimal(0);
  for (const [key, source] of current) {
    const amount = readMoney(source.amount);
    if (!(allocated.get(key) ?? new Prisma.Decimal(0)).equals(amount)) {
      throw new Error("Jumlah alokasi harus sama dengan nominal sumber pembayaran.");
    }
    paid = paid.add(amount);
  }
  return {
    sources: [...current.values()], allocations: normalized, paid: paid.toFixed(2),
    byMethod: { TRANSFER: byMethod.TRANSFER.toFixed(2), GIRO: byMethod.GIRO.toFixed(2) },
  };
}

export function effectiveReceivedQuantities(
  receipts: Array<{ receiptLineId: string; purchaseItemId: string; receivedQty: number }>,
  movements: Array<{ receiptLineId: string | null; purchaseItemId: string; oldReceivedQty: number; newReceivedQty: number }>,
): Array<{ purchaseItemId: string; receivedQty: number }> {
  const sources = new Map<string, { purchaseItemId: string; quantity: Prisma.Decimal }>();
  for (const receipt of receipts) {
    if (!receipt.receiptLineId || !receipt.purchaseItemId || sources.has(`receipt:${receipt.receiptLineId}`)) {
      throw new Error("Sumber penerimaan ganda atau tidak valid.");
    }
    sources.set(`receipt:${receipt.receiptLineId}`, { purchaseItemId: receipt.purchaseItemId, quantity: readQuantity(receipt.receivedQty) });
  }
  for (const movement of movements) {
    if (!movement.purchaseItemId) throw new Error("Barang sumber penerimaan tidak tersedia.");
    const key = movement.receiptLineId ? `receipt:${movement.receiptLineId}` : `new:${movement.purchaseItemId}`;
    let source = sources.get(key);
    if (!source && movement.receiptLineId) throw new Error("Sumber penerimaan tidak tersedia.");
    if (!source) {
      source = { purchaseItemId: movement.purchaseItemId, quantity: new Prisma.Decimal(0) };
      sources.set(key, source);
    }
    if (source.purchaseItemId !== movement.purchaseItemId) throw new Error("Barang sumber penerimaan tidak cocok.");
    source.quantity = source.quantity.add(readQuantity(movement.newReceivedQty)).minus(readQuantity(movement.oldReceivedQty));
  }
  const items = new Map<string, Prisma.Decimal>();
  for (const source of sources.values()) {
    if (source.quantity.isNegative()) throw new Error("Jumlah penerimaan efektif tidak valid.");
    items.set(source.purchaseItemId, (items.get(source.purchaseItemId) ?? new Prisma.Decimal(0)).add(source.quantity));
  }
  return [...items].map(([purchaseItemId, quantity]) => {
    const receivedQty = quantity.toNumber();
    if (!Number.isFinite(receivedQty)) throw new Error("Jumlah penerimaan efektif tidak valid.");
    return { purchaseItemId, receivedQty };
  });
}
