"use client";

import React, { useMemo, useState } from "react";
import { Button, Modal } from "@pos/ui";
import { getLogger } from "@/lib/logger";
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  LoaderCircle,
  Upload,
  Users,
} from "lucide-react";
import {
  type ColumnMapping,
  type ImportPreviewResponse,
  type ImportRowDecision,
  type NormalizedImportRow,
  type PreviewFilter,
} from "../types";
import {
  useCustomerImportCommit,
  useCustomerImportPreview,
} from "../hooks/useCustomerImport";
import {
  buildAutoMapping,
  readFileHeaders,
} from "../helpers/client-parser";
import { buildBlockingErrorItems } from "../helpers/blocking-errors";
import { getRowsMissingImportDecision } from "../helpers/import-decisions";
import { ColumnMappingStep } from "./ColumnMappingStep";
import { MissingColumnsDialog } from "./MissingColumnsDialog";

type ImportStep = "upload" | "mapping" | "preview" | "result";
const log = getLogger("feature:customer-import:drawer");

const FILTER_LABELS: Record<PreviewFilter, string> = {
  all: "Semua",
  ready: "Siap",
  errors: "Error",
  warnings: "Warning",
  duplicate: "Duplikat",
};

function filterRows(rows: NormalizedImportRow[], previewFilter: PreviewFilter) {
  if (previewFilter === "all") return rows;
  return rows.filter((row) => {
    switch (previewFilter) {
      case "ready":
        return row.errors.length === 0 && row.warnings.length === 0;
      case "errors":
        return row.errors.length > 0;
      case "warnings":
        return row.warnings.length > 0;
      case "duplicate":
        return row.duplicateInFile || Boolean(row.existingCustomerId);
      default:
        return true;
    }
  });
}

function getDefaultDecision(row: NormalizedImportRow): ImportRowDecision {
  if (row.existingCustomerId) return "update";
  return "create";
}

function summarizeRows(
  rows: NormalizedImportRow[],
  decisions: Record<string, ImportRowDecision>,
) {
  return rows.reduce(
    (summary, row) => {
      const decision = decisions[String(row.rowNumber)] ?? getDefaultDecision(row);

      if (decision === "skip") {
        summary.skipped += 1;
      } else if (row.existingCustomerId) {
        summary.updated += 1;
      } else {
        summary.created += 1;
      }

      if (row.errors.length > 0) summary.errors += 1;
      return summary;
    },
    { created: 0, updated: 0, skipped: 0, errors: 0 },
  );
}

function countByFilter(rows: NormalizedImportRow[]) {
  return {
    all: rows.length,
    ready: rows.filter(
      (row) => row.errors.length === 0 && row.warnings.length === 0,
    ).length,
    errors: rows.filter((row) => row.errors.length > 0).length,
    warnings: rows.filter((row) => row.warnings.length > 0).length,
    duplicate: rows.filter(
      (row) => row.duplicateInFile || Boolean(row.existingCustomerId),
    ).length,
  };
}

function RowDecisionControl({
  row,
  value,
  onChange,
}: {
  row: NormalizedImportRow;
  value?: ImportRowDecision;
  onChange: (decision: ImportRowDecision) => void;
}) {
  const actions: ImportRowDecision[] = row.existingCustomerId
    ? ["update", "skip"]
    : row.duplicateInFile
      ? ["create", "skip"]
      : ["create"];

  if (actions.length === 1) {
    return (
      <span className="inline-flex rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
        Buat baru
      </span>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action) => {
        const active = value === action;
        return (
          <button
            key={action}
            type="button"
            onClick={() => onChange(action)}
            className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-colors ${
              active
                ? "bg-brand-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {action === "create"
              ? "Buat"
              : action === "update"
                ? "Update"
                : "Skip"}
          </button>
        );
      })}
    </div>
  );
}

