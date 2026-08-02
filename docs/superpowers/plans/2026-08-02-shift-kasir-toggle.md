# Shift Kasir Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tambahkan setting owner-only untuk mematikan kewajiban shift kasir, mempause shift `OPEN` secara akurat, dan membuat POS dapat bertransaksi tanpa popup shift saat setting OFF.

**Architecture:** Simpan flag `shiftEnabled` di `StoreSettings` dan metadata pause di `CashierShift`. Gunakan service server-side yang mengubah setting serta pause/resume shift dalam satu database transaction. POS membaca setting melalui initial server data dan query refresh, sementara API mutation hanya menerima role `OWNER`.

**Tech Stack:** Next.js App Router, React, TanStack Query, TypeScript, Prisma/PostgreSQL, Vitest, Playwright, Tailwind CSS.

## Global Constraints

- Gunakan `pnpm dev` saat iterasi; jangan menjalankan `pnpm build` dalam sesi agent.
- Tulis user-visible text dalam Bahasa Indonesia yang friendly; istilah `shift`, `owner`, dan `POS` boleh dipertahankan.
- Gunakan TDD: tulis test yang gagal, jalankan untuk memastikan gagal, implementasi minimal, lalu jalankan test sampai pass.
- Owner-only harus enforced di server API, bukan hanya dengan menyembunyikan tab frontend.
- Default `shiftEnabled` harus `true` agar behavior existing tetap aman untuk data lama.
- Shift `OPEN` tetap `OPEN`; jangan mengubah `openedAt`, `closedAt`, saldo, atau history saat pause/resume.
- Update dokumentasi Bantuan di `apps/web/features/help-documentation/components/HelpContent.tsx` setelah feature selesai.
- Tidak perlu mengubah `apps/web/features/ai-assistant/workflows/workflow-catalog.ts` karena feature ini bukan guided workflow baru atau perubahan guided workflow.

---

## File Map

Create:

- `packages/db/prisma/migrations/20260802_shift_kasir_toggle/migration.sql` — migration untuk flag settings dan metadata pause.
- `apps/web/lib/shift/shift-pause.ts` — pure calculation helper untuk effective duration dan durasi pause.
- `apps/web/lib/shift/__tests__/shift-pause.test.ts` — unit tests helper durasi.
- `apps/web/lib/shift/shift-settings-server.ts` — read/update setting dan atomic pause/resume transaction.
- `apps/web/app/api/settings/shift/route.ts` — GET untuk role POS dan PATCH owner-only.
- `apps/web/app/api/settings/shift/__tests__/route.test.ts` — authorization dan response tests endpoint.
- `apps/web/hooks/useShiftSettings.ts` — query/mutation client untuk status shift.
- `apps/web/components/settings/ShiftSettingsTab.tsx` — card dan confirmation UI owner.
- `apps/web/components/settings/__tests__/ShiftSettingsTab.test.tsx` — component tests toggle/confirmation/error.

Modify:

- `packages/db/prisma/schema.prisma` — tambah field `shiftEnabled`, `pausedAt`, `pausedDurationSeconds`.
- `apps/web/app/api/shifts/route.ts` — serialize pause fields dan pause shift baru saat feature OFF.
- `apps/web/hooks/useShift.ts` — expose pause fields pada `CashierShift`.
- `apps/web/app/(main)/settings/page.tsx` — register tab owner-only.
- `apps/web/app/(main)/pos/POSClientPage.tsx` — gate popup/banner/checkout berdasarkan setting.
- `apps/web/app/(main)/pos/pos-initial-data.ts` — preload `shiftEnabled` agar tidak ada popup flicker.
- `apps/web/app/(main)/pos/__tests__/pos-initial-data.test.ts` — cover preload default dan OFF.
- `apps/web/components/ShiftStatusBanner.tsx` — tampilkan effective uptime dengan pause metadata.
- `apps/web/app/(main)/shift/page.tsx` — tampilkan effective duration dan paused state.
- `apps/web/e2e/settings.spec.ts` — owner tab dan toggle flow.
- `apps/web/e2e/pos.spec.ts` — POS flow tanpa active shift saat feature OFF.
- `apps/web/features/help-documentation/components/HelpContent.tsx` — panduan owner dan kasir.
- `markdown-files/shift-kasir-toggle-2026-08-02.md` — tambahkan catatan implementasi dan validasi setelah feature selesai.

