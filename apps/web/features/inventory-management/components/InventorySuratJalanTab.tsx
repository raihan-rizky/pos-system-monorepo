import React from "react";
import { SuratJalanList } from "@/features/surat-jalan/components/SuratJalanList";
import {
  useGlobalApproveSuratJalan,
  useGlobalMarkSuratJalan,
  useSuratJalans,
} from "@/features/surat-jalan/hooks/useSuratJalan";
import { useRole } from "@/components/providers/RoleProvider";
import { CheckCircle2, Clock3, HelpCircle, Loader2, PenLine, Truck } from "lucide-react";
import type { useApproveSuratJalan } from "@/features/surat-jalan/hooks/useSuratJalan";
import type {
  SuratJalanMarkingStatus,
  SuratJalanRecord,
} from "@/features/surat-jalan/types/surat-jalan";

const MARKING_OPTIONS: Array<{
  status: Exclude<SuratJalanMarkingStatus, "UNMARKED">;
  label: string;
  tooltip: string;
  requiresNote: boolean;
}> = [
  {
    status: "COMPLETED",
    label: "Selesai",
    tooltip: "Gunakan jika Surat Jalan sudah ditandatangani, barang sudah dikirim, dan stok keluar sudah sesuai.",
    requiresNote: false,
  },
  {
    status: "NOT_DELIVERED",
    label: "Belum Dikirim",
    tooltip: "Gunakan jika Surat Jalan sudah ada di sistem tetapi barang belum dikirim ke penerima.",
    requiresNote: true,
  },
  {
    status: "NEEDS_SIGNATURE",
    label: "Perlu Tanda Tangan",
    tooltip: "Gunakan jika pengiriman atau persiapan sudah berjalan, tetapi tanda tangan penerima atau pihak terkait belum lengkap.",
    requiresNote: true,
  },
  {
    status: "NEEDS_FOLLOW_UP",
    label: "Perlu Follow Up",
    tooltip: "Gunakan jika Surat Jalan sudah dicek, tetapi masih ada masalah yang harus ditindaklanjuti.",
    requiresNote: true,
  },
  {
    status: "POSTPONED",
    label: "Ditunda",
    tooltip: "Gunakan jika pemeriksaan Surat Jalan belum bisa diselesaikan sekarang dan perlu dilanjutkan nanti.",
    requiresNote: true,
  },
  {
    status: "NOT_RELEVANT",
    label: "Tidak Relevan",
    tooltip: "Gunakan jika Surat Jalan tidak perlu ditangani oleh inventory, misalnya data lama, salah input, atau bukan bagian dari proses gudang.",
    requiresNote: true,
  },
];

const MARKING_LABELS: Record<SuratJalanMarkingStatus, string> = {
  UNMARKED: "Belum Dimarking",
  COMPLETED: "Selesai",
  NOT_DELIVERED: "Belum Dikirim",
  NEEDS_SIGNATURE: "Perlu Tanda Tangan",
  NEEDS_FOLLOW_UP: "Perlu Follow Up",
  POSTPONED: "Ditunda",
  NOT_RELEVANT: "Tidak Relevan",
};

function markingPillClass(status: SuratJalanMarkingStatus) {
  if (status === "UNMARKED") return "bg-amber-100 text-amber-800";
  if (status === "COMPLETED") return "bg-emerald-100 text-emerald-800";
  if (status === "NOT_DELIVERED" || status === "POSTPONED") return "bg-slate-100 text-slate-700";
  if (status === "NEEDS_SIGNATURE") return "bg-indigo-100 text-indigo-800";
  if (status === "NEEDS_FOLLOW_UP") return "bg-rose-100 text-rose-800";
  return "bg-zinc-100 text-zinc-700";
}

