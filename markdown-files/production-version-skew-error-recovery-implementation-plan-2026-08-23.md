# Production Version Skew Error Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mencegah service worker mencampur aset internal Next.js lintas deployment dan memastikan route error UI memberikan recovery yang benar untuk version skew maupun error biasa.

**Architecture:** Kebijakan cache diperketat di service worker agar seluruh `/_next/*` kembali ditangani browser dan Vercel. Sebuah helper client-side yang terisolasi mengklasifikasikan runtime mismatch dan menjalankan best-effort cache/service-worker recovery sebelum hard reload. Route error boundary memilih UI dan action berdasarkan classifier tanpa menampilkan raw internal error kepada user.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Vitest 4, native Service Worker API, Vercel deployment routing.

## Global Constraints

- Ikuti test-driven development: test harus terbukti gagal karena behavior belum tersedia sebelum production code ditulis.
- Jangan menjalankan `pnpm build` atau mengelola lifecycle `pnpm dev`.
- Gunakan TypeScript untuk helper dan component test baru.
- User-visible text harus friendly Indonesian, kecuali technical term yang memang dibutuhkan.
- Jangan menambah dependency.
- Jangan mengubah API cache atau offline transaction queue.
- Jangan mengubah `HelpContent.tsx` atau AI Assistant workflow catalog karena tidak ada fitur bisnis atau guided workflow baru.
- Pertahankan perubahan user yang sudah ada pada `AGENTS.md` dan `CLAUDE.md`.
- Jalankan GitNexus impact analysis sebelum mengubah symbol yang sudah ada dan `detect_changes` sebelum final commit.
- Antislop Design Read: error recovery untuk operator POS, visual language error state yang sudah ada, ENERGY 1 / RHYTHM 1 / MOTION 1.
- Button harus memiliki behavior nyata, `type="button"`, tap target minimum 44px, dan visible keyboard focus.

---

## File Structure

- Create `apps/web/app/(main)/error-recovery.ts`: classifier runtime mismatch dan best-effort hard-reload orchestration.
- Create `apps/web/app/(main)/__tests__/error-recovery.test.ts`: unit test classifier, cache cleanup, service-worker update, dan reload fallback.
- Modify `apps/web/app/(main)/error.tsx`: friendly error presentation serta pemilihan retry atau reload action.
- Create `apps/web/app/(main)/__tests__/error.test.tsx`: static render contract untuk kedua mode error UI.
- Modify `apps/web/public/sw.js`: bypass `/_next/*`, scope cache lookup ke cache POS aktif, dan hapus hanya cache POS lama.
- Create `apps/web/app/(main)/__tests__/service-worker-cache.test.ts`: execute service worker di sandbox dan verifikasi fetch/activate behavior.
- Modify `markdown-files/production-version-skew-error-recovery-2026-08-23.md`: catat hasil implementation dan validation aktual.

### Task 1: Runtime mismatch classifier dan reload orchestration

**Files:**
- Create: `apps/web/app/(main)/error-recovery.ts`
- Test: `apps/web/app/(main)/__tests__/error-recovery.test.ts`

**Interfaces:**
- Consumes: browser `CacheStorage`, `ServiceWorkerContainer`, dan `window.location.reload()` melalui dependency object yang dapat di-test.
- Produces: `isClientRuntimeMismatch(error: unknown): boolean` dan `reloadLatestAppVersion(overrides?: Partial<AppReloadDependencies>): Promise<void>`.

- [ ] **Step 1: Write failing classifier tests**

Create `apps/web/app/(main)/__tests__/error-recovery.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import {
  isClientRuntimeMismatch,
  reloadLatestAppVersion,
} from "../error-recovery";

describe("isClientRuntimeMismatch", () => {
  it.each([
    new TypeError("Cannot read properties of undefined (reading 'call')"),
    Object.assign(new Error("Loading chunk 512 failed."), {
      name: "ChunkLoadError",
    }),
    new Error("Failed to fetch dynamically imported module"),
    new Error("Importing a module script failed"),
  ])("recognizes a stale client runtime signature", (error) => {
    expect(isClientRuntimeMismatch(error)).toBe(true);
  });

  it("checks nested causes without classifying an ordinary render error", () => {
    expect(
      isClientRuntimeMismatch(
        Object.assign(new Error("Navigasi gagal"), {
          cause: new Error("Loading CSS chunk 91 failed."),
        }),
      ),
    ).toBe(true);
    expect(isClientRuntimeMismatch(new Error("Data transaksi tidak ditemukan"))).toBe(false);
  });
});
```

