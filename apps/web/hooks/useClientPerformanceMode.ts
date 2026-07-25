"use client";

import { useEffect, useState } from "react";
import {
  resolveClientPerformanceMode,
  type ClientPerformanceMode,
} from "@/lib/utils";

type NavigatorWithPerformanceHints = Navigator & {
  deviceMemory?: number;
  connection?: EventTarget & {
    saveData?: boolean;
  };
};

export function useClientPerformanceMode(): ClientPerformanceMode {
  const [mode, setMode] = useState<ClientPerformanceMode>("standard");

  useEffect(() => {
    const reducedMotionQuery = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );
    const navigatorWithHints = navigator as NavigatorWithPerformanceHints;

    const refreshMode = () => {
      const nextMode = resolveClientPerformanceMode({
        hardwareConcurrency: navigator.hardwareConcurrency || undefined,
        deviceMemory: navigatorWithHints.deviceMemory,
        saveData: navigatorWithHints.connection?.saveData,
        prefersReducedMotion: reducedMotionQuery.matches,
      });

      document.documentElement.dataset.performanceMode = nextMode;
      setMode((currentMode) =>
        currentMode === nextMode ? currentMode : nextMode,
      );
    };

    refreshMode();
    reducedMotionQuery.addEventListener("change", refreshMode);
    navigatorWithHints.connection?.addEventListener("change", refreshMode);

    return () => {
      reducedMotionQuery.removeEventListener("change", refreshMode);
      navigatorWithHints.connection?.removeEventListener(
        "change",
        refreshMode,
      );
    };
  }, []);

  return mode;
}
