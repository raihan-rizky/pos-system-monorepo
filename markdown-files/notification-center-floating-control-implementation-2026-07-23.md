# Notification Center Floating Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membuat Notification Center default hidden, dapat direstore lewat tab `>`, draggable dengan snap kiri/kanan, dan menyimpan preference setelah reload.

**Architecture:** Pure helper terpisah menangani default state, validasi storage, vertical clamp, dan edge snapping. `NotificationCenter` menangani browser state, Pointer Events, resize, serta persistence; `NotificationCenterView` tetap menjadi presentational component yang bisa diverifikasi lewat server-render tests.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Lucide React, Vitest, localStorage, Pointer Events.

## Global Constraints

- Gunakan `pnpm dev` hanya jika user mengelola server; jangan menjalankan `pnpm build`.
- Jangan menambahkan dependency baru.
- Default preference adalah hidden pada sisi kanan.
- Snap hanya ke sisi kiri atau kanan; posisi vertikal tetap mengikuti titik drag.
- Posisi, sisi, dan visibility persist setelah reload.
- Hidden affordance menggunakan ikon `>` dengan hover/focus animation.
- User-visible text menggunakan bahasa Indonesia yang ramah.
- Pertahankan unread badge, mark-all-read, outside click, dan deep-link navigation.
- Jangan menyentuh file env yang sudah ada di worktree.

---

### Task 1: Floating Preference Helpers

**Files:**
- Create: `apps/web/features/notifications/helpers/notification-floating-control.ts`
- Create: `apps/web/features/notifications/helpers/__tests__/notification-floating-control.test.ts`

**Interfaces:**
- Produces:
  - `NotificationFloatingEdge = "left" | "right"`
  - `NotificationFloatingPreference = { edge: NotificationFloatingEdge; y: number; hidden: boolean }`
  - `NOTIFICATION_FLOATING_PREFERENCE_KEY`
  - `DEFAULT_NOTIFICATION_FLOATING_PREFERENCE`
  - `clampNotificationY(y, viewportHeight, controlHeight, margin?)`
  - `snapNotificationEdge(pointerX, viewportWidth)`
  - `parseNotificationFloatingPreference(value)`

- [ ] **Step 1: Write failing helper tests**

```ts
expect(DEFAULT_NOTIFICATION_FLOATING_PREFERENCE).toEqual({
  edge: "right",
  y: 24,
  hidden: true,
});
expect(clampNotificationY(-20, 800, 48)).toBe(8);
expect(clampNotificationY(900, 800, 48)).toBe(744);
expect(snapNotificationEdge(200, 1000)).toBe("left");
expect(snapNotificationEdge(800, 1000)).toBe("right");
expect(parseNotificationFloatingPreference('{"edge":"left","y":120,"hidden":false}'))
  .toEqual({ edge: "left", y: 120, hidden: false });
expect(parseNotificationFloatingPreference("broken"))
  .toEqual(DEFAULT_NOTIFICATION_FLOATING_PREFERENCE);
```

- [ ] **Step 2: Run RED test**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run features/notifications/helpers/__tests__/notification-floating-control.test.ts
```

Expected: FAIL because the helper module does not exist.

- [ ] **Step 3: Implement minimal pure helpers**

```ts
export type NotificationFloatingEdge = "left" | "right";

export type NotificationFloatingPreference = {
  edge: NotificationFloatingEdge;
  y: number;
  hidden: boolean;
};

export const NOTIFICATION_FLOATING_PREFERENCE_KEY =
  "pos_notification_floating_preference_v1";

export const DEFAULT_NOTIFICATION_FLOATING_PREFERENCE = {
  edge: "right",
  y: 24,
  hidden: true,
} satisfies NotificationFloatingPreference;

export function clampNotificationY(
  y: number,
  viewportHeight: number,
  controlHeight: number,
  margin = 8,
) {
  return Math.min(
    Math.max(y, margin),
    Math.max(margin, viewportHeight - controlHeight - margin),
  );
}

export function snapNotificationEdge(pointerX: number, viewportWidth: number) {
  return pointerX < viewportWidth / 2 ? "left" : "right";
}