---

### Task 1: Build and test pure pause-duration calculations

**Files:**
- Create: `apps/web/lib/shift/__tests__/shift-pause.test.ts`
- Create: `apps/web/lib/shift/shift-pause.ts`

**Interfaces:**
- Produces `getPauseDurationSeconds(pausedAt: Date | string, resumedAt: Date | string): number`.
- Produces `getEffectiveDurationSeconds(input: { openedAt: Date | string; closedAt?: Date | string | null; pausedAt?: Date | string | null; pausedDurationSeconds?: number | null }, now?: Date): number`.
- Produces `formatEffectiveDuration(seconds: number): string` with existing copy style (`"0 mnt"`, `"1j 5m"`).

- [ ] **Step 1: Write failing tests**

Add tests for:

```ts
it("subtracts an active pause from an open shift", () => {
  expect(getEffectiveDurationSeconds({
    openedAt: "2026-08-02T08:00:00.000Z",
    pausedAt: "2026-08-02T09:00:00.000Z",
    pausedDurationSeconds: 600,
  }, new Date("2026-08-02T10:00:00.000Z"))).toBe(3000);
});

it("subtracts completed pauses from a closed shift", () => {
  expect(getEffectiveDurationSeconds({
    openedAt: "2026-08-02T08:00:00.000Z",
    closedAt: "2026-08-02T12:00:00.000Z",
    pausedDurationSeconds: 1800,
  })).toBe(12600);
});

it("does not produce a negative duration", () => {
  expect(getEffectiveDurationSeconds({
    openedAt: "2026-08-02T10:00:00.000Z",
    pausedAt: "2026-08-02T09:00:00.000Z",
  }, new Date("2026-08-02T10:00:00.000Z"))).toBe(0);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
pnpm --filter @pos/web exec vitest run lib/shift/__tests__/shift-pause.test.ts
```

Expected: FAIL because `shift-pause.ts` does not exist.

- [ ] **Step 3: Implement the pure helper**

Parse both `Date` and ISO string input, use `closedAt ?? now` as the end time, subtract stored pause seconds and the current pause interval, then clamp at zero. Keep formatting logic independent from React so both the banner and shift page use the same calculation.

- [ ] **Step 4: Run tests and verify pass**

Run the same Vitest command. Expected: all helper tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/shift/shift-pause.ts apps/web/lib/shift/__tests__/shift-pause.test.ts
git commit -m "feat: add shift pause duration helpers"
```

### Task 2: Add Prisma fields and migration

**Files:**
- Modify: `packages/db/prisma/schema.prisma` in `StoreSettings` and `CashierShift`.
- Create: `packages/db/prisma/migrations/20260802_shift_kasir_toggle/migration.sql`.

**Interfaces:**
- `StoreSettings.shiftEnabled: Boolean` defaults to `true`.
- `CashierShift.pausedAt: DateTime?`.
- `CashierShift.pausedDurationSeconds: Int` defaults to `0`.

- [ ] **Step 1: Add schema fields**

Add the exact Prisma fields:

```prisma
// StoreSettings
shiftEnabled Boolean @default(true)

// CashierShift
pausedAt              DateTime?
pausedDurationSeconds Int       @default(0)
```

- [ ] **Step 2: Add an idempotent SQL migration**

Create `migration.sql` with:

```sql
ALTER TABLE "StoreSettings"
  ADD COLUMN IF NOT EXISTS "shiftEnabled" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "pos_cashier_shifts"
  ADD COLUMN IF NOT EXISTS "pausedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "pausedDurationSeconds" INTEGER NOT NULL DEFAULT 0;
