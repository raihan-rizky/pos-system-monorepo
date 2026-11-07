"use client";

import { useOfflineSync } from "@/hooks/useOfflineSync";

/** Keep offline transactions syncing without displaying a global banner. */
export function PwaStatusBanner() {
  useOfflineSync();
  return null;
}
