# AI Assistant Notification and App Shell Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the standalone floating notification center and top-right ambient loop while preserving notification access through Pak Teladan.

**Architecture:** Keep `NotificationProvider` as the single notification data source and keep both assistant components as its consumers. Simplify the authenticated shell so `DeferredAssistantWidget` is the only floating global action, then delete the standalone notification UI and its private drag-preference code.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS, Vitest, React DOM server rendering, GitNexus CLI, pnpm workspace scripts.

## Global Constraints

- Follow test-driven development: change the test first, observe the expected failure, then edit production code.
- User-visible copy stays in friendly Indonesian.
- Keep the existing unread badge and maximum of three unread previews in Pak Teladan.
- Do not change `NotificationProvider`, notification APIs, push delivery, permission prompts, sound, or settings.
- Do not add dependencies.
- Do not run `pnpm build`, start `pnpm dev`, or stop an existing development server.
- Apply antislop during the cleanup and write an after-work audit for the changed UI surface.
- Do not stage or modify the user's existing `AGENTS.md` and `CLAUDE.md` changes.

## File Map

- Modify `apps/web/app/(main)/__tests__/layout.test.ts`: lock the absence of the standalone notification center and ambient loop.
- Modify `apps/web/app/(main)/layout.tsx`: remove the redundant floating UI and loop markup.
- Modify `apps/web/app/globals.css`: remove loop-only animation styles and low-spec overrides.
- Delete `apps/web/features/notifications/components/NotificationCenter.tsx`: remove the unused standalone UI.
- Delete `apps/web/features/notifications/components/__tests__/NotificationCenter.test.tsx`: remove tests for deleted UI.
- Delete `apps/web/features/notifications/helpers/notification-floating-control.ts`: remove private drag-preference logic.
- Delete `apps/web/features/notifications/helpers/__tests__/notification-floating-control.test.ts`: remove tests for deleted helper logic.
- Create `markdown-files/ai-assistant-notification-shell-cleanup-2026-08-23.md`: record the implemented behavior and validation.
- Create `anti-slop/audit-001-2026-08-23.md`: record the scoped after-work antislop audit.

---

### Task 1: Remove the standalone notification UI and ambient loop

**Files:**
- Modify: `apps/web/app/(main)/__tests__/layout.test.ts:45`
- Modify: `apps/web/app/(main)/layout.tsx:1`
- Modify: `apps/web/app/globals.css:266`
- Delete: `apps/web/features/notifications/components/NotificationCenter.tsx`
- Delete: `apps/web/features/notifications/components/__tests__/NotificationCenter.test.tsx`
- Delete: `apps/web/features/notifications/helpers/notification-floating-control.ts`
- Delete: `apps/web/features/notifications/helpers/__tests__/notification-floating-control.test.ts`
- Regression test: `apps/web/features/ai-assistant/components/__tests__/AssistantWidget.test.tsx`

**Interfaces:**
- Consumes: `DeferredAssistantWidget` and the existing `NotificationProvider` context.
- Produces: an authenticated `MainLayout` with one floating global action and no standalone notification UI or `app-page-loop` markup.

- [ ] **Step 1: Confirm symbol impact before production edits**

Run:

```powershell
node .gitnexus/run.cjs impact -r pos-system-monorepo NotificationCenter
node .gitnexus/run.cjs impact -r pos-system-monorepo MainLayout
node .gitnexus/run.cjs impact -r pos-system-monorepo clampNotificationY
node .gitnexus/run.cjs impact -r pos-system-monorepo snapNotificationEdge
node .gitnexus/run.cjs impact -r pos-system-monorepo parseNotificationFloatingPreference
```

Expected: `NotificationCenter` has one direct caller, `MainLayout`. The shell may report broad `CRITICAL` risk because the framework layout fans out across authenticated pages; this warning is already documented and approved in the design spec. The floating helper functions are limited to the standalone component and their tests.

- [ ] **Step 2: Write the failing authenticated-layout test**

Replace the old ambient-loop test in `apps/web/app/(main)/__tests__/layout.test.ts` with:

```tsx
it("keeps Pak Teladan as the only floating global action", () => {
  const html = renderToStaticMarkup(
    React.createElement(
      MainLayout,
      null,
      React.createElement("main", null, "Dashboard"),
    ),
  );
  const source = readFileSync(new URL("../layout.tsx", import.meta.url), "utf8");

  expect(source).not.toContain("NotificationCenter");
  expect(html).not.toContain("app-page-loop");
  expect(html).toContain("floating-ai-button");
});
```

- [ ] **Step 3: Run the targeted test and verify RED**

Run:

```powershell
pnpm --filter @pos/web exec vitest run 'app/(main)/__tests__/layout.test.ts'
```

Expected: FAIL because `layout.tsx` still imports or renders `NotificationCenter` and still renders `app-page-loop`.

- [ ] **Step 4: Apply the minimal production cleanup**

Make `apps/web/app/(main)/layout.tsx` exactly:

```tsx
import React, { Suspense } from "react";
import { Sidebar } from "@/components/Sidebar";
import { DeferredAssistantWidget } from "@/features/ai-assistant/components/DeferredAssistantWidget";
import MainLoading from "./loading";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[100dvh] overflow-hidden bg-surface-50">
      <Sidebar />
      <div className="relative flex flex-1 flex-col overflow-x-auto overflow-y-hidden pb-16 md:pb-0 min-w-0">
        <Suspense fallback={<MainLoading />}>{children}</Suspense>
      </div>
      <DeferredAssistantWidget />
    </div>
  );
}
```

In `apps/web/app/globals.css`:

1. Delete the `app-page-loop-orbit` keyframes.
2. Delete `.app-page-loop-dot`, `.app-page-loop-dot-primary`, and `.app-page-loop-dot-secondary`.
3. Delete the reduced-motion block that only targets `.app-page-loop-dot`.
4. Remove `.app-page-loop-dot` from the low-spec combined animation selector, leaving the selector ending as:

```css
html[data-performance-mode="lite"] .assistant-quick-prompt-glow {
  animation: none !important;
}
```

5. Delete the low-spec `.app-page-loop { display: none; }` block.

Use `apply_patch` to delete these four dead files:

```text
apps/web/features/notifications/components/NotificationCenter.tsx
apps/web/features/notifications/components/__tests__/NotificationCenter.test.tsx
apps/web/features/notifications/helpers/notification-floating-control.ts
apps/web/features/notifications/helpers/__tests__/notification-floating-control.test.ts
```

- [ ] **Step 5: Run targeted tests and verify GREEN**

Run:

```powershell
pnpm --filter @pos/web exec vitest run 'app/(main)/__tests__/layout.test.ts'
pnpm --filter @pos/web exec vitest run 'features/ai-assistant/components/__tests__/AssistantWidget.test.tsx'
```

Expected: both files PASS. The assistant regression includes `Pak Teladan ngabarin`, unread count, preview title, and launcher badge coverage.

- [ ] **Step 6: Validate the TypeScript workspace after the code change**

Run:

```powershell
pnpm lint
pnpm type-check
```

Expected: both commands exit zero without errors or warnings introduced by the cleanup.

- [ ] **Step 7: Verify the staged blast radius and commit only Task 1 files**

Run:

```powershell
git add -- 'apps/web/app/(main)/__tests__/layout.test.ts' 'apps/web/app/(main)/layout.tsx' 'apps/web/app/globals.css' 'apps/web/features/notifications/components/NotificationCenter.tsx' 'apps/web/features/notifications/components/__tests__/NotificationCenter.test.tsx' 'apps/web/features/notifications/helpers/notification-floating-control.ts' 'apps/web/features/notifications/helpers/__tests__/notification-floating-control.test.ts'
git diff --cached --check
node .gitnexus/run.cjs detect-changes -r pos-system-monorepo -s staged
git diff --cached --name-only
```

Expected: only the seven Task 1 paths are staged. GitNexus reports the app-shell removal and no notification provider, API, push, settings, or assistant notification symbols changed.

Commit:

```powershell
git commit -m 'refactor: consolidate notifications in assistant'
```

---

### Task 2: Run full regression validation and document the result

**Files:**
- Create: `markdown-files/ai-assistant-notification-shell-cleanup-2026-08-23.md`
- Create: `anti-slop/audit-001-2026-08-23.md`

**Interfaces:**
- Consumes: the simplified app shell produced by Task 1 and the unchanged Pak Teladan notification integration.
- Produces: validation evidence, required dated implementation documentation, and a scoped after-work antislop audit.

- [ ] **Step 1: Verify source-level boundaries**

Run:

```powershell
rg -n 'NotificationCenter|app-page-loop' 'apps/web/app/(main)/layout.tsx' 'apps/web/app/globals.css'
rg -n 'unreadCount|Pak Teladan ngabarin' 'apps/web/features/ai-assistant/components/DeferredAssistantWidget.tsx' 'apps/web/features/ai-assistant/components/AssistantWidget.tsx'
```

Expected: the first command finds no matches. The second command finds the existing unread badges and assistant notification preview.

- [ ] **Step 2: Run the full repository validation suite**

Run:

```powershell
pnpm test
pnpm lint
pnpm type-check
```

Expected: every command exits zero. Do not substitute `pnpm build` for any validation command.

- [ ] **Step 3: Create the required dated implementation note**

Create `markdown-files/ai-assistant-notification-shell-cleanup-2026-08-23.md` with:

```markdown
# AI Assistant Notification and App Shell Cleanup

Date: 2026-08-23
Status: Implemented and validated

## Outcome

The authenticated app shell no longer renders a standalone floating notification center or the small ambient loop in the top-right corner. Pak Teladan remains the single in-app notification entry point through its unread badge and preview of up to three unread notifications.

## Removed

- Standalone draggable notification bell, panel, hide control, and restore tab.
- Notification floating-position preference helper and its tests.
- Global `app-page-loop` markup, keyframes, dot styles, and low-spec overrides.

## Preserved

- `NotificationProvider`, inbox polling, and mark-as-read behavior.
- Notification API routes, browser push delivery, permission prompt, sound, and settings.
- Pak Teladan unread badge, notification previews, and destination navigation.

## Validation

- Authenticated layout tests passed.
- Pak Teladan component tests passed.
- Full `pnpm test` passed.
- `pnpm lint` passed.
- `pnpm type-check` passed.
- GitNexus change detection confirmed the expected app-shell and dead-UI scope.
```