```

- [ ] **Step 3: Validate the Prisma schema and regenerate the client**

Run:

```bash
pnpm --filter @pos/db exec prisma validate
pnpm --filter @pos/db generate
```

Expected: schema validation succeeds and Prisma client includes the three new fields.

- [ ] **Step 4: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations/20260802_shift_kasir_toggle/migration.sql
git commit -m "feat: add shift pause persistence fields"
```

### Task 3: Implement atomic shift-setting service and API authorization

**Files:**
- Create: `apps/web/lib/shift/__tests__/shift-settings-server.test.ts`
- Create: `apps/web/lib/shift/shift-settings-server.ts`.
- Create: `apps/web/app/api/settings/shift/route.ts`.
- Create: `apps/web/app/api/settings/shift/__tests__/route.test.ts`.

**Interfaces:**
- `export type ShiftSettings = { enabled: boolean }`.
- `export async function getShiftSettings(): Promise<ShiftSettings>`.
- `export async function setShiftEnabled(enabled: boolean, now?: Date): Promise<ShiftSettings>`.
- `GET /api/settings/shift` returns `{ enabled: boolean }` for authenticated POS roles.
- `PATCH /api/settings/shift` accepts `{ enabled: boolean }` and returns `{ enabled: boolean }` only for `OWNER`.

- [ ] **Step 1: Write failing API tests**

Mock `requireRole`, `db`, and the server service. Cover:

```ts
it("rejects PATCH for a non-owner", async () => {
  requireRoleMock.mockRejectedValue(new AuthError(403, "Insufficient permissions"));
  const response = await PATCH(makeJsonRequest({ enabled: false }));
  expect(response.status).toBe(403);
});

it("allows OWNER to disable shift", async () => {
  requireRoleMock.mockResolvedValue({ role: "OWNER" });
  setShiftEnabledMock.mockResolvedValue({ enabled: false });
  const response = await PATCH(makeJsonRequest({ enabled: false }));
  expect(response.status).toBe(200);
  expect(setShiftEnabledMock).toHaveBeenCalledWith(false);
});

it("rejects malformed enabled values", async () => {
  requireRoleMock.mockResolvedValue({ role: "OWNER" });
  const response = await PATCH(makeJsonRequest({ enabled: "false" }));
  expect(response.status).toBe(422);
});
```

Also add service-level tests using a mocked transaction client for OFF, ON, no active shift, repeated OFF/ON, and rollback propagation.

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
pnpm --filter @pos/web exec vitest run app/api/settings/shift/__tests__/route.test.ts lib/shift/__tests__/shift-settings-server.test.ts
```

Expected: FAIL because the endpoint and service do not exist.

- [ ] **Step 3: Implement `shift-settings-server.ts`**

Use the existing `StoreSettings` key `store-main`. Read missing settings as `enabled: true`. For `setShiftEnabled(false, now)`, upsert the setting and update `OPEN` shifts whose `pausedAt` is null with `pausedAt: now` inside `db.$transaction`. For `setShiftEnabled(true, now)`, find `OPEN` shifts with `pausedAt`, increment each `pausedDurationSeconds` by `getPauseDurationSeconds(pausedAt, now)`, clear `pausedAt`, and upsert the setting in the same transaction. A no-op toggle must not modify pause values.

- [ ] **Step 4: Implement the route**

Use `requireRole("OWNER")` for PATCH and `requireRole("OWNER", "ADMIN", "CASHIER", "SALES", "INVENTORY")` for GET. Parse PATCH with `z.object({ enabled: z.boolean() })`. Reuse `handleAuthError` and return status `422` for schema errors.

- [ ] **Step 5: Run tests and verify pass**

Run the same Vitest command. Expected: authorization, validation, transition, idempotency, and rollback tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/shift/shift-settings-server.ts apps/web/lib/shift/__tests__/shift-settings-server.test.ts apps/web/app/api/settings/shift/route.ts apps/web/app/api/settings/shift/__tests__/route.test.ts
git commit -m "feat: add owner shift settings API"
```

### Task 4: Integrate shift creation and response serialization

**Files:**
- Modify: `apps/web/app/api/shifts/route.ts`.
- Modify: `apps/web/hooks/useShift.ts`.
- Create or extend: `apps/web/app/api/shifts/__tests__/route.test.ts`.