export function parseNotificationFloatingPreference(
  value: string | null,
): NotificationFloatingPreference {
  try {
    const parsed = value ? JSON.parse(value) : null;
    if (
      parsed &&
      (parsed.edge === "left" || parsed.edge === "right") &&
      Number.isFinite(parsed.y) &&
      typeof parsed.hidden === "boolean"
    ) {
      return { edge: parsed.edge, y: parsed.y, hidden: parsed.hidden };
    }
  } catch {}
  return { ...DEFAULT_NOTIFICATION_FLOATING_PREFERENCE };
}
```

- [ ] **Step 4: Run GREEN helper test**

Run the Task 1 test command. Expected: PASS.

---

### Task 2: Presentational Hidden and Visible States

**Files:**
- Modify: `apps/web/features/notifications/components/NotificationCenter.tsx`
- Modify: `apps/web/features/notifications/components/__tests__/NotificationCenter.test.tsx`

**Interfaces:**
- Consumes: `NotificationFloatingPreference`.
- Extends `NotificationCenterViewProps` with:
  - `preference`
  - `dragging`
  - `onHide`
  - `onRestore`
  - pointer handler props for the floating control.

- [ ] **Step 1: Write failing render tests**

Add one test rendering `{ edge: "right", y: 24, hidden: true }` and assert:

```ts
expect(html).toContain('aria-label="Tampilkan notifikasi"');
expect(html).toContain("translate-x");
expect(html).not.toContain('aria-label="Notifikasi"');
```

Add one visible-state test and assert:

```ts
expect(html).toContain('aria-label="Sembunyikan notifikasi"');
expect(html).toContain('aria-label="Notifikasi, 3 belum dibaca"');
expect(html).toContain("Pusat notifikasi");
```

- [ ] **Step 2: Run RED component test**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run features/notifications/components/__tests__/NotificationCenter.test.tsx
```

Expected: FAIL because hidden preference and hide/restore controls are not rendered.

- [ ] **Step 3: Implement minimal hidden tab and visible shell**

Render a fixed root using inline `top: preference.y`, edge-aware left/right classes, and `touch-none`.

Hidden state:

```tsx
<button
  type="button"
  aria-label="Tampilkan notifikasi"
  onClick={onRestore}
  className="group flex h-11 w-7 items-center justify-center rounded-l-xl border bg-white shadow-lg transition duration-200 hover:-translate-x-1 hover:scale-105 hover:shadow-xl focus-visible:-translate-x-1 motion-reduce:transform-none"
>
  <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none" />
</button>
```

Visible state adds a small hide button with `aria-label="Sembunyikan notifikasi"` and keeps the existing bell, badge, and panel content.

Panel alignment:

```ts
preference.edge === "left" ? "left-0" : "right-0"
```

- [ ] **Step 4: Run GREEN component test**

Run the Task 2 test command. Expected: PASS, including existing unread-history tests.

---

### Task 3: Pointer Drag, Snap, Persistence, and Resize

**Files:**
- Modify: `apps/web/features/notifications/components/NotificationCenter.tsx`
- Modify: `apps/web/features/notifications/components/__tests__/NotificationCenter.test.tsx`

**Interfaces:**
- Consumes all Task 1 helpers.
- `NotificationCenter` owns `preference`, `dragPosition`, `dragging`, and refs for drag threshold/click suppression.

- [ ] **Step 1: Write failing source-contract test for browser wiring**

Read `NotificationCenter.tsx` from the test and assert the behavior contracts:

```ts
expect(source).toContain("NOTIFICATION_FLOATING_PREFERENCE_KEY");
expect(source).toContain("localStorage.getItem");
expect(source).toContain("localStorage.setItem");
expect(source).toContain("setPointerCapture");
expect(source).toContain("snapNotificationEdge");
expect(source).toContain("clampNotificationY");
expect(source).toContain('window.addEventListener("resize"');
```

- [ ] **Step 2: Run RED wiring test**

Run the Task 2 test command. Expected: FAIL because persistence and Pointer Events are not wired.

