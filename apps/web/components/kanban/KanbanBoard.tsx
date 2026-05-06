"use client";

import React from "react";
import { JobOrder, ProductionStatus } from "@/hooks/useJobOrders";
import {
  Clock,
  Palette,
  Printer,
  Scissors,
  PackageCheck,
  AlertCircle,
  User,
  FileText,
  ChevronRight,
  CheckCircle2,
} from "lucide-react";

// ─── Column Configuration ───────────────────────────────────────────────────────

export interface KanbanColumnConfig {
  id: ProductionStatus;
  label: string;
  icon: React.ReactNode;
  color: string; // Tailwind bg class for the header accent
  dotColor: string; // Tailwind bg class for the status dot
  bgColor: string; // Tailwind bg class for the column body
  textColor: string;
  glowColor: string;
}

export const KANBAN_COLUMNS: KanbanColumnConfig[] = [
  {
    id: "PENDING",
    label: "Pending",
    icon: <Clock className="w-4 h-4" />,
    color: "bg-slate-500",
    dotColor: "bg-slate-400",
    bgColor: "bg-slate-50/60",
    textColor: "text-slate-600",
    glowColor: "shadow-slate-400/60",
  },
  {
    id: "DESIGNING",
    label: "Designing",
    icon: <Palette className="w-4 h-4" />,
    color: "bg-violet-500",
    dotColor: "bg-violet-400",
    bgColor: "bg-violet-50/40",
    textColor: "text-violet-600",
    glowColor: "shadow-violet-400/60",
  },
  {
    id: "PRINTING",
    label: "Printing",
    icon: <Printer className="w-4 h-4" />,
    color: "bg-blue-500",
    dotColor: "bg-blue-400",
    bgColor: "bg-blue-50/40",
    textColor: "text-blue-600",
    glowColor: "shadow-blue-400/60",
  },
  {
    id: "FINISHING",
    label: "Finishing",
    icon: <Scissors className="w-4 h-4" />,
    color: "bg-amber-500",
    dotColor: "bg-amber-400",
    bgColor: "bg-amber-50/40",
    textColor: "text-amber-600",
    glowColor: "shadow-amber-400/60",
  },
  {
    id: "READY_PICKUP",
    label: "Ready",
    icon: <PackageCheck className="w-4 h-4" />,
    color: "bg-emerald-500",
    dotColor: "bg-emerald-400",
    bgColor: "bg-emerald-50/40",
    textColor: "text-emerald-600",
    glowColor: "shadow-emerald-400/60",
  },
];

// ─── Deadline Badge ─────────────────────────────────────────────────────────────

function DeadlineBadge({
  estimatedDoneAt,
}: {
  estimatedDoneAt: string | null;
}) {
  if (!estimatedDoneAt) return null;

  const deadline = new Date(estimatedDoneAt);
  const now = new Date();
  const diffMs = deadline.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  let colorClass = "bg-surface-100 text-surface-600"; // default
  if (diffDays < 0) colorClass = "bg-red-100 text-red-700";
  else if (diffDays === 0) colorClass = "bg-amber-100 text-amber-700";
  else if (diffDays <= 2) colorClass = "bg-yellow-100 text-yellow-700";

  const label =
    diffDays < 0
      ? `${Math.abs(diffDays)}d overdue`
      : diffDays === 0
        ? "Due today"
        : `${diffDays}d left`;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${colorClass}`}
    >
      <Clock className="w-3 h-3" />
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
      className={`text-center items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
        isDP
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
  onMoveForward: (id: string, nextStatus: ProductionStatus) => void;
  columnIndex: number;
}

