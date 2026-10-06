export type SalesGroup = "ATK" | "PAPER" | "CARTRIDGE" | "INK" | "OTHER";

export function inferSalesGroup(name: string): SalesGroup {
  const normalized = name.trim().toLowerCase();

  if (normalized === "atk" || normalized === "stationery") return "ATK";
  if (normalized === "kertas" || normalized === "paper") return "PAPER";
  if (/^(cartridge|catridge|cardridge)(?:\s|$)/.test(normalized)) {
    return "CARTRIDGE";
  }
  if (
    normalized === "tinta" ||
    normalized === "tinta printing" ||
    normalized === "ink"
  ) {
    return "INK";
  }

  return "OTHER";
}

export const SALES_GROUP_LABELS: Record<SalesGroup, string> = {
  ATK: "ATK",
  PAPER: "Kertas",
  CARTRIDGE: "Cartridge",
  INK: "Tinta",
  OTHER: "Lainnya",
};
