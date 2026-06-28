"use client";

import React from "react";
import { AlertTriangle, Boxes, CheckCircle2, ChevronDown, ClipboardCheck, Clock, LogIn, LogOut, ShieldCheck } from "lucide-react";
import {
  fetchInventoryDaySessionHistory,
  type InventoryDaySessionRecord,
} from "../api/inventory-management-api";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function getSnapshotTasks(snapshot: unknown) {
  const completion = asRecord(asRecord(snapshot).completion);
  const tasks = completion.tasks;
  return Array.isArray(tasks)
    ? tasks.filter((task): task is { label: string; completed: boolean; required: boolean } => {
        const record = asRecord(task);
        return typeof record.label === "string";
      })
    : [];
}

function getArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function getText(value: unknown, fallback = "-") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function getNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function formatQty(value: unknown, unit: unknown) {
  const qty = getNumber(value);
  const label = Number.isInteger(qty) ? String(qty) : qty.toFixed(2);
  return `${label} ${getText(unit, "unit")}`;
}

function getCheckOutSummary(snapshot: unknown) {
  const record = asRecord(snapshot);
  const completion = asRecord(record.completion);
  const stockRisk = asRecord(record.stockRisk);
  const morningCheck = asRecord(record.morningCheckSnapshot);
  const materialCounts = getArray(morningCheck.materialCounts).map(asRecord);
  const productionMaterials = getArray(morningCheck.productionMaterials).map(asRecord);
  const safetyChecks = getArray(morningCheck.safetyChecks).map(asRecord);
  const blockers = getArray(completion.blockers).filter(
    (item): item is string => typeof item === "string",
  );

  return {
    checkedOutAt: getText(record.checkedOutAt, ""),
    note: getText(record.note, ""),
    tasks: getSnapshotTasks(snapshot),
    blockers,
    stockRisk: {
      negative: getArray(stockRisk.negative).map(asRecord),
      outOfStock: getArray(stockRisk.outOfStock).map(asRecord),
      lowStock: getArray(stockRisk.lowStock).map(asRecord),
    },
    materialCounts,
    productionMaterials,
    safetyChecks,
  };
}

function findMaterialProduct(
  materialCount: Record<string, unknown>,
  productionMaterials: Record<string, unknown>[],
) {
  const productId = getText(materialCount.productId, "");
  return productionMaterials
    .map((item) => asRecord(item.product))
    .find((product) => product.id === productId);
}

