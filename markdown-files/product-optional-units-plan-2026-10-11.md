# Optional Product Units Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Let users optionally create smaller or larger selling units in the Products form, with distinct badges, independent prices, and one atomic shared-stock save.

**Architecture:** Use a dependency-free TypeScript unit helper shared by the form payload and create API. Keep the optional row UI in a focused component and reuse the existing create transaction, stock groups, catalog response, and price/activity logging conventions.

**Tech Stack:** Existing Next.js, React, TypeScript, Zod, Prisma, TanStack Query, @pos/ui, Vitest, and available browser tools. No new dependencies.

## Global Constraints

- Source specification: `markdown-files/product-optional-units-design-2026-10-11.md`, approved by the user on 2026-10-11.
- Conversation remains English; application labels, help, validation, and errors use friendly Indonesian.
- Antislop applies during design and implementation. Follow the existing modal style: ENERGY 1, RHYTHM 1, MOTION 1.
- Additional units are absent by default and are never required. Support both conversion directions and several added units.
- Text distinguishes small, big, equal-sized, and pending unit badges without relying on color.
- Suggested prices are rounded to the nearest rupiah. Explicit user edits, including zero, survive later conversion and original-price changes.
- Enter initial stock once in the original unit. Create all products and their shared stock group in one transaction.
- Preserve legacy `smallestUnitVariant` callers, product editing, and existing user WIP, including description support.
- No new dependencies or database schema migration are expected.
- Do not run a production build or start/stop the user's development server. Use `pnpm type-check --only` to avoid Turbo build prerequisites.
- Run GitNexus upstream impact before modifying existing symbols; report risk. Run change detection before each commit.
- Documentation is saved in this checkout's `markdown-files`: drive D is unavailable. Do not claim the requested D path was updated.
- Do not push or stage unrelated user changes. If a modified source file already contains user WIP, keep feature work uncommitted unless it can be staged independently without losing that WIP.

## File map and interfaces

Create `apps/web/lib/product-form/product-unit-variants.ts` for pure conversions, suggested values, validation, and badge roles. Create `apps/web/components/inventory/ProductUnitFields.tsx` for optional rows, advanced fields, stock summary, and a named `UnitSizeBadge` export. Modify the existing payload, form, hooks, create route, and help/workflow sources only where the feature requires it.

The helper exports these exact interfaces:

```ts
type UnitDirection = "larger" | "smaller";
type UnitBadgeRole = "primary" | "additional" | "small" | "large" | "equal";
interface UnitVariantDraft {
  id: string; unit: string; direction: UnitDirection; quantity: string;
  price: string; priceEdited: boolean; sku: string; skuEdited: boolean;
  barcode: string; costPrice: string;
}
interface AdditionalUnitInput {
  unit: string; sku: string; relativeQuantity: number; price: number;
  barcode?: string; costPrice?: number;
}
interface UnitPrimaryValues { unit: string; sku: string; price: string; stock: string }
interface NormalizedUnitGroup {
  baseUnit: string; baseStock: number; primaryMultiplier: number;
  additionalMultipliers: number[];
}
function createUnitVariantDraft(id: string): UnitVariantDraft;
function relativeUnitQuantity(direction: UnitDirection, quantity: string): number;
function suggestUnitPrice(price: string, relativeQuantity: number): string;
function generateUnitVariantSku(primarySku: string, unit: string): string;
function resolveUnitVariantValues(primary: UnitPrimaryValues, row: UnitVariantDraft): { price: string; sku: string };
function validateUnitDrafts(primary: UnitPrimaryValues, rows: UnitVariantDraft[]): Record<string, string>;
function buildAdditionalUnitInputs(primary: UnitPrimaryValues, rows: UnitVariantDraft[]): AdditionalUnitInput[];
function normalizeProductUnitGroup(primaryUnit: string, stock: number, variants: AdditionalUnitInput[]): NormalizedUnitGroup;
function getProductUnitBadges(rows: UnitVariantDraft[]): UnitBadgeRole[];
```