- [ ] **Step 2: Run classifier tests and verify RED**

Run:

```bash
pnpm --filter @pos/web exec vitest run "app/(main)/__tests__/error-recovery.test.ts"
```

Expected: FAIL because `../error-recovery` does not exist.

- [ ] **Step 3: Implement the minimal classifier**

Create `apps/web/app/(main)/error-recovery.ts` with these signatures and behavior:

```ts
const RUNTIME_MISMATCH_PATTERNS = [
  /cannot read properties of undefined \(reading ['"]call['"]\)/i,
  /chunkloaderror/i,
  /loading (?:css )?chunk .* failed/i,
  /failed to fetch dynamically imported module/i,
  /importing a module script failed/i,
];

function errorText(error: unknown): string {
  if (error instanceof Error) {
    const cause = "cause" in error ? error.cause : undefined;
    return `${error.name} ${error.message} ${cause ? errorText(cause) : ""}`;
  }
  return typeof error === "string" ? error : "";
}

export function isClientRuntimeMismatch(error: unknown): boolean {
  const text = errorText(error);
  return RUNTIME_MISMATCH_PATTERNS.some((pattern) => pattern.test(text));
}
```

- [ ] **Step 4: Run classifier tests and verify GREEN**

Run the targeted Vitest command from Step 2.

Expected: PASS for all classifier cases.

- [ ] **Step 5: Write failing reload orchestration tests**

Append to the same test file:

```ts
describe("reloadLatestAppVersion", () => {
  it("clears only POS caches, updates the worker, and reloads", async () => {
    const deleteCache = vi.fn().mockResolvedValue(true);
    const update = vi.fn().mockResolvedValue(undefined);
    const postMessage = vi.fn();
    const reload = vi.fn();

    await reloadLatestAppVersion({
      cacheStorage: {
        keys: vi.fn().mockResolvedValue(["pos-v4", "pos-v5", "other-app"]),
        delete: deleteCache,
      },
      serviceWorker: {
        getRegistration: vi.fn().mockResolvedValue({
          update,
          waiting: { postMessage },
        }),
      },
      reload,
    });

    expect(deleteCache.mock.calls).toEqual([["pos-v4"], ["pos-v5"]]);
    expect(update).toHaveBeenCalledOnce();
    expect(postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
    expect(reload).toHaveBeenCalledOnce();
  });

  it("still reloads when cleanup fails", async () => {
    const reload = vi.fn();

    await reloadLatestAppVersion({
      cacheStorage: {
        keys: vi.fn().mockRejectedValue(new Error("cache unavailable")),
        delete: vi.fn(),
      },
      serviceWorker: {
        getRegistration: vi.fn().mockRejectedValue(new Error("worker unavailable")),
      },
      reload,
    });

    expect(reload).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 6: Run reload tests and verify RED**

Run the targeted Vitest command.

Expected: FAIL because `reloadLatestAppVersion` is not exported.

- [ ] **Step 7: Implement minimal best-effort reload orchestration**

Add these contracts and behavior to `error-recovery.ts`:

```ts
interface AppCacheStorage {
  keys(): Promise<string[]>;
  delete(cacheName: string): Promise<boolean>;
}

interface AppServiceWorkerRegistration {
  update(): Promise<unknown>;
  waiting: { postMessage(message: unknown): void } | null;
}

interface AppServiceWorkerContainer {
  getRegistration(): Promise<AppServiceWorkerRegistration | undefined>;
}

export interface AppReloadDependencies {
  cacheStorage?: AppCacheStorage;
  serviceWorker?: AppServiceWorkerContainer;
  reload: () => void;
}

function browserReloadDependencies(): AppReloadDependencies {
  return {
    cacheStorage: typeof caches === "undefined" ? undefined : caches,
    serviceWorker:
      typeof navigator === "undefined" ? undefined : navigator.serviceWorker,
    reload: () => window.location.reload(),
  };
}

