import {
  ACTIONS,
  EDITABLE_ROLES,
  PAGE_TARGETS,
  RESOURCE_TARGETS,
  TRANSITION_RESOURCE_PERMISSIONS,
  buildDefaultRolePermissions,
} from "./rbac-core";
import type {
  EditableRole,
  PermissionScope,
  ResourceAction,
  RolePermissions,
} from "./rbac-core";
import { buildEffectiveActivities, RBAC_RESOURCE_METADATA } from "./rbac-activity-catalog";
export { buildEffectiveActivities, RBAC_RESOURCE_METADATA, RBAC_HISTORY_ACTIVITIES } from "./rbac-activity-catalog";
export { bindDialogFocus } from "./rbac-dialog-focus";

export type PermissionSensitivity = "normal" | "sensitive" | "critical";

export type RbacPermissionModule = {
  id: string;
  groupId: string;
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
    groupId: "operations",
    label: "Dashboard",
    description: "Ringkasan performa toko.",
    pageTargets: ["/dashboard"],
    resourceTargets: [],
    sensitivity: "normal",
  },
  {
    id: "finance-report",
    groupId: "finance",
    label: "Laporan Keuangan",
    description: "Laporan omzet, ekspor laporan, dan pemasukan manual.",
    pageTargets: ["/financial-report"],
    resourceTargets: ["financial-report", "financial-report.daily-income", "financial-report.daily-outstanding-dp", "financial-report.daily-category", "financial-report.daily-subcategory", "financial-report.daily-payment-method", "financial-report.daily-comparison", "income", "income.manual", "financial-report.export"],
    sensitivity: "sensitive",
  },
  {
    id: "pos",
    groupId: "operations",
    label: "Kasir / POS",
    description: "Checkout, nota, draft transaksi, dan harga khusus di nota.",
    pageTargets: ["/pos"],
    resourceTargets: ["transaction", "transaction.request", "transaction.draft", "transaction.custom_price"],
    sensitivity: "normal",
  },
  {
    id: "transaction-auto-approve",
    groupId: "operations",
    label: "Auto Approve Transaksi",
    description: "Finalisasi transaksi role ini tanpa antrean approval.",
    pageTargets: [],
    resourceTargets: ["transaction.auto_approve"],
    sensitivity: "critical",
  },
  {
    id: "processed-printing-receipts",
    groupId: "operations",
    label: "Edit nota percetakan diproses",
    description: "Mengubah nota yang sudah diproses serta menyesuaikan keuangan, stok bahan, dan piutang. Default hanya Owner; berikan izin Ubah untuk role lain bila diperlukan.",
    pageTargets: [],
    resourceTargets: ["printing_receipt.processed"],
    sensitivity: "critical",
  },
  {
    id: "transaction-approval",
    groupId: "operations",
    label: "Approval Transaksi",
    description: "Persetujuan, penolakan, dan pembatalan transaksi.",
    pageTargets: ["/history"],
    resourceTargets: ["transaction.approve"],
    sensitivity: "critical",
  },
  {
    id: "production",
    groupId: "catalog",
    label: "Produksi",
    description: "Status dan aktivitas pekerjaan produksi.",
    pageTargets: ["/production"],
    resourceTargets: ["production"],
    sensitivity: "normal",
  },
  {
    id: "customers",
    groupId: "crm",
    label: "Pelanggan",
    description: "Data pelanggan dan piutang.",
    pageTargets: ["/customers"],
    resourceTargets: ["customer"],
    sensitivity: "normal",
  },
  {
    id: "products",
    groupId: "catalog",
    label: "Produk",
    description: "Data produk, harga jual, stok produk, dan impor produk.",
    pageTargets: ["/products"],
    resourceTargets: ["product", "product.import"],
    sensitivity: "normal",
  },
  {
    id: "price-logs",
    groupId: "catalog",
    label: "Price Logs / HPP",
    description: "Riwayat perubahan harga dan HPP.",
    pageTargets: [],
    resourceTargets: ["product.price_log"],
    sensitivity: "sensitive",
  },
  {
    id: "suppliers",
    groupId: "catalog",
    label: "Supplier",
    description: "Data supplier dan permintaan belanja.",
    pageTargets: ["/suppliers"],
    resourceTargets: [
      "supplier",
      "supplier.shopping_request.edit",
      "supplier.shopping_request.correct_processed",
      "supplier.shopping_request.delete",
      "supplier.shopping_request.set_approved_qty",
      "supplier.shopping_request.approve_stock",
      "supplier.goods_purchase.approve",
      "supplier.goods_purchase.reject",
    ],
    sensitivity: "normal",
  },
  {
    id: "salespersons",
    groupId: "crm",
    label: "Salesperson",
    description: "Data salesperson dan komisi operasional.",
    pageTargets: ["/salespersons"],
    resourceTargets: ["salesperson"],
    sensitivity: "normal",
  },
  {
    id: "shift",
    groupId: "utils",
    label: "Shift Kasir",
    description: "Buka, tutup, dan rekonsiliasi shift.",
    pageTargets: ["/shift"],
    resourceTargets: ["shift"],
    sensitivity: "normal",
  },
  {
    id: "whatsapp",
    groupId: "utils",
    label: "WhatsApp",
    description: "Chat pelanggan dan auto-reply.",
    pageTargets: ["/wa"],
    resourceTargets: ["whatsapp"],
    sensitivity: "sensitive",
  },
  {
    id: "settings",
    groupId: "utils",
    label: "Settings / RBAC",
    description: "Pengaturan toko, WhatsApp, dan permission.",
    pageTargets: ["/settings"],
    resourceTargets: ["settings", "rbac"],
    sensitivity: "critical",
  },
  {
    id: "price-rounding",
    groupId: "utils",
    label: "Pembulatan Harga",
    description: "Lihat dan ubah kelipatan serta ambang pembulatan harga jual. Default hanya Owner; izin Lihat dan Ubah dapat diberikan ke role lain.",
    pageTargets: [],
    resourceTargets: ["settings.price_rounding"],
    sensitivity: "critical",
  },
  {
    id: "keuangan",
    groupId: "finance",
    label: "Keuangan Harian",
    description: "Pengeluaran dan transfer manual, utang supplier, serta pencairan giro.",
    pageTargets: ["/keuangan"],
    resourceTargets: ["expense", "expense.manual_transfer", "expense.payable", "expense.giro"],
    sensitivity: "sensitive",
  },
  {
    id: "proof-media",
    groupId: "utils",
    label: "Bukti / Media",
    description: "Penghapusan foto bukti tersimpan dan tautan bukti lama.",
    pageTargets: [],
    resourceTargets: ["proof_upload"],
    sensitivity: "critical",
  },
  {
    id: "help",
    groupId: "utils",
    label: "Bantuan",
    description: "Dokumentasi bantuan aplikasi.",
    pageTargets: ["/help"],
    resourceTargets: [],
    sensitivity: "normal",
  },
  {
    id: "changelog",
    groupId: "utils",
    label: "Catatan Perubahan",
    description: "Pembaruan aplikasi, gambar fitur, dan alur penggunaan.",
    pageTargets: ["/changelog"],
    resourceTargets: [],
    sensitivity: "normal",
  },
  {
    id: "inventory",
    groupId: "inventory",
    label: "Inventory",
    description: "Workspace stok, aktivitas gudang, dan perubahan stok massal.",
    pageTargets: ["/inventory"],
    resourceTargets: ["inventory", "inventory.bulk"],
    sensitivity: "normal",
  },
  {
    id: "inventory-inbound-receipts",
    groupId: "inventory",
    label: "Penerimaan Barang",
    description: "Mencatat barang supplier yang sudah disetujui untuk dibeli.",
    pageTargets: [],
    resourceTargets: ["inventory.inbound_receipt.create"],
    sensitivity: "critical",
  },
  {
    id: "inventory-approval",
    groupId: "inventory",
    label: "Approval Inventory",
    description: "Persetujuan perubahan stok dan penerimaan.",
    pageTargets: [],
    resourceTargets: [
      "inventory.approve",
      "inventory.out_log.verify",
      "inventory.inbound_receipt.approve",
      "inventory.inbound_receipt.reject",
      "inventory.inbound_receipt.edit",
    ],
    sensitivity: "critical",
  },
  {
    id: "surat-jalan",
    groupId: "inventory",
    label: "Surat Jalan",
    description: "Pembuatan, edit langsung pada dokumen, dan approval surat jalan.",
    pageTargets: [],
    resourceTargets: ["surat_jalan"],
    sensitivity: "normal",
  },
  {
    id: "surat-jalan-auto-approve",
    groupId: "inventory",
    label: "Auto Approve Surat Jalan",
    description: "Konfirmasi Surat Jalan role ini tanpa antrean approval.",
    pageTargets: [],
    resourceTargets: ["surat_jalan.auto_approve"],
    sensitivity: "critical",
  },
];

