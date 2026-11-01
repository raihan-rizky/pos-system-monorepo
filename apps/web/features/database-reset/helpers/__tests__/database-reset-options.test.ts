import { describe, expect, it } from "vitest";
import { DATABASE_RESET_OPTIONS, DATABASE_RESET_SELECTABLE_MODELS, toggleDatabaseResetCategory } from "../database-reset-options";

describe("database reset category selection", () => {
  it("selects a partial category completely without touching another category", () => {
    const selection = toggleDatabaseResetCategory(["ProductPriceLog", "Expense"], "productCatalog");
    expect(selection).toEqual(expect.arrayContaining(DATABASE_RESET_OPTIONS[0].items.map(item => item.model)));
    expect(selection).toContain("Expense");
    expect(new Set(selection).size).toBe(selection.length);
  });

  it("unchecks a complete category while preserving other selected sub-data", () => {
    const selection = toggleDatabaseResetCategory([...DATABASE_RESET_OPTIONS[0].items.map(item => item.model), "Expense"], "productCatalog");
    expect(selection).toEqual(["Expense"]);
  });

  it("can uncheck every category from a select-all selection", () => {
    let selection = [...DATABASE_RESET_SELECTABLE_MODELS];
    for (const category of DATABASE_RESET_OPTIONS) selection = toggleDatabaseResetCategory(selection, category.id);
    expect(selection).toEqual([]);
  });
});
