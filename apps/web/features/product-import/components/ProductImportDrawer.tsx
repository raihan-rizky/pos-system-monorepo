"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Modal, Button } from "@pos/ui";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Download,
  FileSpreadsheet,
  Filter,
  LoaderCircle,
  Upload,
} from "lucide-react";
import {
  REQUIRED_IMPORT_COLUMNS,
  type ColumnMapping,
  type ImportRowDecision,
  type NormalizedImportRow,
  type PreviewFilter,
  type ImportPreviewResponse,
} from "../types";
import {
  useProductImportCommit,
  useProductImportPreview,
  useProductImageExtract,
} from "../hooks/useProductImport";
import { BatchResultPanel } from "@/features/batch-operations/components/BatchResultPanel";
import { MissingColumnsDialog } from "./MissingColumnsDialog";
import { ColumnMappingStep } from "./ColumnMappingStep";
import { MethodSelector, type ImportMethod } from "./MethodSelector";
import { ImageUploadStep } from "./ImageUploadStep";
import { AutoActionBadge } from "./AutoActionBadge";
import { readFileHeaders, buildAutoMapping } from "../helpers/client-parser";
import {
  buildCleanedImportRows,
  buildCleaningChangeLogRows,
  revertImportCleaningFixes,
} from "../helpers/import-core";
import {
  getEffectiveImportDecision,
  getRowsMissingImportDecision,
} from "../helpers/import-decisions";
import { buildProductImportResultSummary } from "../helpers/result-summary";

type ImportStep = "upload" | "mapping" | "preview" | "result";

