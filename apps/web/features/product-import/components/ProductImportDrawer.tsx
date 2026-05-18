"use client";

import React, { useMemo, useState } from "react";
import { Modal, Button } from "@pos/ui";
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Filter,
  Upload,
} from "lucide-react";
import {
  REQUIRED_IMPORT_COLUMNS,
  type ColumnMapping,
  type ImportRowDecision,
  type NormalizedImportRow,
  type PreviewFilter,
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
import { readFileHeaders, buildAutoMapping } from "../helpers/client-parser";
import { getRowsMissingImportDecision } from "../helpers/import-decisions";

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

  const previewData = method === "image" ? imageExtract.data : preview.data;
  const rows: NormalizedImportRow[] = previewData?.rows ?? [];

  // Filter rows for the preview table
  const filteredRows = useMemo(() => {
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
          return row.duplicateInFile || Boolean(row.existingProductId);
        case "new-category":
          return row.missingCategory;
        default:
          return true;
      }
    });
  }, [rows, previewFilter]);

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

  // Filter counts for badges
  const filterCounts = useMemo(() => {
    const ready = rows.filter(
      (r) => r.errors.length === 0 && r.warnings.length === 0
    ).length;
    const errors = rows.filter((r) => r.errors.length > 0).length;
    const warnings = rows.filter((r) => r.warnings.length > 0).length;
    const duplicate = rows.filter(
      (r) => r.duplicateInFile || Boolean(r.existingProductId)
    ).length;
    const newCategory = rows.filter((r) => r.missingCategory).length;
    return { all: rows.length, ready, errors, warnings, duplicate, newCategory };
  }, [rows]);

  const reset = () => {
    setStep("upload");
    setFile(null);
    setRawHeaders([]);
    setColumnMapping({});
    setDecisions({});
    setPreviewFilter("all");
    setMissingColDialogOpen(false);
    setMissingColData(null);
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
    try {
      await imageExtract.mutateAsync(files);
      setStep("preview");
    } catch (error) {
      // Error is handled by react-query error state
    }
  };

  const handleCommit = async () => {
    if (!canCommit) return;

    try {
      const result = await commit.mutateAsync({
        rows,
        decisions,
        createMissingCategories,
      });
      if (result) setStep("result");
    } catch {
      // React Query keeps the error in commit.error for the inline message.
    }
  };

  // Step indicators
  const STEPS: { key: ImportStep; label: string; num: number }[] = method === "file" 
    ? [
        { key: "upload", label: "Upload", num: 1 },
        { key: "mapping", label: "Map Columns", num: 2 },
        { key: "preview", label: "Preview", num: 3 },
        { key: "result", label: "Result", num: 4 },
      ]
    : [
        { key: "upload", label: "Upload", num: 1 },
        { key: "preview", label: "Preview", num: 2 },
        { key: "result", label: "Result", num: 3 },
      ];
  const stepIndex = STEPS.findIndex((s) => s.key === step);

  return (
    <>
      <Modal
        open={open}
        onClose={close}
        title="Batch Product Import"
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
              summary={[
                { label: "Created", value: commit.data.createdProductCount },
                { label: "Updated", value: commit.data.updatedProductCount },
                { label: "Skipped", value: commit.data.skippedRowCount },
                {
                  label: "Categories",
                  value: commit.data.createdCategoryCount,
                },
                { label: "Stock Logs", value: commit.data.inventoryLogCount },
              ]}
            />
          )}

          {/* Step 1: Upload */}
          {step === "upload" && (
            <div className="space-y-6">
              <MethodSelector value={method} onChange={setMethod} />
              
              {method === "file" ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <label className="block text-sm font-bold text-slate-700 mb-2">
                    CSV or Excel file
                  </label>
              <input
                type="file"
                accept=".csv,.xlsx"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                className="block w-full text-sm text-slate-700 file:mr-4 file:rounded-lg file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:font-bold file:text-white"
              />
              <p className="mt-3 text-xs text-slate-500">
                Required columns: {REQUIRED_IMPORT_COLUMNS.join(", ")}. Maximum
                500 rows.
              </p>
              <Button
                type="button"
                className="mt-4"
                icon={<Upload className="w-4 h-4" />}
                loading={headerLoading}
                disabled={!file || headerLoading}
                onClick={handleUpload}
              >
                Continue
                  </Button>
                </div>
              ) : (
                <ImageUploadStep 
                  onExtract={handleImageExtract} 
                  isLoading={imageExtract.isPending} 
                />
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
                  Unknown columns ignored:{" "}
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
                  Create missing categories:{" "}
                  {previewData.missingCategories?.join(", ")}
                </label>
              )}

              {method === "image" && previewData.source && (
                <div className="flex justify-between items-center bg-blue-50 text-blue-800 text-xs font-bold px-3 py-2 rounded-lg border border-blue-100">
                  <span>AI Extraction complete via {previewData.source}</span>
                  <span className="opacity-80">Check data carefully</span>
                </div>
              )}

              {/* Preview Filters */}
              <PreviewFilterBar
                filter={previewFilter}
                counts={filterCounts}
                onChange={setPreviewFilter}
              />

              <ImportPreviewTable
                rows={filteredRows}
                decisions={decisions}
                setDecisions={setDecisions}
              />

              {blockingErrors.length > 0 && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  Fix row errors before commit.
                </div>
              )}
              {needsDecision.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  Choose action for {needsDecision.length} duplicate/existing
                  SKU rows.
                </div>
              )}
              {commit.error && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {(commit.error as Error).message}
                </div>
              )}
              <div className="flex justify-between gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setStep(method === "image" ? "upload" : "mapping");
                    preview.reset();
                    imageExtract.reset();
                    setDecisions({});
                  }}
                >
                  Back
                </Button>
                <div className="flex gap-3">
                  <Button type="button" variant="secondary" onClick={reset}>
                    Start Over
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
              Analyzing file...
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
  };
  onChange: (f: PreviewFilter) => void;
}) {
  const filters: { id: PreviewFilter; label: string; count: number; color: string }[] = [
    { id: "all", label: "All", count: counts.all, color: "bg-slate-100 text-slate-700" },
    { id: "ready", label: "Ready", count: counts.ready, color: "bg-emerald-100 text-emerald-700" },
    { id: "errors", label: "Errors", count: counts.errors, color: "bg-red-100 text-red-700" },
    { id: "warnings", label: "Warnings", count: counts.warnings, color: "bg-amber-100 text-amber-700" },
    { id: "duplicate", label: "Duplicate SKU", count: counts.duplicate, color: "bg-purple-100 text-purple-700" },
    { id: "new-category", label: "New Category", count: counts.newCategory, color: "bg-blue-100 text-blue-700" },
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
function ImportPreviewTable({
  rows,
  decisions,
  setDecisions,
}: {
  rows: NormalizedImportRow[];
  decisions: Record<string, ImportRowDecision>;
  setDecisions: React.Dispatch<
    React.SetStateAction<Record<string, ImportRowDecision>>
  >;
}) {
  return (
    <div className="max-h-[420px] overflow-auto rounded-xl border border-slate-200 bg-white">
      <table className="min-w-[900px] w-full text-left text-sm">
        <thead className="sticky top-0 bg-slate-50 text-[11px] uppercase tracking-widest text-slate-500">
          <tr>
            <th className="px-3 py-2">Row</th>
            <th className="px-3 py-2">Product</th>
            <th className="px-3 py-2">SKU</th>
            <th className="px-3 py-2">Category</th>
            <th className="px-3 py-2 text-right">Price</th>
            <th className="px-3 py-2 text-right">Stock</th>
            <th className="px-3 py-2">Decision</th>
            <th className="px-3 py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const needsDecision =
              Boolean(row.existingProductId) || row.duplicateInFile;
            return (
              <tr key={row.rowNumber} className="border-t border-slate-100">
                <td className="px-3 py-2 font-mono text-xs">
                  {row.rowNumber}
                </td>
                <td className="px-3 py-2 font-semibold text-slate-900">
                  {row.name}
                </td>
                <td className="px-3 py-2">{row.sku}</td>
                <td className="px-3 py-2">
                  {row.category}
                  {row.missingCategory && (
                    <span className="ml-1 text-[10px] font-bold text-blue-600">
                      NEW
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {row.price}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {row.stock} {row.unit}
                </td>
                <td className="px-3 py-2">
                  {row.existingProductId ? (
                    <select
                      value={decisions[String(row.rowNumber)] ?? ""}
                      onChange={(event) =>
                        setDecisions((current) => ({
                          ...current,
                          [String(row.rowNumber)]: event.target.value as
                            | "update"
                            | "skip",
                        }))
                      }
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none"
                    >
                      <option value="">Choose...</option>
                      <option value="update">Update existing</option>
                      <option value="skip">Skip row</option>
                    </select>
                  ) : row.duplicateInFile ? (
                    <select
                      value={decisions[String(row.rowNumber)] ?? ""}
                      onChange={(event) =>
                        setDecisions((current) => ({
                          ...current,
                          [String(row.rowNumber)]: event.target.value as
                            | "create"
                            | "skip",
                        }))
                      }
                      className="rounded-lg border border-purple-200 bg-purple-50 px-2 py-1 text-sm focus:ring-2 focus:ring-purple-400 focus:outline-none"
                    >
                      <option value="">Choose...</option>
                      <option value="create">Keep (Create)</option>
                      <option value="skip">Skip row</option>
                    </select>
                  ) : (
                    <span className="text-emerald-700 font-bold">Create</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {row.errors.length > 0 ? (
                    <span className="text-red-600">{row.errors.join(" ")}</span>
                  ) : row.warnings.length > 0 ? (
                    <span className="text-amber-700">
                      {row.warnings.join(" ")}
                    </span>
                  ) : (
                    <span className="text-emerald-700">Ready</span>
                  )}
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td
                colSpan={8}
                className="px-3 py-8 text-center text-sm text-slate-400"
              >
                No rows match the selected filter.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
