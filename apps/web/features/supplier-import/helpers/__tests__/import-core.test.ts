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

  it("maps and normalizes optional supplier codes", async () => {
    const buffer = workbookBuffer([
      ["Kode Supplier", "name", "type"],
      [" sp0001 ", "CV Sinar", "distributor"],
    ]);

    const parsed = await parseImportFile(buffer);
    const result = normalizeImportRows(parsed.records, new Map());

    expect(parsed.records[0].record).toMatchObject({
      supplierCode: " sp0001 ",
    });
    expect(result.rows[0]).toMatchObject({
      supplierCode: "SP0001",
      errors: [],
    });
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

  it("blocks rows when supplier code and name point to different existing suppliers", () => {
    const existingByName = new Map<string, ExistingSupplierMatch[]>([
      [
        "cv sinar",
        [
          {
            supplierId: "supplier-name",
            name: "CV Sinar",
            type: "DISTRIBUTOR",
            phone: null,
            isActive: true,
          },
        ],
      ],
    ]);
    const existingByCode = new Map<string, ExistingSupplierMatch>([
      [
        "SP0001",
        {
          supplierId: "supplier-code",
          name: "PT Kode",
          type: "DISTRIBUTOR",
          phone: null,
          isActive: true,
        },
      ],
    ]);

    const result = (normalizeImportRows as any)(
      [
        {
          rowNumber: 2,
          record: {
            supplierCode: "sp0001",
            name: "CV Sinar",
            type: "distributor",
          },
        },
      ],
      existingByName,
      existingByCode,
    );

    expect(result.rows[0].supplierCode).toBe("SP0001");
    expect(result.rows[0].errors).toContain(
      "Supplier code and name point to different suppliers. Fix the code or name before commit.",
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
