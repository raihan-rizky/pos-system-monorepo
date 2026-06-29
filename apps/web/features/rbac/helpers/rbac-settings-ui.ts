import {
  ACTIONS,
  EDITABLE_ROLES,
  PAGE_TARGETS,
  RESOURCE_TARGETS,
  buildDefaultRolePermissions,
} from "./rbac-core";
import type {
  EditableRole,
  PermissionScope,
  ResourceAction,
  RolePermissions,
} from "./rbac-core";

export type PermissionSensitivity = "normal" | "sensitive" | "critical";

export type RbacPermissionModule = {
  id: string;
  label: string;
  description: string;
  pageTargets: string[];
  resourceTargets: string[];
  sensitivity: PermissionSensitivity;
};

export type PermissionChange = {
  role: EditableRole;
  moduleId: string;
  moduleLabel: string;
  sensitivity: PermissionSensitivity;
  requiresConfirmation: boolean;
  scope: PermissionScope;
  target: string;
  action: ResourceAction | "access";
  before: boolean;
  after: boolean;
  direction: "added" | "removed";
};

export type RoleSummary = {
  role: EditableRole;
  enabledPages: number;
  enabledActions: number;
  customizationCount: number;
  warningCount: number;
};

export type ModuleWarning = {
  role: EditableRole;
  moduleId: string;
  moduleLabel: string;
  severity: "warning" | "critical";
  message: string;
};

export const RBAC_PERMISSION_MODULES: RbacPermissionModule[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    description: "Ringkasan performa toko.",
    pageTargets: ["/dashboard"],
    resourceTargets: [],
    sensitivity: "normal",
  },
  {
    id: "finance-report",
    label: "Laporan Keuangan",
    description: "Laporan omzet dan pemasukan.",
    pageTargets: ["/financial-report"],
    resourceTargets: ["financial-report", "income"],
    sensitivity: "sensitive",
  },
  {
    id: "pos",
    label: "Kasir / POS",
    description: "Checkout, nota, dan draft transaksi.",
    pageTargets: ["/pos"],
    resourceTargets: ["transaction", "transaction.request", "transaction.draft"],
    sensitivity: "normal",
  },
  {
    id: "transaction-approval",
    label: "Approval Transaksi",
    description: "Persetujuan, penolakan, dan pembatalan transaksi.",
    pageTargets: ["/history"],
    resourceTargets: ["transaction.approve"],
    sensitivity: "critical",
  },
  {
    id: "production",
    label: "Produksi",
    description: "Status dan aktivitas pekerjaan produksi.",
    pageTargets: ["/production"],
    resourceTargets: ["production"],
    sensitivity: "normal",
  },
  {
    id: "customers",
    label: "Pelanggan",
    description: "Data pelanggan dan piutang.",
    pageTargets: ["/customers"],
    resourceTargets: ["customer"],
    sensitivity: "normal",
  },
  {
    id: "products",
    label: "Produk",
    description: "Data produk, harga jual, dan stok produk.",
    pageTargets: ["/products"],
    resourceTargets: ["product"],
    sensitivity: "normal",
  },
  {
    id: "price-logs",
    label: "Price Logs / HPP",
    description: "Riwayat perubahan harga dan HPP.",
    pageTargets: [],
    resourceTargets: ["product.price_log"],
    sensitivity: "sensitive",
  },
  {
    id: "suppliers",
    label: "Supplier",
    description: "Data supplier dan permintaan belanja.",
    pageTargets: ["/suppliers"],
    resourceTargets: ["supplier"],
    sensitivity: "normal",
  },
  {
    id: "salespersons",
    label: "Salesperson",
    description: "Data salesperson dan komisi operasional.",
    pageTargets: ["/salespersons"],
    resourceTargets: ["salesperson"],
    sensitivity: "normal",
  },
  {
    id: "shift",
    label: "Shift Kasir",
    description: "Buka, tutup, dan rekonsiliasi shift.",
    pageTargets: ["/shift"],
    resourceTargets: ["shift"],
    sensitivity: "normal",
  },
  {
    id: "whatsapp",
    label: "WhatsApp",
    description: "Chat pelanggan dan auto-reply.",
    pageTargets: ["/wa"],
    resourceTargets: ["whatsapp"],
    sensitivity: "sensitive",
  },
  {
    id: "settings",
    label: "Settings / RBAC",
    description: "Pengaturan toko, WhatsApp, dan permission.",
    pageTargets: ["/settings"],
    resourceTargets: ["settings", "rbac"],
    sensitivity: "critical",
  },
  {
    id: "keuangan",
    label: "Keuangan Harian",
    description: "Pengeluaran dan kas operasional.",
    pageTargets: ["/keuangan"],
    resourceTargets: ["expense"],
    sensitivity: "sensitive",
  },
  {
    id: "help",
    label: "Bantuan",
    description: "Dokumentasi bantuan aplikasi.",
    pageTargets: ["/help"],
    resourceTargets: [],
    sensitivity: "normal",
  },
  {
    id: "inventory",
    label: "Inventory",
    description: "Workspace stok dan aktivitas gudang.",
    pageTargets: ["/inventory"],
    resourceTargets: ["inventory"],
    sensitivity: "normal",
  },
  {
    id: "inventory-approval",
    label: "Approval Inventory",
    description: "Persetujuan perubahan stok dan penerimaan.",
    pageTargets: [],
    resourceTargets: ["inventory.approve"],
    sensitivity: "critical",
  },
  {
    id: "surat-jalan",
    label: "Surat Jalan",
    description: "Pembuatan dan approval surat jalan.",
    pageTargets: [],
    resourceTargets: ["surat_jalan"],
    sensitivity: "normal",
  },
];