export function ProductImportDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const preview = useProductImportPreview();
  const imageExtract = useProductImageExtract();
  const commit = useProductImportCommit();

  const [method, setMethod] = useState<ImportMethod>("file");
  const [step, setStep] = useState<ImportStep>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({});
  const [decisions, setDecisions] = useState<
    Record<string, ImportRowDecision>
  >({});
  const [createMissingCategories, setCreateMissingCategories] = useState(true);
  const [previewFilter, setPreviewFilter] = useState<PreviewFilter>("all");
  const [missingColDialogOpen, setMissingColDialogOpen] = useState(false);
  const [missingColData, setMissingColData] = useState<{
    missingColumns: string[];
    unknownColumns: string[];
    suggestions: Record<string, string>;
  } | null>(null);
  const [headerLoading, setHeaderLoading] = useState(false);
  const [commitStarted, setCommitStarted] = useState(false);
  const [commitProgress, setCommitProgress] = useState(0);
  const [extractProgress, setExtractProgress] = useState<{ current: number; total: number; stage: "preprocessing" | "extracting" } | null>(null);
  const [accumulatedPreviewData, setAccumulatedPreviewData] = useState<ImportPreviewResponse | null>(null);
  const [previewRowsOverride, setPreviewRowsOverride] = useState<NormalizedImportRow[] | null>(null);

  const previewData = method === "image" ? accumulatedPreviewData : preview.data;
  const rows: NormalizedImportRow[] = useMemo(
    () => previewRowsOverride ?? previewData?.rows ?? [],
    [previewData?.rows, previewRowsOverride],
  );
  useEffect(() => {
    setPreviewRowsOverride(null);
  }, [previewData]);

  // Filter rows for the preview table
  const filteredRows = useMemo(() => {
    if (previewFilter === "all") return rows;
    return rows.filter((row) => {
      switch (previewFilter) {
        case "ready":
          return row.errors.length === 0 && row.warnings.length === 0;
        case "errors":
          return row.errors.length > 0 || row.autoAction === "conflict";
        case "warnings":
          return row.warnings.length > 0;
        case "duplicate":
          return row.duplicateInFile || Boolean(row.existingProductId);
        case "new-category":
          return row.missingCategory;
        case "unresolved":
          return (row.existingProductId || row.duplicateInFile) && !getEffectiveImportDecision(row, decisions);
        default:
          return true;
      }
    });
  }, [rows, previewFilter, decisions]);

  const blockingErrors = useMemo(
    () => rows.flatMap((row) => row.errors),
    [rows]
  );
  const needsDecision = useMemo(
    () => getRowsMissingImportDecision(rows, decisions),
    [rows, decisions]
  );
  const canCommit =
    rows.length > 0 &&
    blockingErrors.length === 0 &&
    needsDecision.length === 0;
  const showCommitProgress = commitStarted && step === "preview";
  const cleanedRowsForExport = useMemo(() => buildCleanedImportRows(rows), [rows]);
  const cleaningLogRows = useMemo(() => buildCleaningChangeLogRows(rows), [rows]);

  // Filter counts for badges
  const filterCounts = useMemo(() => {
    const ready = rows.filter(
      (r) => r.errors.length === 0 && r.warnings.length === 0
    ).length;
    const errors = rows.filter((r) => r.errors.length > 0 || r.autoAction === "conflict").length;
    const warnings = rows.filter((r) => r.warnings.length > 0).length;
    const duplicate = rows.filter(
      (r) => r.duplicateInFile || Boolean(r.existingProductId)
    ).length;
    const newCategory = rows.filter((r) => r.missingCategory).length;
    const unresolved = rows.filter(
      (r) => (r.existingProductId || r.duplicateInFile) && !getEffectiveImportDecision(r, decisions)
    ).length;
    return { all: rows.length, ready, errors, warnings, duplicate, newCategory, unresolved };
  }, [rows, decisions]);

  const commitSummary = useMemo(() => {
    return rows.reduce(
      (summary, row) => {
        const decision = decisions[String(row.rowNumber)] ?? decisions[row.sku];

        if (decision === "skip") {
          summary.skipped += 1;
          return summary;
        }

        if (row.existingProductId) {
          summary.updated += 1;
        } else {
          summary.created += 1;
        }

        if (row.stock !== 0) summary.stockLogs += 1;
        return summary;
      },
      {
        created: 0,
        updated: 0,
        skipped: 0,
        stockLogs: 0,
      },
    );
  }, [decisions, rows]);

  const commitStatus = useMemo(() => {
    if (commit.error) return "Import gagal sebelum selesai.";
    if (commitProgress < 25) return "Memvalidasi baris yang dipilih.";
    if (commitProgress < 55) return "Menyimpan produk dan kategori.";
    if (commitProgress < 85) return "Mencatat stock movement logs.";
    return "Menyelesaikan batch audit record.";
  }, [commit.error, commitProgress]);

  useEffect(() => {
    if (!commit.isPending) return;

    const timer = window.setInterval(() => {
      setCommitProgress((current) => {
        if (current < 30) return current + 6;
        if (current < 70) return current + 4;
        if (current < 92) return current + 2;
        return current;
      });
    }, 450);

    return () => window.clearInterval(timer);
  }, [commit.isPending]);

  const reset = () => {
    setStep("upload");
    setFile(null);
    setRawHeaders([]);
    setColumnMapping({});
    setDecisions({});
    setPreviewFilter("all");
    setMissingColDialogOpen(false);
    setMissingColData(null);
    setCommitStarted(false);
    setCommitProgress(0);
    setExtractProgress(null);
    setAccumulatedPreviewData(null);
    setPreviewRowsOverride(null);
    preview.reset();
    imageExtract.reset();
    commit.reset();
  };

  const close = () => {
    reset();
    onClose();
  };

  // Step 1: Upload → read headers → go to mapping
  const handleUpload = async () => {
    if (!file) return;
    setHeaderLoading(true);
    try {
      const headers = await readFileHeaders(file);
      setRawHeaders(headers);
      setColumnMapping(buildAutoMapping(headers));
      setStep("mapping");
    } catch {
      // If client-side parsing fails, skip mapping and go direct to preview
      await runPreview();
    } finally {
      setHeaderLoading(false);
    }
  };

  // Step 2: Mapping confirmed → call preview with mapping
  const handleMappingConfirm = async () => {
    await runPreview(columnMapping);
  };

  // Call the preview API
  const runPreview = async (mapping?: ColumnMapping) => {
    if (!file) return;
    setDecisions({});
    setPreviewFilter("all");
    setCommitStarted(false);
    setCommitProgress(0);
    setPreviewRowsOverride(null);
    try {
      const result = await preview.mutateAsync({
        file,
        columnMapping: mapping,
      });
      // Check for missing required columns (returned as 400 error)
      // If preview succeeds, go to preview step
      setStep("preview");
    } catch (error: unknown) {
      // Handle missing columns as a blocking dialog
      const err = error as unknown as Record<string, unknown>;
      if (err?.code === "MISSING_REQUIRED_COLUMNS") {
        setMissingColData({
          missingColumns: (err.missingColumns as string[]) ?? [],
          unknownColumns: (err.unknownColumns as string[]) ?? [],
          suggestions: (err.suggestions as Record<string, string>) ?? {},
        });
        setMissingColDialogOpen(true);
        // Stay on mapping step so user can fix
        if (step === "upload") setStep("mapping");
      }
      // Other errors are shown inline by react-query
    }
  };

  const handleImageExtract = async (files: File[]) => {
    setDecisions({});
    setPreviewFilter("all");
    setCommitStarted(false);
    setCommitProgress(0);
    setExtractProgress({ current: 0, total: files.length, stage: "extracting" });
    setAccumulatedPreviewData(null);
    
    try {
      const BATCH_SIZE = 5;
      const combinedData: ImportPreviewResponse = {
        rows: [],
        missingColumns: [],
        missingCategories: [],
        unknownColumns: [],
        warnings: [],
        errors: [],
        existingSkuMatches: [],
        requiredColumns: [],
        suggestions: {}
      };
      
      const missingCatSet = new Set<string>();
      const unknownColSet = new Set<string>();
      
      for (let i = 0; i < files.length; i += BATCH_SIZE) {
        const batch = files.slice(i, i + BATCH_SIZE);
        const result = await imageExtract.mutateAsync(batch);
        
        const startIdx = combinedData.rows.length;
        const newRows = result.rows.map((r, idx) => ({
          ...r,
          rowNumber: startIdx + idx + 1
        }));
        combinedData.rows.push(...newRows);
        combinedData.source = result.source;
        
        result.missingCategories?.forEach((c) => missingCatSet.add(c));
        result.unknownColumns?.forEach((c) => unknownColSet.add(c));
        
        setExtractProgress({ 
          current: Math.min(i + batch.length, files.length), 
          total: files.length,
          stage: "extracting" 
        });
      }
      
      combinedData.missingCategories = Array.from(missingCatSet);
      combinedData.unknownColumns = Array.from(unknownColSet);
      
      setAccumulatedPreviewData(combinedData);
      setStep("preview");
    } catch (error) {
      // Error is handled by react-query error state
    } finally {
      setExtractProgress(null);
    }
  };

  const handleCommit = async () => {
    if (!canCommit) return;

    setCommitStarted(true);
    setCommitProgress(8);
    try {
      const result = await commit.mutateAsync({
        rows,
        decisions,
        createMissingCategories,
      });
      if (result) {
        setCommitProgress(100);
        setStep("result");
      }
    } catch {
      // React Query keeps the error in commit.error for the inline message.
    }
  };

  // Step indicators
  const STEPS: { key: ImportStep; label: string; num: number }[] = method === "file" 
    ? [
        { key: "upload", label: "Upload", num: 1 },
        { key: "mapping", label: "Mapping Kolom", num: 2 },
        { key: "preview", label: "Preview", num: 3 },
        { key: "result", label: "Hasil", num: 4 },
      ]
    : [
        { key: "upload", label: "Upload", num: 1 },
        { key: "preview", label: "Preview", num: 2 },
        { key: "result", label: "Hasil", num: 3 },
      ];
  const stepIndex = STEPS.findIndex((s) => s.key === step);

  return (
    <>
      <Modal
        open={open}
        onClose={close}
        title="Batch Import Produk"
        size="xl"
      >
        <div className="space-y-5">
          {/* Step indicator */}
          <div className="flex items-center gap-1">
            {STEPS.map((s, i) => (
              <React.Fragment key={s.key}>
                {i > 0 && (
                  <div
                    className={`flex-1 h-0.5 ${
                      i <= stepIndex ? "bg-slate-900" : "bg-slate-200"
                    }`}
                  />
                )}
                <div
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap ${
                    s.key === step
                      ? "bg-slate-900 text-white"
                      : i < stepIndex
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-400"
                  }`}
                >
                  {i < stepIndex ? (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  ) : (
                    <span>{s.num}</span>
                  )}
                  <span className="hidden sm:inline">{s.label}</span>
                </div>
              </React.Fragment>
            ))}
          </div>

          {/* Step 4: Result */}
          {step === "result" && commit.data && (
            <BatchResultPanel
              batchOperationId={commit.data.batchOperationId}
              summary={buildProductImportResultSummary(commit.data)}
            />
          )}

          {/* Step 1: Upload */}
          {step === "upload" && (
            <div className="space-y-6">
              <MethodSelector value={method} onChange={setMethod} />
              
              {method === "file" ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <label className="block text-sm font-bold text-slate-700 mb-2">
                    File CSV atau Excel
                  </label>
              <input
                type="file"
                accept=".csv,.xlsx"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                className="block w-full text-sm text-slate-700 file:mr-4 file:rounded-lg file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:font-bold file:text-white"
              />
              <p className="mt-3 text-xs text-slate-500">
                Kolom wajib: {REQUIRED_IMPORT_COLUMNS.join(", ")}. Maksimal
                2000 baris.
              </p>
              <Button
                type="button"
                className="mt-4"
                icon={<Upload className="w-4 h-4" />}
                loading={headerLoading}
                disabled={!file || headerLoading}
                onClick={handleUpload}
              >
                Lanjut
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <ImageUploadStep 
                    onExtract={handleImageExtract}
                    onProgress={(current, total, stage) => setExtractProgress({ current, total, stage })}
                    isLoading={extractProgress !== null} 
                  />
                  
                  {extractProgress && (
                    <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-bold text-blue-900 flex items-center gap-2">
                          <LoaderCircle className="w-4 h-4 animate-spin" />
                          {extractProgress.stage === "preprocessing" ? "Memproses gambar..." : "Mengekstrak data..."}
                        </span>
                        <span className="text-xs font-bold text-blue-700 bg-blue-100 px-2 py-1 rounded-md">
                          {extractProgress.current} / {extractProgress.total} file diproses
                        </span>
                      </div>
                      <div className="h-2.5 bg-blue-100 rounded-full overflow-hidden border border-blue-200/50">
                        <div 
                          className="h-full bg-blue-600 transition-all duration-300 relative" 
                          style={{ width: `${Math.max(5, (extractProgress.current / extractProgress.total) * 100)}%` }}
                        >
                          <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 2: Column Mapping */}
          {step === "mapping" && (
            <ColumnMappingStep
              rawHeaders={rawHeaders}
              mapping={columnMapping}
              onMappingChange={setColumnMapping}
              onConfirm={handleMappingConfirm}
              onBack={() => {
                setStep("upload");
                preview.reset();
                imageExtract.reset();
              }}
            />
          )}

          {/* Step 3: Preview */}
          {step === "preview" && previewData && (
            <div className="space-y-4">
              {(previewData.unknownColumns?.length ?? 0) > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  Kolom tidak dikenal diabaikan:{" "}
                  {previewData.unknownColumns?.join(", ")}
                </div>
              )}

              {(previewData.missingCategories?.length ?? 0) > 0 && (
                <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-sm font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={createMissingCategories}
                    onChange={(event) =>
                      setCreateMissingCategories(event.target.checked)
                    }
                    className="h-4 w-4"
                  />
                  Buat kategori yang belum ada:{" "}
                  {previewData.missingCategories?.join(", ")}
                </label>
              )}

              {method === "image" && previewData.source && (
                <div className="flex justify-between items-center bg-blue-50 text-blue-800 text-xs font-bold px-3 py-2 rounded-lg border border-blue-100">
                  <span>Ekstraksi AI selesai via {previewData.source}</span>
                  <span className="opacity-80">Cek data dengan teliti</span>
                </div>
              )}

              {/* Preview Filters */}
              <PreviewFilterBar
                filter={previewFilter}
                counts={filterCounts}
                onChange={setPreviewFilter}
              />

              {(cleanedRowsForExport.length > 0 || cleaningLogRows.length > 0) && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      downloadCsv("cleaned-product-import.csv", cleanedRowsForExport)
                    }
                    className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download cleaned file
                  </button>
                  <button
                    type="button"
                    disabled={cleaningLogRows.length === 0}
                    onClick={() =>
                      downloadCsv("product-import-cleaning-log.csv", cleaningLogRows)
                    }
                    className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download change log
                  </button>
                  <button
                    type="button"
                    disabled={cleaningLogRows.length === 0 || commit.isPending}
                    onClick={() =>
                      setPreviewRowsOverride(revertImportCleaningFixes(rows))
                    }
                    className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 text-xs font-bold text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Revert all auto-fixes
                  </button>
                </div>
              )}

              <ImportPreviewTable
                filteredRows={filteredRows}
                allRows={rows}
                decisions={decisions}
                setDecisions={setDecisions}
              />

              {blockingErrors.length > 0 && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  Perbaiki error baris sebelum commit.
                </div>
              )}
              {needsDecision.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  Pilih aksi untuk {needsDecision.length} baris SKU duplikat/yang sudah ada.
                </div>
              )}
              {commit.error && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {(commit.error as Error).message}
                </div>
              )}
              {showCommitProgress && (
                <CommitProgressPanel
                  progress={commit.error ? 100 : commitProgress}
                  isError={Boolean(commit.error)}
                  status={commitStatus}
                  totalRows={rows.length}
                  created={commitSummary.created}
                  updated={commitSummary.updated}
                  skipped={commitSummary.skipped}
                  newCategories={
                    createMissingCategories
                      ? (previewData.missingCategories?.length ?? 0)
                      : 0
                  }
                  stockLogs={commitSummary.stockLogs}
                />
              )}
              <div className="flex justify-between gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={commit.isPending}
                  onClick={() => {
                    setStep(method === "image" ? "upload" : "mapping");
                    preview.reset();
                    imageExtract.reset();
                    setDecisions({});
                    setCommitStarted(false);
                    setCommitProgress(0);
                  }}
                >
                  Kembali
                </Button>
                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={commit.isPending}
                    onClick={reset}
                  >
                    Mulai Ulang
                  </Button>
                  <Button
                    type="button"
                    loading={commit.isPending}
                    disabled={!canCommit || commit.isPending}
                    onClick={handleCommit}
                  >
                    Commit Import
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Loading state for preview */}
          {step === "mapping" && preview.isPending && (
            <div className="flex items-center justify-center py-8 text-sm text-slate-500">
              <FileSpreadsheet className="w-5 h-5 mr-2 animate-spin" />
              Menganalisis file...
            </div>
          )}

          {/* Preview error (non-missing-column errors) */}
          {preview.error &&
            !((preview.error as unknown as Record<string, unknown>)?.code) && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                <div className="flex items-center gap-2 font-bold">
                  <AlertTriangle className="w-4 h-4" />
                  {(preview.error as Error).message}
                </div>
              </div>
            )}
            
          {imageExtract.error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <div className="flex items-center gap-2 font-bold">
                <AlertTriangle className="w-4 h-4" />
                {(imageExtract.error as Error).message}
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Blocking dialog for missing columns */}
      {missingColData && (
        <MissingColumnsDialog
          open={missingColDialogOpen}
          onClose={() => setMissingColDialogOpen(false)}
          missingColumns={missingColData.missingColumns}
          unknownColumns={missingColData.unknownColumns}
          suggestions={missingColData.suggestions}
        />
      )}
    </>
  );
}

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function toCsv(rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")),
  ].join("\n");
}

function downloadCsv(filename: string, rows: Array<Record<string, unknown>>) {
  if (typeof window === "undefined") return;
  const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/* ── Preview Filter Bar ── */
function PreviewFilterBar({
  filter,
  counts,
  onChange,
}: {
  filter: PreviewFilter;
  counts: {
    all: number;
    ready: number;
    errors: number;
    warnings: number;
    duplicate: number;
    newCategory: number;
    unresolved: number;
  };
  onChange: (f: PreviewFilter) => void;
}) {
  const filters: { id: PreviewFilter; label: string; count: number; color: string }[] = [
    { id: "all", label: "Semua", count: counts.all, color: "bg-slate-100 text-slate-700" },
    { id: "ready", label: "Siap", count: counts.ready, color: "bg-emerald-100 text-emerald-700" },
    { id: "errors", label: "Error", count: counts.errors, color: "bg-red-100 text-red-700" },
    { id: "warnings", label: "Peringatan", count: counts.warnings, color: "bg-amber-100 text-amber-700" },
    { id: "duplicate", label: "SKU Duplikat", count: counts.duplicate, color: "bg-purple-100 text-purple-700" },
    { id: "new-category", label: "Kategori Baru", count: counts.newCategory, color: "bg-blue-100 text-blue-700" },
    { id: "unresolved", label: "Aksi Kosong", count: counts.unresolved, color: "bg-indigo-100 text-indigo-700" },
  ];

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1">
      <Filter className="w-4 h-4 text-slate-400 shrink-0" />
      {filters.map((f) => (
        <button
          key={f.id}
          type="button"
          onClick={() => onChange(f.id)}
          className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
            filter === f.id
              ? "bg-slate-900 text-white ring-2 ring-slate-900/20"
              : f.color + " hover:ring-1 hover:ring-slate-300"
          }`}
        >
          {f.label}
          <span
            className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-md text-[10px] font-black ${
              filter === f.id ? "bg-white/20" : "bg-white/60"
            }`}
          >
            {f.count}
          </span>
        </button>
      ))}
    </div>
  );
}

/* ── Preview Table ── */
function CommitProgressPanel({
  progress,
  isError,
  status,
  totalRows,
  created,
  updated,
  skipped,
  newCategories,
  stockLogs,
}: {
  progress: number;
  isError: boolean;
  status: string;
  totalRows: number;
  created: number;
  updated: number;
  skipped: number;
  newCategories: number;
  stockLogs: number;
}) {
  const boundedProgress = Math.min(100, Math.max(0, progress));
  const details = [
    { label: "Baris", value: totalRows },
    { label: "Buat", value: created },
    { label: "Diperbarui", value: updated },
    { label: "Lewati", value: skipped },
    { label: "Kategori", value: newCategories },
    { label: "Stock logs", value: stockLogs },
  ];

  return (
    <div
      className={`rounded-xl border p-4 ${
        isError
          ? "border-red-200 bg-red-50"
          : "border-blue-200 bg-blue-50"
      }`}
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div
            className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
              isError ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"
            }`}
          >
            {isError ? (
              <AlertTriangle className="h-4 w-4" />
            ) : (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            )}
          </div>
          <div>
            <div
              className={`text-sm font-bold ${
                isError ? "text-red-900" : "text-slate-900"
              }`}
            >
              Commit import
            </div>
            <div
              className={`mt-0.5 text-xs ${
                isError ? "text-red-700" : "text-slate-600"
              }`}
            >
              {status}
            </div>
          </div>
        </div>
        <div
          className={`flex items-center gap-2 text-xs font-bold ${
            isError ? "text-red-700" : "text-blue-700"
          }`}
        >
          <Database className="h-4 w-4" />
          {boundedProgress}%
        </div>
      </div>

      <div
        className={`mt-4 h-2 overflow-hidden rounded-full ${
          isError ? "bg-red-100" : "bg-blue-100"
        }`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={boundedProgress}
        aria-label="Progress commit import"
      >
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            isError ? "bg-red-600" : "bg-blue-600"
          }`}
          style={{ width: `${boundedProgress}%` }}
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {details.map((item) => (
          <div
            key={item.label}
            className="rounded-lg border border-white/70 bg-white/80 px-3 py-2"
          >
            <div className="text-[11px] font-medium text-slate-500">
              {item.label}
            </div>
            <div className="mt-0.5 text-sm font-bold tabular-nums text-slate-900">
                  {item.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ImportPreviewTable({
  filteredRows,
  allRows,
  decisions,
  setDecisions,
}: {
  filteredRows: NormalizedImportRow[];
  allRows: NormalizedImportRow[];
  decisions: Record<string, ImportRowDecision>;
  setDecisions: React.Dispatch<
    React.SetStateAction<Record<string, ImportRowDecision>>
  >;
}) {
  return (
    <div className="max-h-[420px] overflow-auto rounded-xl border border-slate-200 bg-white relative">
      <table className="min-w-[980px] w-full text-left text-sm border-collapse">
        <thead className="sticky top-0 text-[11px] uppercase tracking-widest text-slate-500 z-20 shadow-sm">
          <tr>
            <th className="px-3 py-2 sticky left-0 z-30 bg-slate-50 border-b border-r border-slate-200">Produk</th>
            <th className="px-3 py-2 bg-slate-50 border-b border-slate-200">SKU</th>
            <th className="px-3 py-2 bg-slate-50 border-b border-slate-200">Kategori</th>
            <th className="px-3 py-2 bg-slate-50 border-b border-slate-200 text-right">Harga Modal</th>
            <th className="px-3 py-2 bg-slate-50 border-b border-slate-200 text-right">Harga</th>
            <th className="px-3 py-2 bg-slate-50 border-b border-slate-200 text-right">Harga Dinas</th>
            <th className="px-3 py-2 bg-slate-50 border-b border-slate-200 text-right">Stok</th>
            <th className="px-3 py-2 bg-slate-50 border-b border-slate-200 text-right">Stok Min.</th>
            <th className="px-3 py-2 bg-slate-50 border-b border-slate-200">Cleaning</th>
            <th className="px-3 py-2 bg-slate-50 border-b border-slate-200">Keputusan</th>
            <th className="px-3 py-2 bg-slate-50 border-b border-slate-200">Status</th>
          </tr>
        </thead>
        <tbody>
          {filteredRows.map((row) => {
            return (
              <tr key={row.rowNumber} className="border-b border-slate-100 hover:bg-slate-50 transition-colors group">
                <td className="px-3 py-3 font-semibold text-slate-900 sticky left-0 z-10 bg-white group-hover:bg-slate-50 border-r border-slate-100 transition-colors">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-slate-400 w-5 text-right">{row.rowNumber}.</span>
                    <span className="truncate max-w-[200px]" title={row.name}>{row.name}</span>
                  </div>
                </td>
                <td className="px-3 py-3">{row.sku}</td>
                <td className="px-3 py-3">
                  {row.category}
                  {row.missingCategory && (
                    <span className="ml-1 text-[10px] font-bold text-blue-600">
                      BARU
                    </span>
                  )}
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-slate-500">
                  {row.costPrice != null ? row.costPrice : "-"}
                </td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {row.price}
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-slate-500">
                  {row.hargaDinas != null ? row.hargaDinas : "-"}
                </td>
                <td className="px-3 py-3 text-right tabular-nums">
                  <div className="flex items-center justify-end gap-1.5">
                    {row.stock < 0 && (
                      <div 
                        className="group/alert relative flex items-center justify-center cursor-help"
                        aria-label="Peringatan stok negatif"
                      >
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                        <div className="absolute bottom-full right-1/2 translate-x-1/2 mb-2 w-max max-w-xs opacity-0 scale-95 invisible group-hover/alert:opacity-100 group-hover/alert:scale-100 group-hover/alert:visible transition-all duration-200 z-50">
                          <div className="bg-slate-900 text-white text-xs font-medium rounded-lg py-1.5 px-3 shadow-xl">
                            Stok seharusnya tidak negatif
                            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900"></div>
                          </div>
                        </div>
                      </div>
                    )}
                    <span>{row.stock} {row.unit}</span>
                  </div>
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-slate-500">
                  {row.minStock != null ? row.minStock : "-"}
                </td>
                <td className="px-3 py-3">
                  <CleaningStatusBadge row={row} />
                </td>
                <td className="px-3 py-3">
                  <ImportActionSelect
                    row={row}
                    rows={allRows}
                    decisions={decisions}
                    setDecisions={setDecisions}
                  />
                </td>
                <td className="px-3 py-3">
                  {row.autoAction ? (
                    <AutoActionBadge
                      action={row.autoAction}
                      reason={row.autoActionReason}
                      conversionNeedsReview={row.conversionNeedsReview}
                    />
                  ) : row.errors.length > 0 ? (
                    <span className="text-red-600">{row.errors.join(" ")}</span>
                  ) : row.warnings.length > 0 ? (
                    <span className="text-amber-700">
                      {row.warnings.join(" ")}
                    </span>
                  ) : (
                    <span className="text-emerald-700">Siap</span>
                  )}
                </td>
              </tr>
            );
          })}
          {filteredRows.length === 0 && (
            <tr>
              <td
                colSpan={11}
                className="px-3 py-8 text-center text-sm text-slate-400"
              >
                Tidak ada baris yang cocok dengan filter.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function CleaningStatusBadge({ row }: { row: NormalizedImportRow }) {
  if (row.cleaningStatus === "auto_fixed") {
    return (
      <span
        className="inline-flex rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-bold text-emerald-700"
        title={row.cleaningIssues?.join(" ") || undefined}
      >
        Auto-fixed
      </span>
    );
  }
  if (row.cleaningStatus === "review_required") {
    return (
      <span
        className="inline-flex rounded-full bg-amber-100 px-2 py-1 text-[11px] font-bold text-amber-700"
        title={row.cleaningIssues?.join(" ") || undefined}
      >
        Review
      </span>
    );
  }
  if (row.cleaningStatus === "warning") {
    return (
      <span
        className="inline-flex rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600"
        title={row.cleaningIssues?.join(" ") || undefined}
      >
        Warning
      </span>
    );
  }
  return <span className="text-xs text-slate-400">-</span>;
}

function ImportActionSelect({
  row,
  rows,
  decisions,
  setDecisions,
}: {
  row: NormalizedImportRow;
  rows: NormalizedImportRow[];
  decisions: Record<string, ImportRowDecision>;
  setDecisions: React.Dispatch<
    React.SetStateAction<Record<string, ImportRowDecision>>
  >;
}) {
  const effectiveDecision = getEffectiveImportDecision(row, decisions);

  const hasCreatedSibling = useMemo(() => {
    return rows.some(
      (r) =>
        r.rowNumber !== row.rowNumber &&
        r.normalizedProductKey === row.normalizedProductKey &&
        getEffectiveImportDecision(r, decisions) === "create"
    );
  }, [rows, row, decisions]);

  const setDecision = (value: ImportRowDecision) => {
    setDecisions((current) => {
      const next = {
        ...current,
        [String(row.rowNumber)]: value,
      };

      if (row.autoAction === "conflict" && value !== "create") {
        rows.forEach((r) => {
          if (
            r.rowNumber !== row.rowNumber &&
            r.normalizedProductKey === row.normalizedProductKey &&
            next[String(r.rowNumber)] === "create-variant"
          ) {
            delete next[String(r.rowNumber)];
          }
        });
      }

      return next;
    });
  };

  if (row.autoAction === "conflict") {
    return (
      <select
        value={effectiveDecision ?? ""}
        onChange={(event) => setDecision(event.target.value as ImportRowDecision)}
        className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-sm focus:ring-2 focus:ring-red-400 focus:outline-none"
      >
        <option value="">Pilih...</option>
        <option value="create">Tambahkan produk dengan SKU yang berbeda</option>
        {hasCreatedSibling && (
          <option value="create-variant">Tambahkan varian produk dengan SKU yang berbeda</option>
        )}
        <option value="skip">Lewati baris</option>
      </select>
    );
  }

  if (row.autoAction === "auto_skip") {
    return <span className="font-bold text-slate-600">Lewati baris</span>;
  }

  if (row.autoAction === "auto_create_variant") {
    return (
      <select
        value={effectiveDecision ?? "create"}
        onChange={(event) => setDecision(event.target.value as ImportRowDecision)}
        className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-sm focus:ring-2 focus:ring-emerald-400 focus:outline-none"
      >
        <option value="create">Tambahkan varian baru</option>
        <option value="skip">Lewati baris</option>
      </select>
    );
  }

  if (row.autoAction === "auto_price_update") {
    return (
      <select
        value={effectiveDecision ?? "update"}
        onChange={(event) => setDecision(event.target.value as ImportRowDecision)}
        className="rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none"
      >
        <option value="update">Perbarui harga yang sudah ada</option>
        <option value="skip">Lewati baris</option>
      </select>
    );
  }

  if (row.existingProductId) {
    return (
      <select
        value={effectiveDecision ?? ""}
        onChange={(event) => setDecision(event.target.value as ImportRowDecision)}
        className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none"
      >
        <option value="">Pilih...</option>
        <option value="update">Perbarui yang sudah ada</option>
        <option value="skip">Lewati baris</option>
      </select>
    );
  }

  if (row.duplicateInFile) {
    return (
      <select
        value={effectiveDecision ?? ""}
        onChange={(event) => setDecision(event.target.value as ImportRowDecision)}
        className="rounded-lg border border-purple-200 bg-purple-50 px-2 py-1 text-sm focus:ring-2 focus:ring-purple-400 focus:outline-none"
      >
        <option value="">Pilih...</option>
        <option value="create">Tetap Buat</option>
        <option value="skip">Lewati baris</option>
      </select>
    );
  }

  return <span className="font-bold text-emerald-700">Buat</span>;
}
