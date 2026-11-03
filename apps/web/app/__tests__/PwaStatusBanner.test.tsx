import React, { isValidElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  cursor: 0, effectCursor: 0,
  states: [] as Array<{ value: any; set: (value: any) => void }>,
  effects: [] as Array<{ deps: readonly unknown[]; cleanup?: () => void }>,
  pending: [] as Array<() => void>,
  sync: { summary: { pending: 0, syncing: 0, failed: 19, pendingApproval: 0, lastSyncAt: null as string | null }, isOnline: true, isSyncing: false, error: null as string | null, syncNow: vi.fn() },
}));
vi.mock("react", async (original) => {
  const actual = await original<typeof import("react")>();
  return { ...actual,
    useState: (initial: any) => {
      const i = h.cursor++;
      if (!h.states[i]) {
        const slot = { value: typeof initial === "function" ? initial() : initial, set: (_: any) => {} };
        slot.set = (next: any) => { slot.value = typeof next === "function" ? next(slot.value) : next; };
        h.states[i] = slot;
      }
      return [h.states[i].value, h.states[i].set];
    },
    useEffect: (effect: () => void | (() => void), deps: readonly unknown[]) => {
      const i = h.effectCursor++;
      const previous = h.effects[i];
      if (!previous || deps.some((v, n) => !Object.is(v, previous.deps[n])) || deps.length !== previous.deps.length) {
        h.pending.push(() => { previous?.cleanup?.(); const cleanup = effect(); h.effects[i] = { deps, cleanup: cleanup || undefined }; });
      }
    },
  };
});
vi.mock("@/hooks/useOfflineSync", () => ({ useOfflineSync: () => h.sync }));
import { PwaStatusBanner } from "@/components/PwaStatusBanner";

function render() {
  h.cursor = 0; h.effectCursor = 0;
  const tree = PwaStatusBanner();
  const effects = h.pending.splice(0); effects.forEach(effect => effect());
  return tree;
}
function findButton(node: React.ReactNode): React.ReactElement<any> | undefined {
  if (Array.isArray(node)) { for (const child of node) { const found = findButton(child); if (found) return found; } }
  if (isValidElement<any>(node)) {
    const element = node as React.ReactElement<any>;
    if (element.type === "button" && element.props["aria-label"] === "Tutup peringatan") return element;
    return findButton(element.props.children);
  }
}

describe("PwaStatusBanner", () => {
  beforeEach(() => {
    vi.useFakeTimers(); h.states = []; h.effects = []; h.pending = [];
    h.sync.summary = { pending: 0, syncing: 0, failed: 19, pendingApproval: 0, lastSyncAt: null };
    h.sync.isOnline = true; h.sync.isSyncing = false; h.sync.error = null;
    vi.stubGlobal("window", { addEventListener: vi.fn(), removeEventListener: vi.fn(), setTimeout, clearTimeout });
  });
  afterEach(() => { h.effects.forEach(effect => effect.cleanup?.()); vi.useRealTimers(); vi.unstubAllGlobals(); });
  it("hides exactly 3 seconds after appearing", () => {
    expect(render()).not.toBeNull();
    vi.advanceTimersByTime(2999); expect(render()).not.toBeNull();
    vi.advanceTimersByTime(1); expect(render()).toBeNull();
  });
  it("closes immediately when the close button is clicked", () => {
    const button = findButton(render());
    expect(button).toBeDefined();
    button!.props.onClick();
    expect(render()).toBeNull();
    vi.advanceTimersByTime(3000);
    expect(render()).toBeNull();
  });
  it("shows a changed status for a fresh 3 seconds", () => {
    render(); vi.advanceTimersByTime(3000); expect(render()).toBeNull();
    h.sync.isOnline = false;
    render(); expect(render()).not.toBeNull();
    vi.advanceTimersByTime(2999); expect(render()).not.toBeNull();
    vi.advanceTimersByTime(1); expect(render()).toBeNull();
  });
  it("does not restart the timer when the same status is rendered again", () => {
    render(); vi.advanceTimersByTime(2000); render();
    vi.advanceTimersByTime(1000); expect(render()).toBeNull();
  });
  it("shows the same warning again after the status clears and returns", () => {
    render(); vi.advanceTimersByTime(3000); expect(render()).toBeNull();
    h.sync.summary.failed = 0; render();
    h.sync.summary.failed = 19; render();
    expect(render()).not.toBeNull();
    vi.advanceTimersByTime(3000); expect(render()).toBeNull();
  });
});
