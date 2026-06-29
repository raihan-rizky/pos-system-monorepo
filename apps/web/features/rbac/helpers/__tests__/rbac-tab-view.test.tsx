import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  buildDefaultRolePermissions,
  flattenRolePermissions,
} from "@/features/rbac/helpers/rbac-core";

vi.mock("lucide-react", () => ({
  AlertTriangle: (props: any) => React.createElement("svg", { ...props, "data-icon": "alert-triangle" }),
  CheckCircle2: (props: any) => React.createElement("svg", { ...props, "data-icon": "check-circle" }),
  ChevronRight: (props: any) => React.createElement("svg", { ...props, "data-icon": "chevron-right" }),
  ChevronDown: (props: any) => React.createElement("svg", { ...props, "data-icon": "chevron-down" }),
  ChevronUp: (props: any) => React.createElement("svg", { ...props, "data-icon": "chevron-up" }),
  Eye: (props: any) => React.createElement("svg", { ...props, "data-icon": "eye" }),
  FileText: (props: any) => React.createElement("svg", { ...props, "data-icon": "file-text" }),
  Info: (props: any) => React.createElement("svg", { ...props, "data-icon": "info" }),
  Pencil: (props: any) => React.createElement("svg", { ...props, "data-icon": "pencil" }),
  RefreshCw: (props: any) => React.createElement("svg", { ...props, "data-icon": "refresh" }),
  Save: (props: any) => React.createElement("svg", { ...props, "data-icon": "save" }),
  ShieldAlert: (props: any) => React.createElement("svg", { ...props, "data-icon": "shield-alert" }),
  ShieldCheck: (props: any) => React.createElement("svg", { ...props, "data-icon": "shield-check" }),
  ToggleLeft: (props: any) => React.createElement("svg", { ...props, "data-icon": "toggle-left" }),
  ToggleRight: (props: any) => React.createElement("svg", { ...props, "data-icon": "toggle-right" }),
  X: (props: any) => React.createElement("svg", { ...props, "data-icon": "x" }),
  ArrowRight: (props: any) => React.createElement("svg", { ...props, "data-icon": "arrow-right" }),
  Lock: (props: any) => React.createElement("svg", { ...props, "data-icon": "lock" }),
  CircleDot: (props: any) => React.createElement("svg", { ...props, "data-icon": "circle-dot" }),
}));

