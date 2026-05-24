"use client";

import React, { useMemo } from "react";
import { JobOrder, ProductionStatus, useJobOrderActivity } from "@/hooks/useJobOrders";
import {
  Activity,
  Clock,
  Printer,
  PackageCheck,
  User,
  FileText,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  MessageCircle,
} from "lucide-react";

// ─── Column Configuration ───────────────────────────────────────────────────────

export interface KanbanColumnConfig {
  id: ProductionStatus;
  label: string;
  icon: React.ReactNode;
  color: string;
  dotColor: string;
  bgColor: string;
  textColor: string;
  glowColor: string;
}

export const KANBAN_COLUMNS: KanbanColumnConfig[] = [
  {
    id: "PRINTING",
    label: "Printing",
    icon: <Printer className="w-4 h-4" aria-hidden="true" />,
    color: "bg-blue-500",
    dotColor: "bg-blue-400",
    bgColor: "bg-blue-50/40",
    textColor: "text-blue-600",
    glowColor: "shadow-blue-400/60",
  },
  {
    id: "READY_PICKUP",
    label: "Siap",
    icon: <PackageCheck className="w-4 h-4" aria-hidden="true" />,
    color: "bg-emerald-500",
    dotColor: "bg-emerald-400",
    bgColor: "bg-emerald-50/40",
    textColor: "text-emerald-600",
    glowColor: "shadow-emerald-400/60",
  },
];

// ─── Filter Mode ────────────────────────────────────────────────────────────────

export type KanbanFilter = "ALL" | "PRINTING" | "READY_PICKUP" | "OVERDUE";

// ─── Helpers ────────────────────────────────────────────────────────────────────

function getDeadlineState(estimatedDoneAt: string | null): {
  level: "none" | "soon" | "today" | "overdue";
  label: string;
  diffDays: number;
} {
  if (!estimatedDoneAt) {
    return { level: "none", label: "", diffDays: Number.POSITIVE_INFINITY };
  }
  const deadline = new Date(estimatedDoneAt);
  const now = new Date();
  const diffMs = deadline.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return {
      level: "overdue",
      label: `Terlambat ${Math.abs(diffDays)} hari`,
      diffDays,
    };
  }
  if (diffDays === 0) {
    return { level: "today", label: "Jatuh tempo hari ini", diffDays };
  }
  if (diffDays <= 2) {
    return { level: "soon", label: `${diffDays} hari lagi`, diffDays };
  }
  return { level: "none", label: `${diffDays} hari lagi`, diffDays };
}

function productionStatusLabel(status: ProductionStatus | null): string {
  if (status === "PRINTING") return "Printing";
  if (status === "READY_PICKUP") return "Siap";
  if (status === "DELIVERED") return "Selesai";
  return "Baru";
}

function isPickupWhatsappActivity(entry: {
  eventType?: string;
}) {
  return entry.eventType === "PICKUP_WHATSAPP_SENT";
}

function formatActivityTimestamp(value: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

// ─── Deadline Badge ─────────────────────────────────────────────────────────────

function DeadlineBadge({
  estimatedDoneAt,
}: {
  estimatedDoneAt: string | null;
}) {
  if (!estimatedDoneAt) return null;
  const { level, label } = getDeadlineState(estimatedDoneAt);

  const colorClass =
    level === "overdue"
      ? "bg-red-100 text-red-700 ring-1 ring-red-200"
      : level === "today"
        ? "bg-amber-100 text-amber-700 ring-1 ring-amber-200"
        : level === "soon"
          ? "bg-yellow-100 text-yellow-700 ring-1 ring-yellow-200"
          : "bg-surface-100 text-surface-600";

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${colorClass}`}
    >
      <Clock className="w-3 h-3" aria-hidden="true" />
      {label}
    </span>
  );
}

// ─── Payment Status Badge ───────────────────────────────────────────────────────

function PaymentBadge({
  status,
  total,
  amountPaid,
}: {
  status: string;
  total: number;
  amountPaid: number;
}) {
  const isDP = status === "DP";
  const remaining = total - amountPaid;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${isDP
        ? "bg-orange-100 text-orange-700 border border-orange-200"
        : "bg-emerald-100 text-emerald-700 border border-emerald-200"
        }`}
    >
      {isDP
        ? `DP • Sisa ${new Intl.NumberFormat("id-ID").format(remaining)}`
        : "Lunas"}
    </span>
  );
}

// ─── Job Order Card ─────────────────────────────────────────────────────────────