**Interfaces:**
- `CashierShift.pausedAt: string | null`.
- `CashierShift.pausedDurationSeconds: number`.

- [ ] **Step 1: Write failing route/type tests**

Add tests that a serialized shift exposes `pausedAt` as an ISO string or `null`, exposes `pausedDurationSeconds`, and that `POST /api/shifts` creates `pausedAt` when `getShiftSettings()` returns `{ enabled: false }`.

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
pnpm --filter @pos/web exec vitest run app/api/shifts/__tests__/route.test.ts
```

Expected: FAIL because the response does not yet include pause fields and POST does not read shift settings.

- [ ] **Step 3: Update API serialization and POST behavior**

Serialize `pausedAt: shift.pausedAt?.toISOString() ?? null` and `pausedDurationSeconds`. In POST, read the setting before creating the shift; set `pausedAt: new Date()` when disabled. Keep the existing store-wide active-shift conflict check. Use a transaction around the setting read, conflict check, and create so a new shift cannot silently start unpaused during a toggle.

- [ ] **Step 4: Update the client type**

Add the two fields to `CashierShift` and preserve them through online/offline-compatible code paths. Existing records with missing values must normalize to `null` and `0`.

- [ ] **Step 5: Run tests and verify pass**

Run the route test command and the existing shift close tests:

```bash
pnpm --filter @pos/web exec vitest run app/api/shifts/__tests__/route.test.ts app/api/shifts/close/__tests__/route.test.ts
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/api/shifts/route.ts apps/web/app/api/shifts/__tests__/route.test.ts apps/web/hooks/useShift.ts
git commit -m "feat: expose paused shift state"
```

### Task 5: Build owner settings tab and client query

**Files:**
- Create: `apps/web/hooks/useShiftSettings.ts`.
- Create: `apps/web/components/settings/ShiftSettingsTab.tsx`.
- Create: `apps/web/components/settings/__tests__/ShiftSettingsTab.test.tsx`.
- Modify: `apps/web/app/(main)/settings/page.tsx`.

**Interfaces:**
- `useShiftSettings(initialEnabled?: boolean)` returns a query keyed by `["settings", "shift"]` with `data: { enabled: boolean }`.
- `useUpdateShiftSettings()` sends `{ enabled: boolean }`, updates the same query cache, and invalidates it after success.
- `ShiftSettingsTab` renders the owner-facing setting and confirmation state.

- [ ] **Step 1: Write failing component tests**

Test that the card renders the ON copy, clicking the OFF control opens confirmation, confirming calls the mutation with `enabled: false`, cancel does not call it, enabling skips confirmation, and mutation errors render a friendly Indonesian error.

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
pnpm --filter @pos/web exec vitest run components/settings/__tests__/ShiftSettingsTab.test.tsx
```

Expected: FAIL because the hook and component do not exist.

- [ ] **Step 3: Implement the query/mutation hook**

Use `fetch("/api/settings/shift")`, `refetchOnWindowFocus: true`, and `refetchInterval: 15_000`. Treat request errors as query errors; the POS consumer will use ON as its safe fallback. The mutation should not optimistically flip the toggle before the server transaction succeeds.

- [ ] **Step 4: Implement the settings card**

Use existing `Button`/modal styling patterns. Show `Gunakan Shift Kasir`, the ON/OFF descriptions, pause warning, and confirmation copy exactly as approved in the spec. Keep loading and error states accessible with button labels and `aria-pressed`.

- [ ] **Step 5: Register the owner-only tab**

Add the `shift` tab type, a suitable Lucide icon, and `{ id: "shift", label: "Shift Kasir", ownerOnly: true }` to `TABS`. Render the component only when `role === "OWNER"`, matching the existing RBAC and Database Reset tabs.

- [ ] **Step 6: Run tests and verify pass**

