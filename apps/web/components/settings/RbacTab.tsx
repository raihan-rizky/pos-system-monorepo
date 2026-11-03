"use client";

import { useEffect, useMemo, useState } from "react";
import { useRef } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  FileText,
  Info,
  Pencil,
  RefreshCw,
  Save,
  ShieldAlert,
  ShieldCheck,
  X,
  ArrowRight,
  Lock,
  CircleDot,
  ChevronDown,
} from "lucide-react";
import {
  ACTIONS,
  EDITABLE_ROLES,
  normalizeRolePermissions,
} from "@/features/rbac/helpers/rbac-core";
import type {
  EditableRole,
  PermissionEntry,
  ResourceAction,
  RolePermissions,
} from "@/features/rbac/helpers/rbac-core";
import {
  RBAC_PERMISSION_MODULES,
  buildModuleGroups,
  buildEffectiveActivities,
  RBAC_RESOURCE_METADATA,
  countSupportedResourceActions,
  bindDialogFocus,
  buildModuleWarnings,
  buildPermissionChanges,
  buildPermissionPresentation,
  buildRoleSummaries,
} from "@/features/rbac/helpers/rbac-settings-ui";
import { loadRbacSettings, saveRbacChanges, notifyPermissionsChanged, PermissionSaveError } from "@/features/rbac/helpers/rbac-client";
import type { PermissionAuditEntry } from "@/features/rbac/helpers/rbac-client";
import type {
  PermissionChange,
  PermissionSensitivity,
  RbacPermissionModule,
} from "@/features/rbac/helpers/rbac-settings-ui";

/* ─── Constants ─────────────────────────────────────────────────────────────── */

const ROLE_LABELS: Record<EditableRole, string> = {
  ADMIN: "Admin",
  CASHIER: "Kasir",
  SALES: "Sales",
  INVENTORY: "Inventaris",
};

const ROLE_COLORS: Record<EditableRole, { gradient: string; dot: string; bg: string; border: string; text: string }> = {
  ADMIN: {
    gradient: "from-brand-500 to-brand-700",
    dot: "bg-brand-500",
    bg: "bg-brand-50",
    border: "border-brand-200",
    text: "text-brand-700",
  },
  CASHIER: {
    gradient: "from-emerald-500 to-emerald-700",
    dot: "bg-emerald-500",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    text: "text-emerald-700",
  },
  SALES: {
    gradient: "from-amber-500 to-amber-700",
    dot: "bg-amber-500",
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-700",
  },
  INVENTORY: {
    gradient: "from-violet-500 to-violet-700",
    dot: "bg-violet-500",
    bg: "bg-violet-50",
    border: "border-violet-200",
    text: "text-violet-700",
  },
};

const ACTION_LABELS: Record<ResourceAction, string> = {
  create: "Buat",
  read: "Lihat",
  update: "Ubah",
  delete: "Hapus",
};

const SENSITIVITY_STYLES: Record<PermissionSensitivity, { dot: string; label: string }> = {
  normal: { dot: "bg-emerald-400", label: "Normal" },
  sensitive: { dot: "bg-amber-400", label: "Sensitif" },
  critical: { dot: "bg-red-400", label: "Kritis" },
};

/* ─── Exported helpers (used by tests) ──────────────────────────────────────── */

export function buildSavedPermissionsFromEntries(entries: PermissionEntry[]) {
  return normalizeRolePermissions(entries);
}

/* ─── Skeleton Loading ──────────────────────────────────────────────────────── */