export const RBAC_MODULE_GROUPS = [
  { id: "operations", label: "Operasi" },
  { id: "catalog", label: "Katalog" },
  { id: "inventory", label: "Manajemen Inventaris" },
  { id: "finance", label: "Keuangan" },
  { id: "crm", label: "Pelanggan" },
  { id: "utils", label: "Lainnya" },
];

export function buildModuleGroups(search = "") {
  const query = search.trim().toLocaleLowerCase("id-ID");
  return RBAC_MODULE_GROUPS.map((group) => ({
    ...group,
    modules: RBAC_PERMISSION_MODULES.filter((module) => module.groupId === group.id &&
      `${module.label} ${module.description} ${module.resourceTargets.join(" ")} ${module.pageTargets.join(" ")}`.toLocaleLowerCase("id-ID").includes(query)),
  })).filter((group) => group.modules.length > 0);
}

export function countSupportedResourceActions(targets: readonly string[], role: EditableRole, permissions: RolePermissions) {
  return targets.reduce((count, resource) => count + (RBAC_RESOURCE_METADATA[resource]?.ownerOnlyReason
    ? 0
    : RBAC_RESOURCE_METADATA[resource]?.actions.filter((action) => permissions[role].resources[resource]?.[action]).length ?? 0), 0);
}