function KanbanCard({ order, onMoveForward, columnIndex }: KanbanCardProps) {
  const currentColumn = KANBAN_COLUMNS[columnIndex];
  const nextColumn = KANBAN_COLUMNS[columnIndex + 1];

  // HTML5 Drag
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("text/plain", order.id);
    e.dataTransfer.effectAllowed = "move";
    // add visual cue
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = "0.5";
    }
  };

  const handleDragEnd = (e: React.DragEvent) => {
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = "1";
    }
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      className="bg-white border border-surface-200/80 rounded-xl p-4 shadow-sm hover:shadow-md 
                 transition-all duration-200 cursor-grab active:cursor-grabbing active:shadow-lg 
                 active:scale-[0.98] group"
    >
      {/* Header */}
      <div className="flex flex-col gap-2 mb-3">
        <div className="min-w-0">
          <p className="font-bold text-surface-900 text-sm truncate">
            {order.customerName || "Walk-in"}
          </p>
          <div className="flex items-center justify-between gap-4 mt-1">
            <p className="text-[11px] text-surface-500 flex items-center gap-1">
              <FileText className="w-3 h-3" />
              {order.invoiceNumber}
            </p>
            {/* Glowing Status Badge */}
            <div
              className={`flex items-center gap-1 px-3 py-1 rounded-full bg-white border border-surface-200 shadow-sm`}
            >
              <span className={`relative flex h-2 w-2`}>
                <span
                  className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${currentColumn.dotColor}`}
                ></span>
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 shadow-[0_0_6px] ${currentColumn.dotColor} ${currentColumn.glowColor}`}
                ></span>
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
      <div className="space-y-1 mb-3">
        {order.items.slice(0, 3).map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between text-xs text-surface-700"
          >
            <span className="truncate flex-1">{item.productName}</span>
            <span className="text-surface-500 ml-2 shrink-0">
              x{item.quantity}
            </span>
          </div>
        ))}
        {order.items.length > 3 && (
          <p className="text-[10px] text-surface-400 italic">
            +{order.items.length - 3} more items
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-surface-100 mt-auto">
        <div className="flex items-center gap-2">
          <DeadlineBadge estimatedDoneAt={order.estimatedDoneAt} />
        </div>

        {nextColumn ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMoveForward(order.id, nextColumn.id);
            }}
            className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-surface-500 
                       hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors 
                       opacity-0 group-hover:opacity-100 cursor-pointer"
            title={`Move to ${nextColumn.label}`}
          >
            {nextColumn.label}
            <ChevronRight className="w-3 h-3" />
          </button>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMoveForward(order.id, "DELIVERED");
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold text-white 
                       bg-emerald-500 hover:bg-emerald-600 shadow-sm hover:shadow-md 
                       rounded-lg transition-all transform hover:scale-105 active:scale-95 
                       opacity-0 group-hover:opacity-100 cursor-pointer"
            title="Mark as Delivered"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            DONE
          </button>
        )}
      </div>

      {/* Salesperson */}
      {order.salesperson && (
        <div className="flex items-center gap-1 mt-2 text-[10px] text-surface-400">
          <User className="w-3 h-3" />
          {order.salesperson.name}
        </div>
      )}
    </div>
  );
}

// ─── Kanban Column ──────────────────────────────────────────────────────────────

interface KanbanColumnProps {
  config: KanbanColumnConfig;
  orders: JobOrder[];
  columnIndex: number;
  onMoveForward: (id: string, nextStatus: ProductionStatus) => void;
  onDrop: (orderId: string, targetStatus: ProductionStatus) => void;
}

function KanbanColumn({
  config,
  orders,
  columnIndex,
  onMoveForward,
  onDrop,
}: KanbanColumnProps) {
  const [isDragOver, setIsDragOver] = React.useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const orderId = e.dataTransfer.getData("text/plain");
    if (orderId) {
      onDrop(orderId, config.id);
    }
  };

  return (
    <div
      className={`flex flex-col w-full md:w-auto md:min-w-[280px] lg:min-w-[300px] md:max-w-[340px] shrink-0 rounded-2xl border transition-all duration-200 ${
        isDragOver
          ? "border-brand-400 bg-brand-50/30 shadow-lg ring-2 ring-brand-200/50"
          : "border-surface-200/60 bg-white/60"
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Column Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-surface-200/50">
        <div
          className={`w-7 h-7 rounded-lg ${config.color} flex items-center justify-center text-white shadow-sm`}
        >
          {config.icon}
        </div>
        <h3 className="font-bold text-surface-900 text-sm">{config.label}</h3>
        <span className="ml-auto flex items-center justify-center min-w-[22px] h-[22px] rounded-full bg-surface-100 text-surface-600 text-xs font-bold px-1.5">
          {orders.length}
        </span>
      </div>

      {/* Cards Container */}
      <div
        className={`flex-1 overflow-y-auto p-3 space-y-3 ${config.bgColor} max-h-[50vh] md:max-h-[calc(100vh-280px)]`}
      >
        {orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-surface-300">
            <div
              className={`w-10 h-10 rounded-xl ${config.bgColor} border-2 border-dashed border-surface-200 flex items-center justify-center mb-3`}
            >
              {config.icon}
            </div>
            <p className="text-xs text-surface-400">Drop here</p>
          </div>
        ) : (
          orders.map((order) => (
            <KanbanCard
              key={order.id}
              order={order}
              onMoveForward={onMoveForward}
              columnIndex={columnIndex}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ─── Kanban Board (Main Export) ─────────────────────────────────────────────────

interface KanbanBoardProps {
  orders: JobOrder[];
  onMoveForward: (id: string, nextStatus: ProductionStatus) => void;
  onDrop: (orderId: string, targetStatus: ProductionStatus) => void;
}

export default function KanbanBoard({
  orders,
  onMoveForward,
  onDrop,
}: KanbanBoardProps) {
  return (
    <div
      className="flex flex-col md:flex-row gap-5 md:overflow-x-auto pb-4 md:px-1 md:snap-x md:snap-mandatory md:scroll-smooth"
      style={{ WebkitOverflowScrolling: "touch" }}
    >
      {KANBAN_COLUMNS.map((col, idx) => {
        const colOrders = orders.filter((o) => o.productionStatus === col.id);
        return (
          <KanbanColumn
            key={col.id}
            config={col}
            orders={colOrders}
            columnIndex={idx}
            onMoveForward={onMoveForward}
            onDrop={onDrop}
          />
        );
      })}
    </div>
  );
}