export function InventoryDaySessionHistory() {
  const [records, setRecords] = React.useState<InventoryDaySessionRecord[]>([]);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<"check-in" | "check-out">("check-in");
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let mounted = true;
    fetchInventoryDaySessionHistory()
      .then((data) => {
        if (mounted) setRecords(data);
      })
      .catch((err) => {
        if (mounted) setError(err instanceof Error ? err.message : "Gagal memuat riwayat check in.");
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">
        Memuat riwayat check in...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm font-semibold text-rose-700 shadow-sm">
        {error}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-900">Riwayat Tugas Harian</h2>
          <p className="mt-1 text-xs text-slate-500">
            Detail check in, check out, dan ringkasan operasional harian.
          </p>
        </div>
        <div className="flex w-fit gap-1 rounded-xl bg-slate-100 p-1">
          {[
            { id: "check-in" as const, label: "Check In" },
            { id: "check-out" as const, label: "Check Out" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id);
                setExpandedId(null);
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-black transition ${
                activeTab === tab.id
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "check-in" ? (
        <CheckInHistoryList
          records={records}
          expandedId={expandedId}
          onToggle={(id) => setExpandedId((current) => (current === id ? null : id))}
        />
      ) : (
        <CheckOutHistoryList
          records={records.filter((record) => record.status === "CHECKED_OUT")}
          expandedId={expandedId}
          onToggle={(id) => setExpandedId((current) => (current === id ? null : id))}
        />
      )}
    </div>
  );
}

function CheckInHistoryList({
  records,
  expandedId,
  onToggle,
}: {
  records: InventoryDaySessionRecord[];
  expandedId: string | null;
  onToggle: (id: string) => void;
}) {
  return (
    <>
      <p className="mt-1 text-xs text-slate-500">
        Detail check in, check out, dan cleared daily task per hari.
      </p>

      <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-100">
        {records.length === 0 ? (
          <div className="p-5 text-center text-sm text-slate-500">
            Belum ada riwayat check in inventaris.
          </div>
        ) : (
          records.map((record) => {
            const expanded = expandedId === record.id;
            const tasks = getSnapshotTasks(record.checkOutSnapshot);
            return (
              <div key={record.id}>
                <button
                  type="button"
                  onClick={() => onToggle(record.id)}
                  className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-slate-50"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-slate-900">{record.periodKey}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${
                        record.status === "CHECKED_OUT"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-amber-100 text-amber-800"
                      }`}>
                        {record.status === "CHECKED_OUT" ? "Checked out" : "Checked in"}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <LogIn className="h-3.5 w-3.5" />
                        {record.checkInByName || "-"}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <LogOut className="h-3.5 w-3.5" />
                        {record.checkOutByName || "Belum check out"}
                      </span>
                    </div>
                  </div>
                  <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`} />
                </button>

                {expanded && (
                  <div className="border-t border-slate-100 bg-slate-50 p-4">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-xl bg-white p-3">
                        <div className="text-xs font-black uppercase text-slate-400">Check In</div>
                        <div className="mt-1 text-sm font-semibold text-slate-800">
                          {record.checkedInAt ? new Date(record.checkedInAt).toLocaleString("id-ID") : "-"}
                        </div>
                      </div>
                      <div className="rounded-xl bg-white p-3">
                        <div className="text-xs font-black uppercase text-slate-400">Check Out</div>
                        <div className="mt-1 text-sm font-semibold text-slate-800">
                          {record.checkedOutAt ? new Date(record.checkedOutAt).toLocaleString("id-ID") : "-"}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 rounded-xl bg-white p-3">
                      <div className="flex items-center gap-2 text-xs font-black uppercase text-slate-400">
                        <Clock className="h-3.5 w-3.5" />
                        Cleared Daily Task
                      </div>
                      <div className="mt-2 grid gap-2">
                        {tasks.length === 0 ? (
                          <div className="text-sm text-slate-500">
                            Belum ada snapshot check out.
                          </div>
                        ) : (
                          tasks.map((task) => (
                            <div key={task.label} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                              <span className="text-sm font-semibold text-slate-700">
                                {task.label}
                                {!task.required && <span className="ml-1 text-xs text-slate-400">(opsional)</span>}
                              </span>
                              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                                task.completed
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-amber-100 text-amber-800"
                              }`}>
                                {task.completed ? "Selesai" : "Belum"}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </>
  );
}

function CheckOutHistoryList({
  records,
  expandedId,
  onToggle,
}: {
  records: InventoryDaySessionRecord[];
  expandedId: string | null;
  onToggle: (id: string) => void;
}) {
  return (
    <>
      <p className="mt-1 text-xs text-slate-500">
        Riwayat Check-Out merangkum penutupan hari inventaris dari snapshot saat check out.
      </p>

      <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-100">
        {records.length === 0 ? (
          <div className="p-5 text-center text-sm text-slate-500">
            Belum ada riwayat check out inventaris.
          </div>
        ) : (
          records.map((record) => {
            const expanded = expandedId === record.id;
            const summary = getCheckOutSummary(record.checkOutSnapshot);
            const completedRequired = summary.tasks.filter((task) => task.required && task.completed).length;
            const requiredCount = summary.tasks.filter((task) => task.required).length;
            const riskTotal =
              summary.stockRisk.negative.length +
              summary.stockRisk.outOfStock.length +
              summary.stockRisk.lowStock.length;

            return (
              <div key={record.id}>
                <button
                  type="button"
                  onClick={() => onToggle(record.id)}
                  className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-slate-900">{record.periodKey}</span>
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-black text-emerald-800">
                        Checked out
                      </span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                        {completedRequired}/{requiredCount} wajib selesai
                      </span>
                      {riskTotal > 0 && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                          {riskTotal} risiko stok
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <LogOut className="h-3.5 w-3.5" />
                        {record.checkOutByName || "-"}
                      </span>
                      <span>
                        {record.checkedOutAt ? new Date(record.checkedOutAt).toLocaleString("id-ID") : "-"}
                      </span>
                    </div>
                  </div>
                  <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`} />
                </button>

                {expanded && (
                  <div className="border-t border-slate-100 bg-slate-50 p-4">
                    <div className="grid gap-3 lg:grid-cols-3">
                      <SummaryTile
                        icon={<CheckCircle2 className="h-4 w-4" />}
                        label="Tugas wajib"
                        value={`${completedRequired}/${requiredCount}`}
                      />
                      <SummaryTile
                        icon={<AlertTriangle className="h-4 w-4" />}
                        label="Risiko stok"
                        value={String(riskTotal)}
                      />
                      <SummaryTile
                        icon={<Boxes className="h-4 w-4" />}
                        label="Material dicek"
                        value={String(summary.materialCounts.length)}
                      />
                    </div>

                    <div className="mt-3 grid gap-3 lg:grid-cols-2">
                      <section className="rounded-xl bg-white p-3">
                        <SectionTitle icon={<ClipboardCheck className="h-3.5 w-3.5" />} label="Cleared Daily Task" />
                        <div className="mt-2 grid gap-2">
                          {summary.tasks.map((task) => (
                            <div key={task.label} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                              <span className="text-sm font-semibold text-slate-700">
                                {task.label}
                                {!task.required && <span className="ml-1 text-xs text-slate-400">(opsional)</span>}
                              </span>
                              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                                task.completed
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-amber-100 text-amber-800"
                              }`}>
                                {task.completed ? "Selesai" : "Belum"}
                              </span>
                            </div>
                          ))}
                        </div>
                      </section>

                      <section className="rounded-xl bg-white p-3">
                        <SectionTitle icon={<AlertTriangle className="h-3.5 w-3.5" />} label="Stock Risk Saat Check Out" />
                        <div className="mt-2 grid gap-2">
                          <CompactRiskList title="Negatif" items={summary.stockRisk.negative} />
                          <CompactRiskList title="Habis" items={summary.stockRisk.outOfStock} />
                          <CompactRiskList title="Rendah" items={summary.stockRisk.lowStock} />
                        </div>
                      </section>

                      <section className="rounded-xl bg-white p-3">
                        <SectionTitle icon={<Boxes className="h-3.5 w-3.5" />} label="Material Count Morning Check" />
                        <div className="mt-2 grid gap-2">
                          {summary.materialCounts.length === 0 ? (
                            <div className="text-sm text-slate-500">Tidak ada material count tersimpan.</div>
                          ) : (
                            summary.materialCounts.map((material) => {
                              const product = findMaterialProduct(material, summary.productionMaterials);
                              const productName = getText(product?.name, getText(material.productId));
                              return (
                                <div key={getText(material.productId)} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                                  <span className="truncate text-sm font-semibold text-slate-700">{productName}</span>
                                  <span className="text-sm font-black tabular-nums text-slate-900">
                                    {formatQty(material.actualQuantity, product?.unit)}
                                  </span>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </section>

                      <section className="rounded-xl bg-white p-3">
                        <SectionTitle icon={<ShieldCheck className="h-3.5 w-3.5" />} label="Workspace & Safety" />
                        <div className="mt-2 grid gap-2">
                          {summary.safetyChecks.length === 0 ? (
                            <div className="text-sm text-slate-500">Tidak ada safety snapshot tersimpan.</div>
                          ) : (
                            summary.safetyChecks.map((item) => (
                              <div key={getText(item.id)} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                                <span className="text-sm font-semibold text-slate-700">{getText(item.label, getText(item.id))}</span>
                                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                                  item.checked ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                                }`}>
                                  {item.checked ? "OK" : "Belum"}
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      </section>
                    </div>

                    {(summary.blockers.length > 0 || summary.note) && (
                      <div className="mt-3 rounded-xl bg-white p-3">
                        {summary.blockers.length > 0 && (
                          <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                            <span className="font-bold">Blocker saat penutupan: </span>
                            {summary.blockers.join(", ")}
                          </div>
                        )}
                        {summary.note && (
                          <p className="mt-2 text-sm text-slate-600">
                            <span className="font-bold text-slate-800">Catatan check out: </span>
                            {summary.note}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </>
  );
}

function SummaryTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-white p-3">
      <div className="flex items-center gap-2 text-xs font-black uppercase text-slate-400">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-2xl font-black tabular-nums text-slate-900">{value}</div>
    </div>
  );
}

function SectionTitle({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs font-black uppercase text-slate-400">
      {icon}
      {label}
    </div>
  );
}

function CompactRiskList({
  title,
  items,
}: {
  title: string;
  items: Record<string, unknown>[];
}) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-black uppercase text-slate-400">{title}</span>
        <span className="text-xs font-bold text-slate-700">{items.length}</span>
      </div>
      {items.length > 0 && (
        <div className="mt-1 space-y-1">
          {items.slice(0, 4).map((item) => (
            <div key={getText(item.id, getText(item.name))} className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate font-semibold text-slate-700">{getText(item.name)}</span>
              <span className="shrink-0 font-bold text-slate-900">{formatQty(item.stock, item.unit)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