Badge arrays are ordered original unit first, then drafts. Invalid conversions produce neutral roles. All valid relative quantities equal to one produce equal roles. Otherwise use the minimum quantity for small roles and larger quantities for large roles. Blank, invalid, duplicate, or nonfinite values are rejected on save; preview computation never emits NaN or Infinity.

### Task 1: Unit payload and conversion behavior

**Files:** Modify `apps/web/lib/product-form/product-form-payload.ts`, `apps/web/hooks/useProducts.ts`, and `apps/web/lib/product-form/__tests__/product-form-payload.test.ts`. Create the helper above and `apps/web/lib/product-form/__tests__/product-unit-variants.test.ts`.

**Consumes:** Existing `ProductFormValues` and `CreateProductInput`.

**Produces:** The helper interfaces above; optional `additionalUnits?: UnitVariantDraft[]` on form values and `additionalUnitVariants?: AdditionalUnitInput[]` on the create input.

- [x] Add failing payload tests against the existing function before creating the helper. Example:

```ts
const row = { id: "dus", unit: "dus", direction: "larger" as const, quantity: "12", price: "", priceEdited: false, sku: "", skuEdited: false, barcode: "", costPrice: "" };
expect(buildProductFormPayload({ ...formData, unit: "pcs", price: "2000", additionalUnits: [row] }, "create"))
  .toMatchObject({ additionalUnitVariants: [{ unit: "dus", relativeQuantity: 12, price: 24000 }] });
```

- [x] Run `pnpm --filter @pos/web test lib/product-form/__tests__/product-form-payload.test.ts` and confirm the missing additional variant causes an assertion failure, not an unrelated setup error.
- [x] Implement the pure helper and map optional rows into the payload, leaving the legacy fields intact. Keep helpers independent of client hooks. Define `relativeQuantity = direction === "larger" ? count : 1 / count`; normalize against `Math.min(1, ...relativeQuantities)` and reject overflow/underflow. Prefer derived suggested values to effects that rewrite editable state.
- [x] Add helper tests for both directions, fractional counts, badges including three sizes/equal/pending, price and SKU override persistence, case-insensitive duplicate units, within-request duplicate SKUs, zero/negative/blank/nonfinite values, and stock overflow. Example: original `dus`, stock 2, added `pcs` with relativeQuantity 1/12 must return `{ baseUnit: "pcs", baseStock: 24, primaryMultiplier: 12, additionalMultipliers: [1] }`.
- [x] Verify the payload's empty rows omit the new field and edit mode omits all new-unit creation data. Run both helper/payload suites and source diagnostics before proceeding.

### Task 2: Atomic API creation

**Files:** Modify `apps/web/app/api/products/route.ts` and `apps/web/app/api/products/__tests__/route.test.ts`.

**Consumes:** `AdditionalUnitInput` and `normalizeProductUnitGroup` from Task 1.

**Produces:** POST support for optional `additionalUnitVariants`, preserving the existing response and legacy paired-unit path.

- [x] Extend existing API tests first. Send original `pcs`, stock 24, and one `dus` row with ratio 12. Assert two product creates use the same group ID, multipliers 1 and 12, one group with baseUnit `pcs` and baseStock 24, and the chosen independent prices. Also test original `dus` plus smaller `pcs`, then three units.

```ts
const request = new Request("http://localhost/api/products", { method: "POST", body: JSON.stringify({ name: "Kertas", sku: "KERTAS-PCS", categoryId: "cat-1", unit: "pcs", stock: 24, minStock: 5, price: 2000, additionalUnitVariants: [{ unit: "dus", sku: "KERTAS-DUS", relativeQuantity: 12, price: 22000 }] }) });
expect((await POST(request)).status).toBe(201);
expect(productCreateMock).toHaveBeenCalledTimes(2);
expect(txProductStockGroupCreateMock).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ baseUnit: "pcs", baseStock: 24 }) }));
```

