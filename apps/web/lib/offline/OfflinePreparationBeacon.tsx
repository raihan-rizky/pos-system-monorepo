"use client";

import { useEffect } from "react";
import { useRole } from "@/components/providers/RoleProvider";
import { loadCurrentRoleAccess } from "@/features/rbac/helpers/permission-refresh";
import { canRoleAccessPage, canRolePerformAction } from "@/features/rbac/helpers/rbac-core";
import { warmOfflineCheckoutModules } from "./offline-module-preparation";
import { warmOfflineShellModules } from "./offline-shell-preparation";

export function OfflinePreparationBeacon() {
  const { role, userId, storeId, authorizationFingerprint } = useRole();

  useEffect(() => {
    const token = new URL(location.href).searchParams.get("__offline_prepare");
    if (!token || !/^[a-f0-9]{32}$/.test(token) || window.parent === window) return;
    let active = true;
    const controller = new AbortController();
    void Promise.all([
      loadCurrentRoleAccess(controller.signal),
      warmOfflineCheckoutModules(),
      warmOfflineShellModules(),
    ]).then(([latest]) => {
      if (!active) return;
      if (!role || !userId || !authorizationFingerprint || !["OWNER", "ADMIN", "CASHIER", "SALES"].includes(role) ||
          latest.user.id !== userId || latest.user.role !== role || latest.user.storeId !== storeId ||
          latest.authorizationFingerprint !== authorizationFingerprint ||
          !canRoleAccessPage(role, "/pos", latest.permissions) ||
          !canRolePerformAction(role, role === "SALES" ? "transaction.request" : "transaction", "create", latest.permissions)) {
        throw new Error("Identitas atau izin POS berubah.");
      }
      const resources = performance.getEntriesByType("resource").map((entry) => entry.name);
      const markup = Array.from(document.querySelectorAll("script[src], link[href]"), (node) => node.getAttribute("src") || node.getAttribute("href") || "");
      const assets = [...new Set([...resources, ...markup].flatMap((value) => {
        try {
          const url = new URL(value, location.origin);
          return url.origin === location.origin && url.pathname.startsWith("/_next/static/") ? [url.href] : [];
        } catch { return []; }
      }))];
      window.parent.postMessage({ type: "POS_OFFLINE_READY", token, cashierId: userId, storeId: storeId || "store-main", role, authorizationFingerprint, permissions: latest.permissions, assets }, location.origin);
    }).catch(() => {
      if (active) window.parent.postMessage({ type: "POS_OFFLINE_ERROR", token }, location.origin);
    });
    return () => { active = false; controller.abort(); };
  }, [role, userId, storeId, authorizationFingerprint]);

  return null;
}