Run the component test command. Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/hooks/useShiftSettings.ts apps/web/components/settings/ShiftSettingsTab.tsx apps/web/components/settings/__tests__/ShiftSettingsTab.test.tsx apps/web/app/(main)/settings/page.tsx
git commit -m "feat: add owner shift toggle settings UI"
```

### Task 6: Apply setting to POS without initial popup flicker

**Files:**
- Modify: `apps/web/app/(main)/pos/POSClientPage.tsx`.
- Modify: `apps/web/app/(main)/pos/pos-initial-data.ts`.
- Modify: `apps/web/app/(main)/pos/__tests__/pos-initial-data.test.ts`.
- Modify: `apps/web/e2e/pos.spec.ts`.

**Interfaces:**
- Extend `POSInitialData` with `shiftEnabled?: boolean`.
- `POSClientPage` passes `initialData.shiftEnabled` to `useShiftSettings`.
- `const shiftRequired = shiftSettings?.enabled !== false` is the safe gate used for popup, banner, and checkout.

- [ ] **Step 1: Write failing initial-data and E2E tests**

Add unit coverage that an unavailable setting defaults to `true` and a stored false value is returned as `shiftEnabled: false`. Add a POS E2E case that mocks `GET /api/settings/shift` to `{ enabled: false }`, leaves `/api/shifts?active=true` empty, opens the payment flow, and confirms the “Buka shift” popup is not visible.

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
pnpm --filter @pos/web exec vitest run "app/(main)/pos/__tests__/pos-initial-data.test.ts"
pnpm --filter @pos/web exec playwright test e2e/pos.spec.ts --grep "shift disabled"
```

Expected: the new assertions fail because initial data and POS do not read `shiftEnabled`.

- [ ] **Step 3: Preload setting in server initial data**

In `loadPOSInitialData`, read `StoreSettings` alongside the existing product/category queries and return `shiftEnabled: settings?.shiftEnabled ?? true`. Keep the E2E bypass return explicitly set to `shiftEnabled: true` unless the test overrides the API query.

- [ ] **Step 4: Update POS gating**

Use `useShiftSettings(initialData.shiftEnabled)`. Change `handleOpenPayment` so the existing active-shift guard runs only when `shiftRequired`. Render `ShiftStatusBanner`, `OpenShiftModal`, and the SALES no-shift overlay only when `shiftRequired`. Keep active-shift close behavior available through the existing shift page, and do not change unrelated checkout validations.

- [ ] **Step 5: Run tests and verify pass**

Run:

```bash
pnpm --filter @pos/web exec vitest run "app/(main)/pos/__tests__/pos-initial-data.test.ts"
pnpm --filter @pos/web exec playwright test e2e/pos.spec.ts --grep "shift disabled"
```

Expected: unit and E2E tests PASS.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/(main)/pos/POSClientPage.tsx" "apps/web/app/(main)/pos/pos-initial-data.ts" "apps/web/app/(main)/pos/__tests__/pos-initial-data.test.ts" apps/web/e2e/pos.spec.ts
git commit -m "feat: allow POS checkout without shift when disabled"
```

### Task 7: Make shift displays pause-aware

**Files:**
- Modify: `apps/web/components/ShiftStatusBanner.tsx`.
- Modify: `apps/web/app/(main)/shift/page.tsx`.
- Extend: `apps/web/lib/shift/__tests__/shift-pause.test.ts`.

**Interfaces:**
- Both UI surfaces consume `getEffectiveDurationSeconds` and `formatEffectiveDuration` from Task 1.
- A paused active shift renders a paused indicator in the shift page and does not advance its duration.

- [ ] **Step 1: Write failing display tests**

Extend helper tests with a paused shift whose displayed duration remains constant as `now` advances. Add component coverage where practical for the banner/page formatter using mocked shift data.

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
pnpm --filter @pos/web exec vitest run lib/shift/__tests__/shift-pause.test.ts
```

Expected: the new paused-duration assertion fails against the current `openedAt`-only calculation.

- [ ] **Step 3: Update the banner**

Replace the local `openedAt` subtraction with the shared helper and include `pausedAt`/`pausedDurationSeconds` in effect dependencies. Use the existing banner only when POS setting is ON; if a stale paused shift reaches the component, show a non-animated paused indicator rather than a running uptime.

