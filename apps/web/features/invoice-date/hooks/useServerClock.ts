"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  estimateServerNow,
  readServerClockSyncMetadata,
  type ServerClockSource,
  type ClockAnchor,
} from "../helpers/server-clock";

export type { ServerClockSource } from "../helpers/server-clock";

interface StoredClockAnchor {
  serverEpochMs: number;
  deviceSavedAt: number;
  lastSyncedAt?: number | null;
}

interface ServerClockState {
  now: Date | null;
  source: ServerClockSource | null;
  lastSyncedAt: number | null;
  isLoading: boolean;
}

const STORAGE_KEY = "pos-server-clock-anchor-v1";
const RESYNC_INTERVAL_MS = 5 * 60 * 1000;

function readStoredAnchor(): StoredClockAnchor | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredClockAnchor>;
    if (
      !Number.isFinite(parsed.serverEpochMs) ||
      !Number.isFinite(parsed.deviceSavedAt)
    ) {
      return null;
    }
    return {
      serverEpochMs: parsed.serverEpochMs as number,
      deviceSavedAt: parsed.deviceSavedAt as number,
      lastSyncedAt:
        typeof parsed.lastSyncedAt === "number" &&
        Number.isFinite(parsed.lastSyncedAt)
          ? parsed.lastSyncedAt
          : null,
    };
  } catch {
    return null;
  }
}

function saveAnchor(anchor: StoredClockAnchor): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(anchor));
  } catch {
    // A restricted storage context can still use the live server anchor.
  }
}

export function useServerClock(enabled = true) {
  const anchorRef = useRef<ClockAnchor | null>(null);
  const [state, setState] = useState<ServerClockState>({
    now: null,
    source: null,
    lastSyncedAt: null,
    isLoading: true,
  });

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const startedAt = performance.now();
    try {
      const response = await fetch("/api/time", {
        cache: "no-store",
        credentials: "same-origin",
        signal,
      });
      if (!response.ok) throw new Error("Waktu server tidak tersedia");
      const payload: unknown = await response.json();
      if (
        !payload ||
        typeof payload !== "object" ||
        !("serverEpochMs" in payload) ||
        typeof payload.serverEpochMs !== "number" ||
        !Number.isFinite(payload.serverEpochMs)
      ) {
        throw new Error("Respons waktu server tidak valid");
      }

      const receivedAt = performance.now();
      const serverEpochMs =
        Number(payload.serverEpochMs) + Math.max(0, receivedAt - startedAt) / 2;
      const anchor = { serverEpochMs, receivedMonotonicMs: receivedAt };
      anchorRef.current = anchor;
      const now = estimateServerNow(anchor, receivedAt);
      const syncMetadata = readServerClockSyncMetadata(payload);
      saveAnchor({
        serverEpochMs,
        deviceSavedAt: Date.now(),
        lastSyncedAt: syncMetadata.lastSyncedAt,
      });
      setState({
        now,
        ...syncMetadata,
        isLoading: false,
      });
    } catch (error) {
      if (signal?.aborted) return;
      if (anchorRef.current) {
        const now = estimateServerNow(anchorRef.current, performance.now());
        setState((current) => ({
          ...current,
          now,
          source: "SERVER_ESTIMATE",
          isLoading: false,
        }));
        return;
      }
      setState((current) => ({
        ...current,
        now: current.now ?? new Date(),
        source: current.source ?? "DEVICE_UNVERIFIED",
        lastSyncedAt: current.lastSyncedAt,
        isLoading: false,
      }));
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const stored = readStoredAnchor();
    if (stored) {
      const elapsedDeviceMs = Math.max(0, Date.now() - stored.deviceSavedAt);
      const estimatedServerEpochMs = stored.serverEpochMs + elapsedDeviceMs;
      const anchor = {
        serverEpochMs: estimatedServerEpochMs,
        receivedMonotonicMs: performance.now(),
      };
      anchorRef.current = anchor;
      setState({
        now: new Date(estimatedServerEpochMs),
        source: "SERVER_ESTIMATE",
        lastSyncedAt: stored.lastSyncedAt ?? null,
        isLoading: true,
      });
    }

    const controller = new AbortController();
    void refresh(controller.signal);
    const refreshOnResume = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const refreshOnline = () => void refresh();
    const timer = window.setInterval(
      () => setState((current) => {
        if (!anchorRef.current) return current;
        return {
          ...current,
          now: estimateServerNow(anchorRef.current, performance.now()),
        };
      }),
      1000,
    );
    const syncTimer = window.setInterval(() => void refresh(), RESYNC_INTERVAL_MS);
    document.addEventListener("visibilitychange", refreshOnResume);
    window.addEventListener("online", refreshOnline);
    window.addEventListener("focus", refreshOnResume);

    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.clearInterval(syncTimer);
      document.removeEventListener("visibilitychange", refreshOnResume);
      window.removeEventListener("online", refreshOnline);
      window.removeEventListener("focus", refreshOnResume);
    };
  }, [enabled, refresh]);

  return { ...state, refresh: () => refresh() };
}