- [ ] **Step 3: Implement persisted state**

On mount:

```ts
const stored = parseNotificationFloatingPreference(
  window.localStorage.getItem(NOTIFICATION_FLOATING_PREFERENCE_KEY),
);
setPreference({
  ...stored,
  y: clampNotificationY(stored.y, window.innerHeight, CONTROL_HEIGHT),
});
setHydrated(true);
```

Persist only after hydration:

```ts
window.localStorage.setItem(
  NOTIFICATION_FLOATING_PREFERENCE_KEY,
  JSON.stringify(preference),
);
```

Catch storage errors without blocking state updates.

- [ ] **Step 4: Implement Pointer Events**

Use pointer capture and a 5px threshold. Pointer move updates temporary `x/y`. Pointer up:

```ts
const edge = snapNotificationEdge(event.clientX, window.innerWidth);
const y = clampNotificationY(
  dragPosition.y,
  window.innerHeight,
  preference.hidden ? HIDDEN_CONTROL_HEIGHT : VISIBLE_CONTROL_HEIGHT,
);
setPreference((current) => ({ ...current, edge, y }));
```

Set a ref when threshold is crossed and suppress the next click. Handle `pointercancel` with the same cleanup but without opening the panel.

- [ ] **Step 5: Implement resize clamp and hide/restore**

Resize:

```ts
setPreference((current) => ({
  ...current,
  y: clampNotificationY(
    current.y,
    window.innerHeight,
    current.hidden ? HIDDEN_CONTROL_HEIGHT : VISIBLE_CONTROL_HEIGHT,
  ),
}));
```

Hide closes the panel and stores `hidden: true`; restore stores `hidden: false`.

- [ ] **Step 6: Run GREEN notification tests**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run features/notifications/helpers/__tests__/notification-floating-control.test.ts features/notifications/components/__tests__/NotificationCenter.test.tsx
```

Expected: both test files PASS.

---

### Task 4: Help Documentation and Final Validation

**Files:**
- Modify: `apps/web/features/help-documentation/components/HelpContent.tsx`
- Modify: `apps/web/features/help-documentation/__tests__/HelpContent.test.tsx`
- Update: `markdown-files/notification-center-floating-control-design-2026-07-23.md` only if implementation differs from the approved design.

**Interfaces:**
- No new runtime interfaces.

- [ ] **Step 1: Write failing help-content test**

Extend the notification help assertion:

```ts
expect(html).toContain("geser");
expect(html).toContain("sembunyikan");
expect(html).toContain(">");
```

- [ ] **Step 2: Run RED help test**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run features/help-documentation/__tests__/HelpContent.test.tsx
```

Expected: FAIL because drag/hide guidance is absent.

- [ ] **Step 3: Update friendly Indonesian help copy**

Explain that the bell starts hidden behind the `>` tab, can be restored, dragged vertically, snapped to the nearest left/right edge, hidden again, and keeps its position after reload.

- [ ] **Step 4: Run GREEN help test**

Run the Task 4 test command. Expected: PASS.

- [ ] **Step 5: Run full targeted regression**

```powershell
.\node_modules\.bin\vitest.cmd run features/notifications/helpers/__tests__/notification-floating-control.test.ts features/notifications/components/__tests__/NotificationCenter.test.tsx features/help-documentation/__tests__/HelpContent.test.tsx
```

Expected: all targeted tests PASS.

- [ ] **Step 6: Run lint and type validation**

```powershell
.\node_modules\.bin\eslint.cmd features/notifications/helpers/notification-floating-control.ts features/notifications/helpers/__tests__/notification-floating-control.test.ts features/notifications/components/NotificationCenter.tsx features/notifications/components/__tests__/NotificationCenter.test.tsx features/help-documentation/components/HelpContent.tsx features/help-documentation/__tests__/HelpContent.test.tsx
.\node_modules\.bin\tsc.cmd --noEmit
```

Expected: both commands exit 0.

- [ ] **Step 7: Verify final diff**

```powershell
git diff --check
git status --short
```

Expected: no whitespace errors; the two pre-existing env files remain untouched.
