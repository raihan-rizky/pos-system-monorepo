import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  SupplierImportConflictError,
  commitSupplierImport,
  previewSupplierImport,
} from "../supplier-import-service";
import type { SupplierImportCommitRow } from "../../helpers/import-core";

const parseSpreadsheetMatrixMock = vi.hoisted(() => vi.fn());
const listCandidatesMock = vi.hoisted(() => vi.fn());
const listCandidatesTxMock = vi.hoisted(() => vi.fn());
const createSupplierMock = vi.hoisted(() => vi.fn());
const updateSupplierMock = vi.hoisted(() => vi.fn());
const transactionMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/server/spreadsheet-parser", () => ({
  parseSpreadsheetMatrix: parseSpreadsheetMatrixMock,
}));

vi.mock("../../repositories/supplier-import-repository", () => ({
  listSupplierImportCandidates: listCandidatesMock,
  listSupplierImportCandidatesForTransaction: listCandidatesTxMock,
  createSupplierForImport: createSupplierMock,
  updateSupplierForImport: updateSupplierMock,
  runSupplierImportTransaction: transactionMock,
}));

describe("supplier import service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    parseSpreadsheetMatrixMock.mockResolvedValue([["Nama"], ["CV Sinar"]]);
    listCandidatesMock.mockResolvedValue([]);
    listCandidatesTxMock.mockResolvedValue([]);
    transactionMock.mockImplementation((action) => action({}));
  });

  it("matches existing suppliers by code during preview even when the name differs", async () => {
    listCandidatesMock.mockResolvedValue([
      supplierCandidate("supplier-1", "CV Nama Lama", { code: "SP0001" }),
    ]);
    parseSpreadsheetMatrixMock.mockResolvedValue([
      ["Kode Supplier", "Nama"],
      ["sp0001", "CV Nama Baru"],
    ]);

    const result = await previewSupplierImport({ buffer: new ArrayBuffer(0) });

    expect(result.rows[0].supplierCode).toBe("SP0001");
    expect(result.rows[0].existingMatches).toEqual([
      expect.objectContaining({
        supplierId: "supplier-1",
        code: "SP0001",
        name: "CV Nama Lama",
      }),
    ]);
  });

  it("creates new suppliers and skips rows by decision", async () => {
    const result = await commitSupplierImport({
      rows: [
        commitRow({ rowNumber: 2, name: "CV Sinar" }),
        commitRow({ rowNumber: 3, name: "PT Lewati", duplicateInFile: true }),
      ],
      decisions: { "3": "skip" },
      selectedExistingSupplierIds: {},
    });

    expect(createSupplierMock).toHaveBeenCalledTimes(1);
    expect(updateSupplierMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      createdSupplierCount: 1,
      updatedSupplierCount: 0,
      skippedRowCount: 1,
      failedRowCount: 0,
    });
  });

  it("passes normalized supplier code into create payloads", async () => {
    await commitSupplierImport({
      rows: [commitRow({ rowNumber: 2, name: "CV Sinar", supplierCode: "SP0001" } as Partial<SupplierImportCommitRow> & { name: string })],
      decisions: {},
      selectedExistingSupplierIds: {},
    });

    expect(createSupplierMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        code: "SP0001",
        name: "CV Sinar",
      }),
    );
  });

  it("updates an existing supplier selected by code even when the imported name differs", async () => {
    listCandidatesTxMock.mockResolvedValue([
      supplierCandidate("supplier-1", "CV Nama Lama", { code: "SP0001" }),
    ]);

    await commitSupplierImport({
      rows: [
        commitRow({
          rowNumber: 2,
          name: "CV Nama Baru",
          supplierCode: "SP0001",
          existingMatches: [
            {
              supplierId: "supplier-1",
              name: "CV Nama Lama",
              code: "SP0001",
              type: "DISTRIBUTOR",
              phone: null,
              isActive: true,
            },
          ],
        } as Partial<SupplierImportCommitRow> & { name: string }),
      ],
      decisions: { "2": "update" },
      selectedExistingSupplierIds: {},
    });

    expect(updateSupplierMock).toHaveBeenCalledWith(
      expect.anything(),
      "supplier-1",
      expect.objectContaining({
        code: "SP0001",
        name: "CV Nama Baru",
      }),
    );
    expect(createSupplierMock).not.toHaveBeenCalled();
  });

  it("requires selected supplier id when update has multiple current matches", async () => {
    listCandidatesTxMock.mockResolvedValue([
      supplierCandidate("supplier-1", "CV Sinar"),
      supplierCandidate("supplier-2", "CV Sinar"),
    ]);

    await expect(
      commitSupplierImport({
        rows: [commitRow({ rowNumber: 2, name: "CV Sinar" })],
        decisions: { "2": "update" },
        selectedExistingSupplierIds: {},
      }),
    ).rejects.toBeInstanceOf(SupplierImportConflictError);
  });
});

function commitRow(
  overrides: Partial<SupplierImportCommitRow> & { name: string },
): SupplierImportCommitRow {
  const normalizedName = overrides.name.toLowerCase().replace(/\s+/g, " ").trim();
  return {
    rowNumber: overrides.rowNumber ?? 2,
    supplierCode: overrides.supplierCode ?? null,
    name: overrides.name,
    normalizedName,
    type: overrides.type ?? "DISTRIBUTOR",
    phone: overrides.phone ?? null,
    contactPerson: overrides.contactPerson ?? null,
    address: overrides.address ?? null,
    notes: overrides.notes ?? null,
    duplicateInFile: overrides.duplicateInFile ?? false,
    existingMatches: overrides.existingMatches ?? [],
    warnings: overrides.warnings ?? [],
    errors: overrides.errors ?? [],
  };
}

type SupplierCandidate = {
  supplierId: string;
  name: string;
  normalizedName: string;
  code: string | null;
  type: "DISTRIBUTOR";
  phone: string | null;
  isActive: boolean;
};

function supplierCandidate(
  id: string,
  name: string,
  overrides: Partial<SupplierCandidate> = {},
): SupplierCandidate {
  return {
    supplierId: id,
    name,
    normalizedName: name.toLowerCase().replace(/\s+/g, " ").trim(),
    code: overrides.code ?? null,
    type: "DISTRIBUTOR",
    phone: null,
    isActive: true,
    ...overrides,
  };
}
