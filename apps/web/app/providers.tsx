"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { useAppPrefetch } from "@/hooks/usePrefetch";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import { RoleProvider } from "@/components/providers/RoleProvider";
import { PwaStatusBanner } from "@/components/PwaStatusBanner";
import { NotificationPermissionPrompt } from "@/components/NotificationPermissionPrompt";
import { InAppPushNotifications } from "@/components/InAppPushNotifications";
import type { Role } from "@/lib/rbac/permissions";
import type { RolePermissions } from "@/features/rbac/helpers/rbac-core";

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

export function Providers({ 
  children,
  role,
  userId,
  userName,
  permissions,
}: { 
  children: React.ReactNode;
  role: Role | null;
  userId: string | null;
  userName: string | null;
  permissions: RolePermissions;
}) {
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
      <RoleProvider role={role} userId={userId} userName={userName} permissions={permissions}>
        <PwaStatusBanner />
        <AppBootstrap enabled={Boolean(role)}>{children}</AppBootstrap>
        <InAppPushNotifications />
        <NotificationPermissionPrompt />
        <ServiceWorkerRegistration />
      </RoleProvider>
    </QueryClientProvider>
  );
}