- [x] Run `pnpm --filter @pos/web test app/api/products/__tests__/route.test.ts` and confirm the new request currently creates only the original product.
- [x] Extend the Zod schema with finite positive relative quantities, finite nonnegative prices/HPP, trimmed required units/SKUs, request-level duplicate checks, and explicit rejection of mixed legacy/new input. Perform SKU prechecks and retain unique-constraint race handling.
- [x] Inside the existing transaction, reject existing matching groups, normalize stock, strip request-only variant fields before Prisma writes, create the original and every additional unit, and write all applicable price logs and group activity. Preserve shared product metadata including description. Use Indonesian validation/conflict messages for the new path.
- [x] Add failure tests for a duplicate unit/SKU, invalid ratio, nonfinite computed stock, existing group, and a later product-create failure. Confirm no success response or price/activity writes follow a failed product creation. Retain database transaction ownership of rollback; if a local test database is available, verify rollback against it without touching production.
- [x] Run create-route, grouping-integration, helper, and payload tests. Keep unchanged legacy paired tests green.

### Task 3: Optional form rows and distinct badges

**Files:** Create `apps/web/components/inventory/ProductUnitFields.tsx` and `apps/web/features/product-stock-groups/__tests__/product-unit-form.test.tsx`. Modify `apps/web/components/inventory/ProductFormModal.tsx` and `apps/web/hooks/useProducts.ts`.

**Consumes:** All Task 1 helper types/functions. `ProductUnitFields` props are `{ primary: UnitPrimaryValues; rows: UnitVariantDraft[]; onChange: (rows: UnitVariantDraft[]) => void; disabled?: boolean; errors: Record<string, string> }`. `UnitSizeBadge` props are `{ role: UnitBadgeRole }`.

**Produces:** Always-available optional rows in create mode, no extra unit fields in edit mode, correct draft payload, and create-success cache refresh.

- [x] Add a failing initial form-render assertion using the repository's existing `renderToStaticMarkup` + mocked @pos/ui pattern: the create modal contains `Tambah unit lain (opsional)` at multiplier one; the edit modal has no new-unit action. Add component markup tests for labels, both readable conversion sentences, badge role text/style, native details disclosure, and errors linked to row controls.
- [x] Run `pnpm --filter @pos/web test features/product-stock-groups/__tests__/product-unit-form.test.tsx` and confirm the optional action is missing.
- [x] Add typed rows to the original form's state/reset. Remove only the old creation UI's conditional smallest-unit section and standalone technical multiplier input, preserving description and edit behavior. Validate rows during submit, route focus to the first failing row, retain values after API failure, and guard repeated saves.
- [x] Build each row as a fieldset with its unit badge, accessible unit/price labels, compact direction control, the explicit equation, and native `details` for optional SKU/barcode/HPP. Disable mutation controls only while saving. Use at least 44px tap targets, focus-visible styling, wrapping, and single-column narrow layout. Focus the new name input on addition and a safe remaining control on removal.

```tsx
<fieldset>
  <legend>Unit tambahan <UnitSizeBadge role={role} /></legend>
  <label htmlFor={`${row.id}-unit`}>Nama unit</label>
  <input id={`${row.id}-unit`} name={`${row.id}-unit`} value={row.unit} required />
  <details><summary>Detail tambahan</summary></details>
</fieldset>
```

- [x] Derive price/SKU suggestions without overwriting manually edited values. Show stock equivalences only for valid rows and explain `Stok dihitung bersama, bukan ditambah lagi.` Render emerald-800/emerald-50 small badges, violet-800/violet-50 big badges, and neutral pending/equal badges with role text.
- [x] After create success, invalidate actual repository stock-group/inventory query keys in addition to existing catalog/price/dashboard keys. Locate keys before changing the hook; add a focused QueryClient test to prove the required groups refresh.
- [x] Run component markup, description-form, helper, payload, API, and query-invalidation tests. Verify source diagnostics. Browser-check the actual form interactions on an already running user-managed server before delivery; do not substitute static-render assertions for click/focus/save behavior.