export function buildRoleSummaries(
  permissions: RolePermissions,
  baseline: RolePermissions = buildDefaultRolePermissions(),
): RoleSummary[] {
  const changes = buildPermissionChanges(permissions, baseline);

  return EDITABLE_ROLES.map((role) => {
    const enabledPages = PAGE_TARGETS.filter((page) => permissions[role].pages[page]).length;
    const enabledActions = RESOURCE_TARGETS.reduce(
      (count, resource) =>
        count + ACTIONS.filter((action) => permissions[role].resources[resource]?.[action]).length,
      0,
    );
    const roleChanges = changes.filter((change) => change.role === role);

    return {
      role,
      enabledPages,
      enabledActions,
      customizationCount: roleChanges.length,
      warningCount: roleChanges.filter((change) => change.requiresConfirmation).length,
    };
  });
}

export function buildPermissionChanges(
  permissions: RolePermissions,
  baseline: RolePermissions = buildDefaultRolePermissions(),
): PermissionChange[] {
  const changes: PermissionChange[] = [];

  for (const role of EDITABLE_ROLES) {
    for (const page of PAGE_TARGETS) {
      const before = baseline[role].pages[page] ?? false;
      const after = permissions[role].pages[page] ?? false;
      if (before !== after) {
        changes.push(makeChange(role, "page", page, "access", before, after));
      }
    }

    for (const resource of RESOURCE_TARGETS) {
      for (const action of ACTIONS) {
        const before = baseline[role].resources[resource]?.[action] ?? false;
        const after = permissions[role].resources[resource]?.[action] ?? false;
        if (before !== after) {
          changes.push(makeChange(role, "resource", resource, action, before, after));
        }
      }
    }
  }

  return changes;
}

export function buildModuleWarnings(
  role: EditableRole,
  permissions: RolePermissions,
): ModuleWarning[] {
  const warnings: ModuleWarning[] = [];

  for (const permissionModule of RBAC_PERMISSION_MODULES) {
    const hasPageAccess = permissionModule.pageTargets.some((page) => permissions[role].pages[page]);
    const hasResourceAccess = permissionModule.resourceTargets.some((resource) =>
      ACTIONS.some((action) => permissions[role].resources[resource]?.[action]),
    );
    const hasResourceRead = permissionModule.resourceTargets.some(
      (resource) => permissions[role].resources[resource]?.read,
    );

    if (permissionModule.pageTargets.length > 0 && !hasPageAccess && hasResourceAccess) {
      warnings.push({
        role,
        moduleId: permissionModule.id,
        moduleLabel: permissionModule.label,
        severity: "warning",
        message: `${permissionModule.label}: actions may work through API calls, but the page is hidden.`,
      });
    }

    if (permissionModule.pageTargets.length > 0 && hasPageAccess && permissionModule.resourceTargets.length > 0 && !hasResourceRead) {
      warnings.push({
        role,
        moduleId: permissionModule.id,
        moduleLabel: permissionModule.label,
        severity: "warning",
        message: `${permissionModule.label}: the page may open, but data or actions may be blocked.`,
      });
    }
  }

  return warnings;
}

export function findModuleForTarget(target: string) {
  return (
    RBAC_PERMISSION_MODULES.find(
      (module) =>
        module.pageTargets.includes(target) || module.resourceTargets.includes(target),
    ) ?? RBAC_PERMISSION_MODULES[0]
  );
}

function makeChange(
  role: EditableRole,
  scope: PermissionScope,
  target: string,
  action: ResourceAction | "access",
  before: boolean,
  after: boolean,
): PermissionChange {
  const permissionModule = findModuleForTarget(target);

  return {
    role,
    moduleId: permissionModule.id,
    moduleLabel: permissionModule.label,
    sensitivity: permissionModule.sensitivity,
    requiresConfirmation: permissionModule.sensitivity !== "normal",
    scope,
    target,
    action,
    before,
    after,
    direction: after ? "added" : "removed",
  };
}
