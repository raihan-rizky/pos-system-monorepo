"use client";

import React from "react";
import { Button, Modal } from "@pos/ui";
import { CheckCircle2, ClipboardCheck, LogOut } from "lucide-react";
import {
  checkOutInventoryDay,
  fetchInventoryDaySession,
  type InventoryCheckOutSnapshot,
  type InventoryDayCompletion,
  type InventoryDaySessionPreview,
} from "../api/inventory-management-api";

interface InventoryDaySessionPanelProps {
  initialPreview?: InventoryDaySessionPreview | null;
}

export function InventoryDaySessionPanel({
  initialPreview,
}: InventoryDaySessionPanelProps) {
  const [preview, setPreview] = React.useState<InventoryDaySessionPreview | null>(initialPreview ?? null);
  const [isLoading, setIsLoading] = React.useState(!initialPreview);
  const [isCheckOutOpen, setIsCheckOutOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setPreview(await fetchInventoryDaySession());
    } catch (err) {
      setPreview(null);
      setError(err instanceof Error ? err.message : "Gagal memuat status inventaris.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const checkedOut = preview?.session?.status === "CHECKED_OUT";

  return (
    <>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-slate-100 p-2 text-slate-700">
              <ClipboardCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                Check Out
              </p>
              <h2 className="mt-1 text-base font-bold text-slate-900">
                {isLoading
                  ? "Memuat status inventaris..."
                  : checkedOut
                    ? `Hari inventaris ${preview?.dateKey} sudah ditutup`
                    : preview
                      ? `Hari inventaris ${preview.dateKey} belum ditutup`
                      : "Status inventaris belum tersedia"}
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Kerjakan tugas harian, lalu periksa ringkasan sebelum menutup hari.
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={isLoading || !preview || checkedOut}
            onClick={() => setIsCheckOutOpen(true)}
            icon={<LogOut className="h-4 w-4" />}
          >
            Check Out
          </Button>
        </div>
        {error && (
          <div role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
            {error}
          </div>
        )}
      </section>
      {preview && isCheckOutOpen && (
        <CheckOutModal
          open={isCheckOutOpen}
          completion={preview.completion}
          snapshot={preview.checkOutPreview ?? null}
          onClose={() => setIsCheckOutOpen(false)}
          onDone={async () => {
            setIsCheckOutOpen(false);
            await load();
          }}
        />
      )}
    </>
  );
}

function CheckOutModal({
  open,
  completion,
  snapshot,
  onClose,
  onDone,
}: {
  open: boolean;
  completion: InventoryDayCompletion;
  snapshot: InventoryCheckOutSnapshot | null;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [note, setNote] = React.useState("");
  const [blockers, setBlockers] = React.useState<string[]>(completion.blockers);
  const [missingExceptionTaskIds, setMissingExceptionTaskIds] = React.useState<string[]>(() =>
    completion.tasks.filter((task) => task.required && !task.completed).map((task) => task.id),
  );
  const [exceptionNotes, setExceptionNotes] = React.useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const unresolvedRequiredTasks = completion.tasks.filter((task) => task.required && !task.completed);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setBlockers([]);
    try {
      await checkOutInventoryDay({
        note: note.trim() || null,
        exceptionNotes,
      });
      await onDone();
    } catch (err) {
      const typed = err as Error & { blockers?: string[]; missingExceptionTaskIds?: string[] };
      setBlockers(typed.blockers ?? [typed.message]);
      setMissingExceptionTaskIds(typed.missingExceptionTaskIds ?? []);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Check Out Inventaris" size="4xl">
      <div className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-xl border border-slate-200 p-4">
            <h3 className="text-sm font-bold text-slate-900">Ringkasan Penutupan Hari</h3>
            <div className="mt-3 space-y-2">
              {completion.tasks.map((task) => (
                <div key={task.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
                  <span className="text-sm font-semibold text-slate-700">
                    {task.label}
                    {!task.required && <span className="ml-1 text-xs text-slate-400">(opsional)</span>}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${task.completed ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                    {task.completed ? "Selesai" : task.required ? "Perlu alasan" : "Belum"}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {snapshot && (
            <div className="rounded-xl border border-slate-200 p-4">
              <h3 className="text-sm font-bold text-slate-900">Status Dokumen & Workflow</h3>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <SummaryPill label="Penerimaan tunggu owner" value={snapshot.workflowSummary.submittedInboundReceipts} />
                <SummaryPill label="Penerimaan revisi" value={snapshot.workflowSummary.needsRevisionReceipts} />
                <SummaryPill label="Surat Jalan pending" value={snapshot.workflowSummary.pendingSuratJalan} />
                <SummaryPill label="Surat Jalan belum marking" value={snapshot.workflowSummary.unmarkedSuratJalan} />
                <SummaryPill label="Checklist tersisa" value={snapshot.workflowSummary.dailyChecklistRemaining} />
                <SummaryPill label="OUT belum verifikasi" value={snapshot.workflowSummary.unverifiedOutLogs} />
              </div>
            </div>
          )}
        </div>

        {snapshot && (
          <div className="rounded-xl border border-slate-200 p-4">
            <h3 className="text-sm font-bold text-slate-900">Ringkasan Pergerakan Stok Hari Ini</h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <SummaryPill label="Stok masuk" value={snapshot.movementSummary.stockInQuantity} suffix="unit" />
              <SummaryPill label="Stok keluar" value={snapshot.movementSummary.stockOutQuantity} suffix="unit" />
              <SummaryPill label="Pemakaian internal" value={snapshot.movementSummary.internalUseQuantity} suffix="unit" />
              <SummaryPill label="Barang rusak" value={snapshot.movementSummary.damagedQuantity} suffix="unit" />
              <SummaryPill label="Penyesuaian stok" value={snapshot.movementSummary.adjustmentQuantity} suffix="unit" />
              <SummaryPill label="Log approved" value={snapshot.movementSummary.approvedLogCount} />
              <SummaryPill label="Request pending" value={snapshot.movementSummary.pendingRequestCount} />
            </div>
          </div>
        )}

        {unresolvedRequiredTasks.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <h3 className="text-sm font-bold text-amber-950">Alasan pengecualian wajib diisi</h3>
            <p className="mt-1 text-xs text-amber-800">
              Check out tetap bisa dilanjutkan jika setiap kategori yang belum selesai diberi alasan yang jelas.
            </p>
            <div className="mt-3 space-y-3">
              {unresolvedRequiredTasks.map((task) => (
                <label key={task.id} className="block">
                  <span className="text-xs font-black uppercase text-amber-900">{task.label}</span>
                  <textarea
                    value={exceptionNotes[task.id] ?? ""}
                    onChange={(event) =>
                      setExceptionNotes((current) => ({
                        ...current,
                        [task.id]: event.target.value,
                      }))
                    }
                    placeholder="Tulis alasan dan tindak lanjut..."
                    className={`mt-1 min-h-20 w-full rounded-xl border p-3 text-sm outline-none focus:border-amber-500 ${
                      missingExceptionTaskIds.includes(task.id) ? "border-rose-300 bg-white" : "border-amber-200 bg-white"
                    }`}
                  />
                </label>
              ))}
            </div>
          </div>
        )}

        {!snapshot && (
          <div className="rounded-xl border border-slate-200 p-4">
            <h3 className="text-sm font-bold text-slate-900">Summary Shift Inventaris</h3>
            <div className="mt-3 space-y-2">
            {completion.tasks.map((task) => (
              <div key={task.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
                <span className="text-sm font-semibold text-slate-700">
                  {task.label}
                  {!task.required && <span className="ml-1 text-xs text-slate-400">(opsional)</span>}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${task.completed ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                  {task.completed ? "Selesai" : "Belum"}
                </span>
              </div>
            ))}
            </div>
          </div>
        )}

        {blockers.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-bold">Check out membutuhkan alasan pengecualian.</p>
            <ul className="mt-2 list-disc pl-5">
              {blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          </div>
        )}

        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Catatan penutupan shift inventaris..."
          className="min-h-24 w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-slate-400"
        />

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Batal
          </Button>
          <Button
            type="button"
            disabled={isSubmitting}
            onClick={handleSubmit}
            className="bg-slate-900 text-white hover:bg-slate-800"
            icon={<CheckCircle2 className="h-4 w-4" />}
          >
            {isSubmitting ? "Menutup..." : "Tutup Hari"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function SummaryPill({
  label,
  value,
  suffix,
}: {
  label: string;
  value: number;
  suffix?: string;
}) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <div className="text-[11px] font-black uppercase text-slate-400">{label}</div>
      <div className="mt-1 text-lg font-black tabular-nums text-slate-900">
        {Number.isInteger(value) ? value : value.toFixed(2)}
        {suffix ? <span className="ml-1 text-xs font-bold text-slate-500">{suffix}</span> : null}
      </div>
    </div>
  );
}
