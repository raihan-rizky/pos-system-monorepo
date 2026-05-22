"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Save, ShieldCheck } from "lucide-react";
import {
  ACTIONS,
  EDITABLE_ROLES,
  PAGE_TARGETS,
  RESOURCE_TARGETS,
  flattenRolePermissions,
  normalizeRolePermissions,
} from "@/features/rbac/helpers/rbac-core";
import type {
  EditableRole,
  PermissionEntry,
  ResourceAction,
  RolePermissions,
} from "@/features/rbac/helpers/rbac-core";

type RbacResponse = {
  permissions: PermissionEntry[];
};

const ROLE_LABELS: Record<EditableRole, string> = {
  ADMIN: "Admin",
  CASHIER: "Kasir",
  SALES: "Sales",
};

export default function RbacTab() {
  const [activeRole, setActiveRole] = useState<EditableRole>("ADMIN");
  const [permissions, setPermissions] = useState<RolePermissions | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/settings/rbac");
        const data = (await response.json()) as RbacResponse & { message?: string };

        if (!response.ok) {
          throw new Error(data.message || "Gagal memuat pengaturan RBAC");
        }

        if (!cancelled) {
          setPermissions(normalizeRolePermissions(data.permissions));
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

  const activePermissions = permissions?.[activeRole];
  const permissionEntries = useMemo(
    () => (permissions ? flattenRolePermissions(permissions) : []),
    [permissions],
  );

  function setPagePermission(target: string, allowed: boolean) {
    setPermissions((current) => {
      if (!current) return current;
      return {
        ...current,
        [activeRole]: {
          ...current[activeRole],
          pages: {
            ...current[activeRole].pages,
            [target]: allowed,
          },
        },
      };
    });
  }

  function setResourcePermission(target: string, action: ResourceAction, allowed: boolean) {
    setPermissions((current) => {
      if (!current) return current;
      return {
        ...current,
        [activeRole]: {
          ...current[activeRole],
          resources: {
            ...current[activeRole].resources,
            [target]: {
              ...current[activeRole].resources[target],
              [action]: allowed,
            },
          },
        },
      };
    });
  }

  async function saveSettings() {
    if (!permissions) return;
    setIsSaving(true);
    setSaved(false);
    setError(null);

    try {
      const response = await fetch("/api/settings/rbac", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions: permissionEntries }),
      });
      const data = (await response.json()) as RbacResponse & { message?: string };

      if (!response.ok) {
        throw new Error(data.message || "Gagal menyimpan pengaturan RBAC");
      }

      setPermissions(normalizeRolePermissions(data.permissions));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan pengaturan RBAC");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <RefreshCw className="h-6 w-6 animate-spin text-brand-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-surface-900">Permission RBAC</h2>
          <p className="mt-0.5 text-sm text-surface-500">
            Akses Owner tetap. Atur permission untuk role bawaan.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void saveSettings()}
          disabled={isSaving || !permissions}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-bold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saved ? "Tersimpan" : "Simpan"}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </div>
      )}

      <div className="inline-flex rounded-lg border border-surface-200 bg-surface-50 p-1">
        {EDITABLE_ROLES.map((role) => (
          <button
            key={role}
            type="button"
            onClick={() => setActiveRole(role)}
            className={`inline-flex min-h-9 items-center gap-2 rounded-md px-3 text-sm font-semibold transition-colors ${
              activeRole === role
                ? "bg-white text-brand-700 shadow-sm"
                : "text-surface-600 hover:text-surface-900"
            }`}
          >
            <ShieldCheck className="h-4 w-4" />
            {ROLE_LABELS[role]}
          </button>
        ))}
      </div>

      {activePermissions && (
        <>
          <section className="space-y-3">
            <h3 className="text-sm font-bold uppercase tracking-wide text-surface-500">Akses Halaman</h3>
            <div className="overflow-x-auto rounded-lg border border-surface-200">
              <table className="min-w-full divide-y divide-surface-200 text-sm">
                <tbody className="divide-y divide-surface-100 bg-white">
                  {PAGE_TARGETS.map((page) => (
                    <tr key={page}>
                      <td className="px-4 py-3 font-semibold text-surface-800">{page}</td>
                      <td className="w-28 px-4 py-3 text-right">
                        <input
                          type="checkbox"
                          checked={activePermissions.pages[page] ?? false}
                          onChange={(event) => setPagePermission(page, event.target.checked)}
                          className="h-4 w-4 rounded border-surface-300 text-brand-600 focus:ring-brand-500"
                          aria-label={`${ROLE_LABELS[activeRole]} akses ${page}`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-bold uppercase tracking-wide text-surface-500">Aksi Resource</h3>
            <div className="overflow-x-auto rounded-lg border border-surface-200">
              <table className="min-w-full divide-y divide-surface-200 text-sm">
                <thead className="bg-surface-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-bold text-surface-600">Resource</th>
                    {ACTIONS.map((action) => (
                      <th key={action} className="px-4 py-3 text-center font-bold capitalize text-surface-600">
                        {action}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100 bg-white">
                  {RESOURCE_TARGETS.map((resource) => (
                    <tr key={resource}>
                      <td className="px-4 py-3 font-semibold text-surface-800">{resource}</td>
                      {ACTIONS.map((action) => (
                        <td key={action} className="px-4 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={activePermissions.resources[resource]?.[action] ?? false}
                            onChange={(event) =>
                              setResourcePermission(resource, action, event.target.checked)
                            }
                            className="h-4 w-4 rounded border-surface-300 text-brand-600 focus:ring-brand-500"
                            aria-label={`${ROLE_LABELS[activeRole]} ${action} ${resource}`}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
