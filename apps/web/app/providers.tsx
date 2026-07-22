"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useAppPrefetch } from "@/hooks/usePrefetch";
import { RoleProvider } from "@/components/providers/RoleProvider";
import type { Role } from "@/lib/rbac/permissions";
import type { RolePermissions } from "@/features/rbac/helpers/rbac-core";
import { NotificationProvider } from "@/features/notifications/components/NotificationProvider";

const PwaStatusBanner = dynamic(
  () => import("@/components/PwaStatusBanner").then((mod) => mod.PwaStatusBanner),
  { ssr: false },
);
const InAppPushNotifications = dynamic(
  () =>
    import("@/components/InAppPushNotifications").then(
      (mod) => mod.InAppPushNotifications,
    ),
  { ssr: false },
);
const NotificationPermissionPrompt = dynamic(
  () =>
    import("@/components/NotificationPermissionPrompt").then(
      (mod) => mod.NotificationPermissionPrompt,
    ),
  { ssr: false },
);
const ServiceWorkerRegistration = dynamic(
  () =>
    import("@/components/ServiceWorkerRegistration").then(
      (mod) => mod.ServiceWorkerRegistration,
    ),
  { ssr: false },
);

function useIdleReady(enabled: boolean) {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setIsReady(false);
      return;
    }

    let cancelled = false;
    const markReady = () => {
      if (!cancelled) setIsReady(true);
    };

    const idleWindow = window as Window & {
      requestIdleCallback?: (
        callback: () => void,
        options?: { timeout?: number },
      ) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    if (idleWindow.requestIdleCallback) {
      const handle = idleWindow.requestIdleCallback(markReady, { timeout: 1500 });
      return () => {
        cancelled = true;
        idleWindow.cancelIdleCallback?.(handle);
      };
    }

    const handle = window.setTimeout(markReady, 1000);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [enabled]);

  return isReady;
}

function AppBootstrap({
  children,
  enabled,
}: {
  children: React.ReactNode;
  enabled: boolean;
}) {
  useAppPrefetch(enabled);
  return <>{children}</>;
}

function DeferredAppServices({ enabled }: { enabled: boolean }) {
  if (!enabled) return null;

  return (
    <>
      <PwaStatusBanner />
      <InAppPushNotifications />
      <NotificationPermissionPrompt />
      <ServiceWorkerRegistration />
    </>
  );
}

export function Providers({ 
  children,
  role,
  userId,
  userName,
  storeId,
  authorizationFingerprint,
  permissions,
}: { 
  children: React.ReactNode;
  role: Role | null;
  userId: string | null;
  userName: string | null;
  storeId: string | null;
  authorizationFingerprint: string | null;
  permissions: RolePermissions;
}) {
  const isIdleReady = useIdleReady(Boolean(role));
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000,   // 5 minutes — no refetch on quick navigation
            gcTime: 10 * 60 * 1000,     // keep cache 10 min after component unmounts
            refetchOnWindowFocus: false,
            refetchOnReconnect: "always",
            retry: 2,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <RoleProvider
        role={role}
        userId={userId}
        userName={userName}
        storeId={storeId}
        authorizationFingerprint={authorizationFingerprint}
        permissions={permissions}
      >
        <NotificationProvider enabled={Boolean(role)}>
          <AppBootstrap enabled={isIdleReady}>{children}</AppBootstrap>
          <DeferredAppServices enabled={isIdleReady} />
        </NotificationProvider>
      </RoleProvider>
    </QueryClientProvider>
  );
}