export async function reloadLatestAppVersion(
  overrides: Partial<AppReloadDependencies> = {},
): Promise<void> {
  const dependencies = { ...browserReloadDependencies(), ...overrides };
  const cleanupTasks: Promise<unknown>[] = [];

  if (dependencies.cacheStorage) {
    cleanupTasks.push(
      dependencies.cacheStorage.keys().then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("pos-"))
            .map((key) => dependencies.cacheStorage?.delete(key)),
        ),
      ),
    );
  }

  if (dependencies.serviceWorker) {
    cleanupTasks.push(
      dependencies.serviceWorker.getRegistration().then(async (registration) => {
        if (!registration) return;
        await registration.update();
        registration.waiting?.postMessage({ type: "SKIP_WAITING" });
      }),
    );
  }

  await Promise.allSettled(cleanupTasks);
  dependencies.reload();
}
```

- [ ] **Step 8: Run Task 1 tests and verify GREEN**

Run the targeted Vitest command.

Expected: PASS with no warnings.

- [ ] **Step 9: Validate changed TypeScript files**

Run:

```bash
pnpm --filter @pos/web exec tsc --noEmit
```

Expected: exit code 0.

- [ ] **Step 10: Commit Task 1**

```bash
git add "apps/web/app/(main)/error-recovery.ts" "apps/web/app/(main)/__tests__/error-recovery.test.ts"
git commit -m "fix: add production runtime recovery"
```

### Task 2: Route error UI memilih action yang benar

**Files:**
- Modify: `apps/web/app/(main)/error.tsx:1-39`
- Test: `apps/web/app/(main)/__tests__/error.test.tsx`

**Interfaces:**
- Consumes: `isClientRuntimeMismatch(error)` dan `reloadLatestAppVersion()` dari Task 1.
- Produces: default `MainError({ error, reset })` yang menampilkan mode runtime mismatch atau generic error.

- [ ] **Step 1: Run GitNexus impact analysis before editing `MainError`**

Run:

```bash
node .gitnexus/run.cjs impact MainError -r pos-system-monorepo -d upstream --depth 3 --include-tests
```

Report direct dependants, affected processes, and LOW/MEDIUM/HIGH/CRITICAL risk before continuing. Stop and warn the user if risk is HIGH or CRITICAL.

- [ ] **Step 2: Write failing render contract tests**

Create `apps/web/app/(main)/__tests__/error.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import MainError from "../error";

vi.mock("lucide-react", () => ({
  AlertTriangle: () => <svg data-icon="alert" />,
  RefreshCw: () => <svg data-icon="refresh" />,
  RotateCcw: () => <svg data-icon="retry" />,
}));

describe("MainError", () => {
  it("offers a latest-version reload for a runtime mismatch", () => {
    const rawMessage = "Cannot read properties of undefined (reading 'call')";
    const html = renderToStaticMarkup(
      <MainError error={new TypeError(rawMessage)} reset={vi.fn()} />,
    );

    expect(html).toContain("Versi aplikasi telah diperbarui");
    expect(html).toContain("Muat Ulang Versi Terbaru");
    expect(html).not.toContain("Coba Lagi");
    expect(html).not.toContain(rawMessage);
    expect(html).toContain('type="button"');
    expect(html).toContain("min-h-11");
    expect(html).toContain("focus-visible:");
  });

  it("offers reset and full reload for an ordinary error", () => {
    const rawMessage = "Database timeout with internal details";
    const error = Object.assign(new Error(rawMessage), { digest: "support-123" });
    const html = renderToStaticMarkup(
      <MainError error={error} reset={vi.fn()} />,
    );

    expect(html).toContain("Halaman tidak dapat dimuat");
    expect(html).toContain("Coba Lagi");
    expect(html).toContain("Muat Ulang Halaman");
    expect(html).toContain("support-123");
    expect(html).not.toContain(rawMessage);
  });
});
```

- [ ] **Step 3: Run component tests and verify RED**

Run:

```bash
pnpm --filter @pos/web exec vitest run "app/(main)/__tests__/error.test.tsx"
```

Expected: FAIL because the current component exposes `error.message` and only renders `Coba Lagi`.

- [ ] **Step 4: Implement the minimal error UI behavior**

Replace `error.tsx` with this complete component:

```tsx
"use client";