export const InventorySuratJalanTab: React.FC = () => {
  const { data, isLoading, error } = useSuratJalans(50, 0);
  const { canPerform } = useRole();
  const canApprove = canPerform("surat_jalan", "update");
  const canMark = canPerform("surat_jalan", "update");
  const approveMutation = useGlobalApproveSuratJalan();
  const markMutation = useGlobalMarkSuratJalan();
  const [markingRecord, setMarkingRecord] = React.useState<SuratJalanRecord | null>(null);
  const [selectedStatus, setSelectedStatus] =
    React.useState<Exclude<SuratJalanMarkingStatus, "UNMARKED">>("COMPLETED");
  const [markingNote, setMarkingNote] = React.useState("");
  const [markingError, setMarkingError] = React.useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-40 items-center justify-center rounded-2xl border border-red-200 bg-red-50 text-red-500 shadow-sm">
        <p className="text-sm font-semibold">Gagal memuat data Surat Jalan</p>
      </div>
    );
  }

  const records: SuratJalanRecord[] = data?.data || [];
  const unmarkedRecords = records.filter((record) => record.markingStatus === "UNMARKED");
  const markedRecords = records.filter((record) => record.markingStatus !== "UNMARKED");
  const unmarkedItemCount = unmarkedRecords.reduce(
    (sum, record) => sum + record.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
    0,
  );
  const selectedOption = MARKING_OPTIONS.find((option) => option.status === selectedStatus);

  const openMarking = (record: SuratJalanRecord) => {
    setMarkingRecord(record);
    setSelectedStatus("COMPLETED");
    setMarkingNote("");
    setMarkingError(null);
  };

  const submitMarking = () => {
    if (!markingRecord || !selectedOption) return;
    if (selectedOption.requiresNote && markingNote.trim().length === 0) {
      setMarkingError("Catatan wajib diisi untuk status ini.");
      return;
    }
    markMutation.mutate(
      {
        suratJalanId: markingRecord.id,
        markingStatus: selectedStatus,
        markingNote: markingNote.trim() || null,
      },
      {
        onSuccess: () => {
          setMarkingRecord(null);
          setMarkingNote("");
          setMarkingError(null);
        },
        onError: (mutationError) => {
          setMarkingError(
            mutationError instanceof Error
              ? mutationError.message
              : "Marking Surat Jalan gagal disimpan.",
          );
        },
      },
    );
  };

  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
          <Truck className="h-6 w-6 text-slate-400" />
        </div>
        <h3 className="text-sm font-bold text-slate-900">Belum ada Surat Jalan</h3>
        <p className="text-xs text-slate-500 max-w-[250px]">
          Belum ada riwayat Surat Jalan yang memengaruhi stok gudang.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">
              Marking Surat Jalan
            </p>
            <h2 className="mt-1 text-lg font-bold text-slate-900">
              {unmarkedRecords.length > 0
                ? `${unmarkedRecords.length} dokumen belum dimarking`
                : "Semua Surat Jalan sudah dimarking"}
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              Tandai status operasional Surat Jalan. Approval stok tetap berjalan terpisah.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:min-w-[24rem]">
            <div className="rounded-xl bg-amber-50 p-3">
              <div className="flex items-center gap-1.5 text-[10px] font-black uppercase text-amber-700">
                <Clock3 className="h-3.5 w-3.5" />
                Belum Marking
              </div>
              <div className="mt-1 text-2xl font-black tabular-nums text-amber-950">
                {unmarkedRecords.length}
              </div>
            </div>
            <div className="rounded-xl bg-indigo-50 p-3">
              <div className="flex items-center gap-1.5 text-[10px] font-black uppercase text-indigo-700">
                <Truck className="h-3.5 w-3.5" />
                Qty
              </div>
              <div className="mt-1 text-2xl font-black tabular-nums text-indigo-950">
                {unmarkedItemCount}
              </div>
            </div>
            <div className="rounded-xl bg-emerald-50 p-3">
              <div className="flex items-center gap-1.5 text-[10px] font-black uppercase text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Dimarking
              </div>
              <div className="mt-1 text-2xl font-black tabular-nums text-emerald-950">
                {markedRecords.length}
              </div>
            </div>
          </div>
        </div>

        {unmarkedRecords.length > 0 && (
          <div className="mt-5 divide-y divide-slate-100 rounded-xl border border-slate-100">
            {unmarkedRecords.map((record) => {
              const totalQty = record.items.reduce((sum, item) => sum + item.quantity, 0);
              return (
                <div
                  key={record.id}
                  className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-slate-900">{record.number}</span>
                      {record.transaction?.invoiceNumber && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                          {record.transaction.invoiceNumber}
                        </span>
                      )}
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${markingPillClass(record.markingStatus)}`}>
                        {MARKING_LABELS[record.markingStatus]}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                        Approval: {record.status}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {record.recipientName} - {totalQty} item - {record.requestedByName || "Tanpa requester"}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={!canMark || markMutation.isPending}
                      onClick={() => openMarking(record)}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      <PenLine className="h-3.5 w-3.5" />
                      {canMark ? "Marking" : "Butuh akses"}
                    </button>
                    {record.status === "PENDING" && canApprove && (
                      <button
                        type="button"
                        disabled={approveMutation.isPending}
                        onClick={() => approveMutation.mutate(record.id)}
                        className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100"
                      >
                        Approve
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {markingRecord && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                Form Marking
              </p>
              <h3 className="mt-1 text-base font-bold text-slate-900">
                {markingRecord.number}
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Pilih hasil marking. Status selain Selesai wajib memakai catatan.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setMarkingRecord(null)}
              className="text-xs font-bold text-slate-500 hover:text-slate-900"
            >
              Batal
            </button>
          </div>

          <div className="mt-4 grid gap-2 md:grid-cols-3">
            {MARKING_OPTIONS.map((option) => (
              <button
                key={option.status}
                type="button"
                title={option.tooltip}
                onClick={() => {
                  setSelectedStatus(option.status);
                  setMarkingError(null);
                }}
                className={`flex min-h-16 items-start justify-between gap-3 rounded-xl border p-3 text-left transition ${
                  selectedStatus === option.status
                    ? "border-slate-900 bg-slate-50"
                    : "border-slate-200 bg-white hover:bg-slate-50"
                }`}
              >
                <span>
                  <span className="block text-sm font-bold text-slate-900">
                    {option.label}
                  </span>
                  {option.requiresNote && (
                    <span className="mt-1 block text-[11px] font-bold text-amber-700">
                      Wajib catatan
                    </span>
                  )}
                </span>
                <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              </button>
            ))}
          </div>

          <label className="mt-4 block">
            <span className="text-xs font-bold text-slate-600">Catatan</span>
            <textarea
              value={markingNote}
              onChange={(event) => setMarkingNote(event.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Tulis catatan jika belum dikirim, perlu tanda tangan, follow up, ditunda, atau tidak relevan."
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
            />
          </label>

          {markingError && (
            <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
              {markingError}
            </div>
          )}

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              disabled={markMutation.isPending}
              onClick={submitMarking}
              className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Simpan Marking
            </button>
          </div>
        </section>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900 mb-2">Riwayat Surat Jalan</h2>
        <p className="text-sm text-slate-500 mb-6">Semua daftar Surat Jalan yang tercatat di sistem.</p>
        <SuratJalanList
          records={records}
          canApprove={canApprove}
          approveMutation={approveMutation as unknown as ReturnType<typeof useApproveSuratJalan>}
          groupByTransaction={true}
        />
      </div>
    </div>
  );
};
