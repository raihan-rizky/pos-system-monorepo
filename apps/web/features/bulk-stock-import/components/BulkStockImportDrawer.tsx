"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Modal } from "@pos/ui";
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  PackagePlus,
  SlidersHorizontal,
  Upload,
} from "lucide-react";

import type {
  BulkStockImportMode,
  BulkStockImportRow,
} from "../helpers/import-core";
import {
  applyBulkStockImportRowSelections,
  applyBulkStockImportSetModeSkips,
  applyBulkStockImportStockChanges,
} from "../helpers/import-core";
import {
  useBulkStockImportCommit,
  useBulkStockImportCommitJob,
  useBulkStockImportCommitJobStatus,
  useBulkStockImportPreview,
  type BulkStockImportJobResponse,
  type BulkStockImportPreviewResponse,
} from "../hooks/useBulkStockImport";
import { useSuppliers } from "@/features/suppliers/hooks/useSuppliers";
import type { SupplierListItem } from "@/features/suppliers/types/supplier";

export function BulkStockImportDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const preview = useBulkStockImportPreview();
  const commit = useBulkStockImportCommit();
  const commitJob = useBulkStockImportCommitJob();
  const queryClient = useQueryClient();
  const suppliers = useSuppliers({ isActive: true, limit: 100 });
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const activeJob = useBulkStockImportCommitJobStatus(activeJobId);

  useEffect(() => {
    if (
      activeJob.data?.status !== "COMMITTED" &&
      activeJob.data?.status !== "PENDING_APPROVAL"
    ) {
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["products"] });
    queryClient.invalidateQueries({ queryKey: ["inventory-logs"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  }, [activeJob.data?.status, queryClient]);
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<BulkStockImportMode>("ADD");
  const [supplierId, setSupplierId] = useState("");
  const [note, setNote] = useState("");
  const [allowNegativeStock, setAllowNegativeStock] = useState(false);
  const [candidateSelections, setCandidateSelections] = useState<
    Record<number, string | undefined>
  >({});
  const [previewFilter, setPreviewFilter] =
    useState<BulkStockImportPreviewFilter>("all");

  const previewData = preview.data;
  const resolvedPreview = useMemo(
    () => {
      if (!previewData) return null;
      const selected = applyBulkStockImportRowSelections(
        previewData.rows,
        candidateSelections,
      );
      const rowsWithStockChanges = applyBulkStockImportStockChanges(
        selected.rows,
        mode,
      );
      return applyBulkStockImportSetModeSkips(rowsWithStockChanges, mode);
    },
    [candidateSelections, mode, previewData],
  );
  const rowsForCommit = useMemo(
    () =>
      (resolvedPreview?.rows ?? [])
        .filter((row) => row.status === "valid")
        .map((row) => ({
          rowNumber: row.rowNumber,
          name: row.name,
          category: row.category,
          unit: row.unit,
          stock: row.stock,
          selectedProductId: row.selectedProductId,
        })),
    [resolvedPreview?.rows],
  );
  const canCommit =
    Boolean(resolvedPreview) &&
    (resolvedPreview?.summary.validRows ?? 0) > 0 &&
    rowsForCommit.length > 0 &&
    (resolvedPreview?.summary.errorRows ?? 0) === 0 &&
    !commit.isPending &&
    !commitJob.isPending &&
    !isActiveCommitJob(activeJob.data);

  const handlePreview = async () => {
    if (!file) return;
    commit.reset();
    await preview.mutateAsync(file);
  };

  const handleCommit = async () => {
    if (!canCommit) return;
    const job = await commitJob.mutateAsync({
      mode,
      rows: rowsForCommit,
      supplierId: supplierId.trim() || undefined,
      note,
      allowNegativeStock,
    });
    setActiveJobId(job.id);
  };

  const close = () => {
    preview.reset();
    commit.reset();
    commitJob.reset();
    setActiveJobId(null);
    setFile(null);
    setMode("ADD");
    setSupplierId("");
    setNote("");
    setAllowNegativeStock(false);
    setCandidateSelections({});
    setPreviewFilter("all");
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Import Bulk Stock"
      size="5xl"
      className="max-h-[92dvh] max-w-[96vw] xl:max-w-6xl translate-y-0"
    >
      <div className="space-y-4">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-700 ring-1 ring-emerald-200">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-black text-slate-950">
                Upload file stok
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Required columns: name product, category, unit, stock. Unmatched products are skipped.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto]">
          <label className="block rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <span className="mb-1 block text-sm font-bold text-slate-700">
              Excel / CSV file
            </span>
            <input
              type="file"
              accept=".xlsx,.csv"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                preview.reset();
                commit.reset();
                setCandidateSelections({});
                setPreviewFilter("all");
              }}
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-xl file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-bold file:text-white"
            />
          </label>
          <div className="flex items-end">
            <Button
              type="button"
              onClick={handlePreview}
              loading={preview.isPending}
              disabled={!file || preview.isPending}
              icon={<Upload className="h-4 w-4" />}
              className="w-full lg:w-auto"
            >
              Preview
            </Button>
          </div>
        </div>

        {preview.error && (
          <ErrorBox message={(preview.error as Error).message} />
        )}
        {commit.error && <ErrorBox message={(commit.error as Error).message} />}
        {commitJob.error && <ErrorBox message={(commitJob.error as Error).message} />}
        {activeJob.error && <ErrorBox message={(activeJob.error as Error).message} />}

        {previewData && (
          <>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <button
                type="button"
                onClick={() => setMode("ADD")}
                className={`rounded-2xl border p-4 text-left transition-colors ${
                  mode === "ADD"
                    ? "border-emerald-500 bg-emerald-50"
                    : "border-slate-200 bg-white hover:bg-slate-50"
                }`}
              >
                <PackagePlus className="mb-2 h-5 w-5 text-emerald-700" />
                <p className="text-sm font-black text-slate-950">Add stock</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  Excel stock is added to current stock.
                </p>
              </button>
              <button
                type="button"
                onClick={() => setMode("SET")}
                className={`rounded-2xl border p-4 text-left transition-colors ${
                  mode === "SET"
                    ? "border-blue-500 bg-blue-50"
                    : "border-slate-200 bg-white hover:bg-slate-50"
                }`}
              >
                <SlidersHorizontal className="mb-2 h-5 w-5 text-blue-700" />
                <p className="text-sm font-black text-slate-950">
                  Set final stock
                </p>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  Excel stock becomes the final displayed stock.
                </p>
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <BulkStockImportSupplierDropdown
                value={supplierId}
                onChange={setSupplierId}
                suppliers={suppliers.data?.data ?? []}
                loading={suppliers.isPending}
                error={suppliers.error ? "Failed to load suppliers" : null}
              />
              <label className="block rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                <span className="mb-1 block text-sm font-bold text-slate-700">
                  Batch note optional
                </span>
                <input
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </label>
            </div>

            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3">
              <input
                type="checkbox"
                checked={allowNegativeStock}
                onChange={(event) => setAllowNegativeStock(event.target.checked)}
                className="mt-1 h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
              />
              <span>
                <span className="block text-sm font-black text-amber-900">
                  Allow negative stock
                </span>
                <span className="block text-xs font-semibold text-amber-800/80">
                  Allows ADD rows below zero and SET final stock below zero for exceptional corrections.
                </span>
              </span>
            </label>

            <BulkStockImportPreviewPanel
              rows={resolvedPreview?.rows ?? previewData.rows}
              summary={resolvedPreview?.summary ?? previewData.summary}
              filter={previewFilter}
              onFilterChange={setPreviewFilter}
              candidateSelections={candidateSelections}
              onSelectCandidate={(rowNumber, productId) => {
                setCandidateSelections((current) => ({
                  ...current,
                  [rowNumber]: productId || undefined,
                }));
              }}
            />

            {activeJob.data && (
              <BulkStockImportProgressPanel job={activeJob.data} />
            )}

            {activeJob.data?.result ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                  <div>
                    <p className="font-black">
                      {activeJob.data.result.pendingApproval
                        ? "Import submitted for approval"
                        : "Stock import committed"}
                    </p>
                    <p className="mt-1">
                      {activeJob.data.result.inventoryLogCount} stock logs created.
                    </p>
                  </div>
                </div>
              </div>
            ) : activeJob.data?.status === "FAILED" ? (
              <ErrorBox
                message={
                  activeJob.data.errorMessage || "Bulk stock import failed"
                }
              />
            ) : (
              <div className="sticky bottom-0 -mx-6 -mb-4 border-t border-slate-200 bg-white/95 px-6 py-3 backdrop-blur">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs font-semibold text-slate-500">
                    Skipped rows will not be committed. Error rows must be fixed first.
                  </p>
                  <Button
                    type="button"
                    onClick={handleCommit}
                    loading={commit.isPending || commitJob.isPending || isActiveCommitJob(activeJob.data)}
                    disabled={!canCommit}
                  >
                    Commit Stock Import
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

export type BulkStockImportPreviewFilter =
  | "all"
  | "valid"
  | "warning"
  | "error"
  | "skipped";

export function BulkStockImportPreviewPanel({
  rows,
  summary,
  filter = "all",
  onFilterChange,
  candidateSelections = {},
  onSelectCandidate,
}: {
  rows: BulkStockImportRow[];
  summary: BulkStockImportPreviewResponse["summary"];
  filter?: BulkStockImportPreviewFilter;
  onFilterChange?: (filter: BulkStockImportPreviewFilter) => void;
  candidateSelections?: Record<number, string | undefined>;
  onSelectCandidate?: (rowNumber: number, productId: string) => void;
}) {
  const filteredRows = rows.filter((row) => {
    if (filter === "all") return true;
    if (filter === "warning") return row.warnings.length > 0;
    return row.status === filter;
  });
  const filters: Array<{
    value: BulkStockImportPreviewFilter;
    label: string;
    count: number;
  }> = [
    { value: "all", label: "All", count: rows.length },
    { value: "valid", label: "Valid", count: summary.validRows },
    { value: "warning", label: "Warning", count: summary.warningRows },
    { value: "error", label: "Error", count: summary.errorRows },
    { value: "skipped", label: "Skipped", count: summary.skippedRows },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <SummaryTile label="Valid" value={summary.validRows} tone="emerald" />
        <SummaryTile label="Skipped" value={summary.skippedRows} tone="slate" />
        <SummaryTile label="Warning" value={summary.warningRows} tone="amber" />
        <SummaryTile label="Error" value={summary.errorRows} tone="red" />
      </div>

      <div className="flex flex-wrap gap-2">
        {filters.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => onFilterChange?.(item.value)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-black transition-colors ${
              filter === item.value
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {item.label} {item.count}
          </button>
        ))}
      </div>

      <div className="max-h-[360px] overflow-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-[1080px] w-full text-sm">
          <thead className="sticky top-0 bg-slate-50 text-left text-[11px] uppercase tracking-widest text-slate-500">
            <tr>
              <th className="px-3 py-2">Row</th>
              <th className="px-3 py-2">Product</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">Unit</th>
              <th className="px-3 py-2 text-right">Stock</th>
              <th className="px-3 py-2 text-right">Before</th>
              <th className="px-3 py-2 text-right">After</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Notes</th>
              <th className="px-3 py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => (
              <tr key={row.rowNumber} className="border-t border-slate-100">
                <td className="px-3 py-2 font-bold text-slate-500">
                  {row.rowNumber}
                </td>
                <td className="px-3 py-2 font-semibold text-slate-900">
                  {row.name}
                </td>
                <td className="px-3 py-2">{row.category}</td>
                <td className="px-3 py-2">{row.unit}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {row.stock}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                  {formatPreviewStock(row.beforeStock)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-bold text-slate-900">
                  {formatPreviewStock(row.afterStock)}
                </td>
                <td className="px-3 py-2">
                  <StatusBadge status={row.status} />
                </td>
                <td className="px-3 py-2 text-xs font-semibold text-slate-500">
                  {[...row.errors, ...row.warnings, ...(row.notes ?? [])].join(" ")}
                </td>
                <td className="px-3 py-2">
                  {row.candidates?.length ? (
                    <select
                      value={
                        candidateSelections[row.rowNumber] ??
                        row.selectedProductId ??
                        ""
                      }
                      onChange={(event) =>
                        onSelectCandidate?.(row.rowNumber, event.target.value)
                      }
                      className="min-h-9 w-56 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    >
                      <option value="">Select product</option>
                      {row.candidates.map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>
                          {candidate.name} - {candidate.sku} - stock{" "}
                          {candidate.stock} {candidate.unit}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-xs font-semibold text-slate-400">
                      -
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {filteredRows.length === 0 && (
              <tr>
                <td
                  colSpan={10}
                  className="border-t border-slate-100 px-3 py-6 text-center text-sm font-semibold text-slate-500"
                >
                  No rows for this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function BulkStockImportSupplierDropdown({
  value,
  onChange,
  suppliers,
  loading = false,
  error = null,
}: {
  value: string;
  onChange: (supplierId: string) => void;
  suppliers: SupplierListItem[];
  loading?: boolean;
  error?: string | null;
}) {
  const disabled = loading || Boolean(error);
  return (
    <label className="block rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <span className="mb-1 block text-sm font-bold text-slate-700">
        Supplier optional
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
      >
        <option value="">
          {loading
            ? "Loading suppliers..."
            : error
              ? error
              : suppliers.length === 0
                ? "No active suppliers"
                : "No supplier"}
        </option>
        {suppliers.map((supplier) => (
          <option key={supplier.id} value={supplier.id}>
            {supplier.name} - {supplier.type}
          </option>
        ))}
      </select>
    </label>
  );
}

export function BulkStockImportProgressPanel({
  job,
}: {
  job: Pick<
    BulkStockImportJobResponse,
    | "id"
    | "status"
    | "phase"
    | "totalRows"
    | "processedRows"
    | "successRows"
    | "failedRows"
    | "result"
    | "errorMessage"
  >;
}) {
  const totalRows = Math.max(0, job.totalRows);
  const processedRows = Math.min(Math.max(0, job.processedRows), totalRows);
  const percent = totalRows > 0 ? Math.round((processedRows / totalRows) * 100) : 0;
  return (
    <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-black">Commit progress</p>
          <p className="mt-1 text-xs font-semibold text-blue-800/80">
            {formatBulkStockImportPhase(job.phase)}
          </p>
        </div>
        <span className="text-xs font-black tabular-nums">{percent}%</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
        <div
          className="h-full rounded-full bg-blue-600"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-2 text-xs font-semibold text-blue-800/80">
        {processedRows} / {totalRows} rows
      </p>
      {job.errorMessage && (
        <p className="mt-2 text-xs font-semibold text-red-700">
          {job.errorMessage}
        </p>
      )}
    </div>
  );
}

function isActiveCommitJob(job: BulkStockImportJobResponse | null | undefined) {
  return job?.status === "PENDING" || job?.status === "RUNNING";
}

function formatBulkStockImportPhase(phase: string) {
  const labels: Record<string, string> = {
    QUEUED: "Queued",
    VALIDATING: "Validating",
    BUILDING_IMPACTS: "Building stock changes",
    UPDATING_STOCK: "Updating stock",
    CREATING_LOGS: "Creating stock logs",
    FINALIZING: "Finalizing",
    DONE: "Done",
    FAILED: "Failed",
  };
  return labels[phase] ?? phase;
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "emerald" | "slate" | "amber" | "red";
}) {
  const classes = {
    emerald: "border-emerald-100 bg-emerald-50 text-emerald-700",
    slate: "border-slate-200 bg-slate-50 text-slate-700",
    amber: "border-amber-100 bg-amber-50 text-amber-700",
    red: "border-red-100 bg-red-50 text-red-700",
  }[tone];

  return (
    <div className={`rounded-xl border px-3 py-2 ${classes}`}>
      <p className="text-[10px] font-black uppercase tracking-wider">
        {label}
      </p>
      <p className="mt-1 text-lg font-black text-slate-950">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: BulkStockImportRow["status"] }) {
  const classes = {
    valid: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    skipped: "bg-slate-50 text-slate-600 ring-slate-200",
    error: "bg-red-50 text-red-700 ring-red-100",
  }[status];
  return (
    <span className={`rounded-lg px-2 py-1 text-xs font-black ring-1 ${classes}`}>
      {status}
    </span>
  );
}

function formatPreviewStock(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return "-";
  if (Number.isInteger(value)) return String(value);
  return Number(value.toFixed(2)).toString();
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