interface KanbanCardProps {
  order: JobOrder;
  onMoveForward?: (id: string, nextStatus: ProductionStatus) => void;
  onSendPickupNotification?: (id: string) => void;
  pickupNotificationPendingId?: string | null;
  columnIndex: number;
  dimmed?: boolean;
}

function KanbanCard({
  order,
  onMoveForward,
  onSendPickupNotification,
  pickupNotificationPendingId,
  columnIndex,
  dimmed,
}: KanbanCardProps) {
  const [showActivity, setShowActivity] = React.useState(false);
  const {
    data: activity = [],
    isLoading: isActivityLoading,
    isError: isActivityError,
  } = useJobOrderActivity(order.id, showActivity);
  const currentColumn = KANBAN_COLUMNS[columnIndex];
  const nextColumn = KANBAN_COLUMNS[columnIndex + 1];
  const deadline = getDeadlineState(order.estimatedDoneAt);
  const isOverdue = deadline.level === "overdue";
  const isUrgent = deadline.level === "today" || deadline.level === "soon";
  const canNotifyPickup =
    order.productionStatus === "READY_PICKUP" && Boolean(onSendPickupNotification);
  const hasWhatsappNumber = Boolean(order.customer?.phone);
  const isSendingPickupNotification =
    pickupNotificationPendingId === order.id;

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("text/plain", order.id);
    e.dataTransfer.effectAllowed = "move";
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = "0.5";
    }
  };

  const handleDragEnd = (e: React.DragEvent) => {
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = "1";
    }
  };

  const accentClass = isOverdue
    ? "border-red-300 ring-1 ring-red-200 shadow-[0_0_0_1px_rgba(252,165,165,0.4)]"
    : isUrgent
      ? "border-amber-200"
      : "border-surface-200/80";

  return (
    <article
      draggable={Boolean(onMoveForward)}
      onDragStart={onMoveForward ? handleDragStart : undefined}
      onDragEnd={handleDragEnd}
      aria-label={`Job order ${order.invoiceNumber}${order.customerName ? ` for ${order.customerName}` : ""}${isOverdue ? `, ${deadline.label}` : ""
        }`}
      className={`relative bg-white border ${accentClass} rounded-xl p-4 shadow-sm hover:shadow-md
                 transition-all duration-200 ${onMoveForward ? "cursor-grab active:cursor-grabbing" : ""}
                 active:shadow-lg active:scale-[0.99] group
                 ${dimmed ? "opacity-40" : "opacity-100"}`}
    >
      {isOverdue ? (
        <span
          aria-hidden="true"
          className="absolute top-0 left-0 h-full w-1 rounded-l-xl bg-red-500"
        />
      ) : null}

      {/* Header */}
      <div className="flex flex-col gap-2 mb-3">
        <div className="min-w-0">
          <p className="font-bold text-surface-900 text-sm truncate">
            {order.customerName || "Walk-in"}
          </p>
          <div className="flex lg:flex-col lg:gap-1 items-center lg:items-start justify-between gap-4 mt-1">
            <p className="text-[11px] text-surface-500 flex items-center gap-1">
              <FileText className="w-3 h-3" aria-hidden="true" />
              {order.invoiceNumber}
            </p>
            <div
              className="flex items-center gap-1 px-3 py-1 rounded-full bg-white border border-surface-200 shadow-sm"
            >
              <span className="relative flex h-2 w-2" aria-hidden="true">
                <span
                  className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${currentColumn.dotColor}`}
                />
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 shadow-[0_0_6px] ${currentColumn.dotColor} ${currentColumn.glowColor}`}
                />
              </span>
              <span
                className={`text-[10px] font-bold uppercase tracking-wider ${currentColumn.textColor}`}
              >
                {currentColumn.label}
              </span>
            </div>
          </div>
        </div>
        <PaymentBadge
          status={order.status}
          total={order.total}
          amountPaid={order.amountPaid}
        />
      </div>

      {/* Items Preview */}
      <ul className="space-y-1 mb-3">
        {order.items.slice(0, 3).map((item) => (
          <li
            key={item.id}
            className="flex items-center justify-between text-xs text-surface-700"
          >
            <span className="truncate flex-1">{item.productName}</span>
            <span className="text-surface-500 ml-2 shrink-0">
              x{item.quantity}
            </span>
          </li>
        ))}
        {order.items.length > 3 ? (
          <li className="text-[10px] text-surface-400 italic">
            +{order.items.length - 3} item lagi
          </li>
        ) : null}
      </ul>

      {/* Footer */}
      <div className="flex items-center lg:flex-col xl:items-end justify-between pt-3 border-t border-surface-100 mt-auto gap-3">
        <div className="flex lg:flex-col xl:flex-row  items-center gap-2 min-w-0">
          {isOverdue ? (
            <AlertTriangle
              className="w-3.5 h-3.5   text-red-500 shrink-0"
              aria-hidden="true"
            />
          ) : null}
          <DeadlineBadge estimatedDoneAt={order.estimatedDoneAt} />
        </div>

        {onMoveForward && nextColumn ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onMoveForward(order.id, nextColumn.id);
            }}
            aria-label={`Pindahkan ${order.invoiceNumber} ke ${nextColumn.label}`}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-semibold text-surface-600
                       hover:text-brand-600 hover:bg-brand-50 active:bg-brand-100 rounded-lg
                       transition-colors cursor-pointer min-h-[32px]
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
            title={`Pindahkan ke ${nextColumn.label}`}
          >
            {nextColumn.label}
            <ChevronRight className="w-3 h-3" aria-hidden="true" />
          </button>
        ) : onMoveForward ? (
          <div className="flex items-center gap-1.5">
            {canNotifyPickup ? (
              <button
                type="button"
                disabled={!hasWhatsappNumber || isSendingPickupNotification}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!hasWhatsappNumber || isSendingPickupNotification) return;
                  onSendPickupNotification?.(order.id);
                }}
                aria-label={
                  hasWhatsappNumber
                    ? `Kirim broadcast WhatsApp untuk ${order.invoiceNumber}`
                    : `No WhatsApp number untuk ${order.invoiceNumber}`
                }
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-600 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:border-surface-200 disabled:bg-surface-50 disabled:text-surface-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
                title={
                  hasWhatsappNumber
                    ? isSendingPickupNotification
                      ? "Mengirim..."
                      : "Kirim broadcast WhatsApp"
                    : "No WhatsApp number"
                }
              >
                <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            ) : null}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMoveForward(order.id, "DELIVERED");
              }}
              aria-label={`Tandai ${order.invoiceNumber} sudah diserahkan`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold text-white
                         bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 shadow-sm hover:shadow-md
                         rounded-lg transition-colors cursor-pointer min-h-[32px]
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
              title="Tandai Sudah Diserahkan"
            >
              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
              SELESAI
            </button>
          </div>
        ) : null}
      </div>

      {/* Salesperson */}
      {order.salesperson && (
        <div className="flex items-center gap-1 mt-2 text-[10px] text-surface-400">
          <User className="w-3 h-3" aria-hidden="true" />
          {order.salesperson.name}
        </div>
      )}

      <div className="mt-3 border-t border-surface-100 pt-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setShowActivity((current) => !current);
          }}
          aria-expanded={showActivity}
          className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-surface-500
                     hover:text-brand-600 transition-colors cursor-pointer min-h-[28px]
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 rounded-md px-1"
        >
          <Activity className="w-3 h-3" aria-hidden="true" />
          Aktivitas
        </button>

        {showActivity ? (
          <div className="mt-2 rounded-lg bg-surface-50 border border-surface-100 p-2">
            {isActivityLoading ? (
              <p className="text-[10px] text-surface-400">Memuat aktivitas...</p>
            ) : isActivityError ? (
              <p className="text-[10px] text-red-500">Gagal memuat aktivitas.</p>
            ) : activity.length === 0 ? (
              <p className="text-[10px] text-surface-400">Belum ada aktivitas.</p>
            ) : (
              <ol className="space-y-2">
                {activity.slice(0, 4).map((entry) => (
                  <li key={entry.id} className="text-[10px] text-surface-600">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-surface-800 truncate">
                        {entry.actorName}
                      </span>
                      <time className="text-surface-400 shrink-0">
                        {formatActivityTimestamp(entry.createdAt)}
                      </time>
                    </div>
                    <p className="mt-0.5">
                      {isPickupWhatsappActivity(entry)
                        ? "Notifikasi WhatsApp pickup terkirim"
                        : `${productionStatusLabel(entry.fromStatus)} ke ${productionStatusLabel(entry.toStatus)}`}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        ) : null}
      </div>
    </article>
  );
}

// ─── Kanban Column ──────────────────────────────────────────────────────────────

interface KanbanColumnProps {
  config: KanbanColumnConfig;
  orders: JobOrder[];
  columnIndex: number;
  filter: KanbanFilter;
  onMoveForward?: (id: string, nextStatus: ProductionStatus) => void;
  onSendPickupNotification?: (id: string) => void;
  pickupNotificationPendingId?: string | null;
  onDrop?: (orderId: string, targetStatus: ProductionStatus) => void;
}

function KanbanColumn({
  config,
  orders,
  columnIndex,
  filter,
  onMoveForward,
  onSendPickupNotification,
  pickupNotificationPendingId,
  onDrop,
}: KanbanColumnProps) {
  const [isDragOver, setIsDragOver] = React.useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setIsDragOver(true);
  };

  const handleDragLeave = () => setIsDragOver(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const orderId = e.dataTransfer.getData("text/plain");
    if (orderId && onDrop) onDrop(orderId, config.id);
  };

  const isCardDimmed = (order: JobOrder) => {
    if (filter === "ALL") return false;
    if (filter === "OVERDUE") {
      return getDeadlineState(order.estimatedDoneAt).level !== "overdue";
    }
    return order.productionStatus !== filter;
  };

  return (
    <section
      aria-label={`Kolom ${config.label}`}
      className={`flex flex-col w-full md:flex-1 md:min-w-0 rounded-2xl border transition-all duration-200 ${isDragOver
        ? "border-brand-400 bg-brand-50/30 shadow-lg ring-2 ring-brand-200/50"
        : "border-surface-200/60 bg-white/60"
        }`}
      onDragOver={onDrop ? handleDragOver : undefined}
      onDragLeave={onDrop ? handleDragLeave : undefined}
      onDrop={onDrop ? handleDrop : undefined}
    >
      {/* Column Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-surface-200/50">
        <div
          className={`w-7 h-7 rounded-lg ${config.color} flex items-center justify-center text-white shadow-sm`}
        >
          {config.icon}
        </div>
        <h3 className="font-bold text-surface-900 text-sm">{config.label}</h3>
        <span
          aria-label={`${orders.length} order`}
          className="ml-auto flex items-center justify-center min-w-[22px] h-[22px] rounded-full bg-surface-100 text-surface-600 text-xs font-bold px-1.5"
        >
          {orders.length}
        </span>
      </div>

      {/* Cards Container */}
      <div
        className={`flex-1 overflow-y-auto p-3 ${config.bgColor} max-h-[60vh] md:max-h-[calc(100vh-280px)]`}
      >
        {orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-surface-300">
            <div
              className={`w-10 h-10 rounded-xl ${config.bgColor} border-2 border-dashed border-surface-200 flex items-center justify-center mb-3`}
            >
              {config.icon}
            </div>
            <p className="text-xs text-surface-400">Drop di sini</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
            {orders.map((order) => (
              <KanbanCard
                key={order.id}
                order={order}
                onMoveForward={onMoveForward}
                onSendPickupNotification={onSendPickupNotification}
                pickupNotificationPendingId={pickupNotificationPendingId}
                columnIndex={columnIndex}
                dimmed={isCardDimmed(order)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ─── Kanban Board (Main Export) ─────────────────────────────────────────────────

interface KanbanBoardProps {
  orders: JobOrder[];
  filter?: KanbanFilter;
  onMoveForward?: (id: string, nextStatus: ProductionStatus) => void;
  onSendPickupNotification?: (id: string) => void;
  pickupNotificationPendingId?: string | null;
  onDrop?: (orderId: string, targetStatus: ProductionStatus) => void;
}

export default function KanbanBoard({
  orders,
  filter = "ALL",
  onMoveForward,
  onSendPickupNotification,
  pickupNotificationPendingId,
  onDrop,
}: KanbanBoardProps) {
  const ordersByColumn = useMemo(() => {
    const map = new Map<ProductionStatus, JobOrder[]>();
    KANBAN_COLUMNS.forEach((col) => map.set(col.id, []));
    orders.forEach((o) => {
      const list = map.get(o.productionStatus);
      if (list) list.push(o);
    });
    return map;
  }, [orders]);

  return (
    <div className="flex flex-col lg:flex-row gap-4 lg:gap-5 pb-4 w-full">
      {KANBAN_COLUMNS.map((col, idx) => (
        <KanbanColumn
          key={col.id}
          config={col}
          orders={ordersByColumn.get(col.id) ?? []}
          columnIndex={idx}
          filter={filter}
          onMoveForward={onMoveForward}
          onSendPickupNotification={onSendPickupNotification}
          pickupNotificationPendingId={pickupNotificationPendingId}
          onDrop={onDrop}
        />
      ))}
    </div>
  );
}
