"use client";

import {
  ArrowRight,
  FileClock,
  Info,
  Package,
  ReceiptText,
  UserRound,
  Wallet,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReceiptChangeRecord } from "../types";
import {
  compareReceiptSnapshots,
  formatReceiptCurrency,
  formatReceiptDate,
  getReceiptRevisionSummary,
  type ReceiptDifferenceGroup,
} from "../lib/receipt-comparison";
import { ReceiptSnapshot } from "./ReceiptSnapshot";

type ReceiptView = "changes" | "original" | "full";
const focus =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600";

function DifferenceGroup({ group }: { group: ReceiptDifferenceGroup }) {
  const Icon =
    group.category === "items"
      ? Package
      : group.category === "payments" || group.category === "totals"
        ? Wallet
        : ReceiptText;
  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-surface-200 bg-white">
      <div className="flex items-start gap-2.5 border-b border-surface-200 px-3 py-3.5 sm:px-4">
        <Icon
          aria-hidden="true"
          className="mt-0.5 h-4 w-4 shrink-0 text-brand-700"
        />
        <h4 className="min-w-0 break-words text-sm font-semibold text-surface-900">
          {group.title}
        </h4>
        {group.kind && (
          <span
            className={`ml-auto shrink-0 rounded px-2 py-1 text-xs font-semibold ${group.kind === "added" ? "bg-brand-50 text-brand-800" : "bg-amber-50 text-amber-900"}`}
          >
            {group.kind === "added" ? "Ditambahkan" : "Dihapus"}
          </span>
        )}
      </div>
      <div className="px-3 pb-2 sm:px-4">
        <table className="w-full table-fixed border-collapse text-left text-xs sm:text-sm">
          <caption className="sr-only">
            Perbandingan {group.title}
            {group.kind
              ? group.kind === "added"
                ? ", ditambahkan"
                : ", dihapus"
              : ""}
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="w-[34%] py-3 pr-2 text-xs font-medium text-surface-600"
              >
                Rincian
              </th>
              <th
                scope="col"
                className="px-2 py-3 text-xs font-medium text-surface-600"
              >
                Sebelum
              </th>
              <th
                scope="col"
                className="px-2 py-3 text-xs font-semibold text-brand-800"
              >
                Sesudah
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-200">
            {group.fields.map((field) => (
              <tr key={field.key}>
                <th
                  scope="row"
                  className="break-words py-3 pr-2 align-top font-medium text-surface-600"
                >
                  {field.label}
                </th>
                <td className="break-words px-2 py-3 align-top tabular-nums text-surface-800">
                  <span className="whitespace-pre-wrap">{field.before}</span>
                </td>
                <td className="break-words bg-brand-50/70 px-2 py-3 align-top font-semibold tabular-nums text-brand-900">
                  <span className="whitespace-pre-wrap">{field.after}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TotalImpact({
  change,
  fieldCount,
}: {
  change: ReceiptChangeRecord;
  fieldCount: number;
}) {
  const before = change.before.total,
    after = change.after.total;
  const decimals = (value: number) => {
    const [coefficient, exponent = "0"] = String(value).split("e");
    return Math.max(
      0,
      (coefficient.split(".")[1] || "").length - Number(exponent),
    );
  };
  const delta = Number(
    (after - before).toFixed(
      Math.min(20, Math.max(decimals(before), decimals(after))),
    ),
  );
  return (
    <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-surface-200 bg-white p-4 sm:gap-x-6 sm:p-5">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-surface-600">Total sebelum</p>
        <p className="mt-1 break-words text-xl font-bold tabular-nums tracking-tight text-surface-900 sm:text-2xl">
          {formatReceiptCurrency(before)}
        </p>
      </div>
      <ArrowRight
        aria-hidden="true"
        className="h-4 w-4 shrink-0 text-surface-500"
      />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-surface-600">Total sesudah</p>
        <p className="mt-1 break-words text-xl font-bold tabular-nums tracking-tight text-brand-800 sm:text-2xl">
          {formatReceiptCurrency(after)}
        </p>
      </div>
      <div className="flex w-full flex-wrap items-center justify-between gap-2 border-t border-surface-200 pt-3 text-xs">
        <p className="font-semibold text-amber-900">
          {delta === 0
            ? "Total tetap"
            : `${delta > 0 ? "Naik" : "Turun"} ${formatReceiptCurrency(Math.abs(delta))}`}
        </p>
        <p className="text-surface-600">{fieldCount} rincian berubah</p>
      </div>
    </div>
  );
}

export function ReceiptChangeComparison({
  changes,
  initialChangeId,
}: {
  changes: ReceiptChangeRecord[];
  initialChangeId?: string;
}) {
  const [selectedId, setSelectedId] = useState(initialChangeId || "");
  const [view, setView] = useState<ReceiptView>("changes");
  const selected =
    changes.find((change) => change.id === selectedId) ?? changes.at(-1);
  const selectedIndex = selected ? changes.indexOf(selected) : -1;
  const selectedRevision = useRef<HTMLButtonElement>(null);
  const originalTab = useRef<HTMLButtonElement>(null);
  const groups = useMemo(
    () =>
      selected ? compareReceiptSnapshots(selected.before, selected.after) : [],
    [selected],
  );
  const fieldCount = groups.reduce(
    (total, group) => total + group.fields.length,
    0,
  );
  useEffect(() => {
    selectedRevision.current?.scrollIntoView({ block: "nearest" });
  }, [selected?.id, view]);

  if (!selected)
    return (
      <div className="rounded-2xl border border-dashed border-surface-300 bg-white px-6 py-14 text-center">
        <FileClock
          aria-hidden="true"
          className="mx-auto h-9 w-9 text-surface-400"
        />
        <h2 className="mt-4 text-lg font-semibold text-surface-900">
          Belum ada perubahan nota
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-surface-600">
          Belum ada perubahan Sales yang tercatat untuk nota ini. Setiap
          perubahan yang tersimpan akan tampil di sini.
        </p>
      </div>
    );

  const selectRevision = (id: string) => {
    setSelectedId(id);
    setView("changes");
  };
  const openOriginal = () => {
    setView("original");
    originalTab.current?.focus({ preventScroll: true });
  };
  const missingRevision =
    selectedId && !changes.some((change) => change.id === selectedId);
  return (
    <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[232px_minmax(0,1fr)]">
      <aside
        aria-labelledby="receipt-timeline"
        className="sticky top-0 hidden overflow-hidden rounded-2xl bg-surface-900 text-white lg:block"
      >
        <div className="border-b border-white/15 px-5 py-5">
          <h2
            id="receipt-timeline"
            className="flex items-center gap-2 text-sm font-semibold"
          >
            <FileClock aria-hidden="true" className="h-4 w-4 text-brand-200" />
            Jejak perubahan
          </h2>
          <p className="mt-1.5 text-xs text-surface-300">
            Nota asli dan {changes.length} revisi tersimpan
          </p>
        </div>
        <ol className="max-h-[32rem] space-y-1 overflow-y-auto p-3">
          <li>
            <button
              type="button"
              onClick={openOriginal}
              ref={view === "original" ? selectedRevision : undefined}
              aria-current={view === "original" ? "step" : undefined}
              className={`flex min-h-11 w-full gap-3 rounded-xl border p-3 text-left ${focus} ${view === "original" ? "border-white/30 bg-white/10" : "border-transparent hover:bg-white/5"}`}
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/30 text-xs text-surface-200">
                0
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">Nota asli</span>
                <span className="mt-1 block text-xs leading-relaxed text-surface-300">
                  Sebelum perubahan Sales pertama
                </span>
              </span>
            </button>
          </li>
          {changes.map((change, index) => {
            const active = view !== "original" && selected.id === change.id;
            return (
              <li key={change.id}>
                <button
                  type="button"
                  ref={active ? selectedRevision : undefined}
                  onClick={() => selectRevision(change.id)}
                  aria-current={active ? "step" : undefined}
                  className={`flex min-h-11 w-full gap-3 rounded-xl border p-3 text-left ${focus} ${active ? "border-white/30 bg-white/10" : "border-transparent hover:bg-white/5"}`}
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs tabular-nums ${active ? "bg-brand-200 font-bold text-surface-900" : "border border-white/30 text-surface-200"}`}
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">
                      Revisi {index + 1}
                      {index === changes.length - 1 && (
                        <span className="text-brand-200"> · Terbaru</span>
                      )}
                    </span>
                    <span className="mt-1 block break-words text-xs text-surface-200">
                      {change.actorName}
                    </span>
                    <span className="mt-1 block text-xs leading-relaxed text-surface-300">
                      {formatReceiptDate(change.createdAt)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <p className="border-t border-white/15 px-5 py-4 text-xs leading-relaxed text-surface-300">
          Setiap versi tersimpan agar perubahan dapat ditelusuri kembali.
        </p>
      </aside>
      <section className="min-w-0" aria-label="Pemeriksaan revisi nota">
        <div className="mb-5 flex min-w-0 items-center justify-between gap-3 rounded-xl border border-surface-200 bg-white px-3 py-1.5 lg:hidden">
          <label
            htmlFor="receipt-change"
            className="shrink-0 text-xs font-medium text-surface-600"
          >
            Jejak versi
          </label>
          <select
            id="receipt-change"
            value={view === "original" ? "original" : selected.id}
            onChange={(event) =>
              event.target.value === "original"
                ? setView("original")
                : selectRevision(event.target.value)
            }
            className={`min-h-11 min-w-0 max-w-[72%] rounded-lg bg-white px-2 text-sm font-semibold text-surface-900 ${focus}`}
          >
            <option value="original">Nota asli</option>
            {changes.map((change, index) => (
              <option key={change.id} value={change.id}>
                Revisi {index + 1} · {change.actorName} ·{" "}
                {formatReceiptDate(change.createdAt)}
                {index === changes.length - 1 ? " · Terbaru" : ""}
              </option>
            ))}
          </select>
        </div>
        {missingRevision && (
          <p
            role="status"
            className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
          >
            Perubahan yang diminta tidak ditemukan. Menampilkan perubahan
            terbaru.
          </p>
        )}
        <header className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-surface-600">
              {view === "original"
                ? "Versi awal tersimpan"
                : `Revisi ${selectedIndex + 1} dari ${changes.length}`}
            </p>
            <h2 className="mt-1.5 break-words text-xl font-bold leading-snug tracking-tight text-surface-900 sm:text-2xl">
              {view === "original"
                ? "Nota asli sebelum perubahan Sales pertama"
                : getReceiptRevisionSummary(groups)}
            </h2>
            {view === "original" ? (
              <p className="mt-2 text-sm text-surface-600">
                Rincian awal untuk menelusuri perubahan dari awal.
              </p>
            ) : (
              <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs leading-relaxed text-surface-600">
                <UserRound
                  aria-hidden="true"
                  className="h-3.5 w-3.5 shrink-0"
                />
                Diubah oleh{" "}
                <strong className="min-w-0 max-w-full break-words font-semibold text-surface-800">
                  {selected.actorName}
                </strong>
                <span>· {formatReceiptDate(selected.createdAt)}</span>
              </p>
            )}
          </div>
          <span
            aria-hidden="true"
            className="shrink-0 text-4xl font-bold tabular-nums tracking-tighter text-surface-300"
          >
            {String(view === "original" ? 0 : selectedIndex + 1).padStart(
              2,
              "0",
            )}
          </span>
        </header>
        {view !== "original" && (
          <TotalImpact change={selected} fieldCount={fieldCount} />
        )}
        <div
          className="my-5 flex gap-4 overflow-x-auto border-b border-surface-200 sm:gap-6"
          aria-label="Tampilan rincian nota"
        >
          {(
            [
              { key: "changes", label: "Yang berubah" },
              { key: "original", label: "Nota asli" },
              { key: "full", label: "Versi lengkap" },
            ] as const
          ).map((tab) => (
            <button
              type="button"
              key={tab.key}
              ref={tab.key === "original" ? originalTab : undefined}
              aria-pressed={view === tab.key}
              onClick={() => setView(tab.key)}
              className={`min-h-11 shrink-0 whitespace-nowrap border-b-2 px-0.5 pb-3 pt-2 text-xs font-semibold sm:text-sm ${focus} ${view === tab.key ? "border-brand-600 text-brand-800" : "border-transparent text-surface-600 hover:text-surface-900"}`}
            >
              {tab.label}
              {tab.key === "changes" && (
                <span className="ml-1.5 rounded bg-brand-50 px-1.5 py-0.5 text-[11px] text-brand-800">
                  {fieldCount}
                </span>
              )}
            </button>
          ))}
        </div>
        {view === "changes" && (
          <section aria-labelledby="change-differences" className="space-y-3">
            <h3 id="change-differences" className="sr-only">
              Rincian yang berubah
            </h3>
            {groups.length ? (
              groups.map((group) => (
                <DifferenceGroup key={group.key} group={group} />
              ))
            ) : (
              <p className="rounded-xl border border-surface-200 bg-white p-5 text-sm text-surface-600">
                Tidak ada perbedaan rincian yang dapat ditampilkan.
              </p>
            )}
            <p className="flex gap-2 pt-1 text-xs leading-relaxed text-surface-600">
              <Info
                aria-hidden="true"
                className="mt-0.5 h-3.5 w-3.5 shrink-0"
              />
              Rincian yang tetap sama tidak ditampilkan di sini. Buka Versi
              lengkap untuk memeriksa seluruh rincian.
            </p>
            <div className="!mt-5 flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-surface-300 bg-white p-4">
              <ReceiptText
                aria-hidden="true"
                className="h-6 w-6 shrink-0 text-surface-500"
              />
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-surface-900">
                  Ingin menelusuri dari awal?
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-surface-600">
                  Nota asli sebelum perubahan Sales pertama.
                </p>
              </div>
              <button
                type="button"
                onClick={openOriginal}
                className={`min-h-11 rounded-lg px-2 text-sm font-semibold text-brand-800 hover:bg-brand-50 ${focus}`}
              >
                Buka nota asli
              </button>
            </div>
          </section>
        )}
        {view === "original" && (
          <div className="mx-auto max-w-xl">
            <ReceiptSnapshot
              title="Nota asli sebelum perubahan Sales pertama"
              snapshot={changes[0].before}
            />
          </div>
        )}
        {view === "full" && (
          <section
            aria-label="Dua versi rincian nota"
            className="grid min-w-0 items-start gap-5 xl:grid-cols-2"
          >
            <ReceiptSnapshot
              title={`Sebelum revisi ${selectedIndex + 1}`}
              snapshot={selected.before}
            />
            <ReceiptSnapshot
              title={`Sesudah revisi ${selectedIndex + 1}`}
              snapshot={selected.after}
            />
          </section>
        )}
      </section>
    </div>
  );
}