export function CustomerImportDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const preview = useCustomerImportPreview();
  const commit = useCustomerImportCommit();
  const [step, setStep] = useState<ImportStep>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({});
  const [previewFilter, setPreviewFilter] = useState<PreviewFilter>("all");
  const [decisions, setDecisions] = useState<Record<string, ImportRowDecision>>(
    {},
  );
  const [headerLoading, setHeaderLoading] = useState(false);
  const [missingColDialogOpen, setMissingColDialogOpen] = useState(false);
  const [missingColData, setMissingColData] = useState<{
    missingColumns: string[];
    unknownColumns: string[];
    suggestions: Record<string, string>;
  } | null>(null);
  const [result, setResult] = useState<{
    createdCustomerCount: number;
    updatedCustomerCount: number;
    skippedRowCount: number;
    failedRowCount: number;
  } | null>(null);

  const previewData: ImportPreviewResponse | undefined = preview.data;
  const rows = useMemo(() => previewData?.rows ?? [], [previewData?.rows]);
  const filteredRows = useMemo(
    () => filterRows(rows, previewFilter),
    [previewFilter, rows],
  );
  const blockingErrors = useMemo(
    () => rows.flatMap((row) => row.errors),
    [rows],
  );
  const blockingErrorItems = useMemo(
    () => buildBlockingErrorItems(blockingErrors.slice(0, 6)),
    [blockingErrors],
  );
  const needsDecision = useMemo(
    () => getRowsMissingImportDecision(rows, decisions),
    [decisions, rows],
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
    setHeaderLoading(false);
    setMissingColDialogOpen(false);
    setMissingColData(null);
    setResult(null);
    preview.reset();
    commit.reset();
  };

  const close = () => {
    log.info("customer.import.drawer.closed", {
      step,
      hadFile: Boolean(file),
      rowCount: rows.length,
    });
    reset();
    onClose();
  };

  const runPreview = async (mapping?: ColumnMapping) => {
    if (!file) return;
    setDecisions({});
    setPreviewFilter("all");
    log.info("customer.import.drawer.preview_started", {
      step,
      fileName: file.name,
      fileSizeBytes: file.size,
      hasMapping: Boolean(mapping),
      mappedColumnCount: mapping
        ? Object.values(mapping).filter(Boolean).length
        : 0,
    });

    try {
      const response = await preview.mutateAsync({
        file,
        columnMapping: mapping,
      });
      log.info("customer.import.drawer.preview_ready", {
        rowCount: response.rows.length,
        warningCount: response.warnings.length,
        errorCount: response.errors.length,
        existingMatchCount: response.existingPhoneMatches.length,
      });
      setStep("preview");
    } catch (error: unknown) {
      const err = error as Record<string, unknown>;
      if (err.code === "MISSING_REQUIRED_COLUMNS") {
        log.warn("customer.import.drawer.preview_missing_columns", {
          missingColumns: (err.missingColumns as string[]) ?? [],
          unknownColumns: (err.unknownColumns as string[]) ?? [],
        });
        setMissingColData({
          missingColumns: (err.missingColumns as string[]) ?? [],
          unknownColumns: (err.unknownColumns as string[]) ?? [],
          suggestions: (err.suggestions as Record<string, string>) ?? {},
        });
        setMissingColDialogOpen(true);
        if (step === "upload") setStep("mapping");
        return;
      }
      log.error("customer.import.drawer.preview_failed", { error });
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setHeaderLoading(true);
    log.info("customer.import.drawer.header_read_started", {
      fileName: file.name,
      fileSizeBytes: file.size,
    });
    try {
      const headers = await readFileHeaders(file);
      log.info("customer.import.drawer.header_read_completed", {
        fileName: file.name,
        headerCount: headers.length,
      });
      setRawHeaders(headers);
      setColumnMapping(buildAutoMapping(headers));
      setStep("mapping");
    } catch {
      log.warn("customer.import.drawer.header_read_failed_fallback_preview", {
        fileName: file.name,
      });
      await runPreview();
    } finally {
      setHeaderLoading(false);
    }
  };

  const handleCommit = async () => {
    if (!canCommit) return;
    log.info("customer.import.drawer.commit_started", {
      rowCount: rows.length,
      blockingErrorCount: blockingErrors.length,
      undecidedRowCount: needsDecision.length,
      decisionCount: Object.keys(decisions).length,
    });
    const response = await commit.mutateAsync({ rows, decisions });
    log.info("customer.import.drawer.commit_completed", {
      ...response,
    });
    setResult(response);
    setStep("result");
  };

  return (
    <>
      <Modal open={open} onClose={close} title="Import Pelanggan" size="5xl">
        <div className="min-w-0 space-y-5">
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
              <Users className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-900">
                Upload file customer lalu preview sebelum commit.
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Format didukung: .xlsx dan .csv. Hanya kolom nama yang wajib.
              </p>
            </div>
            <div className="rounded-xl bg-white px-3 py-2 text-left shadow-sm sm:text-right">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Maksimum
              </p>
              <p className="text-sm font-bold text-slate-900">500 baris</p>
            </div>
          </div>

          {step === "upload" && (
            <div className="space-y-5">
              <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/70 p-4 text-center sm:p-8">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-brand-700 shadow-sm">
                  <FileSpreadsheet className="h-7 w-7" />
                </div>
                <p className="mt-4 text-sm font-bold text-slate-900">
                  Pilih file Excel atau CSV untuk customer import
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Kolom opsional: phone, email, company, address, type, notes
                </p>
                <input
                  type="file"
                  accept=".csv,.xlsx"
                  onChange={(event) =>
                    setFile(event.target.files?.[0] ?? null)
                  }
                  className="mx-auto mt-4 block max-w-full text-sm text-slate-600 file:mr-3 file:rounded-xl file:border-0 file:bg-brand-600 file:px-4 file:py-2 file:text-sm file:font-bold file:text-white"
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
              onMappingChange={setColumnMapping}
              onConfirm={() => void runPreview(columnMapping)}
              onBack={() => setStep("upload")}
            />
          )}

          {step === "preview" && (
            <div className="space-y-5">
              <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Total Baris
                  </p>
                  <p className="mt-1 text-2xl font-black text-slate-900">
                    {rows.length}
                  </p>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">
                    Buat
                  </p>
                  <p className="mt-1 text-2xl font-black text-slate-900">
                    {commitSummary.created}
                  </p>
                </div>
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-blue-700">
                    Update
                  </p>
                  <p className="mt-1 text-2xl font-black text-slate-900">
                    {commitSummary.updated}
                  </p>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">
                    Skip
                  </p>
                  <p className="mt-1 text-2xl font-black text-slate-900">
                    {commitSummary.skipped}
                  </p>
                </div>
              </div>

              {preview.error && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {preview.error.message}
                </div>
              )}

              {blockingErrors.length > 0 && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  <div className="flex items-center gap-2 font-bold">
                    <AlertTriangle className="h-4 w-4" />
                    Perbaiki error sebelum commit
                  </div>
                  <ul className="mt-2 space-y-1 text-xs">
                    {blockingErrorItems.map((error) => (
                      <li key={error.key}>{error.message}</li>
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
                    Pilih update/skip untuk nomor HP yang sudah ada, dan pilih
                    create/skip untuk duplikat di dalam file.
                  </p>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {(Object.keys(FILTER_LABELS) as PreviewFilter[]).map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setPreviewFilter(filter)}
                    className={`rounded-xl px-3 py-2 text-xs font-bold transition-colors ${
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
                <table className="min-w-[760px] w-full text-sm">
                  <thead className="bg-slate-50 text-[11px] uppercase tracking-widest text-slate-500">
                    <tr>
                      <th className="px-4 py-3 text-left">Baris</th>
                      <th className="px-4 py-3 text-left">Pelanggan</th>
                      <th className="px-4 py-3 text-left">Kontak</th>
                      <th className="px-4 py-3 text-left">Tipe</th>
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
                          <p className="max-w-[180px] break-words font-semibold text-slate-900">
                            {row.name || "-"}
                          </p>
                          {(row.company || row.address) && (
                            <p className="mt-1 max-w-[220px] break-words text-xs text-slate-500">
                              {[row.company, row.address].filter(Boolean).join(" · ")}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          <p className="max-w-[160px] break-words">{row.phone ?? "Tanpa nomor HP"}</p>
                          <p className="max-w-[160px] break-words">{row.email ?? "Tanpa email"}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
                            {row.type}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="space-y-1 text-xs">
                            {row.existingCustomerId && (
                              <p className="font-semibold text-blue-700">
                                Cocok dengan: {row.existingCustomerName}
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
                        </td>
                        <td className="px-4 py-3">
                          <RowDecisionControl
                            row={row}
                            value={decisions[String(row.rowNumber)]}
                            onChange={(decision) =>
                              setDecisions((current) => ({
                                ...current,
                                [String(row.rowNumber)]: decision,
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
                      Import customer selesai.
                    </p>
                    <p className="mt-1 text-xs text-emerald-700">
                      Data pelanggan sudah diperbarui sesuai preview.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Buat
                  </p>
                  <p className="mt-1 text-2xl font-black text-slate-900">
                    {result.createdCustomerCount}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Update
                  </p>
                  <p className="mt-1 text-2xl font-black text-slate-900">
                    {result.updatedCustomerCount}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Skip
                  </p>
                  <p className="mt-1 text-2xl font-black text-slate-900">
                    {result.skippedRowCount}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Gagal
                  </p>
                  <p className="mt-1 text-2xl font-black text-slate-900">
                    {result.failedRowCount}
                  </p>
                </div>
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