export function RbacSkeletonLoading() {
  return (
    <div className="space-y-6 animate-pulse" aria-busy="true" aria-label="Memuat pengaturan RBAC">
      {/* Header skeleton */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="h-6 w-44 rounded-lg bg-surface-200" />
          <div className="h-4 w-72 rounded-md bg-surface-100" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-28 rounded-lg bg-surface-200" />
          <div className="h-10 w-36 rounded-lg bg-surface-200" />
        </div>
      </div>
      {/* Role cards skeleton */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-surface-100 bg-white p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-3 w-1 rounded-full bg-surface-200" />
              <div className="h-5 w-20 rounded-md bg-surface-200" />
            </div>
            <div className="space-y-2">
              <div className="h-3 w-full rounded bg-surface-100" />
              <div className="h-3 w-3/4 rounded bg-surface-100" />
            </div>
          </div>
        ))}
      </div>
      {/* Table skeleton */}
      <div className="rounded-xl border border-surface-100 bg-white p-4 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <div className="h-4 w-32 rounded bg-surface-200" />
            <div className="flex-1" />
            {Array.from({ length: 4 }).map((_, j) => (
              <div key={j} className="h-6 w-16 rounded-full bg-surface-100" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Main Container ────────────────────────────────────────────────────────── */

export default function RbacTab() {
  const [activeRole, setActiveRole] = useState<EditableRole>("ADMIN");
  const [selectedModuleId, setSelectedModuleId] = useState(RBAC_PERMISSION_MODULES[0].id);
  const [permissions, setPermissions] = useState<RolePermissions | null>(null);
  const [savedPermissions, setSavedPermissions] = useState<RolePermissions | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [isSensitiveConfirmOpen, setIsSensitiveConfirmOpen] = useState(false);
  const [version, setVersion] = useState("");
  const [audit, setAudit] = useState<PermissionAuditEntry[]>([]);
  const [hasConflict, setHasConflict] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      setIsLoading(true);
      setError(null);

      try {
        const data = await loadRbacSettings();

        if (!cancelled) {
          const normalized = buildSavedPermissionsFromEntries(data.permissions);
          setPermissions(normalized);
          setSavedPermissions(normalized);
          setVersion(data.version);
          setAudit(data.audit);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Gagal memuat pengaturan RBAC");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadSettings();

    return () => {
      cancelled = true;
    };
  }, []);

  function setPagePermission(role: EditableRole, target: string, allowed: boolean) {
    setSaved(false);
    setPermissions((current) => {
      if (!current) return current;
      return {
        ...current,
        [role]: {
          ...current[role],
          pages: {
            ...current[role].pages,
            [target]: allowed,
          },
        },
      };
    });
  }

  function setResourcePermission(
    role: EditableRole,
    target: string,
    action: ResourceAction,
    allowed: boolean,
  ) {
    setSaved(false);
    setPermissions((current) => {
      if (!current) return current;
      return {
        ...current,
        [role]: {
          ...current[role],
          resources: {
            ...current[role].resources,
            [target]: {
              ...current[role].resources[target],
              [action]: allowed,
            },
          },
        },
      };
    });
  }

  async function saveSettings() {
    if (!permissions || !savedPermissions || !version || hasConflict) return;
    setIsSaving(true);
    setSaved(false);
    setError(null);

    try {
      const data = await saveRbacChanges(permissions, savedPermissions, version);

      const normalized = buildSavedPermissionsFromEntries(data.permissions);
      setPermissions(normalized);
      setSavedPermissions(normalized);
      setVersion(data.version);
      setAudit(previous => [...data.audit, ...previous].filter((entry, index, entries) => entries.findIndex(other => other.id === entry.id) === index).slice(0, 20));
      notifyPermissionsChanged(data.version);
      setIsReviewOpen(false);
      setIsSensitiveConfirmOpen(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan pengaturan RBAC");
      if (err instanceof PermissionSaveError && err.statusCode === 409) {
        setHasConflict(true);
        setIsReviewOpen(false);
        setIsSensitiveConfirmOpen(false);
        try {
          const latest = await loadRbacSettings();
          setAudit(latest.audit);
        } catch { /* Local edits remain available if the latest audit cannot be loaded. */ }
      }
    } finally {
      setIsSaving(false);
    }
  }

  async function reloadSettings() {
    setIsSaving(true);
    try {
      const data = await loadRbacSettings();
      const normalized = buildSavedPermissionsFromEntries(data.permissions);
      setPermissions(normalized);
      setSavedPermissions(normalized);
      setVersion(data.version);
      setAudit(data.audit);
      setHasConflict(false);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat pengaturan RBAC");
    } finally { setIsSaving(false); }
  }

  function confirmReview() {
    if (!permissions || !savedPermissions) return;
    const changes = buildPermissionChanges(permissions, savedPermissions);
    if (changes.some((change) => change.requiresConfirmation)) {
      setIsSensitiveConfirmOpen(true);
      return;
    }
    void saveSettings();
  }

  if (isLoading) {
    return <RbacSkeletonLoading />;
  }

  if (!permissions || !savedPermissions) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
          <ShieldAlert className="h-6 w-6 text-red-600" />
        </div>
        <p className="text-sm font-semibold text-red-700">
          {error || "Gagal memuat pengaturan RBAC"}
        </p>
        <button type="button" onClick={() => window.location.reload()} className="rounded-lg border border-surface-200 px-4 py-2 text-sm font-semibold text-surface-700">Coba lagi</button>
      </div>
    );
  }

  return (
    <>
    {hasConflict && (
      <div role="alert" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-semibold">Hak akses berubah di sesi lain</p>
        <p className="mt-1">Edit Anda masih tersedia di bawah. Periksa catatan perubahan, lalu muat versi terbaru sebelum menyusun dan meninjau perubahan lagi. Memuat ulang akan mengganti edit yang belum disimpan.</p>
        <button type="button" disabled={isSaving} onClick={() => void reloadSettings()} className="mt-3 rounded-lg border border-amber-300 bg-white px-3 py-2 font-semibold disabled:opacity-50">Muat versi terbaru dan ganti edit lokal</button>
      </div>
    )}
    <RbacSettingsView
      activeRole={activeRole}
      selectedModuleId={selectedModuleId}
      permissions={permissions}
      savedPermissions={savedPermissions}
      isSaving={isSaving}
      saveBlocked={hasConflict}
      saved={saved}
      error={error}
      isReviewOpen={isReviewOpen}
      isSensitiveConfirmOpen={isSensitiveConfirmOpen}
      onActiveRoleChange={setActiveRole}
      onSelectedModuleChange={setSelectedModuleId}
      onPagePermissionChange={setPagePermission}
      onResourcePermissionChange={setResourcePermission}
      onRequestSaveReview={() => { if (!hasConflict) setIsReviewOpen(true); }}
      onCloseReview={() => setIsReviewOpen(false)}
      onConfirmReview={confirmReview}
      onCancelSensitiveConfirm={() => setIsSensitiveConfirmOpen(false)}
      onConfirmSensitiveSave={() => void saveSettings()}
    />
    <details className="mt-6 rounded-xl border border-surface-200 bg-white p-4">
      <summary className="cursor-pointer text-sm font-semibold text-surface-800">Catatan perubahan hak akses</summary>
      <p className="mt-2 text-xs text-surface-500">20 perubahan terbaru oleh Owner, berlaku untuk seluruh toko. Waktu dalam WIB.</p>
      {audit.length === 0 ? <p className="mt-3 text-sm text-surface-500">Belum ada perubahan yang tercatat.</p> : (
        <ol className="mt-3 space-y-3">
          {audit.map(entry => (
            <li key={entry.id} className="rounded-lg bg-surface-50 p-3 text-sm">
              <p className="font-medium text-surface-800">{entry.actorName} · {new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(entry.createdAt))}</p>
              <p className="text-xs text-surface-500">{entry.changes.length} izin diubah</p>
              <ul className="mt-2 space-y-1 text-xs text-surface-600">
                {entry.changes.map(change => {
                  const presentation = buildPermissionPresentation(change);
                  return (
                  <li key={`${change.role}:${change.scope}:${change.target}:${change.action}`}>
                    {ROLE_LABELS[change.role]} · {presentation.label}: {change.allowed ? "Diizinkan" : "Tidak diizinkan"}
                    <details className="mt-1 text-surface-500"><summary className="cursor-pointer">Detail teknis</summary><code>{presentation.technicalId}</code></details>
                  </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </details>
    </>
  );
}

/* ─── View Props ────────────────────────────────────────────────────────────── */

type RbacSettingsViewProps = {
  activeRole: EditableRole;
  selectedModuleId: string;
  permissions: RolePermissions;
  savedPermissions: RolePermissions;
  isSaving: boolean;
  saveBlocked?: boolean;
  saved: boolean;
  error: string | null;
  isReviewOpen: boolean;
  isSensitiveConfirmOpen: boolean;
  onActiveRoleChange: (role: EditableRole) => void;
  onSelectedModuleChange: (moduleId: string) => void;
  onPagePermissionChange: (role: EditableRole, target: string, allowed: boolean) => void;
  onResourcePermissionChange: (
    role: EditableRole,
    target: string,
    action: ResourceAction,
    allowed: boolean,
  ) => void;
  onRequestSaveReview: () => void;
  onCloseReview: () => void;
  onConfirmReview: () => void;
  onCancelSensitiveConfirm: () => void;
  onConfirmSensitiveSave: () => void;
};

const MODULE_GROUPS = buildModuleGroups();

/* ─── Main View ─────────────────────────────────────────────────────────────── */

export function RbacSettingsView({
  activeRole,
  selectedModuleId,
  permissions,
  savedPermissions,
  isSaving,
  saveBlocked = false,
  saved,
  error,
  isReviewOpen,
  isSensitiveConfirmOpen,
  onActiveRoleChange,
  onSelectedModuleChange,
  onPagePermissionChange,
  onResourcePermissionChange,
  onRequestSaveReview,
  onCloseReview,
  onConfirmReview,
  onCancelSensitiveConfirm,
  onConfirmSensitiveSave,
}: RbacSettingsViewProps) {
  const [isMatrixExpanded, setIsMatrixExpanded] = useState(false);
  const [moduleSearch, setModuleSearch] = useState("");
  const filteredGroups = buildModuleGroups(moduleSearch);
  const [expandedSidebarGroups, setExpandedSidebarGroups] = useState<Record<string, boolean>>(() => {
    const activeGroup = MODULE_GROUPS.find((g) => g.modules.some((module) => module.id === selectedModuleId));
    const initial: Record<string, boolean> = {};
    MODULE_GROUPS.forEach((g) => {
      initial[g.id] = activeGroup ? activeGroup.id === g.id : false;
    });
    return initial;
  });

  useEffect(() => {
    const parentGroup = MODULE_GROUPS.find((g) => g.modules.some((module) => module.id === selectedModuleId));
    if (parentGroup) {
      setExpandedSidebarGroups((prev) => ({
        ...prev,
        [parentGroup.id]: true,
      }));
    }
  }, [selectedModuleId]);

  const toggleSidebarGroup = (groupId: string) => {
    setExpandedSidebarGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  };
  const selectedModule =
    RBAC_PERMISSION_MODULES.find((module) => module.id === selectedModuleId) ??
    RBAC_PERMISSION_MODULES[0];
  const summaries = useMemo(() => buildRoleSummaries(permissions), [permissions]);
  const pendingChanges = useMemo(
    () => buildPermissionChanges(permissions, savedPermissions),
    [permissions, savedPermissions],
  );
  const isDirty = pendingChanges.length > 0;
  const activeWarnings = buildModuleWarnings(activeRole, permissions);

  return (
    <div className="space-y-6">
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1.5">
          <h2 className="text-lg font-bold text-surface-900 tracking-tight">
            Permission RBAC
          </h2>
          <p className="text-sm text-surface-500 leading-relaxed">
            Atur akses Admin, Kasir, Sales, dan Inventaris. Akses Owner selalu penuh dan tidak bisa diedit.
          </p>
          <div className="inline-flex items-center gap-2 rounded-lg border border-surface-100 bg-surface-50 px-3 py-1.5">
            <Info className="h-3.5 w-3.5 text-surface-400 shrink-0" />
            <p className="text-xs text-surface-500">
              Akses halaman, data, dan tindakan diatur terpisah. Sesuaikan ketiganya agar aktivitas yang dibutuhkan bisa dipakai.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge isDirty={isDirty} saved={saved} />
          <button
            type="button"
            onClick={onRequestSaveReview}
            disabled={isSaving || !isDirty || saveBlocked}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 text-sm font-bold text-white shadow-sm transition-all duration-200 hover:bg-brand-700 hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
            aria-label="Review dan simpan perubahan permission"
          >
            {isSaving ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Review & Simpan
          </button>
        </div>
      </div>

      {/* ── Error Alert ──────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <ShieldAlert className="h-5 w-5 text-red-500 shrink-0" />
          <p className="text-sm font-medium text-red-700">{error}</p>
        </div>
      )}

      {/* ── Role Summary Cards ───────────────────────────────────────── */}
      <section className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-surface-400">
          Ringkasan Role
        </h3>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {summaries.map((summary) => {
            const colors = ROLE_COLORS[summary.role];
            const isActive = activeRole === summary.role;
            const totalPages = Object.keys(permissions[summary.role].pages).length;
            const pagesPercent = totalPages > 0 ? Math.round((summary.enabledPages / totalPages) * 100) : 0;

            return (
              <button
                key={summary.role}
                type="button"
                onClick={() => onActiveRoleChange(summary.role)}
                aria-label={`Pilih role ${ROLE_LABELS[summary.role]}`}
                className={`group relative overflow-hidden rounded-xl border p-4 text-left transition-all duration-200 cursor-pointer ${
                  isActive
                    ? `${colors.border} ${colors.bg} shadow-sm`
                    : "border-surface-100 bg-white hover:border-surface-200 hover:shadow-sm"
                }`}
              >
                {/* Gradient left accent bar */}
                <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-xl bg-gradient-to-b ${colors.gradient} transition-opacity duration-200 ${isActive ? "opacity-100" : "opacity-30 group-hover:opacity-60"}`} />

                <div className="flex items-center justify-between gap-3 pl-2">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${colors.dot}`} />
                    <span className={`font-bold ${isActive ? colors.text : "text-surface-900"}`}>
                      {ROLE_LABELS[summary.role]}
                    </span>
                  </div>
                  {summary.warningCount > 0 ? (
                    <ShieldAlert className="h-4.5 w-4.5 text-amber-500" />
                  ) : (
                    <ShieldCheck className="h-4.5 w-4.5 text-emerald-500" />
                  )}
                </div>

                {/* Stats */}
                <div className="mt-3 pl-2 space-y-2">
                  {/* Progress bar for pages */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs text-surface-500">
                      <span className="flex items-center gap-1">
                        <FileText className="h-3 w-3" />
                        {summary.enabledPages} halaman
                      </span>
                      <span>{pagesPercent}%</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-surface-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full bg-gradient-to-r ${colors.gradient} transition-all duration-300`}
                        style={{ width: `${pagesPercent}%` }}
                      />
                    </div>
                  </div>
                  {/* Bottom stats row */}
                  <div className="flex items-center gap-3 text-xs text-surface-500">
                    <span className="flex items-center gap-1">
                      <Pencil className="h-3 w-3" />
                      {summary.enabledActions} aksi
                    </span>
                    {summary.customizationCount > 0 && (
                      <span className="rounded-full bg-surface-100 px-1.5 py-0.5 text-[10px] font-semibold text-surface-600">
                        {summary.customizationCount} custom
                      </span>
                    )}
                    {summary.warningCount > 0 && (
                      <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                        {summary.warningCount} sensitif
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Module Matrix ────────────────────────────────────────────── */}
      <section className="border border-surface-100 rounded-xl bg-white shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setIsMatrixExpanded(!isMatrixExpanded)}
          aria-expanded={isMatrixExpanded}
          aria-controls="rbac-module-matrix"
          className="w-full flex items-center justify-between px-5 py-4 text-left font-bold text-surface-900 hover:bg-surface-50/50 transition-colors focus:outline-none cursor-pointer"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-surface-100 flex items-center justify-center text-surface-600">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div>
              <span className="block text-sm font-extrabold text-surface-900 tracking-tight">Matrix Modul</span>
              <span className="block text-xs text-surface-400 font-medium mt-0.5">Tinjau ringkasan hak akses seluruh role</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-surface-100 px-2.5 py-0.5 text-[10px] font-bold text-surface-600">
              {RBAC_PERMISSION_MODULES.length} Modul
            </span>
            <ChevronDown className={`h-4 w-4 text-surface-400 transition-transform duration-200 ${isMatrixExpanded ? "rotate-180" : ""}`} />
          </div>
        </button>

        {isMatrixExpanded && (
          <div id="rbac-module-matrix" className="border-t border-surface-100 overflow-x-auto">
            {/* Scroll hint gradient on mobile */}
            <div className="relative">
              <table className="min-w-full divide-y divide-surface-100 text-sm">
                <thead>
                  <tr className="bg-surface-50/80">
                    <th className="px-4 py-3.5 text-left text-xs font-bold uppercase tracking-wider text-surface-400">
                      Modul
                    </th>
                    {EDITABLE_ROLES.map((role) => (
                      <th key={role} className="px-4 py-3.5 text-left text-xs font-bold uppercase tracking-wider text-surface-400">
                        <span className="flex items-center gap-1.5">
                          <span className={`h-2 w-2 rounded-full ${ROLE_COLORS[role].dot}`} />
                          {ROLE_LABELS[role]}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-50">
                  {RBAC_PERMISSION_MODULES.map((module, idx) => (
                    <tr
                      key={module.id}
                      className={`transition-colors hover:bg-surface-50/50 ${idx % 2 === 1 ? "bg-surface-50/30" : ""}`}
                    >
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => {
                            onSelectedModuleChange(module.id);
                            document.getElementById("permission-editor")?.scrollIntoView({ behavior: "smooth" });
                          }}
                          className="group flex items-start gap-2 text-left cursor-pointer"
                          aria-label={`Lihat detail modul ${module.label}`}
                        >
                          <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${SENSITIVITY_STYLES[module.sensitivity].dot}`} />
                          <div>
                            <span className="font-semibold text-surface-900 group-hover:text-brand-600 transition-colors duration-150">
                              {module.label}
                            </span>
                            <span className="block text-xs text-surface-400 mt-0.5 leading-relaxed">
                              {module.description}
                            </span>
                          </div>
                        </button>
                      </td>
                      {EDITABLE_ROLES.map((role) => (
                        <td key={role} className="px-4 py-3">
                          <ModuleAccessBadge module={module} role={role} permissions={permissions} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* ── Permission Editor ────────────────────────────────────────── */}
      <section id="permission-editor" className="scroll-mt-6 rounded-xl border border-surface-100 bg-white shadow-sm overflow-hidden">
        {/* Section header */}
        <div className="border-b border-surface-100 bg-surface-50/50 px-5 py-4">
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${SENSITIVITY_STYLES[selectedModule.sensitivity].dot}`} />
            <h3 className="text-base font-bold text-surface-900">{selectedModule.label}</h3>
            <span className={`ml-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
              selectedModule.sensitivity === "critical"
                ? "bg-red-100 text-red-700"
                : selectedModule.sensitivity === "sensitive"
                  ? "bg-amber-100 text-amber-700"
                  : "bg-emerald-100 text-emerald-700"
            }`}>
              {SENSITIVITY_STYLES[selectedModule.sensitivity].label}
            </span>
          </div>
          <p className="text-sm text-surface-500 mt-1">{selectedModule.description}</p>
        </div>

        <div className="p-5 space-y-5">
          <div className="space-y-1.5">
            <label htmlFor="rbac-module-search" className="block text-sm font-semibold text-surface-700">Cari modul hak akses</label>
            <input id="rbac-module-search" type="search" value={moduleSearch} onChange={(event) => setModuleSearch(event.target.value)}
              aria-label="Cari modul hak akses" placeholder="Cari nama modul atau aktivitas…"
              className="w-full rounded-xl border border-surface-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20" />
            {filteredGroups.length === 0 && <p role="status" className="text-sm text-surface-500">Modul belum ditemukan. Coba nama lain, ya.</p>}
          </div>
          {/* Warnings */}
          {activeWarnings.length > 0 && (
            <div className="space-y-2">
              {activeWarnings.map((warning) => (
                <div
                  key={`${warning.role}-${warning.moduleId}-${warning.message}`}
                  className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5"
                >
                  <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-800">{warning.message}</p>
                </div>
              ))}
            </div>
          )}

          {/* Mobile & Tablet Dropdown Selector */}
          <div className="lg:hidden w-full">
            <label htmlFor="module-select" className="block text-xs font-bold text-surface-400 uppercase tracking-wider mb-1.5">
              Pilih Modul
            </label>
            <div className="relative">
              <select
                id="module-select"
                value={selectedModule.id}
                onChange={(e) => onSelectedModuleChange(e.target.value)}
                className="w-full px-4 py-2.5 pr-10 rounded-xl border border-surface-200 bg-white text-sm font-semibold text-surface-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all appearance-none cursor-pointer"
              >
                {moduleSearch.trim() && !filteredGroups.some((group) => group.modules.some((module) => module.id === selectedModule.id)) && <option value={selectedModule.id} hidden>{selectedModule.label} (sedang dipilih)</option>}
                {filteredGroups.map((group) => {
                  const groupModules = group.modules;
                  if (groupModules.length === 0) return null;

                  return (
                    <optgroup key={group.id} label={group.label}>
                      {groupModules.map((module) => {
                        const enabledCount = getModuleEnabledCount(module, activeRole, permissions);
                        const countSuffix = enabledCount > 0 ? ` (${enabledCount} aktif)` : "";
                        return (
                          <option key={module.id} value={module.id}>
                            {module.label}{countSuffix}
                          </option>
                        );
                      })}
                    </optgroup>
                  );
                })}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-surface-400">
                <ChevronDown className="h-4 w-4" />
              </div>
            </div>
          </div>

          {/* Two-column layout: sidebar + editor */}
          <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
            {/* Desktop Sidebar (Grouped & Collapsible Accordion Dropdowns) */}
            <div className="hidden lg:block space-y-2 lg:border-r lg:border-surface-100 lg:pr-5 max-h-[70vh] overflow-y-auto pr-1">
              {filteredGroups.map((group) => {
                const groupModules = group.modules;
                if (groupModules.length === 0) return null;
                const isExpanded = moduleSearch.trim() ? true : !!expandedSidebarGroups[group.id];

                return (
                  <div key={group.id} className="space-y-1">
                    <button
                      type="button"
                      onClick={() => toggleSidebarGroup(group.id)}
                      aria-expanded={isExpanded}
                      aria-controls={`rbac-group-${group.id}`}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-left text-[10px] font-black text-surface-400 uppercase tracking-widest hover:bg-surface-50 hover:text-surface-600 transition-colors focus:outline-none cursor-pointer select-none"
                    >
                      <span>{group.label}</span>
                      <ChevronDown
                        className={`h-3 w-3 text-surface-400 transition-transform duration-200 ${
                          isExpanded ? "rotate-180" : ""
                        }`}
                      />
                    </button>
                    {isExpanded && (
                      <div id={`rbac-group-${group.id}`} className="space-y-0.5 pl-1.5 border-l border-surface-100 ml-3">
                        {groupModules.map((module) => {
                          const isSelected = selectedModule.id === module.id;
                          const enabledCount = getModuleEnabledCount(module, activeRole, permissions);

                          return (
                            <button
                              key={module.id}
                              type="button"
                              onClick={() => onSelectedModuleChange(module.id)}
                              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-all duration-150 cursor-pointer ${
                                isSelected
                                  ? "bg-brand-50 font-semibold text-brand-700 shadow-sm border border-brand-100"
                                  : "text-surface-600 hover:bg-surface-50 hover:text-surface-800 border border-transparent"
                              }`}
                              aria-label={`Modul ${module.label}`}
                              aria-current={isSelected ? "true" : undefined}
                            >
                              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${SENSITIVITY_STYLES[module.sensitivity].dot}`} />
                              <span className="flex-1 truncate">{module.label}</span>
                              {enabledCount > 0 && (
                                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                                  isSelected
                                    ? "bg-brand-100 text-brand-700"
                                    : "bg-surface-100 text-surface-500"
                                }`}>
                                  {enabledCount}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Editor panel */}
            <div className="space-y-5">
              {/* Role selector tabs */}
              <div className="flex flex-wrap gap-1 rounded-xl border border-surface-100 bg-surface-50 p-1">
                {EDITABLE_ROLES.map((role) => {
                  const colors = ROLE_COLORS[role];
                  const isActive = activeRole === role;

                  return (
                    <button
                      key={role}
                      type="button"
                      onClick={() => onActiveRoleChange(role)}
                      className={`inline-flex min-h-[44px] items-center gap-2 rounded-lg px-4 text-sm font-semibold transition-all duration-200 cursor-pointer ${
                        isActive
                          ? `bg-white ${colors.text} shadow-sm`
                          : "text-surface-500 hover:text-surface-700 hover:bg-white/50"
                      }`}
                      aria-label={`Pilih role ${ROLE_LABELS[role]}`}
                      aria-pressed={isActive}
                    >
                      <span className={`h-2 w-2 rounded-full ${colors.dot} ${isActive ? "" : "opacity-40"}`} />
                      {ROLE_LABELS[role]}
                    </button>
                  );
                })}
              </div>

              {/* Permission editor */}
              <ModulePermissionEditor
                module={selectedModule}
                role={activeRole}
                permissions={permissions}
                onPagePermissionChange={onPagePermissionChange}
                onResourcePermissionChange={onResourcePermissionChange}
              />
              {(selectedModule.id === "transaction-approval" || selectedModule.id === "pos") && (
                <section className="space-y-3 rounded-xl border border-surface-100 bg-surface-50/50 p-4" aria-label="Pratinjau aktivitas Riwayat">
                  <h4 className="text-sm font-bold text-surface-900">Pratinjau aktivitas Riwayat</h4>
                  <p className="text-xs text-surface-600">Akses halaman hanya membuka menu. Data dan tindakan memerlukan izin masing-masing. Pratinjau ini menilai izin; status transaksi dan batas data tetap berlaku.</p>
                  <button type="button" onClick={() => { setModuleSearch(""); onSelectedModuleChange(selectedModule.id === "pos" ? "transaction-approval" : "pos"); }} className="text-sm font-semibold text-brand-700 underline underline-offset-2">
                    {selectedModule.id === "pos" ? "Atur akses halaman Riwayat dan persetujuan" : "Atur Lihat / Ubah transaksi di Kasir / POS"}
                  </button>
                  <ul className="space-y-2">
                    {buildEffectiveActivities(activeRole, permissions).map((activity) => <li key={activity.id} className="text-sm text-surface-700">
                      <span className="font-semibold">{activity.label}: </span>{activity.available ? "Izin lengkap" : "Belum bisa dipakai"}
                      {activity.missing.length > 0 && <p className="mt-0.5 text-xs text-amber-800">Perlu {activity.missing.map((item) => item.label).join(" + ")}.</p>}
                      {activity.note && <p className="mt-0.5 text-xs text-surface-500">{activity.note}</p>}
                    </li>)}
                  </ul>
                </section>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Review Modal ─────────────────────────────────────────────── */}
      {isReviewOpen && (
        <PermissionReviewModal
          changes={pendingChanges}
          isSaving={isSaving}
          isSensitiveConfirmOpen={isSensitiveConfirmOpen}
          onCloseReview={onCloseReview}
          onConfirmReview={onConfirmReview}
          onCancelSensitiveConfirm={onCancelSensitiveConfirm}
          onConfirmSensitiveSave={onConfirmSensitiveSave}
        />
      )}
    </div>
  );
}

/* ─── Status Badge ──────────────────────────────────────────────────────────── */

function StatusBadge({ isDirty, saved }: { isDirty: boolean; saved: boolean }) {
  const config = isDirty
    ? { border: "border-amber-200", bg: "bg-amber-50", text: "text-amber-700", icon: AlertTriangle, label: "Belum disimpan" }
    : saved
      ? { border: "border-emerald-200", bg: "bg-emerald-50", text: "text-emerald-700", icon: CheckCircle2, label: "Tersimpan" }
      : { border: "border-surface-200", bg: "bg-white", text: "text-surface-600", icon: CheckCircle2, label: "Sinkron" };

  const Icon = config.icon;

  return (
    <span
      className={`inline-flex min-h-[36px] items-center gap-2 rounded-lg border px-3 text-sm font-semibold transition-all duration-200 ${config.border} ${config.bg} ${config.text} ${
        isDirty ? "animate-pulse" : ""
      }`}
    >
      <Icon className="h-4 w-4" />
      {config.label}
    </span>
  );
}

/* ─── Module Access Badge ───────────────────────────────────────────────────── */

function ModuleAccessBadge({
  module,
  role,
  permissions,
}: {
  module: RbacPermissionModule;
  role: EditableRole;
  permissions: RolePermissions;
}) {
  const hasPageAccess = module.pageTargets.some((page) => permissions[role].pages[page]);
  const enabledActions = countSupportedResourceActions(module.resourceTargets, role, permissions);
  const hasAccess = hasPageAccess || enabledActions > 0;

  if (!hasAccess) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-surface-100 bg-surface-50 px-2.5 py-1 text-xs font-medium text-surface-400">
        <Lock className="h-3 w-3" />
        Belum ada akses
      </span>
    );
  }

  const isSensitive = module.sensitivity !== "normal";
  const baseTone = isSensitive
    ? "border-amber-200 bg-amber-50 text-amber-700"
    : "border-emerald-200 bg-emerald-50 text-emerald-700";

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${baseTone}`}>
      {hasPageAccess && (
        <span className="flex items-center gap-0.5">
          <FileText className="h-3 w-3" />
          Halaman
        </span>
      )}
      {hasPageAccess && enabledActions > 0 && <span className="text-current/40">+</span>}
      {enabledActions > 0 && (
        <span className="flex items-center gap-0.5">
          <Pencil className="h-3 w-3" />
          {enabledActions} aksi
        </span>
      )}
    </span>
  );
}

/* ─── Toggle Switch ─────────────────────────────────────────────────────────── */

function ToggleSwitch({
  checked,
  onChange,
  label,
  id,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  id?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 cursor-pointer ${
        checked ? "bg-brand-600" : "bg-surface-200"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ease-in-out ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

/* ─── Module Permission Editor ──────────────────────────────────────────────── */

function ModulePermissionEditor({
  module,
  role,
  permissions,
  onPagePermissionChange,
  onResourcePermissionChange,
}: {
  module: RbacPermissionModule;
  role: EditableRole;
  permissions: RolePermissions;
  onPagePermissionChange: (role: EditableRole, target: string, allowed: boolean) => void;
  onResourcePermissionChange: (
    role: EditableRole,
    target: string,
    action: ResourceAction,
    allowed: boolean,
  ) => void;
}) {
  return (
    <div className="space-y-5">
      {/* Page access toggles */}
      {module.pageTargets.length > 0 && (
        <div className="space-y-2.5">
          <h4 className="text-xs font-bold uppercase tracking-wider text-surface-400 flex items-center gap-1.5">
            <Eye className="h-3.5 w-3.5" />
            Akses Halaman
          </h4>
          <p className="text-xs text-surface-500">Akses halaman hanya membuka menu. Izin data dan tindakan diatur terpisah di bawah.</p>
          <div className="space-y-2">
            {module.pageTargets.map((page) => {
              const isChecked = permissions[role].pages[page] ?? false;

              return (
                <div
                  key={page}
                  className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 transition-all duration-150 ${
                    isChecked
                      ? "border-brand-100 bg-brand-50/40"
                      : "border-surface-100 bg-white hover:border-surface-200"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <FileText className={`h-4 w-4 shrink-0 ${isChecked ? "text-brand-500" : "text-surface-400"}`} />
                    <div>
                      <span className={`text-sm font-medium ${isChecked ? "text-surface-900" : "text-surface-600"}`}>
                        Akses halaman {module.label}
                      </span>
                      <span className="block text-xs text-surface-400 mt-0.5">{page}</span>
                    </div>
                  </div>
                  <ToggleSwitch
                    checked={isChecked}
                    onChange={(newVal) => onPagePermissionChange(role, page, newVal)}
                    label={`${ROLE_LABELS[role]} akses halaman ${module.label} (${page})`}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Resource action table */}
      {module.resourceTargets.length > 0 && (
        <div className="space-y-2.5">
          <h4 className="text-xs font-bold uppercase tracking-wider text-surface-400 flex items-center gap-1.5">
            <Pencil className="h-3.5 w-3.5" />
            Izin Data dan Tindakan
          </h4>
          {module.pageTargets.length > 0 && <p className="text-xs text-surface-500">Untuk memakai fitur dari menu ini, aktifkan akses halaman serta izin Lihat data yang sesuai.</p>}
          {module.groupId === "inventory" && module.pageTargets.length === 0 && <p className="text-xs text-surface-500">Aktivitas ini dibuka dari Inventory. Aktifkan akses halaman Inventory dan Lihat data gudang di modul Inventory.</p>}
          {module.id === "price-logs" && <p className="text-xs text-surface-500">Riwayat harga dibuka dari halaman Produk dengan izin Lihat produk.</p>}
          <div className="overflow-x-auto rounded-xl border border-surface-100">
            <table className="min-w-full divide-y divide-surface-100 text-sm">
              <thead>
                <tr className="bg-surface-50/80">
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-surface-400">
                    Resource
                  </th>
                  {ACTIONS.map((action) => (
                    <th key={action} className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider text-surface-400">
                      {ACTION_LABELS[action]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-50 bg-white">
                {module.resourceTargets.map((resource, idx) => (
                  <tr key={resource} className={idx % 2 === 1 ? "bg-surface-50/30" : ""}>
                    <td className="px-4 py-3">
                      <span className="font-semibold text-surface-800">
                        {RBAC_RESOURCE_METADATA[resource]?.label ?? resource}
                      </span>
                      {RBAC_RESOURCE_METADATA[resource]?.guidance && <p className="mt-1 max-w-xs text-[11px] font-normal text-surface-500">{RBAC_RESOURCE_METADATA[resource].guidance}</p>}
                      {RBAC_RESOURCE_METADATA[resource]?.ownerOnlyReason && <p className="mt-1 max-w-xs text-xs text-amber-800"><strong>Khusus Owner.</strong> {RBAC_RESOURCE_METADATA[resource].ownerOnlyReason}</p>}
                      <details className="mt-1 text-[11px] text-surface-500"><summary className="cursor-pointer">Detail teknis</summary><code>{resource}</code></details>
                    </td>
                    {ACTIONS.map((action) => {
                      const isChecked = permissions[role].resources[resource]?.[action] ?? false;
                      const metadata = RBAC_RESOURCE_METADATA[resource];
                      if (metadata?.ownerOnlyReason || !metadata?.actions.includes(action)) {
                        return <td key={action} className="px-4 py-3 text-center text-surface-300">—</td>;
                      }

                      return (
                        <td key={action} className="px-4 py-3 text-center">
                          <div className="flex justify-center">
                            <ToggleSwitch
                              checked={isChecked}
                              onChange={(newVal) =>
                                onResourcePermissionChange(role, resource, action, newVal)
                              }
                              label={`${ROLE_LABELS[role]} ${metadata.actionLabels?.[action] ?? ACTION_LABELS[action]} ${metadata.label}`}
                            />
                          </div>
                          {metadata.actionLabels?.[action] && <span className="mt-1 block text-[10px] text-surface-500">{metadata.actionLabels[action]}</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Review Modal ──────────────────────────────────────────────────────────── */

function PermissionReviewModal({
  changes,
  isSaving,
  isSensitiveConfirmOpen,
  onCloseReview,
  onConfirmReview,
  onCancelSensitiveConfirm,
  onConfirmSensitiveSave,
}: {
  changes: PermissionChange[];
  isSaving: boolean;
  isSensitiveConfirmOpen: boolean;
  onCloseReview: () => void;
  onConfirmReview: () => void;
  onCancelSensitiveConfirm: () => void;
  onConfirmSensitiveSave: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeReviewRef = useRef(onCloseReview);
  closeReviewRef.current = onCloseReview;
  useEffect(() => {
    if (dialogRef.current) return bindDialogFocus(dialogRef.current, () => closeReviewRef.current());
  }, []);
  const sensitiveChanges = changes.filter((change) => change.requiresConfirmation);
  const normalChanges = changes.filter((change) => !change.requiresConfirmation);

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Review perubahan permission"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-surface-900/40 backdrop-blur-sm animate-fade-in"
        onClick={onCloseReview}
        aria-hidden="true"
      />

      {/* Modal panel */}
      <div className="relative w-full max-w-lg mx-4 mb-4 sm:mb-0 bg-white rounded-2xl shadow-xl border border-surface-100 overflow-hidden animate-slide-up max-h-[85vh] flex flex-col">
        {/* Modal header */}
        <div className="flex items-start justify-between gap-3 border-b border-surface-100 px-5 py-4 bg-surface-50/50">
          <div>
            <h3 className="text-base font-bold text-surface-900">
              Review perubahan permission
            </h3>
            <p className="text-sm text-surface-500 mt-0.5">
              Periksa perubahan sebelum disimpan.
            </p>
          </div>
          <button
            type="button"
            onClick={onCloseReview}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-surface-400 hover:bg-surface-100 hover:text-surface-600 transition-colors cursor-pointer"
            aria-label="Tutup review"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {changes.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-surface-400">
              <CheckCircle2 className="h-10 w-10 mb-2" />
              <p className="text-sm font-medium">Tidak ada perubahan permission.</p>
            </div>
          ) : (
            <>
              {sensitiveChanges.length > 0 && (
                <ChangeList title="Perubahan sensitif / kritis" changes={sensitiveChanges} variant="sensitive" />
              )}
              {normalChanges.length > 0 && (
                <ChangeList title="Perubahan normal" changes={normalChanges} variant="normal" />
              )}
            </>
          )}

          {/* Sensitive confirmation */}
          {isSensitiveConfirmOpen && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3 animate-fade-in">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-amber-900">Konfirmasi perubahan sensitif</h4>
                  <p className="mt-1 text-sm text-amber-800 leading-relaxed">
                    Anda sudah meninjau akses sensitif atau kritis yang akan berubah.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={onCancelSensitiveConfirm}
                  className="inline-flex min-h-[40px] items-center rounded-lg border border-amber-200 bg-white px-4 text-sm font-bold text-amber-800 transition-colors hover:bg-amber-50 cursor-pointer"
                >
                  Kembali review
                </button>
                <button
                  type="button"
                  onClick={onConfirmSensitiveSave}
                  disabled={isSaving}
                  className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-amber-600 px-4 text-sm font-bold text-white transition-colors hover:bg-amber-700 disabled:opacity-50 cursor-pointer"
                >
                  {isSaving && <RefreshCw className="h-4 w-4 animate-spin" />}
                  Konfirmasi simpan
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal footer */}
        {!isSensitiveConfirmOpen && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-surface-100 px-5 py-4 bg-surface-50/30">
            <button
              type="button"
              onClick={onCloseReview}
              className="inline-flex min-h-[44px] items-center rounded-xl border border-surface-200 bg-white px-5 text-sm font-bold text-surface-700 transition-all duration-150 hover:bg-surface-50 cursor-pointer"
              aria-label="Tutup"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={onConfirmReview}
              disabled={isSaving || changes.length === 0}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-brand-600 px-5 text-sm font-bold text-white transition-all duration-150 hover:bg-brand-700 disabled:opacity-50 cursor-pointer"
            >
              {isSaving && <RefreshCw className="h-4 w-4 animate-spin" />}
              Lanjut simpan
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Change List ───────────────────────────────────────────────────────────── */

function ChangeList({
  title,
  changes,
  variant,
}: {
  title: string;
  changes: PermissionChange[];
  variant: "sensitive" | "normal";
}) {
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-bold uppercase tracking-wider text-surface-400 flex items-center gap-1.5">
        {variant === "sensitive" && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
        {title}
      </h4>
      <div className="rounded-xl border border-surface-100 bg-white overflow-hidden divide-y divide-surface-50">
        {changes.map((change) => {
          const presentation = buildPermissionPresentation(change);
          return (
          <div
            key={`${change.role}-${change.scope}-${change.target}-${change.action}`}
            className="flex items-center gap-3 px-4 py-2.5 text-sm"
          >
            {/* Role */}
            <span className="flex items-center gap-1.5 min-w-[72px]">
              <span className={`h-2 w-2 rounded-full ${ROLE_COLORS[change.role].dot}`} />
              <span className="font-semibold text-surface-800">
                {ROLE_LABELS[change.role]}
              </span>
            </span>
            {/* Module */}
            <span className="text-surface-500 min-w-[100px] hidden md:block">
              {change.moduleLabel}
            </span>
            <div className="min-w-0 flex-1 text-xs text-surface-600">
              <p className="font-medium leading-relaxed">{presentation.label}</p>
              <details className="mt-1 text-surface-500"><summary className="cursor-pointer">Detail teknis</summary><code>{presentation.technicalId}</code></details>
            </div>
            {/* Direction arrow */}
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${
                change.direction === "added"
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-red-50 text-red-700"
              }`}
            >
              {change.direction === "added" ? (
                <>
                  <ArrowRight className="h-3 w-3" />
                  Ditambahkan
                </>
              ) : (
                <>
                  <X className="h-3 w-3" />
                  Dihapus
                </>
              )}
            </span>
          </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Helpers ───────────────────────────────────────────────────────────────── */

function getModuleEnabledCount(
  module: RbacPermissionModule,
  role: EditableRole,
  permissions: RolePermissions,
): number {
  const pages = module.pageTargets.filter((page) => permissions[role].pages[page]).length;
  const actions = countSupportedResourceActions(module.resourceTargets, role, permissions);
  return pages + actions;
}