- [ ] **Step 4: Update shift history/active panel**

Use the shared helper in `useUptime` and show `Dijeda` or an equivalent Indonesian label when `pausedAt` is present. Keep status `OPEN`, close actions, cash summaries, and historical timestamps unchanged.

- [ ] **Step 5: Run tests and verify pass**

Run the helper tests plus existing shift E2E:

```bash
pnpm --filter @pos/web exec vitest run lib/shift/__tests__/shift-pause.test.ts
pnpm --filter @pos/web exec playwright test e2e/shifts.spec.ts
```

Expected: all tests PASS and the existing history/edit flow remains green.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/ShiftStatusBanner.tsx "apps/web/app/(main)/shift/page.tsx" apps/web/lib/shift/__tests__/shift-pause.test.ts
git commit -m "feat: pause shift duration while shift mode is off"
```

### Task 8: Add user-facing help and end-to-end settings coverage

**Files:**
- Modify: `apps/web/features/help-documentation/components/HelpContent.tsx`.
- Modify: `apps/web/e2e/settings.spec.ts`.
- Modify: `markdown-files/shift-kasir-toggle-2026-08-02.md`.

**Interfaces:**
- Owner help explains where to toggle Shift Kasir and what pause/resume means.
- Cashier help explains that checkout can work without a shift only when Owner disables the setting.

- [ ] **Step 1: Write failing E2E/help assertions**

Add an owner settings E2E flow that opens `Pengaturan`, selects `Shift Kasir`, sees the ON state, toggles OFF through confirmation, and verifies the success state. Add assertions for the new help item title and the approved Indonesian copy.

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
pnpm --filter @pos/web exec playwright test e2e/settings.spec.ts --grep "Shift Kasir"
```

Expected: FAIL because the tab and help entry are not present.

- [ ] **Step 3: Update HelpContent**

Add an Owner accordion item with steps: open Pengaturan, open Shift Kasir, understand the warning, confirm OFF, and re-enable to resume paused shifts. Add a cashier-facing note to the role help that the shift popup is controlled by Owner settings. Do not change the AI workflow catalog.

- [ ] **Step 4: Run E2E and verify pass**

Run the settings test command. Expected: the new owner flow and existing settings tests PASS.

- [ ] **Step 5: Update implementation notes**

Append a short “Implementation status” section to `markdown-files/shift-kasir-toggle-2026-08-02.md` listing the migration, API, POS behavior, tests run, and the safe default ON behavior.

- [ ] **Step 6: Commit**

```bash
git add apps/web/features/help-documentation/components/HelpContent.tsx apps/web/e2e/settings.spec.ts markdown-files/shift-kasir-toggle-2026-08-02.md
git commit -m "docs: explain shift toggle behavior"
```

### Task 9: Run the full validation pass

**Files:**
- No new files; validate all changes from Tasks 1–8.

- [ ] **Step 1: Run targeted web unit tests**

```bash
pnpm --filter @pos/web test --runInBand
```

Expected: Vitest completes without failures. If the script does not accept `--runInBand`, rerun `pnpm --filter @pos/web test` because the repository Vitest config already limits workers to one.

- [ ] **Step 2: Run type-check**

```bash
pnpm type-check
```

Expected: TypeScript reports no errors.

- [ ] **Step 3: Run focused E2E suites**

```bash
pnpm --filter @pos/web exec playwright test e2e/settings.spec.ts e2e/pos.spec.ts e2e/shifts.spec.ts
```

Expected: settings owner-only, disabled POS checkout, and existing shift history flows pass.

- [ ] **Step 4: Inspect final diff and status**

```bash
git diff --check
git status --short
git log --oneline -8
```

Expected: no whitespace errors, only intended files changed, and all task commits are present.

- [ ] **Step 5: Keep the final workspace clean**

Do not run `pnpm build` in the agent session. If a validation failure requires a source or test correction, fix that specific failure, rerun its focused command, then rerun the full validation pass. Do not commit generated artifacts.
