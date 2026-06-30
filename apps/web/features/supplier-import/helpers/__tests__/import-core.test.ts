import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";

import {
  normalizeImportRows,
  parseImportFile,
} from "../import-core";
import type { ExistingSupplierMatch } from "../../types";

describe("supplier import preprocessing", () => {
  it("removes empty rows before preview and preserves source row numbers", async () => {
    const buffer = workbookBuffer([
      ["name", "type", "phone"],
      ["CV Sinar", "distributor", "0812"],
      ["", "", ""],
      ["PT Pabrik", "", ""],
    ]);

    const parsed = await parseImportFile(buffer);

    expect(parsed.removedEmptyRowCount).toBe(1);
    expect(parsed.records.map((record) => record.rowNumber)).toEqual([2, 4]);
    expect(parsed.records).toHaveLength(2);
  });

  it("normalizes supplier rows, type warnings, duplicates, and existing matches", () => {
    const existing = new Map<string, ExistingSupplierMatch[]>([
      [
        "cv sinar",
        [
          {
            supplierId: "supplier-1",
            name: "CV Sinar",
            type: "DISTRIBUTOR",
            phone: null,
            isActive: true,
          },
          {
            supplierId: "supplier-2",
            name: "CV Sinar Cabang",
            type: "DISTRIBUTOR",
            phone: null,
            isActive: true,
          },
        ],
      ],
    ]);

    const result = normalizeImportRows(
      [
        {
          rowNumber: 2,
          record: { name: " CV   Sinar ", type: "dist" },
        },
        {
          rowNumber: 3,
          record: { name: "CV Sinar", type: "bad type" },
        },
      ],
      existing,
    );

    expect(result.rows[0]).toMatchObject({
      name: "CV   Sinar",
      normalizedName: "cv sinar",
      type: "DISTRIBUTOR",
      duplicateInFile: true,
      existingMatches: expect.arrayContaining([
        expect.objectContaining({ supplierId: "supplier-1" }),
        expect.objectContaining({ supplierId: "supplier-2" }),
      ]),
    });
    expect(result.rows[1].type).toBe("OTHER");
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Duplicate supplier name in file"),
        expect.stringContaining("Unknown supplier type"),
        expect.stringContaining("Multiple suppliers match"),
      ]),
    );
  });
});

function workbookBuffer(rows: unknown[][]): ArrayBuffer {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, sheet, "Suppliers");
  const data = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  if (data instanceof ArrayBuffer) return data;
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
}
