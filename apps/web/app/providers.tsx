"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { useAppPrefetch } from "@/hooks/usePrefetch";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import { RoleProvider } from "@/components/providers/RoleProvider";
import { PwaStatusBanner } from "@/components/PwaStatusBanner";
import { NotificationPermissionPrompt } from "@/components/NotificationPermissionPrompt";
import type { Role } from "@/lib/rbac/permissions";

function AppBootstrap({ children }: { children: React.ReactNode }) {
  // Warm up the QueryClient cache on mount
  useAppPrefetch();
  return <>{children}</>;
}

export function Providers({ 
  children,
  role,
  userId,
  userName,
}: { 
  children: React.ReactNode;
  role: Role | null;
  userId: string | null;
  userName: string | null;
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
      <RoleProvider role={role} userId={userId} userName={userName}>
        <PwaStatusBanner />
        <AppBootstrap>{children}</AppBootstrap>
        <NotificationPermissionPrompt />
        <ServiceWorkerRegistration />
      </RoleProvider>
    </QueryClientProvider>
  );
}
