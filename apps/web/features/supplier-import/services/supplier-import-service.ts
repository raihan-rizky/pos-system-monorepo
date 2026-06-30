import type { SupplierInput } from "@/features/suppliers/types/supplier";
import type {
  ColumnMapping,
  ExistingSupplierMatch,
  ImportRowDecision,
  SupplierImportPreviewResponse,
} from "@/features/supplier-import/types";
import {
  buildMissingColumnResponse,
  importRowCommitSchema,
  normalizeImportRows,
  parseImportFile,
  type SupplierImportCommitRow,
} from "@/features/supplier-import/helpers/import-core";
import {
  createSupplierForImport,
  listSupplierImportCandidates,
  listSupplierImportCandidatesForTransaction,
  runSupplierImportTransaction,
  updateSupplierForImport,
} from "@/features/supplier-import/repositories/supplier-import-repository";

export async function previewSupplierImport(input: {
  buffer: ArrayBuffer;
  columnMapping?: ColumnMapping;
}): Promise<SupplierImportPreviewResponse> {
  const parsed = await parseImportFile(input.buffer, input.columnMapping);
  const { missingColumns, unknownColumns, suggestions } =
    buildMissingColumnResponse(parsed.headers);

  if (missingColumns.length > 0) {
    throw new SupplierImportMissingColumnsError({
      missingColumns,
      unknownColumns,
      suggestions,
      removedEmptyRowCount: parsed.removedEmptyRowCount,
    });
  }

  const supplierMap = await buildExistingSupplierMap();
  const normalized = normalizeImportRows(parsed.records, supplierMap);

  return {
    ...normalized,
    missingColumns,
    unknownColumns,
    removedEmptyRowCount: parsed.removedEmptyRowCount,
    requiredColumns: ["name"] as const,
    suggestions,
  };
}

export async function commitSupplierImport(input: {
  rows: SupplierImportCommitRow[];
  decisions: Record<string, ImportRowDecision>;
  selectedExistingSupplierIds: Record<string, string>;
}): Promise<{
  createdSupplierCount: number;
  updatedSupplierCount: number;
  skippedRowCount: number;
  failedRowCount: number;
}> {
  if (input.rows.length === 0) {
    throw new SupplierImportValidationError("No rows to import", {
      rows: ["At least one row is required"],
    });
  }

  const rowErrors = input.rows.flatMap((row) => row.errors);
  if (rowErrors.length > 0) {
    throw new SupplierImportConflictError(
      "Import contains rows with blocking errors",
      { errors: rowErrors },
    );
  }

  return runSupplierImportTransaction(async (tx) => {
    const supplierMap = await buildExistingSupplierMap(tx);
    const activeRows = input.rows.filter((row) => {
      const decision = resolveDecision(row, input.decisions);
      return decision !== "skip";
    });
    const duplicateNames = findDuplicateActiveNames(activeRows);
    if (duplicateNames.length > 0) {
      throw new SupplierImportConflictError(
        "Import contains duplicate supplier names. Mark extra rows as skip.",
        { duplicateNames },
      );
    }

    let createdSupplierCount = 0;
    let updatedSupplierCount = 0;
    let skippedRowCount = 0;
    const failedRowCount = 0;

    for (const row of input.rows) {
      const decision = resolveDecision(row, input.decisions);
      const matches = supplierMap.get(row.normalizedName) ?? [];

      if (!decision) {
        throw new SupplierImportConflictError(
          "Some rows still require an import decision",
          { rowNumber: row.rowNumber },
        );
      }

      if (decision === "skip") {
        skippedRowCount += 1;
        continue;
      }

      if (decision === "create") {
        if (matches.length > 0) {
          throw new SupplierImportConflictError(
            "Invalid decision for an existing supplier row",
            { rowNumber: row.rowNumber },
          );
        }
        await createSupplierForImport(tx, toSupplierInput(row));
        createdSupplierCount += 1;
        continue;
      }

      const targetSupplierId = resolveUpdateSupplierId({
        row,
        matches,
        selectedExistingSupplierIds: input.selectedExistingSupplierIds,
      });
      await updateSupplierForImport(tx, targetSupplierId, toSupplierInput(row));
      updatedSupplierCount += 1;
    }

    return {
      createdSupplierCount,
      updatedSupplierCount,
      skippedRowCount,
      failedRowCount,
    };
  });
}

