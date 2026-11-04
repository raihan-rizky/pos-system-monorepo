import { ChevronDown, ReceiptText } from "lucide-react";
import type { ReceiptChangeSnapshot } from "../types";
import {
  formatReceiptDate,
  formatReceiptStatus,
  getReceiptSections,
} from "../lib/receipt-comparison";

export function ReceiptSnapshot({
  snapshot,
  title,
}: {
  snapshot: ReceiptChangeSnapshot;
  title: string;
}) {
  const sections = getReceiptSections(snapshot);
  const ordered = [
    ...sections.filter((section) => section.category === "transaction"),
    ...sections.filter((section) => section.category === "items"),
    ...sections.filter((section) => section.category === "printing"),
    ...sections.filter((section) => section.category === "payments"),
    ...sections.filter((section) => section.category === "totals"),
  ];
  const technical = sections.flatMap((section) =>
    section.fields
      .filter((field) => field.technical && field.raw !== null)
      .map((field) => ({ ...field, section: section.title })),
  );

  return (
    <article
      aria-label={title}
      className="relative min-w-0 rounded-sm border border-surface-200 border-l-[3px] border-l-brand-500 bg-white p-5 sm:p-6"
    >
      <header className="border-b border-dashed border-surface-300 pb-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="min-w-0 text-sm font-semibold text-surface-800">
            {title}
          </h3>
          <ReceiptText
            aria-hidden="true"
            className="h-5 w-5 shrink-0 text-surface-400"
          />
        </div>
        <p className="mt-3 break-words text-lg font-bold tracking-tight text-surface-900">
          {snapshot.invoiceNumber || "Tanpa nomor nota"}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-surface-600">
          {formatReceiptDate(snapshot.invoiceDate)}
        </p>
        <span
          className={`mt-3 inline-flex rounded px-2 py-1 text-xs font-semibold ${snapshot.status === "COMPLETED" ? "bg-emerald-50 text-emerald-800" : "bg-surface-100 text-surface-700"}`}
        >
          {formatReceiptStatus(snapshot.status)}
        </span>
      </header>
      {snapshot.items.length === 0 && (
        <p className="mt-5 text-sm text-surface-600">
          Tidak ada barang pada versi ini.
        </p>
      )}
      <div className="divide-y divide-dashed divide-surface-200">
        {ordered.map((section) => {
          const fields = section.fields.filter(
            (field) =>
              !field.technical &&
              ![
                "invoiceNumber",
                "invoiceDate",
                "status",
                "printingPresent",
              ].includes(field.key) &&
              !(section.category === "items" && field.key === "productName"),
          );
          if (!fields.length) return null;
          return (
            <section key={section.key} className="py-5">
              <h4 className="break-words text-sm font-semibold text-surface-900">
                {section.title}
              </h4>
              <dl className="mt-3 space-y-3">
                {fields.map((field) => (
                  <div
                    key={field.key}
                    className={`grid grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] gap-3 ${field.key === "total" ? "border-t border-surface-200 pt-3 text-base font-bold" : "text-xs"}`}
                  >
                    <dt className="text-surface-600">{field.label}</dt>
                    <dd className="min-w-0 whitespace-pre-wrap break-words text-right tabular-nums text-surface-900">
                      {field.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          );
        })}
      </div>
      {technical.length > 0 && (
        <details className="group/identity border-t border-dashed border-surface-300 pt-2">
          <summary className="flex min-h-11 cursor-pointer items-center gap-2 rounded text-xs font-medium text-surface-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">
            Identitas data{" "}
            <span className="font-normal">({technical.length})</span>
            <ChevronDown aria-hidden="true" className="ml-auto h-4 w-4 shrink-0 group-open/identity:rotate-180" />
          </summary>
          <dl className="space-y-3 py-3">
            {technical.map((field, index) => (
              <div key={`${field.section}:${field.key}:${index}`}>
                <dt className="text-xs text-surface-600">
                  {field.section} · {field.label}
                </dt>
                <dd className="mt-1 break-all text-xs text-surface-800">
                  {field.value}
                </dd>
              </div>
            ))}
          </dl>
        </details>
      )}
      <p className="mt-4 border-t border-dashed border-surface-200 pt-4 text-xs leading-relaxed text-surface-500">
        Rincian transaksi yang tersimpan pada versi ini, dengan susunan untuk
        memudahkan pemeriksaan.
      </p>
    </article>
  );
}
