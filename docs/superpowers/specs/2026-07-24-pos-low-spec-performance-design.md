# POS Performance Pass for Low-Spec Cashier PCs

**Date:** 2026-07-24
**Status:** Approved design, ready for implementation plan
**Scope:** Targeted render/bundle fixes + list virtualization

## Problem

Cashiers run the POS web app on weak x86 PCs and the whole app feels
sluggish. An audit of the codebase (not guesswork) identified concrete
bottlenecks in render behavior, bundle weight on high-traffic pages, and
un-virtualized long lists. This pass fixes them in descending order of
cashier-felt impact.

## Guiding principle

Every change must preserve exact current behavior — pricing, RBAC gating,
cart logic, variant selection. This is the checkout path, so correctness
beats cleverness. Each step is independently shippable and verified against
the existing test suite (`pnpm test`) plus `pnpm type-check`.

## Steps (impact-ordered)

### Step 1 — Memoize `ProductCard` + remove per-render pricing recompute

**Problem:** `ProductCard` (`apps/web/features/pos-product-variants/components/ProductCard.tsx:25`)
is not wrapped in `React.memo`. `ProductGrid.tsx:101` calls
`showRegularPriceHintFor(product)` inline, running `priceProductForCustomerType`
for all 24 cards on every POS re-render (every keystroke, every cart change).

**Fix:**
- Wrap `ProductCard` in `React.memo` with a custom comparator (compare
  `product.id`, `product.price`, stock, variants reference, `isEditMode`,
  `showRegularPriceHint`, and the `onAddToCart`/`onEditProduct`/`onDeleteProduct`
  refs).
- Precompute price hints once per `products` change in `ProductGrid` via a
  `useMemo` map (`productId -> boolean`); look up instead of calling inline.
- Requires callbacks passed into cards to be stable. `handleAddToCart` is
  already `useCallback`-wrapped; verify `onEditProduct`/`onDeleteProduct` from
  the POS page are stable and wrap upstream if not.

### Step 2 — Stabilize `RoleProvider` context value

**Problem:** `apps/web/components/providers/RoleProvider.tsx:66-67` builds a
new object literal for `value` every render, and `canAccess`/`canPerform` are
recreated each render. Every `useRole()` consumer (ProductCard, ProductGrid,
most pages) re-renders whenever any ancestor re-renders.

**Fix:** Wrap `canAccess`/`canPerform` in `useCallback` (deps: `role`,
`permissions`) and the context `value` in `useMemo`. Pure win, no behavior
change.

### Step 3 — POS search: stop re-rendering the 1000-line tree per keystroke

**Problem:** `POSClientPage` holds `search` in state
(`apps/web/app/(main)/pos/POSClientPage.tsx:100`); every keystroke re-renders
the whole component (header, category scroller, grid, cart). The network fetch
is already debounced, but the render is not deferred.

**Fix:** Keep the input controlled for responsiveness, but feed
`useDeferredValue(search)` into the product query / `parseSearchQuery` / grid
so the expensive subtree updates at lower priority. Mirrors the pattern already
proven in `customers/page.tsx:1297`. Apply the same fix on `products/page.tsx`
for its `[...products].sort()` (`:330`).

### Step 4 — Virtualize long lists

**Problem:** No virtualization installed anywhere. `/products` mounts up to 100
heavy cards (`products/page.tsx:147`, `PRODUCTS_PER_PAGE = 100`). Inventory
`ProductTable` and the history table render full desktop + mobile markup both
in the DOM (toggled by CSS), doubling node count.

**Fix:** Add `@tanstack/react-virtual` (lightweight, hook-based, no wrapper
components). Virtualize:
- `/products` grid (row-based windowing over the grid)
- inventory `ProductTable` (`apps/web/components/inventory/ProductTable.tsx`)
- history table (`apps/web/app/(main)/history/page.tsx`)

POS grid stays as-is (capped at 24 — virtualization overhead not worth it).

**Tradeoff:** Virtualized grids need a scroll container with measured height.
Confirm each page's layout supports it before converting. This is the step most
likely to need visual verification.

### Step 5 — Lazy-load recharts in `InventoryWorkspace`

**Problem:** `apps/web/features/inventory-management/components/InventoryWorkspace.tsx:4-15`
statically imports recharts into a page staff open constantly — the biggest
static-bundle offender on a high-traffic page.

**Fix:** Convert chart imports to `dynamic()` with `ssr: false` and a
lightweight skeleton, matching `dashboard/components/RevenueTrendChart.tsx`.

### Step 6 — Trim infinite CSS animations on list items

**Problem:** `animate-pulse` (infinite) on low-stock dots/badges across many
cards/rows, plus `animate-fade-in`/`animate-slide-up` per item, keep the
compositor busy on weak GPUs.

**Fix:** Remove infinite `animate-pulse` from per-item low-stock indicators
(keep the color/state, drop the animation). Keep one-shot fade/slide since they
do not loop. Conservative — visual state stays, only continuous churn goes.

## Verification per step

`pnpm type-check` + `pnpm test` after each step. For steps 4 and 6, UI
correctness needs a human eye since the browser cannot be driven in this
environment; this will be flagged explicitly.

## Out of scope (deferred to follow-ups)

- Breaking up the 1000-line `POSClientPage` component.
- The `useFitText` synchronous reflow loop in `products/page.tsx` StatCards.
- `InventoryWorkspace`'s 60s `setInterval` full-component re-render.

These are noted for a future structural pass; this project stays focused on
low-risk, high-impact wins for the checkout path.