export function parseSupplierImportCommitRows(
  rows: unknown[],
): SupplierImportCommitRow[] {
  return rows.map((row) => importRowCommitSchema.parse(row));
}

async function buildExistingSupplierMap(tx?: Parameters<typeof listSupplierImportCandidatesForTransaction>[0]): Promise<
  Map<string, ExistingSupplierMatch[]>
> {
  const suppliers = tx
    ? await listSupplierImportCandidatesForTransaction(tx)
    : await listSupplierImportCandidates();
  return suppliers.reduce((map, supplier) => {
    const current = map.get(supplier.normalizedName) ?? [];
    current.push({
      supplierId: supplier.supplierId,
      name: supplier.name,
      type: supplier.type,
      phone: supplier.phone,
      isActive: supplier.isActive,
    });
    map.set(supplier.normalizedName, current);
    return map;
  }, new Map<string, ExistingSupplierMatch[]>());
}

function resolveDecision(
  row: SupplierImportCommitRow,
  decisions: Record<string, ImportRowDecision>,
): ImportRowDecision | undefined {
  const explicit = decisions[String(row.rowNumber)];
  if (explicit) return explicit;
  if (!row.duplicateInFile && row.existingMatches.length === 0) return "create";
  return undefined;
}

function resolveUpdateSupplierId({
  row,
  matches,
  selectedExistingSupplierIds,
}: {
  row: SupplierImportCommitRow;
  matches: ExistingSupplierMatch[];
  selectedExistingSupplierIds: Record<string, string>;
}): string {
  if (matches.length === 0) {
    throw new SupplierImportConflictError(
      "Invalid update decision for a new supplier row",
      { rowNumber: row.rowNumber },
    );
  }

  if (matches.length === 1) return matches[0].supplierId;

  const selectedId = selectedExistingSupplierIds[String(row.rowNumber)];
  if (!selectedId || !matches.some((match) => match.supplierId === selectedId)) {
    throw new SupplierImportConflictError(
      "Rows with multiple supplier matches require a selected supplier",
      { rowNumber: row.rowNumber },
    );
  }
  return selectedId;
}

function findDuplicateActiveNames(rows: SupplierImportCommitRow[]): string[] {
  const counts = rows.reduce((map, row) => {
    map.set(row.normalizedName, (map.get(row.normalizedName) ?? 0) + 1);
    return map;
  }, new Map<string, number>());

  return Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([name]) => name);
}

function toSupplierInput(row: SupplierImportCommitRow): SupplierInput {
  return {
    name: row.name,
    type: row.type,
    phone: row.phone ?? null,
    contactPerson: row.contactPerson ?? null,
    address: row.address ?? null,
    notes: row.notes ?? null,
  };
}

export class SupplierImportMissingColumnsError extends Error {
  readonly missingColumns: string[];
  readonly unknownColumns: string[];
  readonly suggestions: Record<string, string>;
  readonly removedEmptyRowCount: number;

  constructor(input: {
    missingColumns: string[];
    unknownColumns: string[];
    suggestions: Record<string, string>;
    removedEmptyRowCount: number;
  }) {
    super("Import file is missing required columns.");
    this.name = "SupplierImportMissingColumnsError";
    this.missingColumns = input.missingColumns;
    this.unknownColumns = input.unknownColumns;
    this.suggestions = input.suggestions;
    this.removedEmptyRowCount = input.removedEmptyRowCount;
  }
}

export class SupplierImportValidationError extends Error {
  readonly errors: Record<string, string[]>;

  constructor(message: string, errors: Record<string, string[]>) {
    super(message);
    this.name = "SupplierImportValidationError";
    this.errors = errors;
  }
}

export class SupplierImportConflictError extends Error {
  readonly extra: Record<string, unknown>;

  constructor(message: string, extra: Record<string, unknown>) {
    super(message);
    this.name = "SupplierImportConflictError";
    this.extra = extra;
  }
}
