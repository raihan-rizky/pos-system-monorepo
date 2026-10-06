import { describe, expect, it } from "vitest";
import { inferSalesGroup, SALES_GROUP_LABELS } from "../sales-groups";

describe("inferSalesGroup", () => {
  it("maps explicit category names and aliases to their sales groups", () => {
    expect(inferSalesGroup("ATK")).toBe("ATK");
    expect(inferSalesGroup("Stationery")).toBe("ATK");
    expect(inferSalesGroup("Kertas")).toBe("PAPER");
    expect(inferSalesGroup("Paper")).toBe("PAPER");
    expect(inferSalesGroup("Cartridge HP")).toBe("CARTRIDGE");
    expect(inferSalesGroup("Catridge Canon")).toBe("CARTRIDGE");
    expect(inferSalesGroup("Cardridge Canon")).toBe("CARTRIDGE");
    expect(inferSalesGroup("Tinta")).toBe("INK");
    expect(inferSalesGroup("Tinta Printing")).toBe("INK");
    expect(inferSalesGroup("Ink")).toBe("INK");
  });

  it("normalizes casing and surrounding whitespace without guessing aliases", () => {
    expect(inferSalesGroup("  sTaTiOnErY  ")).toBe("ATK");
    expect(inferSalesGroup(" PAPER ")).toBe("PAPER");
    expect(inferSalesGroup("  CATridge HP  ")).toBe("CARTRIDGE");
    expect(inferSalesGroup(" ink ")).toBe("INK");
    expect(inferSalesGroup("Toner HP")).toBe("OTHER");
    expect(inferSalesGroup("Bot")).toBe("OTHER");
    expect(inferSalesGroup("Plano")).toBe("OTHER");
    expect(inferSalesGroup("ATK Supplies")).toBe("OTHER");
    expect(inferSalesGroup("")).toBe("OTHER");
  });

  it("provides stable Indonesian display labels for every group", () => {
    expect(SALES_GROUP_LABELS).toEqual({
      ATK: "ATK",
      PAPER: "Kertas",
      CARTRIDGE: "Cartridge",
      INK: "Tinta",
      OTHER: "Lainnya",
    });
  });
});
