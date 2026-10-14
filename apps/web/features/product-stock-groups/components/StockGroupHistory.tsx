"use client";
import { useState } from "react";
import type {
  StockGroupHistoryFilter,
  StockGroupHistoryRecord,
} from "../api/stock-group-api";
import { useStockGroupHistory } from "../hooks/useStockGroup";

export function stockGroupActivityLabel(type: string) {
  const labels: Record<string, string> = {
    VARIANT_ADDED: "Satuan ditambahkan",
    PAIRED_VARIANTS_CREATED: "Satuan dibuat",
    CONVERSION_RATE_CHANGED: "Konversi satuan diubah",
    GROUP_CREATED: "Grup stok dibuat",
    SHARED_STOCK_CHANGED: "Stok bersama diubah",
    REVIEW_CLEARED: "Pemeriksaan diselesaikan",
  };
  return labels[type] ?? type.replaceAll("_", " ");
}
function stockSnapshot(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const snapshot = value as { baseStock?: unknown; baseUnit?: unknown };
  return typeof snapshot.baseStock === "number" &&
    Number.isFinite(snapshot.baseStock) &&
    typeof snapshot.baseUnit === "string"
    ? `${snapshot.baseStock} ${snapshot.baseUnit}`
    : null;
}
export function StockGroupHistoryList({
  records,
}: {
  records: StockGroupHistoryRecord[];
}) {
  if (!records.length)
    return (
      <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-700">
        Belum ada riwayat untuk pilihan ini.
      </p>
    );
  return (
    <ol className="divide-y divide-slate-200 rounded-xl border border-slate-200">
      {records.map((record) => {
        const before = stockSnapshot(record.before),
          after = stockSnapshot(record.after);
        const date = new Date(record.createdAt);
        return (
          <li key={record.id} className="space-y-2 p-4 text-sm text-slate-700">
            <p className="font-bold text-slate-900">
              {stockGroupActivityLabel(record.type)}
            </p>
            <p>
              <time dateTime={record.createdAt}>
                {Number.isNaN(date.getTime())
                  ? "Waktu belum tercatat"
                  : date.toLocaleString("id-ID", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
              </time>
              {(record.person || record.createdBy) &&
                ` • ${record.person || record.createdBy}`}
            </p>
            {record.note && <p className="break-words">{record.note}</p>}
            {(before || after) && (
              <dl className="grid gap-2 sm:grid-cols-2">
                {before && (
                  <div>
                    <dt className="text-xs">Stok sebelum</dt>
                    <dd className="font-semibold">{before}</dd>
                  </div>
                )}
                {after && (
                  <div>
                    <dt className="text-xs">Stok sesudah</dt>
                    <dd className="font-semibold">{after}</dd>
                  </div>
                )}
              </dl>
            )}
          </li>
        );
      })}
    </ol>
  );
}
export function StockGroupHistory({ groupId }: { groupId: string }) {
  const [filter, setFilter] = useState<StockGroupHistoryFilter>("activity"),
    [page, setPage] = useState(1);
  const query = useStockGroupHistory(groupId, filter, page);
  return (
    <section className="space-y-4">
      <h3 className="text-lg font-bold text-slate-900">Riwayat grup</h3>
      <p className="text-sm text-slate-700">
        Menampilkan aktivitas yang tercatat untuk grup ini.
      </p>
      <label className="block text-sm font-semibold text-slate-700">
        Tampilkan riwayat
        <select
          className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 focus-visible:outline-blue-600"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value as StockGroupHistoryFilter);
            setPage(1);
          }}
        >
          <option value="activity">Semua aktivitas</option>
          <option value="conversion">Perubahan konversi</option>
        </select>
      </label>
      {query.isPending ? (
        <p role="status" className="p-4 text-sm text-slate-700">
          Memuat riwayat grup...
        </p>
      ) : query.isError ? (
        <div
          role="alert"
          className="space-y-3 rounded-xl bg-red-50 p-4 text-sm text-red-800"
        >
          <p>{query.error.message}</p>
          <button
            type="button"
            className="min-h-11 rounded-xl border border-red-300 px-4 font-semibold"
            onClick={() => query.refetch()}
          >
            Coba lagi
          </button>
        </div>
      ) : (
        <StockGroupHistoryList records={query.data.data} />
      )}
      {query.data && !query.isError && !query.isPending && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-700">
          <button
            type="button"
            className="min-h-11 rounded-xl border border-slate-300 px-3 disabled:opacity-50"
            disabled={
              !query.data.pagination.hasPreviousPage || query.isFetching
            }
            onClick={() => setPage((p) => p - 1)}
          >
            Sebelumnya
          </button>
          <p>
            Halaman {query.data.pagination.page} dari{" "}
            {Math.max(1, query.data.pagination.totalPages)}
          </p>
          <button
            type="button"
            className="min-h-11 rounded-xl border border-slate-300 px-3 disabled:opacity-50"
            disabled={!query.data.pagination.hasNextPage || query.isFetching}
            onClick={() => setPage((p) => p + 1)}
          >
            Berikutnya
          </button>
        </div>
      )}
    </section>
  );
}