describe("RbacSettingsView", () => {
  it("renders role summaries, advisory copy, pending state, and review confirmation", async () => {
    const { RbacSettingsView } = await import("@/components/settings/RbacTab");
    const permissions = buildDefaultRolePermissions();
    permissions.CASHIER.pages["/products"] = true;
    permissions.CASHIER.resources["product.price_log"].read = true;

    const html = renderToStaticMarkup(
      <RbacSettingsView
        activeRole="CASHIER"
        selectedModuleId="products"
        permissions={permissions}
        savedPermissions={buildDefaultRolePermissions()}
        isSaving={false}
        saved={false}
        error={null}
        isReviewOpen
        isSensitiveConfirmOpen
        onActiveRoleChange={vi.fn()}
        onSelectedModuleChange={vi.fn()}
        onPagePermissionChange={vi.fn()}
        onResourcePermissionChange={vi.fn()}
        onRequestSaveReview={vi.fn()}
        onCloseReview={vi.fn()}
        onConfirmReview={vi.fn()}
        onCancelSensitiveConfirm={vi.fn()}
        onConfirmSensitiveSave={vi.fn()}
      />,
    );

    // Role summary section present
    expect(html).toContain("Ringkasan Role");
    // Advisory notice
    expect(html).toContain("backend tetap sumber kebenaran");
    // Pending changes indicator
    expect(html).toContain("Belum disimpan");
    // Role label present
    expect(html).toContain("Kasir");
    // Module label present
    expect(html).toContain("Price Logs / HPP");
    // Change direction label present
    expect(html).toContain("Ditambahkan");
    // Change target reference
    expect(html).toContain("product.price_log");
    // Sensitive confirmation present
    expect(html).toContain("Konfirmasi perubahan sensitif");
    // Review section present
    expect(html).toContain("Review perubahan permission");
    // Toggle switches use proper role attribute
    expect(html).toContain('role="switch"');
    // Human-readable page labels (not raw paths)
    expect(html).toContain("Produk");
    // Module sensitivity dot / indicator
    expect(html).toContain("halaman");
    expect(html).toContain("aksi");
  });

  it("renders role cards with role-specific color accents", async () => {
    const { RbacSettingsView } = await import("@/components/settings/RbacTab");
    const permissions = buildDefaultRolePermissions();

    const html = renderToStaticMarkup(
      <RbacSettingsView
        activeRole="ADMIN"
        selectedModuleId="dashboard"
        permissions={permissions}
        savedPermissions={buildDefaultRolePermissions()}
        isSaving={false}
        saved={false}
        error={null}
        isReviewOpen={false}
        isSensitiveConfirmOpen={false}
        onActiveRoleChange={vi.fn()}
        onSelectedModuleChange={vi.fn()}
        onPagePermissionChange={vi.fn()}
        onResourcePermissionChange={vi.fn()}
        onRequestSaveReview={vi.fn()}
        onCloseReview={vi.fn()}
        onConfirmReview={vi.fn()}
        onCancelSensitiveConfirm={vi.fn()}
        onConfirmSensitiveSave={vi.fn()}
      />,
    );

    // All four role cards rendered
    expect(html).toContain("Admin");
    expect(html).toContain("Kasir");
    expect(html).toContain("Sales");
    expect(html).toContain("Inventaris");
    // Module matrix section
    expect(html).toContain("Matrix Modul");
    // Saved state indicator
    expect(html).toContain("Sinkron");
  });

  it("renders review modal as an overlay with backdrop", async () => {
    const { RbacSettingsView } = await import("@/components/settings/RbacTab");
    const permissions = buildDefaultRolePermissions();
    permissions.ADMIN.pages["/products"] = false;

    const html = renderToStaticMarkup(
      <RbacSettingsView
        activeRole="ADMIN"
        selectedModuleId="products"
        permissions={permissions}
        savedPermissions={buildDefaultRolePermissions()}
        isSaving={false}
        saved={false}
        error={null}
        isReviewOpen
        isSensitiveConfirmOpen={false}
        onActiveRoleChange={vi.fn()}
        onSelectedModuleChange={vi.fn()}
        onPagePermissionChange={vi.fn()}
        onResourcePermissionChange={vi.fn()}
        onRequestSaveReview={vi.fn()}
        onCloseReview={vi.fn()}
        onConfirmReview={vi.fn()}
        onCancelSensitiveConfirm={vi.fn()}
        onConfirmSensitiveSave={vi.fn()}
      />,
    );

    // Modal overlay has role="dialog"
    expect(html).toContain('role="dialog"');
    // Has an accessible label
    expect(html).toContain("aria-modal");
    // Close button present
    expect(html).toContain("Tutup");
    // Confirm button present
    expect(html).toContain("Lanjut simpan");
  });

  it("normalizes the saved baseline from API entries", async () => {
    const { buildSavedPermissionsFromEntries } = await import("@/components/settings/RbacTab");
    const defaults = buildDefaultRolePermissions();
    defaults.ADMIN.resources.product.update = false;

    const saved = buildSavedPermissionsFromEntries(flattenRolePermissions(defaults));

    expect(saved.ADMIN.resources.product.update).toBe(false);
  });

  it("renders skeleton loading state", async () => {
    const { RbacSkeletonLoading } = await import("@/components/settings/RbacTab");

    const html = renderToStaticMarkup(<RbacSkeletonLoading />);

    expect(html).toContain("animate-pulse");
  });
});
