import { createRequire } from "node:module";
import * as XLSX from "xlsx";
import { afterEach, describe, expect, it, vi } from "vitest";

import { parseSpreadsheetMatrix } from "@/lib/server/spreadsheet-parser";

const require = createRequire(import.meta.url);
const xlsxCommonJs = require("xlsx") as typeof XLSX;
const originalRead = xlsxCommonJs.read;

describe("parseSpreadsheetMatrix", () => {
  afterEach(() => {
    xlsxCommonJs.read = originalRead;
    vi.restoreAllMocks();
  });

  it("decodes spreadsheets outside the main xlsx module instance", async () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ["name", "stock"],
      ["Kertas HVS", 5],
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
    const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" });

    xlsxCommonJs.read = () => {
      throw new Error("main-thread parser should not run");
    };

    await expect(parseSpreadsheetMatrix(buffer)).resolves.toEqual([
      ["name", "stock"],
      ["Kertas HVS", "5"],
    ]);
  });
});
