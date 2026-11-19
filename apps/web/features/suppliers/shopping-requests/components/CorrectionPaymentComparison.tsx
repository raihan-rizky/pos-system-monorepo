import type { CorrectionPreview } from "../types/shopping-request-correction";

export const correctionMoney = (value: string | number) => new Intl.NumberFormat("id-ID", {
  style: "currency", currency: "IDR", maximumFractionDigits: 2,
}).format(Number(value));

export function correctionDate(value: string): string {
  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("id-ID", {
    day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  }).format(date);
}

function rows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry)) : [];
}

export function correctionMethodLabel(value: unknown, schedule?: unknown): string {
  const methods = new Set(rows(schedule).map(row => row.method));
  if (methods.has("TRANSFER") && methods.has("GIRO")) return "Transfer + Giro";
  if (methods.has("GIRO") || value === "GIRO") return "Giro";
  if (methods.has("TRANSFER") || value === "TRANSFER") return "Transfer";
  return "Belum ditentukan";
}

export function CorrectionPaymentComparison({ change }: { change: CorrectionPreview["changes"][number] }) {
  const schedule = change.field === "pembayaran.jadwal";
  const sources = change.field === "pembayaran.rincian";
  return <div className="grid gap-3 md:grid-cols-2">
    {([ ["Sebelum", change.before], ["Sesudah", change.after] ] as const).map(([label, value]) => {
      const entries = rows(value);
      return <section key={label} aria-label={`${schedule ? "Jadwal" : sources ? "Pembayaran" : "Alokasi"} ${label.toLowerCase()}`} className="min-w-0 overflow-hidden rounded-lg border border-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
          <h4 className="font-semibold text-slate-900">{label}</h4>
          {schedule && <span className="text-xs font-semibold text-cyan-800">{correctionMethodLabel(null, value)}</span>}
        </div>
        {entries.length ? <ul className="divide-y divide-slate-200">{entries.map((entry, index) => {
          const sourceLabel = entry.sourceKind === "TRANSFER_EXPENSE" ? "Pembayaran Transfer" : entry.sourceKind === "PAYABLE_PAYMENT" ? "Pembayaran utang supplier" : "Pembayaran tercatat";
          return <li key={index} className="space-y-3 p-4">
            <p className="font-semibold text-slate-900">{schedule ? `${correctionMethodLabel(entry.method)} ${index + 1}` : sourceLabel}</p>
            <dl className="grid gap-x-4 gap-y-3 text-sm sm:grid-cols-2">
              <div><dt className="text-slate-600">Nominal</dt><dd className="mt-1 font-semibold tabular-nums">{typeof entry.amount === "string" || typeof entry.amount === "number" ? correctionMoney(entry.amount) : "Tidak tersedia"}</dd></div>
              <div><dt className="text-slate-600">{schedule ? "Jatuh tempo" : sources ? "Tanggal pembayaran" : "Dialokasikan ke"}</dt><dd className="mt-1">{schedule ? entry.method === "GIRO" && typeof entry.dueDate === "string" ? correctionDate(entry.dueDate) : entry.method === "TRANSFER" ? "Tidak berlaku" : "Belum diisi" : sources ? typeof entry.paidAt === "string" ? correctionDate(entry.paidAt) : "Tidak tersedia" : correctionMethodLabel(entry.method)}</dd></div>
              {schedule && <div className="sm:col-span-2"><dt className="text-slate-600">Catatan</dt><dd className="mt-1 break-words">{typeof entry.note === "string" && entry.note ? entry.note : "Tidak ada"}</dd></div>}
            </dl>
          </li>;
        })}</ul> : <p className="p-4 text-sm text-slate-600">{schedule ? "Belum ada jadwal pembayaran." : sources ? "Belum ada pembayaran tercatat." : "Tidak ada alokasi pembayaran."}</p>}
      </section>;
    })}
  </div>;
}