- [ ] **Step 4: Create the after-work antislop audit**

Create the `anti-slop` directory if it is absent, then create `anti-slop/audit-001-2026-08-23.md` with this scoped audit:

```markdown
# Anti-slop Audit 001

Date: 2026-08-23
Scope: Authenticated app shell and Pak Teladan notification entry point
Outcome: PASS, no actionable findings

## Design Read

Authenticated POS shell for operational users, established visual language, dial `ENERGY 1 / RHYTHM 1 / MOTION 1` for global shell decoration.

## Findings

No numbered findings. The changed surface passes the delivery gate.

## Hard Gate

- R-02 PASS: no new UI copy or em dash was introduced.
- R-03 PASS: removing fixed controls reduces collision and overflow risk on mobile.
- R-17 PASS: no statistics were added.
- R-18 PASS: no testimonials were added.
- R-23 PASS: no visual assets or identities were invented.
- R-24 PASS: no navigation items were added.
- R-25 PASS: no colors or text contrast were changed.
- R-26 PASS: Pak Teladan notification cards retain real mark-and-navigate behavior.
- R-27 PASS: the assistant retains its existing empty, loading, and error behavior while optional notification affordances render only when data exists.
- R-28 PASS: no FAQ content was added.
- R-32 PASS: redundant controls leave the tab order; remaining launcher and cards are native buttons.
- R-33 PASS: source and CSS were edited directly with `apply_patch`.
- R-34 PASS: no theme behavior was changed.
- R-35 PASS: targeted interaction tests, full tests, lint, and type checking passed.
- R-36 PASS: no claims were added.
- R-37 PASS: the approved design read and dials guided the cleanup.
- R-38 PASS: no fabricated content was added.

## Purpose Gate

- R-01 PASS: no color or gradient was added.
- R-04 PASS: no icon was added.
- R-06 PASS: typography was not changed.
- R-07 PASS: no background pattern was added.
- R-08 PASS: no decorative arrow was added.
- R-09 PASS: no badge was added; the existing unread count remains functional.
- R-10 PASS: no glassmorphism was added.
- R-12 PASS: no shadow was added.
- R-13 PASS: no glow was added.
- R-14 PASS: no feature card was added.
- R-19 PASS: the decorative top-right loop was removed and no replacement motion was introduced.
- R-22 PASS: no illustration was added.

## Liveliness

- Dials PASS: `ENERGY 1 / RHYTHM 1 / MOTION 1` is explicit and matches the calmer shell.
- Focal point PASS: Pak Teladan is the only floating global action.
- Whitespace PASS: removing duplicate controls restores clear shell space.
- Accent PASS: the existing Pak Teladan control remains the deliberate accent.
- Identity PASS: Pak Teladan remains the product-specific notification voice.
- Design Read PASS: recorded above and in the approved design spec.

## Craftsmanship and Quality Locks

- C-1 PASS: every removal serves reduced duplication or reduced decorative motion.
- C-2 PASS: remaining notification controls retain real behavior.
- C-3 PASS: no filler section was introduced.
- C-4 PASS: targeted and full validation protect shell resilience.
- C-5 PASS: no claim or evidence content was added.
- R-05 PASS: the existing content structure remains intact.
- R-11 PASS: no radius was added or changed.
- R-15 PASS: no CTA was added.
- R-16 PASS: no buzzword copy was added.
- R-20 PASS: Pak Teladan remains the product-specific identity motif.
- R-21 PASS: no theme default or toggle behavior was changed.
- R-29 PASS: no palette color was added.
- R-30 PASS: no external product style was copied.
- R-31 PASS: layout removal reduces duplicate controls; motion removal reduces non-functional decoration; typography, spacing, cards, and illustration were unchanged.
```

- [ ] **Step 5: Run documentation checks, detect staged changes, and commit**

Run:

```powershell
git diff --check
git add -- 'markdown-files/ai-assistant-notification-shell-cleanup-2026-08-23.md' 'anti-slop/audit-001-2026-08-23.md'
git diff --cached --check
node .gitnexus/run.cjs detect-changes -r pos-system-monorepo -s staged
git diff --cached --name-only
```

Expected: only the implementation note and audit are staged. GitNexus may report no symbol changes because both files are Markdown.

Commit:

```powershell
git commit -m 'docs: record assistant notification cleanup'
```

- [ ] **Step 6: Confirm the final working tree preserves user-owned changes**

Run:

```powershell
git status --short
```

Expected: only the user's pre-existing `AGENTS.md` modification and untracked `CLAUDE.md` remain. No task file is unstaged.
