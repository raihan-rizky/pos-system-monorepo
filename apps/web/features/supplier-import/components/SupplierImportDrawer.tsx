"use client";

import React, { useMemo, useState } from "react";
import { Button, Modal } from "@pos/ui";
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  LoaderCircle,
  Upload,
} from "lucide-react";

import type {
  ColumnMapping,
  ImportRowDecision,
  NormalizedSupplierImportRow,
  PreviewFilter,
  SupplierImportPreviewResponse,
} from "../types";
import { SupplierImportApiError } from "../api/supplierImportApi";
import {
  buildAutoMapping,
  readFileHeaders,
} from "../helpers/client-parser";
import { getRowsMissingImportDecision } from "../helpers/import-decisions";
import {
  useSupplierImportCommit,
  useSupplierImportPreview,
} from "../hooks/useSupplierImport";
import { ColumnMappingStep } from "./ColumnMappingStep";
import { MissingColumnsDialog } from "./MissingColumnsDialog";

type ImportStep = "upload" | "mapping" | "preview" | "result";

const FILTER_LABELS: Record<PreviewFilter, string> = {
  all: "Semua",
  ready: "Siap",
  errors: "Error",
  warnings: "Warning",
  duplicate: "Duplikat",
};

export function SupplierImportDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const preview = useSupplierImportPreview();
  const commit = useSupplierImportCommit();
  const [step, setStep] = useState<ImportStep>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({});
  const [previewFilter, setPreviewFilter] = useState<PreviewFilter>("all");
  const [decisions, setDecisions] = useState<Record<string, ImportRowDecision>>(
    {},
  );
  const [selectedExistingSupplierIds, setSelectedExistingSupplierIds] =
    useState<Record<string, string>>({});
  const [headerLoading, setHeaderLoading] = useState(false);
  const [missingColDialogOpen, setMissingColDialogOpen] = useState(false);
  const [missingColData, setMissingColData] = useState<{
    missingColumns: string[];
    unknownColumns: string[];
    suggestions: Record<string, string>;
  } | null>(null);
  const [previewErrorMessage, setPreviewErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<{
    createdSupplierCount: number;
    updatedSupplierCount: number;
    skippedRowCount: number;
    failedRowCount: number;
  } | null>(null);

  const previewData: SupplierImportPreviewResponse | undefined = preview.data;
  const rows = useMemo(() => previewData?.rows ?? [], [previewData?.rows]);
  const filteredRows = useMemo(
    () => filterRows(rows, previewFilter),
    [previewFilter, rows],
  );
  const blockingErrors = useMemo(
    () => rows.flatMap((row) => row.errors),
    [rows],
  );
  const needsDecision = useMemo(
    () =>
      getRowsMissingImportDecision(
        rows,
        decisions,
        selectedExistingSupplierIds,
      ),
    [decisions, rows, selectedExistingSupplierIds],
  );
  const filterCounts = useMemo(() => countByFilter(rows), [rows]);
  const commitSummary = useMemo(
    () => summarizeRows(rows, decisions),
    [decisions, rows],
  );
  const canCommit =
    rows.length > 0 &&
    blockingErrors.length === 0 &&
    needsDecision.length === 0 &&
    !commit.isPending;

  const reset = () => {
    setStep("upload");
    setFile(null);
    setRawHeaders([]);
    setColumnMapping({});
    setPreviewFilter("all");
    setDecisions({});
    setSelectedExistingSupplierIds({});
    setHeaderLoading(false);
    setMissingColDialogOpen(false);
    setMissingColData(null);
    setPreviewErrorMessage(null);
    setResult(null);
    preview.reset();
    commit.reset();
  };

  const close = () => {
    reset();
    onClose();
  };

  const runPreview = async (mapping?: ColumnMapping) => {
    if (!file) {
      setPreviewErrorMessage("Pilih file supplier terlebih dahulu.");
      return;
    }
    setPreviewErrorMessage(null);
    setDecisions({});
    setSelectedExistingSupplierIds({});
    setPreviewFilter("all");

    try {
      await preview.mutateAsync({ file, columnMapping: mapping });
      setStep("preview");
    } catch (error) {
      const err = error as SupplierImportApiError;
      if (err.payload?.missingColumns) {
        setMissingColData({
          missingColumns: err.payload.missingColumns,
          unknownColumns: err.payload.unknownColumns ?? [],
          suggestions: err.payload.suggestions ?? {},
        });
        setMissingColDialogOpen(true);
        if (step === "upload") setStep("mapping");
        return;
      }
      setPreviewErrorMessage(err.message || "Preview supplier gagal. Coba lagi.");
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setHeaderLoading(true);
    try {
      const headers = await readFileHeaders(file);
      setRawHeaders(headers);
      setColumnMapping(buildAutoMapping(headers));
      setStep("mapping");
    } catch {
      await runPreview();
    } finally {
      setHeaderLoading(false);
    }
  };

  const handleCommit = async () => {
    if (!canCommit) return;
    const response = await commit.mutateAsync({
      rows,
      decisions,
      selectedExistingSupplierIds,
    });
    setResult(response);
    setStep("result");
  };

  return (
    <>
      <Modal open={open} onClose={close} title="Import Supplier" size="5xl">
        <div className="min-w-0 space-y-5">
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-900">
                Upload file supplier lalu preview sebelum commit.
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Format didukung: .xlsx dan .csv. Kolom wajib hanya name.
              </p>
            </div>
            <div className="rounded-xl bg-white px-3 py-2 text-left shadow-sm sm:text-right">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Maksimum
              </p>
              <p className="text-sm font-bold text-slate-900">
                500 baris bersih
              </p>
            </div>
          </div>

          {step === "upload" && (
            <div className="space-y-5">
              <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/70 p-4 text-center sm:p-8">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-brand-700 shadow-sm">
                  <FileSpreadsheet className="h-7 w-7" />
                </div>
                <p className="mt-4 text-sm font-bold text-slate-900">
                  Pilih file Excel atau CSV untuk supplier import
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Kolom opsional: type, phone, contactPerson, address, notes
                </p>
                <input
                  type="file"
                  accept=".csv,.xlsx"
                  onChange={(event) =>
                    setFile(event.target.files?.[0] ?? null)
                  }
                  className="mx-auto mt-4 block max-w-full cursor-pointer text-sm text-slate-600 file:mr-3 file:cursor-pointer file:rounded-xl file:border-0 file:bg-brand-600 file:px-4 file:py-2 file:text-sm file:font-bold file:text-white"
                />
                {file && (
                  <p className="mt-3 break-words text-xs text-slate-500">
                    File dipilih: <span className="font-semibold">{file.name}</span>
                  </p>
                )}
              </div>

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                <Button type="button" variant="secondary" onClick={close}>
                  Batal
                </Button>
                <Button
                  type="button"
                  icon={
                    headerLoading ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )
                  }
                  disabled={!file || headerLoading}
                  onClick={handleUpload}
                >
                  {headerLoading ? "Membaca Header..." : "Lanjutkan"}
                </Button>
              </div>
            </div>
          )}

          {step === "mapping" && (
            <ColumnMappingStep
              rawHeaders={rawHeaders}
              mapping={columnMapping}
              onMappingChange={(nextMapping) => {
                setColumnMapping(nextMapping);
                setPreviewErrorMessage(null);
              }}
              onConfirm={() => void runPreview(columnMapping)}
              onBack={() => setStep("upload")}
              isPreviewing={preview.isPending}
              previewErrorMessage={previewErrorMessage}
            />
          )}

          {step === "preview" && previewData && (
            <div className="space-y-5">
              <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <SummaryCard label="Total Baris" value={rows.length} />
                <SummaryCard label="Buat" value={commitSummary.created} tone="emerald" />
                <SummaryCard label="Update" value={commitSummary.updated} tone="blue" />
                <SummaryCard label="Skip" value={commitSummary.skipped} tone="amber" />
                <SummaryCard
                  label="Baris Kosong Dihapus"
                  value={previewData.removedEmptyRowCount}
                  tone="slate"
                />
              </div>

              {preview.error && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {preview.error.message}
                </div>
              )}

              {commit.error && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {commit.error.message}
                </div>
              )}

              {blockingErrors.length > 0 && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  <div className="flex items-center gap-2 font-bold">
                    <AlertTriangle className="h-4 w-4" />
                    Perbaiki error sebelum commit
                  </div>
                  <ul className="mt-2 space-y-1 text-xs">
                    {blockingErrors.slice(0, 6).map((error, index) => (
                      <li key={`${error}-${index}`}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}

              {needsDecision.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  <div className="flex items-center gap-2 font-bold">
                    <AlertTriangle className="h-4 w-4" />
                    {needsDecision.length} baris masih butuh keputusan
                  </div>
                  <p className="mt-1 text-xs">
                    Pilih update/skip untuk nama yang sudah ada, pilih supplier
                    target jika ada beberapa match, dan skip duplikat ekstra.
                  </p>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {(Object.keys(FILTER_LABELS) as PreviewFilter[]).map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setPreviewFilter(filter)}
                    className={`min-h-11 cursor-pointer rounded-xl px-3 py-2 text-xs font-bold transition-colors ${
                      previewFilter === filter
                        ? "bg-slate-900 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {FILTER_LABELS[filter]} ({filterCounts[filter]})
                  </button>
                ))}
              </div>

              <div className="max-w-full overflow-auto rounded-2xl border border-slate-200 bg-white">
                <table className="min-w-[900px] w-full text-sm">
                  <thead className="bg-slate-50 text-[11px] uppercase tracking-widest text-slate-500">
                    <tr>
                      <th className="px-4 py-3 text-left">Baris</th>
                      <th className="px-4 py-3 text-left">Supplier</th>
                      <th className="px-4 py-3 text-left">Kontak</th>
                      <th className="px-4 py-3 text-left">Status</th>
                      <th className="px-4 py-3 text-left">Keputusan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row) => (
                      <tr key={row.rowNumber} className="border-t border-slate-100 align-top">
                        <td className="px-4 py-3 text-xs font-bold text-slate-500">
                          {row.rowNumber}
                        </td>
                        <td className="px-4 py-3">
                          <p className="max-w-[220px] break-words font-semibold text-slate-900">
                            {row.name || "-"}
                          </p>
                          <p className="mt-1 font-mono text-xs font-bold uppercase text-slate-500">
                            {row.supplierCode ?? "Tanpa kode"}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {row.type}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          <p className="max-w-[180px] break-words">{row.phone ?? "Tanpa phone"}</p>
                          <p className="max-w-[180px] break-words">{row.contactPerson ?? "Tanpa kontak"}</p>
                        </td>
                        <td className="px-4 py-3">
                          <RowStatus row={row} />
                        </td>
                        <td className="px-4 py-3">
                          <RowDecisionControl
                            row={row}
                            decision={decisions[String(row.rowNumber)]}
                            selectedSupplierId={
                              selectedExistingSupplierIds[String(row.rowNumber)]
                            }
                            onDecisionChange={(decision) =>
                              setDecisions((current) => ({
                                ...current,
                                [String(row.rowNumber)]: decision,
                              }))
                            }
                            onSelectedSupplierChange={(supplierId) =>
                              setSelectedExistingSupplierIds((current) => ({
                                ...current,
                                [String(row.rowNumber)]: supplierId,
                              }))
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setStep("mapping")}
                >
                  Kembali
                </Button>
                <Button
                  type="button"
                  disabled={!canCommit}
                  loading={commit.isPending}
                  onClick={() => void handleCommit()}
                >
                  Commit Import
                </Button>
              </div>
            </div>
          )}

          {step === "result" && result && (
            <div className="space-y-5">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-700">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-emerald-900">
                      Import supplier selesai.
                    </p>
                    <p className="mt-1 text-xs text-emerald-700">
                      Data supplier sudah diperbarui sesuai preview.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <SummaryCard label="Buat" value={result.createdSupplierCount} />
                <SummaryCard label="Update" value={result.updatedSupplierCount} />
                <SummaryCard label="Skip" value={result.skippedRowCount} />
                <SummaryCard label="Gagal" value={result.failedRowCount} />
              </div>

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                <Button type="button" variant="secondary" onClick={reset}>
                  Import File Lain
                </Button>
                <Button type="button" onClick={close}>
                  Selesai
                </Button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      <MissingColumnsDialog
        open={missingColDialogOpen}
        onClose={() => setMissingColDialogOpen(false)}
        missingColumns={missingColData?.missingColumns ?? []}
        unknownColumns={missingColData?.unknownColumns ?? []}
        suggestions={missingColData?.suggestions ?? {}}
      />
    </>
  );
}

function RowStatus({ row }: { row: NormalizedSupplierImportRow }) {
  return (
    <div className="space-y-1 text-xs">
      {row.existingMatches.length === 1 && (
        <p className="font-semibold text-blue-700">
          Cocok dengan: {row.existingMatches[0].name}
        </p>
      )}
      {row.existingMatches.length > 1 && (
        <p className="font-semibold text-blue-700">
          {row.existingMatches.length} supplier cocok
        </p>
      )}
      {row.warnings.map((warning) => (
        <p key={warning} className="text-amber-700">
          {warning}
        </p>
      ))}
      {row.errors.map((error) => (
        <p key={error} className="text-red-700">
          {error}
        </p>
      ))}
      {row.warnings.length === 0 && row.errors.length === 0 && (
        <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 font-semibold text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Siap diimport
        </span>
      )}
    </div>
  );
}

function RowDecisionControl({
  row,
  decision,
  selectedSupplierId,
  onDecisionChange,
  onSelectedSupplierChange,
}: {
  row: NormalizedSupplierImportRow;
  decision?: ImportRowDecision;
  selectedSupplierId?: string;
  onDecisionChange: (decision: ImportRowDecision) => void;
  onSelectedSupplierChange: (supplierId: string) => void;
}) {
  const actions: ImportRowDecision[] =
    row.existingMatches.length > 0 ? ["update", "skip"] : ["create", "skip"];

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <button
            key={action}
            type="button"
            onClick={() => onDecisionChange(action)}
            className={`min-h-11 cursor-pointer rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
              decision === action
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {action}
          </button>
        ))}
      </div>
      {decision === "update" && row.existingMatches.length > 1 && (
        <select
          value={selectedSupplierId ?? ""}
          onChange={(event) => onSelectedSupplierChange(event.target.value)}
          className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-700"
        >
          <option value="">Pilih supplier target</option>
          {row.existingMatches.map((match) => (
            <option key={match.supplierId} value={match.supplierId}>
              {match.name} / {match.type}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: React.ReactNode;
  tone?: "slate" | "emerald" | "blue" | "amber";
}) {
  const toneClass = {
    slate: "border-slate-200 bg-white text-slate-400",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
  }[tone];

  return (
    <div className={`rounded-xl border p-4 ${toneClass}`}>
      <p className="text-[10px] font-black uppercase tracking-widest">
        {label}
      </p>
      <p className="mt-1 text-2xl font-black text-slate-900">{value}</p>
    </div>
  );
}

function filterRows(
  rows: NormalizedSupplierImportRow[],
  previewFilter: PreviewFilter,
): NormalizedSupplierImportRow[] {
  if (previewFilter === "all") return rows;
  if (previewFilter === "errors") {
    return rows.filter((row) => row.errors.length > 0);
  }
  if (previewFilter === "warnings") {
    return rows.filter((row) => row.warnings.length > 0);
  }
  if (previewFilter === "duplicate") {
    return rows.filter((row) => row.duplicateInFile);
  }
  return rows.filter(
    (row) => row.errors.length === 0 && row.warnings.length === 0,
  );
}

function countByFilter(rows: NormalizedSupplierImportRow[]) {
  return {
    all: rows.length,
    ready: filterRows(rows, "ready").length,
    errors: filterRows(rows, "errors").length,
    warnings: filterRows(rows, "warnings").length,
    duplicate: filterRows(rows, "duplicate").length,
  } satisfies Record<PreviewFilter, number>;
}

function summarizeRows(
  rows: NormalizedSupplierImportRow[],
  decisions: Record<string, ImportRowDecision>,
) {
  return rows.reduce(
    (summary, row) => {
      const decision = decisions[String(row.rowNumber)];
      if (decision === "skip") summary.skipped += 1;
      else if (decision === "update") summary.updated += 1;
      else if (decision === "create") summary.created += 1;
      else if (!row.duplicateInFile && row.existingMatches.length === 0) {
        summary.created += 1;
      }
      return summary;
    },
    { created: 0, updated: 0, skipped: 0 },
  );
}