### Task 4: Help, workflow, and regression verification

**Files:** Modify `apps/web/features/help-documentation/components/HelpContent.tsx`, `apps/web/features/ai-assistant/docs/help/products.md`, `apps/web/features/ai-assistant/workflows/workflow-catalog.ts`, relevant existing help/workflow tests, and the design/plan documentation.

**Consumes:** Final implemented field labels and behaviors from Tasks 1-3.

**Produces:** Consistent Indonesian user help and AI guided creation instructions, verification evidence, and feature-only review.

- [x] First add a focused help/workflow expectation for `Tambah unit lain (opsional)`, larger/smaller conversion examples, editable suggested prices, badge meaning, and one shared stock balance. Run the relevant existing help/workflow suite and confirm its old smallest-unit-only guidance fails that expectation.
- [x] Update only the product creation guidance, preserving Supplier approvals and other existing WIP. Explain the advanced details and that users may skip the entire section. The AI assistant opens the form but does not silently save user data.
- [x] Run all affected suites together, `pnpm type-check --only`, and `git diff --check`. Compare any generated-validator errors to the recorded baseline; do not modify unrelated stock-history/internal-stock-out routes. If those errors persist, verify source types with an untracked temporary type-check configuration excluding generated `.next-e2e` output and report the full-check limitation explicitly.
- [x] Perform browser checks on desktop and narrow screens: create mode at default unit, add/remove rows, both conversion directions, three sizes, edited price persistence, optional SKU edit, pending/error states, keyboard focus, badges, shared-stock save, and duplicate rejection. Record which checks were actually exercised and inspect console errors.
- [x] Run change detection and review the final diff against the saved pre-feature WIP. Update this document's checkboxes and execution notes with actual results and unresolved limitations. Commit only independently staged feature changes; do not push.

## Self-review and execution notes

All specification requirements map to the four tasks. Tasks 1-3 share the exact interfaces declared above, and Task 4 synchronizes the final user guidance. No unrelated refactoring, deployment, dependency installation, schema mutation, or server lifecycle change is required. Initial implementation should run in an explicitly selected workspace/execution mode because the current primary checkout contains user WIP.

GitNexus's initial two-worker refresh failed at worker startup. A verbose single-worker retry completed successfully (9,025 nodes, 21,826 edges, 300 flows) without editing repository instruction files. The cause of the first worker startup failure is not established; reducing concurrency allowed the refresh to complete. Full-text search remains unavailable because the LadybugDB FTS extension could not load. Direct symbol impact queries are available. Initial payload impact is LOW, with the form's handleSubmit as its direct caller; create POST impact is LOW with no indexed callers. Disambiguate ProductFormModal by its component file before editing. Runtime HTTP and dynamic imports are reviewed from source in addition to graph results.

## Completed execution (2026-10-11)

All four tasks are complete. The full suite passed 2,472 tests (10 skipped), and the real-component browser regression and live app smoke checks passed. Source TypeScript passes; the full workspace check retains three unrelated generated-route baseline errors. Static form tests cover creation/edit availability; conversion labels, disclosure, badge styles, error linkage and interaction are covered by the browser regression rather than extra static markup tests. Database transaction rollback is simulated, without a real database write test.

The user explicitly authorized the isolated worktree and its development server, then authorized resolving conflicts and merging to local main. Feature-only commit 8b93170 is merged into main; unrelated user WIP remains uncommitted and preserved. Read-only review and feature-only patch comparison completed. The feature-only staged GitNexus report covers 19 files, 41 symbols and seven flows with HIGH aggregate risk; exact impact of ProductUnitFields is LOW with one direct caller. Subsequent unrelated primary-checkout help edits were combined with the unit instructions. The recovery snapshot, stash, branch and running-server worktree are retained. Headroom was unavailable at one checkpoint and became available during integration, with an unreachable proxy; bounded output is used. See product-optional-units-implementation-2026-10-11.md for detailed evidence and limitations.
