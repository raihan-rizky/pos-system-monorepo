"use client";

import React, { useState } from "react";
import { Card } from "@pos/ui";
import { useJobOrders, useMoveJobOrder, ProductionStatus } from "@/hooks/useJobOrders";
import KanbanBoard, { KANBAN_COLUMNS } from "@/components/kanban/KanbanBoard";
import {
  Kanban,
  RefreshCw,
  AlertCircle,
  ClipboardList,
  Clock,
  CheckCircle2,
  TrendingUp,
} from "lucide-react";

// ─── Stat Card ──────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon,
  color,
  delay,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  delay?: string;
}) {
  return (
    <Card glass className="animate-fade-in" style={delay ? { animationDelay: delay } : undefined}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-surface-400 uppercase tracking-wider">
            {label}
          </p>
          <p className="text-2xl font-extrabold text-surface-900 mt-2">{value}</p>
        </div>
        <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center`}>
          {icon}
        </div>
      </div>
    </Card>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────────

export default function ProductionPage() {
  const { data: jobOrders = [], isLoading, isError } = useJobOrders();
  const moveJobOrder = useMoveJobOrder();

  // Derived stats
  const totalActive = jobOrders.length;
  const overdueCount = jobOrders.filter((o) => {
    if (!o.estimatedDoneAt) return false;
    return new Date(o.estimatedDoneAt).getTime() < Date.now();
  }).length;
  const readyCount = jobOrders.filter((o) => o.productionStatus === "READY_PICKUP").length;
  const inProgressCount = jobOrders.filter((o) =>
    ["DESIGNING", "PRINTING", "FINISHING"].includes(o.productionStatus)
  ).length;

  const handleMoveForward = (id: string, nextStatus: ProductionStatus) => {
    moveJobOrder.mutate({ id, productionStatus: nextStatus });
  };

  const handleDrop = (orderId: string, targetStatus: ProductionStatus) => {
    // Don't update if already in the same column
    const current = jobOrders.find((o) => o.id === orderId);
    if (current && current.productionStatus !== targetStatus) {
      moveJobOrder.mutate({ id: orderId, productionStatus: targetStatus });
    }
  };

  return (
    <div className="flex-1 overflow-y-auto w-full">
      <div className="max-w-full mx-auto space-y-6 animate-in fade-in duration-500 pb-12 pt-4 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-surface-900 tracking-tight flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-sm">
                <Kanban className="w-5 h-5 text-white" />
              </div>
              Production Board
            </h1>
            <p className="text-sm text-surface-500 mt-1">
              Track job orders from receipt to delivery.
            </p>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard
            label="Active Jobs"
            value={isLoading ? "..." : totalActive}
            icon={<ClipboardList className="w-5 h-5 text-brand-600" />}
            color="bg-brand-50"
            delay="0ms"
          />
          <StatCard
            label="In Progress"
            value={isLoading ? "..." : inProgressCount}
            icon={<TrendingUp className="w-5 h-5 text-blue-600" />}
            color="bg-blue-50"
            delay="75ms"
          />
          <StatCard
            label="Ready for Pickup"
            value={isLoading ? "..." : readyCount}
            icon={<CheckCircle2 className="w-5 h-5 text-emerald-600" />}
            color="bg-emerald-50"
            delay="150ms"
          />
          <StatCard
            label="Overdue"
            value={isLoading ? "..." : overdueCount}
            icon={<Clock className="w-5 h-5 text-red-600" />}
            color="bg-red-50"
            delay="225ms"
          />
        </div>

        {/* Kanban Board */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-24 text-surface-400 animate-pulse">
            <RefreshCw className="w-8 h-8 mb-4 animate-spin text-surface-300" />
            <p className="text-sm">Loading production board...</p>
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-24 text-red-500">
            <AlertCircle className="w-8 h-8 mb-4" />
            <p className="text-sm font-medium">Failed to load job orders</p>
            <p className="text-xs text-surface-400 mt-1">Please check your database connection.</p>
          </div>
        ) : totalActive === 0 ? (
          <Card glass className="flex flex-col items-center justify-center py-20">
            <div className="w-16 h-16 rounded-2xl bg-surface-100 flex items-center justify-center mb-4">
              <Kanban className="w-8 h-8 text-surface-300" />
            </div>
            <p className="text-surface-900 font-semibold mb-1">No active job orders</p>
            <p className="text-sm text-surface-500">
              Create a transaction with &quot;Job Order&quot; enabled from the POS to see it here.
            </p>
          </Card>
        ) : (
          <KanbanBoard
            orders={jobOrders}
            onMoveForward={handleMoveForward}
            onDrop={handleDrop}
          />
        )}
      </div>
    </div>
  );
}