export function buildPermissionPresentation(permission: Pick<PermissionChange, "scope" | "target" | "action">) {
  const metadata = RBAC_RESOURCE_METADATA[permission.target];
  const targetLabel = permission.scope === "page"
    ? permission.target === "/history" ? "Riwayat" : findModuleForTarget(permission.target).label
    : metadata?.label ?? "Izin data";
  const actionLabels: Record<ResourceAction, string> = { create: "Buat", read: "Lihat", update: "Ubah", delete: "Hapus" };
  const actionLabel = permission.action === "access" ? "Buka halaman"
    : (metadata?.actionLabels?.[permission.action] ?? actionLabels[permission.action]).replace(" / ", " atau ");
  return { label: `${targetLabel} / ${actionLabel}`, technicalId: `${permission.target}.${permission.action}` };
}

export function buildRoleSummaries(
  permissions: RolePermissions,
  baseline: RolePermissions = buildDefaultRolePermissions(),
): RoleSummary[] {
  const changes = buildPermissionChanges(permissions, baseline);

  return EDITABLE_ROLES.map((role) => {
    const enabledPages = PAGE_TARGETS.filter((page) => permissions[role].pages[page]).length;
    const enabledActions = countSupportedResourceActions(RESOURCE_TARGETS, role, permissions);
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
    // History reads transaction data from the POS resource, never approval.read.
    if (permissionModule.id === "transaction-approval") continue;
    const hasPageAccess = permissionModule.pageTargets.some((page) => permissions[role].pages[page]);
    const hasResourceAccess = permissionModule.resourceTargets.some((resource) =>
      RBAC_RESOURCE_METADATA[resource]?.actions.some((action) => permissions[role].resources[resource]?.[action]),
    );
    const hasResourceRead = permissionModule.resourceTargets.some(
      (resource) => !TRANSITION_RESOURCE_PERMISSIONS[resource] && RBAC_RESOURCE_METADATA[resource]?.actions.includes("read") && permissions[role].resources[resource]?.read,
    );

    if (permissionModule.pageTargets.length > 0 && !hasPageAccess && hasResourceAccess) {
      warnings.push({
        role,
        moduleId: permissionModule.id,
        moduleLabel: permissionModule.label,
        severity: "warning",
        message: `${permissionModule.label}: beberapa tindakannya masih bisa dilakukan meski halamannya belum bisa dibuka. Coba cek lagi hak aksesnya, ya.`,
      });
    }

    if (permissionModule.pageTargets.length > 0 && hasPageAccess && permissionModule.resourceTargets.length > 0 && !hasResourceRead) {
      warnings.push({
        role,
        moduleId: permissionModule.id,
        moduleLabel: permissionModule.label,
        severity: "warning",
        message: `${permissionModule.label}: halamannya bisa dibuka, tapi beberapa data atau tindakan mungkin belum bisa dipakai. Coba cek lagi hak aksesnya, ya.`,
      });
    }
  }

  for (const activity of buildEffectiveActivities(role, permissions)) {
    if (activity.shouldWarn) {
      warnings.push({ role, moduleId: "transaction-approval", moduleLabel: "Approval Transaksi", severity: "warning",
        message: `${activity.label} belum bisa dipakai: aktifkan ${activity.missing.map((item) => item.label).join(" dan ")}.`,
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
