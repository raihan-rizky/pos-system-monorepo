"use client";

import { useEffect } from "react";
import { useRole } from "@/components/providers/RoleProvider";
import { warmOfflineCheckoutModules } from "./offline-module-preparation";
import { warmOfflineShellModules } from "./offline-shell-preparation";

export function OfflinePreparationBeacon() {
  const { userId, storeId } = useRole();

  useEffect(() => {
    const token = new URL(location.href).searchParams.get("__offline_prepare");
    if (!token || !/^[a-f0-9]{32}$/.test(token) || window.parent === window || !userId) return;
    let active = true;
    void Promise.all([warmOfflineCheckoutModules(), warmOfflineShellModules()]).then(() => {
      if (!active) return;
      const resources = performance.getEntriesByType("resource").map((entry) => entry.name);
      const markup = Array.from(document.querySelectorAll("script[src], link[href]"), (node) => node.getAttribute("src") || node.getAttribute("href") || "");
      const assets = [...new Set([...resources, ...markup].flatMap((value) => {
        try {
          const url = new URL(value, location.origin);
          return url.origin === location.origin && url.pathname.startsWith("/_next/static/") ? [url.href] : [];
        } catch { return []; }
      }))];
      window.parent.postMessage({ type: "POS_OFFLINE_READY", token, cashierId: userId, storeId: storeId || "store-main", assets }, location.origin);
    }).catch(() => {
      if (active) window.parent.postMessage({ type: "POS_OFFLINE_ERROR", token }, location.origin);
    });
    return () => { active = false; };
  }, [userId, storeId]);

  return null;
}
