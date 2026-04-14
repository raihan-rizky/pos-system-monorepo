"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { useAppPrefetch } from "@/hooks/usePrefetch";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";

function AppBootstrap({ children }: { children: React.ReactNode }) {
  // Warm up the QueryClient cache on mount
  useAppPrefetch();
  return <>{children}</>;
}

export function Providers({ children }: { children: React.ReactNode }) {
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
      <AppBootstrap>{children}</AppBootstrap>
      <ServiceWorkerRegistration />
    </QueryClientProvider>
  );
}
