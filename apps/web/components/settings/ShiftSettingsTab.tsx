"use client";

import { PauseCircle, PlayCircle, ShieldCheck } from "lucide-react";
import { Button } from "@pos/ui";
import { useState } from "react";
import { useRole } from "@/components/providers/RoleProvider";
import { useShiftSettings, useUpdateShiftSettings } from "@/hooks/useShiftSettings";

export interface ShiftSettingsViewProps {
  enabled: boolean;
  isLoading: boolean;
  isUpdating: boolean;
  error: string | null;
  confirmingDisable: boolean;
  onToggle: () => void;
  onCancelDisable: () => void;
  onConfirmDisable: () => void;
}

export function ShiftSettingsView({
  enabled,
  isLoading,
  isUpdating,
  error,
  confirmingDisable,
  onToggle,
  onCancelDisable,
  onConfirmDisable,
}: ShiftSettingsViewProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          {enabled ? <PlayCircle className="h-5 w-5" aria-hidden="true" /> : <PauseCircle className="h-5 w-5" aria-hidden="true" />}
        </div>
        <div>
          <h2 className="text-lg font-bold text-surface-900">Gunakan Shift Kasir</h2>
          <p className="mt-1 text-sm text-surface-500">Atur apakah kasir wajib membuka shift sebelum transaksi.</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-xl border border-surface-200 bg-surface-50 p-4">
        <div>
          <p className="text-sm font-semibold text-surface-900">{enabled ? "Shift kasir aktif" : "Shift kasir dimatikan"}</p>
          <p className="mt-1 text-sm text-surface-500">
            {enabled ? "Kasir wajib membuka shift sebelum transaksi." : "Kasir bisa bertransaksi tanpa membuka shift."}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-pressed={enabled}
          aria-label="Gunakan Shift Kasir"
          disabled={isLoading || isUpdating}
          onClick={onToggle}
          className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${enabled ? "bg-brand-600" : "bg-surface-300"}`}
        >
          <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-6" : "translate-x-1"}`} />
        </button>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-bold">{enabled ? "Matikan Shift Kasir" : "Shift sedang dalam mode pause"}</p>
            <p className="mt-1">Shift yang terbuka akan dipause, bukan ditutup. History shift tetap aman.</p>
          </div>
        </div>
      </div>

      {confirmingDisable && (
        <div className="rounded-xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-800">
          <p className="font-bold">Konfirmasi Matikan Shift</p>
          <p className="mt-1">Shift akan dipause dan kasir bisa langsung bertransaksi tanpa membuka shift.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" variant="danger" loading={isUpdating} onClick={onConfirmDisable}>
              Lanjutkan
            </Button>
            <Button type="button" variant="secondary" disabled={isUpdating} onClick={onCancelDisable}>
              Batal
            </Button>
          </div>
        </div>
      )}

      {error && <p className="rounded-lg bg-danger-50 p-3 text-sm font-medium text-danger-700">{error}</p>}
    </div>
  );
}

export default function ShiftSettingsTab() {
  const { role } = useRole();
  const settingsQuery = useShiftSettings();
  const updateSettings = useUpdateShiftSettings();
  const [confirmingDisable, setConfirmingDisable] = useState(false);
  const enabled = settingsQuery.data?.enabled ?? true;

  if (role !== "OWNER") return null;

  return (
    <ShiftSettingsView
      enabled={enabled}
      isLoading={settingsQuery.isLoading}
      isUpdating={updateSettings.isPending}
      error={settingsQuery.error?.message ?? updateSettings.error?.message ?? null}
      confirmingDisable={confirmingDisable}
      onToggle={() => {
        if (enabled) setConfirmingDisable(true);
        else updateSettings.mutate({ enabled: true });
      }}
      onCancelDisable={() => setConfirmingDisable(false)}
      onConfirmDisable={() => {
        setConfirmingDisable(false);
        updateSettings.mutate({ enabled: false });
      }}
    />
  );
}
