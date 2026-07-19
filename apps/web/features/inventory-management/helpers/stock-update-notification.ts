export type StockUpdateNotificationKind = "success" | "error";

export interface StockUpdateNotification {
  kind: StockUpdateNotificationKind;
  title: string;
  message: string;
}

export function createStockUpdateNotification(
  kind: StockUpdateNotificationKind,
  message: string,
): StockUpdateNotification {
  return {
    kind,
    title: kind === "success" ? "Update stok berhasil" : "Update stok gagal",
    message,
  };
}
