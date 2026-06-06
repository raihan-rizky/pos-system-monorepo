import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  SupplierImportConflictError,
  commitSupplierImport,
} from "../supplier-import-service";
import type { SupplierImportCommitRow } from "../../helpers/import-core";

const listCandidatesMock = vi.hoisted(() => vi.fn());
const listCandidatesTxMock = vi.hoisted(() => vi.fn());
const createSupplierMock = vi.hoisted(() => vi.fn());
const updateSupplierMock = vi.hoisted(() => vi.fn());
const transactionMock = vi.hoisted(() => vi.fn());

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
    listCandidatesMock.mockResolvedValue([]);
    listCandidatesTxMock.mockResolvedValue([]);
    transactionMock.mockImplementation((action) => action({}));
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

function supplierCandidate(id: string, name: string) {
  return {
    supplierId: id,
    name,
    normalizedName: name.toLowerCase().replace(/\s+/g, " ").trim(),
    type: "DISTRIBUTOR",
    phone: null,
    isActive: true,
  };
}