import React, { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, RotateCcw } from "lucide-react";

import { getLogger } from "@/lib/logger";
import {
  isClientRuntimeMismatch,
  reloadLatestAppVersion,
} from "./error-recovery";

const log = getLogger("ui:MainError");

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function MainError({ error, reset }: ErrorProps) {
  const [isRecovering, setIsRecovering] = useState(false);
  const runtimeMismatch = isClientRuntimeMismatch(error);

  useEffect(() => {
    log.error("Main route failed", error);
  }, [error]);

  const reload = () => {
    if (isRecovering) return;
    setIsRecovering(true);
    void reloadLatestAppVersion();
  };

  return (
    <div
      className="flex flex-1 flex-col items-center justify-center gap-5 p-8"
      role="alert"
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-danger-50">
        <AlertTriangle className="h-7 w-7 text-danger-600" aria-hidden="true" />
      </div>

      <div className="text-center">
        <h2 className="text-lg font-bold text-surface-900">Terjadi Kesalahan</h2>
        <p className="mt-1 max-w-sm text-sm text-surface-500">
          {runtimeMismatch
            ? "Versi aplikasi telah diperbarui. Muat ulang halaman untuk melanjutkan."
            : "Halaman tidak dapat dimuat. Silakan coba lagi."}
        </p>
        {error.digest && (
          <p className="mt-1 font-mono text-xs text-surface-400">
            ID: {error.digest}
          </p>
        )}
      </div>

      <div className="flex w-full max-w-sm flex-col justify-center gap-2 sm:flex-row">
        {!runtimeMismatch && (
          <button
            type="button"
            onClick={reset}
            disabled={isRecovering}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Coba Lagi
          </button>
        )}
        <button
          type="button"
          onClick={reload}
          disabled={isRecovering}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-surface-300 bg-white px-5 py-2.5 text-sm font-semibold text-surface-800 transition-colors hover:bg-surface-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
        >
          <RefreshCw
            className={`h-4 w-4 ${isRecovering ? "animate-spin" : ""}`}
            aria-hidden="true"
          />
          {runtimeMismatch ? "Muat Ulang Versi Terbaru" : "Muat Ulang Halaman"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run component tests and verify GREEN**

Run the targeted Vitest command from Step 3.

Expected: PASS.

- [ ] **Step 6: Run Task 1 and Task 2 tests together**

```bash
pnpm --filter @pos/web exec vitest run "app/(main)/__tests__/error-recovery.test.ts" "app/(main)/__tests__/error.test.tsx"
```

Expected: PASS with no errors or warnings.

- [ ] **Step 7: Run TypeScript validation**

```bash
pnpm --filter @pos/web exec tsc --noEmit
```

Expected: exit code 0.

- [ ] **Step 8: Commit Task 2**

```bash
git add "apps/web/app/(main)/error.tsx" "apps/web/app/(main)/__tests__/error.test.tsx"
git commit -m "fix: recover main route errors safely"
```

### Task 3: Service worker tidak meng-cache Next.js runtime

**Files:**
- Modify: `apps/web/public/sw.js:8-179`
- Test: `apps/web/app/(main)/__tests__/service-worker-cache.test.ts`

**Interfaces:**
- Consumes: native service-worker `fetch` and `activate` events.
- Produces: cache `pos-v6` yang hanya menangani aset aplikasi dan melewatkan seluruh `/_next/*`.

- [ ] **Step 1: Attempt GitNexus impact analysis for service-worker symbols**

Run:

```bash
node .gitnexus/run.cjs impact cacheFirst -r pos-system-monorepo -d upstream --depth 3 --include-tests
```

GitNexus currently does not index `apps/web/public/sw.js`, so a not-found result is expected. Record that limitation, then manually confirm callers with:

```bash
rg -n "cacheFirst|CACHE_NAME|addEventListener\(\"fetch\"|addEventListener\(\"activate\"" apps/web/public/sw.js apps/web
```

Report the manual blast radius before editing: service-worker fetch handling, production PWA asset caching, and push notification worker lifecycle.

- [ ] **Step 2: Write the failing service-worker sandbox tests**

Create `apps/web/app/(main)/__tests__/service-worker-cache.test.ts`. Load `public/sw.js` with `node:vm`, capture registered listeners, and provide fake `caches`, `fetch`, `self`, `clients`, `Request`, `Response`, and `URL` globals:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

function loadWorker(cacheNames = ["pos-v5", "other-app"]) {
  const listeners = new Map<string, (event: any) => void>();
  const activeCache = {
    match: vi.fn().mockResolvedValue(undefined),
    put: vi.fn().mockResolvedValue(undefined),
    add: vi.fn().mockResolvedValue(undefined),
  };
  const caches = {
    keys: vi.fn().mockResolvedValue(cacheNames),
    delete: vi.fn().mockResolvedValue(true),
    open: vi.fn().mockResolvedValue(activeCache),
    match: vi.fn().mockResolvedValue(undefined),
  };
  const source = readFileSync(join(process.cwd(), "public/sw.js"), "utf8");

  runInNewContext(source, {
    self: {
      addEventListener: (type: string, handler: (event: any) => void) =>
        listeners.set(type, handler),
      skipWaiting: vi.fn(),
      clients: { claim: vi.fn() },
      registration: { showNotification: vi.fn() },
    },
    clients: { matchAll: vi.fn().mockResolvedValue([]), openWindow: vi.fn() },
    caches,
    fetch: vi.fn().mockResolvedValue(new Response("asset", { status: 200 })),
    Request,
    Response,
    URL,
    console,
  });

  return { listeners, caches, activeCache };
}

describe("service worker runtime cache policy", () => {
  it("does not intercept Next.js assets", () => {
    const worker = loadWorker();
    const respondWith = vi.fn();

    worker.listeners.get("fetch")?.({
      request: new Request("https://pos.example/_next/static/chunks/app.js"),
      respondWith,
    });

    expect(respondWith).not.toHaveBeenCalled();
    expect(worker.caches.open).not.toHaveBeenCalled();
  });

  it("deletes old POS caches without deleting another app cache", async () => {
    const worker = loadWorker(["pos-v5", "pos-v6", "other-app"]);
    let activation: Promise<unknown> | undefined;

    worker.listeners.get("activate")?.({
      waitUntil: (promise: Promise<unknown>) => {
        activation = promise;
      },
    });
    await activation;

    expect(worker.caches.delete.mock.calls).toEqual([["pos-v5"]]);
  });

  it("still caches application icons in the active POS cache", async () => {
    const worker = loadWorker();
    const respondWith = vi.fn();

    worker.listeners.get("fetch")?.({
      request: new Request("https://pos.example/icons/icon-192.png"),
      respondWith,
    });

    expect(respondWith).toHaveBeenCalledOnce();
    await respondWith.mock.calls[0][0];
    expect(worker.caches.open).toHaveBeenCalledWith("pos-v6");
    expect(worker.activeCache.match).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 3: Run service-worker tests and verify RED**

```bash
pnpm --filter @pos/web exec vitest run "app/(main)/__tests__/service-worker-cache.test.ts"
```

Expected failures:

- `/_next/static/*` currently calls `respondWith`.
- activation currently deletes `other-app` and retains `pos-v5`.
- cache name is still `pos-v5`.

- [ ] **Step 4: Implement the minimal cache-policy fix**

Modify `apps/web/public/sw.js`:

```js
const CACHE_PREFIX = "pos-v";
const CACHE_NAME = "pos-v6";
```

In `activate`, delete only keys that start with `CACHE_PREFIX` and differ from `CACHE_NAME`.

In the `fetch` listener, add this guard before API or asset handling:

```js
if (url.pathname.startsWith("/_next/")) return;
```

Remove `/_next/static/` from the `cacheFirst` condition. In `cacheFirst`, open `CACHE_NAME` first and call `cache.match(request)` instead of global `caches.match(request)`.

- [ ] **Step 5: Run service-worker tests and verify GREEN**

Run the targeted Vitest command from Step 3.

Expected: all three tests PASS.

- [ ] **Step 6: Run all new regression tests**

```bash
pnpm --filter @pos/web exec vitest run "app/(main)/__tests__/error-recovery.test.ts" "app/(main)/__tests__/error.test.tsx" "app/(main)/__tests__/service-worker-cache.test.ts"
```

Expected: PASS with no errors or warnings.

- [ ] **Step 7: Commit Task 3**

```bash
git add "apps/web/public/sw.js" "apps/web/app/(main)/__tests__/service-worker-cache.test.ts"
git commit -m "fix: bypass Next assets in service worker"
```

### Task 4: Full validation, impact review, dan implementation documentation

**Files:**
- Modify: `markdown-files/production-version-skew-error-recovery-2026-08-23.md`

**Interfaces:**
- Consumes: completed behavior and test output from Tasks 1 through 3.
- Produces: evidence-backed final documentation and clean repository validation report.

- [ ] **Step 1: Run the focused regression suite**

```bash
pnpm --filter @pos/web exec vitest run "app/(main)/__tests__/error-recovery.test.ts" "app/(main)/__tests__/error.test.tsx" "app/(main)/__tests__/service-worker-cache.test.ts"
```

Expected: PASS.

- [ ] **Step 2: Run the complete web unit test suite**

```bash
pnpm test
```

Expected: exit code 0 with no failing tests.

- [ ] **Step 3: Run lint and TypeScript checks**

```bash
pnpm lint
pnpm type-check
```

Expected: both commands exit 0. Do not substitute `pnpm build`.

- [ ] **Step 4: Run relevant audits**

```bash
pnpm audit:icons
pnpm audit --audit-level high
```

Expected: icon import audit passes. Dependency audit has no high-severity issue introduced by this change; no dependency is modified by the implementation.

- [ ] **Step 5: Run GitNexus change detection**

```bash
node .gitnexus/run.cjs detect-changes -r pos-system-monorepo -s compare -b main
```

If `main` now points to the current implementation commits, compare against design commit `6e68a77` instead:

```bash
node .gitnexus/run.cjs detect-changes -r pos-system-monorepo -s compare -b 6e68a77
```

Expected affected scope: main route error recovery and service-worker cache lifecycle only. Investigate any unrelated execution flow before continuing.

- [ ] **Step 6: Update implementation documentation**

Append an `Implementation Result` section to `markdown-files/production-version-skew-error-recovery-2026-08-23.md` containing:

- Exact files changed.
- Final recovery behavior for runtime mismatch and generic error.
- Service-worker cache version and bypass rule.
- Actual focused/full test, lint, type-check, icon audit, dependency audit, and GitNexus results.
- Vercel operational follow-up: verify Skew Protection and Automatically expose System Environment Variables in project settings.

- [ ] **Step 7: Self-review the documentation and diff**

```bash
rg -n "T[B]D|T[O]DO|implement l[a]ter|fill in det[a]ils" "markdown-files/production-version-skew-error-recovery-2026-08-23.md"
git diff --check
git status --short
```

Expected: no placeholders, no whitespace errors, and only intended files plus preserved user-owned `AGENTS.md` and `CLAUDE.md` changes.

- [ ] **Step 8: Commit final documentation**

```bash
git add -f "markdown-files/production-version-skew-error-recovery-2026-08-23.md"
git commit -m "docs: record production error recovery"
```

- [ ] **Step 9: Run final clean verification**

```bash
git status --short
```

Expected: only the pre-existing user-owned `AGENTS.md` modification and untracked `CLAUDE.md` remain.

## Antislop Delivery Gate

- R-02 PASS target: UI copy contains no em dash.
- R-03 PASS target: controls retain responsive layout and minimum 44px tap targets.
- R-25 PASS target: existing surface/brand/danger tokens preserve readable contrast.
- R-26 PASS target: every rendered button has a concrete `onClick` action.
- R-32 PASS target: native buttons and visible `focus-visible` ring support keyboard use.
- R-35 PASS target: focused tests, full tests, lint, type-check, and audits run successfully without forbidden production build.
- C-2 PASS target: runtime mismatch gets hard reload; generic error gets reset plus reload fallback.
- C-4 PASS target: cleanup failure still reaches hard reload and error copy never depends on raw internal message.
- ENERGY 1 / RHYTHM 1 / MOTION 1 target: existing calm error-state hierarchy remains, with motion limited to recovery loading feedback.
