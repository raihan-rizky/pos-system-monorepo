import React from "react";
import { Card } from "@pos/ui";
import { formatRupiah } from "@/lib/utils";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  Legend,
} from "recharts";

// Mapping colors for production stages
const STATUS_COLORS: Record<string, string> = {
  PRINTING: "#3b82f6", // Blue 500
  READY_PICKUP: "#10b981", // Emerald 500
  DELIVERED: "#06b6d4", // Cyan 500
  UNKNOWN: "#cbd5e1", // Slate 300
};

export type TopSalesperson = {
  id?: string | null;
  name?: string | null;
  txCount?: number | null;
  revenue?: number | string | null;
};

export type TopCustomer = {
  id?: string | null;
  name?: string | null;
  phone?: string | null;
  totalSpent?: number | string | null;
};

export type ProductionStatusCount = {
  status?: string | null;
  count?: number | null;
};

export type ActiveDPTransaction = {
  id?: string | null;
  invoiceNumber?: string | null;
  customerName?: string | null;
  total?: number | string | null;
  paidAmount?: number | string | null;
};

export function TopSalespersonsWidget({ data }: { data: TopSalesperson[] }) {
  return (
    <Card>
      <h2 className="text-base font-bold text-surface-900 mb-4">
        🏆 Top Salesperson
      </h2>
      {data?.length ? (
        <div className="space-y-3">
          {data.map((sp, idx) => (
            <div
              key={`${sp.id || "salesperson"}-${sp.name || "sales"}-${idx}`}
              className="flex items-center justify-between border-b border-surface-50 pb-2 last:border-0 last:pb-0"
            >
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center text-xs font-bold">
                  {idx + 1}
                </div>
                <div>
                  <p className="text-sm font-medium text-surface-900">
                    {sp.name}
                  </p>
                  <p className="text-xs text-surface-400">
                    {sp.txCount ?? 0} transaksi
                  </p>
                </div>
              </div>
              <p className="text-sm font-semibold text-surface-900">
                {formatRupiah(Number(sp.revenue || 0))}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-surface-400">Belum ada data sales</p>
      )}
    </Card>
  );
}

export function TopCustomersWidget({ data }: { data: TopCustomer[] }) {
  return (
    <Card>
      <h2 className="text-base font-bold text-surface-900 mb-4">
        👑 Top Customer (30 Hari)
      </h2>
      {data?.length ? (
        <div className="space-y-3">
          {data.map((c, idx) => (
            <div
              key={c.id || idx}
              className="flex items-center justify-between border-b border-surface-50 pb-2 last:border-0 last:pb-0"
            >
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-accent-100 text-accent-600 flex items-center justify-center text-xs font-bold">
                  {idx + 1}
                </div>
                <div>
                  <p className="text-sm font-medium text-surface-900">
                    {c.name}
                  </p>
                  <p className="text-xs text-surface-400">{c.phone || "-"}</p>
                </div>
              </div>
              <p className="text-sm font-semibold text-surface-900">
                {formatRupiah(Number(c.totalSpent || 0))}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-surface-400">Belum ada data pelanggan</p>
      )}
    </Card>
  );
}

export function ProductionStatusWidget({ data }: { data: ProductionStatusCount[] }) {
  // Format data for chart and handle label mapping
  const chartData =
    data?.map((ps) => ({
      name: (ps.status || "UNKNOWN").replace(/_/g, " "),
      value: ps.count ?? 0,
      rawStatus: ps.status || "UNKNOWN",
    })) || [];

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-bold text-surface-900">
          🏭 Status Produksi
        </h2>
      </div>
      <div className="h-[240px] w-full">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
              >
                {chartData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={
                      STATUS_COLORS[entry.rawStatus] || STATUS_COLORS.UNKNOWN
                    }
                  />
                ))}
              </Pie>
              <RechartsTooltip
                contentStyle={{
                  borderRadius: "8px",
                  border: "none",
                  boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
                }}
              />
              <Legend
                verticalAlign="bottom"
                align="center"
                layout="horizontal"
                iconType="circle"
                iconSize={8}
                formatter={(value) => (
                  <span className="text-[10px] font-medium text-surface-600 capitalize">
                    {value.toLowerCase()}
                  </span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-surface-400">
              Tidak ada order dalam produksi
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}

export function ActiveDPWidget<T extends ActiveDPTransaction>({
  data,
  onSelect,
}: {
  data: T[];
  onSelect?: (tx: T) => void;
}) {
  return (
    <Card>
      <h2 className="text-base font-bold text-surface-900 mb-4">
        ⏳ Down Payment Aktif
      </h2>
      {data?.length ? (
        <div className="space-y-3">
          {data.map((dp, idx) => (
            <div
              key={dp.id || idx}
              role={onSelect ? "button" : undefined}
              tabIndex={onSelect ? 0 : undefined}
              className={`flex items-center justify-between border-b border-surface-50 pb-2 last:border-0 last:pb-0 ${onSelect ? "cursor-pointer hover:bg-surface-50 -mx-2 px-2 rounded-lg transition-colors" : ""}`}
              onClick={() => onSelect?.(dp)}
              onKeyDown={(event) => {
                if (!onSelect) return;
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(dp);
                }
              }}
            >
              <div>
                <p className="text-sm font-medium text-brand-600">
                  {dp.invoiceNumber}
                </p>
                <p className="text-xs text-surface-400">
                  {dp.customerName || "Customer"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-surface-900">
                  {formatRupiah(Number(dp.total || 0))}
                </p>
                <p className="text-xs text-danger-500">
                  Kurang: {formatRupiah(Math.max(0, Number(dp.total || 0) - Number(dp.paidAmount || 0)))}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-surface-400">Tidak ada transaksi DP aktif</p>
      )}
    </Card>
  );
}
