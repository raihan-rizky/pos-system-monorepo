"use client";

import React from "react";
import { Button, Modal } from "@pos/ui";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  LogIn,
  LogOut,
  PackageCheck,
  ShieldCheck,
} from "lucide-react";
import {
  checkInInventoryDay,
  checkOutInventoryDay,
  fetchInventoryDaySession,
  type InventoryCheckOutSnapshot,
  type InventoryDayCompletion,
  type InventoryDaySessionPreview,
} from "../api/inventory-management-api";

interface InventoryDaySessionPanelProps {
  onPreviewChange?: (preview: InventoryDaySessionPreview | null) => void;
}

function formatQty(value: number, unit: string) {
  return `${Number.isInteger(value) ? value : value.toFixed(2)} ${unit}`;
}

function isCheckedIn(preview: InventoryDaySessionPreview | null) {
  return preview?.session?.status === "CHECKED_IN" || preview?.session?.status === "CHECKED_OUT";
}

export function InventoryDaySessionPanel({
  onPreviewChange,
}: InventoryDaySessionPanelProps) {
  const [preview, setPreview] = React.useState<InventoryDaySessionPreview | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isMorningOpen, setIsMorningOpen] = React.useState(false);
  const [isCheckOutOpen, setIsCheckOutOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchInventoryDaySession();
      setPreview(data);
      onPreviewChange?.(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat check in inventaris.");
      onPreviewChange?.(null);
    } finally {
      setIsLoading(false);
    }
  }, [onPreviewChange]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const session = preview?.session;
  const checkedIn = isCheckedIn(preview);
  const checkedOut = session?.status === "CHECKED_OUT";

  return (
    <>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className={`rounded-xl p-2 ${checkedIn ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
              <ClipboardCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                Check In / Check Out
              </p>
              <h2 className="mt-1 text-base font-bold text-slate-900">
                {isLoading
                  ? "Memuat status inventaris..."
                  : checkedOut
                    ? `Inventory day ${preview?.dateKey} sudah check out`
                    : checkedIn
                      ? `Inventory day ${preview?.dateKey} sedang berjalan`
                      : `Inventory day ${preview?.dateKey ?? ""} belum check in`}
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Check in membuka tab Tugas. Check out menutup hari setelah tugas wajib selesai.
              </p>
              {session?.checkInByName && (
                <p className="mt-2 text-xs font-semibold text-slate-600">
                  Check in oleh {session.checkInByName}
                  {session.checkedInAt ? ` - ${new Date(session.checkedInAt).toLocaleString("id-ID")}` : ""}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              disabled={isLoading}
              onClick={() => setIsMorningOpen(true)}
              className="bg-slate-900 text-white hover:bg-slate-800"
              icon={<LogIn className="h-4 w-4" />}
            >
              {checkedIn ? "Lihat Morning Check" : "Check In"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={isLoading || !checkedIn || checkedOut}
              onClick={() => setIsCheckOutOpen(true)}
              icon={<LogOut className="h-4 w-4" />}
            >
              Check Out
            </Button>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
            {error}
          </div>
        )}
      </section>

      {preview && (
        <MorningCheckModal
          open={isMorningOpen}
          preview={preview}
          onClose={() => setIsMorningOpen(false)}
          onDone={async () => {
            setIsMorningOpen(false);
            await load();
          }}
        />
      )}

      {preview && (
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

function MorningCheckModal({
  open,
  preview,
  onClose,
  onDone,
}: {
  open: boolean;
  preview: InventoryDaySessionPreview;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [stockRiskAcknowledged, setStockRiskAcknowledged] = React.useState(
    Boolean(preview.session?.morningCheckSnapshot),
  );
  const [materialCounts, setMaterialCounts] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(
      preview.productionMaterials.map((item) => [item.product.id, String(item.product.stock)]),
    ),
  );
  const [safetyChecks, setSafetyChecks] = React.useState<Record<string, boolean>>(() =>
    Object.fromEntries(preview.workspaceSafetyItems.map((item) => [item.id, false])),
  );
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const hasStockRisk =
    preview.stockRisk.negative.length +
      preview.stockRisk.outOfStock.length +
      preview.stockRisk.lowStock.length >
    0;
  const materialComplete =
    preview.productionMaterials.length > 0 &&
    preview.productionMaterials.every((item) => {
      const value = Number(materialCounts[item.product.id]);
      return Number.isFinite(value) && value >= 0;
    });
  const safetyComplete = preview.workspaceSafetyItems.every((item) => safetyChecks[item.id]);
  const sections = [
    stockRiskAcknowledged || !hasStockRisk,
    materialComplete,
    safetyComplete,
  ];
  const progress = Math.round((sections.filter(Boolean).length / sections.length) * 100);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      await checkInInventoryDay({
        stockRiskAcknowledged: stockRiskAcknowledged || !hasStockRisk,
        materialCounts: preview.productionMaterials.map((item) => ({
          productId: item.product.id,
          actualQuantity: Number(materialCounts[item.product.id]),
        })),
        safetyChecks: preview.workspaceSafetyItems.map((item) => ({
          id: item.id,
          checked: Boolean(safetyChecks[item.id]),
        })),
      });
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Check in gagal.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Morning Check" size="4xl">
      <div className="space-y-5">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between text-xs font-bold text-slate-600">
            <span>Progress Morning Check</span>
            <span>{progress}%</span>
          </div>
          <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <section className="rounded-xl border border-slate-200 p-4">
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            Stock Risk Review
          </h3>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <RiskList title="Negatif" items={preview.stockRisk.negative} />
            <RiskList title="Habis" items={preview.stockRisk.outOfStock} />
            <RiskList title="Rendah" items={preview.stockRisk.lowStock} />
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={stockRiskAcknowledged || !hasStockRisk}
              disabled={!hasStockRisk}
              onChange={(event) => setStockRiskAcknowledged(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            Saya sudah membaca kondisi stok risiko hari ini
          </label>
        </section>

        <section className="rounded-xl border border-slate-200 p-4">
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <PackageCheck className="h-4 w-4 text-indigo-600" />
            Key Production Materials
          </h3>
          <div className="mt-3 grid gap-2">
            {preview.productionMaterials.map((item) => (
              <label
                key={item.product.id}
                className="grid gap-2 rounded-xl border border-slate-100 bg-slate-50 p-3 sm:grid-cols-[1fr_10rem]"
              >
                <span>
                  <span className="block text-sm font-bold text-slate-900">{item.product.name}</span>
                  <span className="text-xs text-slate-500">
                    Sistem: {formatQty(item.product.stock, item.product.unit)} - {item.source}
                  </span>
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={materialCounts[item.product.id] ?? ""}
                  onChange={(event) =>
                    setMaterialCounts((current) => ({
                      ...current,
                      [item.product.id]: event.target.value,
                    }))
                  }
                  className="h-10 rounded-lg border border-slate-200 px-3 text-right text-sm font-bold outline-none focus:border-slate-400"
                />
              </label>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 p-4">
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            Workspace & Safety
          </h3>
          <div className="mt-3 grid gap-2">
            {preview.workspaceSafetyItems.map((item) => (
              <label key={item.id} className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={Boolean(safetyChecks[item.id])}
                  onChange={(event) =>
                    setSafetyChecks((current) => ({
                      ...current,
                      [item.id]: event.target.checked,
                    }))
                  }
                  className="h-4 w-4 rounded border-slate-300"
                />
                {item.label}
              </label>
            ))}
          </div>
        </section>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Batal
          </Button>
          <Button
            type="button"
            disabled={isSubmitting || progress < 100}
            onClick={handleSubmit}
            className="bg-slate-900 text-white hover:bg-slate-800"
          >
            {isSubmitting ? "Menyimpan..." : "Selesaikan Check In"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function RiskList({
  title,
  items,
}: {
  title: string;
  items: Array<{ id: string; name: string; stock: number; minStock: number; unit: string }>;
}) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <div className="text-xs font-black uppercase text-slate-500">{title}</div>
      <div className="mt-2 space-y-1">
        {items.length === 0 ? (
          <div className="text-xs text-slate-400">Tidak ada</div>
        ) : (
          items.slice(0, 5).map((item) => (
            <div key={item.id} className="flex justify-between gap-2 text-xs">
              <span className="truncate font-semibold text-slate-700">{item.name}</span>
              <span className="shrink-0 font-bold tabular-nums text-slate-900">
                {formatQty(item.stock, item.unit)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
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
