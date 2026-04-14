"use client";

import { useEffect } from "react";

/**
 * Registers the service worker for PWA offline support.
 * Only registers in production or after the page has fully loaded.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    // During local development, aggressive Service Worker caching destroys Hot Module Replacement (HMR) 
    // and causes unstyled white screens because it caches dynamic Dev chunks. 
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (let registration of registrations) {
          registration.unregister();
        }
      });
      // Purge the poisoned local developer cache
      caches.keys().then((keys) => {
        keys.forEach((key) => caches.delete(key));
      });
      return;
    }

    // Wait for the window load event to avoid competing with critical resources
    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((registration) => {
          console.log("[SW] Registered with scope:", registration.scope);

          // Auto-update: check for new SW every 60 minutes
          setInterval(() => {
            registration.update();
          }, 60 * 60 * 1000);
        })
        .catch((error) => {
          console.warn("[SW] Registration failed:", error);
        });
    };

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
    }
  }, []);

  return null; // This component renders nothing — it only runs the effect
}
