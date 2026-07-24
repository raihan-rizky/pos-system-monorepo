# POS Hot-Path Performance Pass for Low-Spec Cashier PCs

**Date:** 2026-07-24
**Status:** Approved design, ready for implementation plan
**Scope:** POS checkout hot path only — render-path fixes, no new dependencies

## Problem

Cashiers run the POS web app on weak x86 PCs and the whole app feels
sluggish. A codebase audit (not guesswork) found the dominant cost is
render-path amplification on the POS checkout screen, not bundle weight:
every keystroke and cart change re-renders and re-prices all product cards,
and a fresh RBAC context value each render forces every consumer to re-render.

This pass fixes the POS hot path only. Broader-scope items (long lists,
inventory charts, component splitting) are explicitly deferred.

## Constraints

- **No new dependencies.** All fixes use React primitives already in use.
- **Exact behavior preserved** — pricing, RBAC gating, cart logic, variant
  selection. This is the checkout path, so correctness beats cleverness.
- Each step is independently shippable and verified against `pnpm test` plus
  `pnpm type-check`.

## Steps (impact-ordered)

### Step 1 — Memoize `ProductCard` + hoist pricing out of the render loop

**Problem:** `ProductCard`
(`apps/web/features/pos-product-variants/components/ProductCard.tsx:25`) is not
wrapped in `React.memo`. `ProductGrid.tsx:101` calls
`showRegularPriceHintFor(product)` inline, running
`priceProductForCustomerType` for all 24 cards on every POS re-render (every
keystroke, every cart change).

**Fix:**
- Wrap `ProductCard` in `React.memo`.
- In `ProductGrid`, precompute the price-hint booleans once per
  `products` / `customerType` / `categoryPricingRules` change via a `useMemo`
  map (`productId -> boolean`); each card reads a boolean instead of
  recomputing.
- Requires callbacks passed into cards to be stable. `handleAddToCart` is
  already `useCallback`-wrapped; verify `onEditProduct`/`onDeleteProduct` from
  the POS page are stable and wrap upstream if not. Step 2 stabilizes the
  `canPerform` that flows into each card.

### Step 2 — Stabilize `RoleProvider` context value

**Problem:** `apps/web/components/providers/RoleProvider.tsx:66-67` builds a
new object literal for `value` every render, and `canAccess`/`canPerform` are
recreated each render. Every `useRole()` consumer (ProductCard, ProductGrid,
most pages) re-renders whenever any ancestor re-renders. This is the widest
amplifier and also what makes Step 1's memo actually hold.

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
proven in `customers/page.tsx:1297`.

### Step 4 — Trim infinite CSS animations on the POS grid

**Problem:** Infinite `animate-pulse` on the per-card low-stock dot
(`ProductCard.tsx:266`) and the always-on `animate-fade-in` wrapper
(`ProductCard.tsx:75`) keep the compositor busy on weak GPUs across every
visible card.

**Fix:** Remove the infinite `animate-pulse` from the per-card low-stock
indicator and the `animate-fade-in` wrapper (keep the color/state, drop the
continuous animation). One-shot animations like `animate-slide-up` on cart
lines do not loop and stay.

## Verification per step

`pnpm type-check` + `pnpm test` after each step. Step 4 is a visual change;
since the browser cannot be driven in this environment, UI correctness will be
flagged explicitly for human verification.

## Out of scope (deferred to follow-ups)

- Breaking up the 1000-line `POSClientPage` component.
- Virtualizing `/products`, inventory `ProductTable`, and history lists.
- Lazy-loading recharts in `InventoryWorkspace`.
- The `useFitText` synchronous reflow loop in `products/page.tsx` StatCards.
- `InventoryWorkspace`'s 60s `setInterval` full-component re-render.

None of these are on the cashier checkout hot path. They are noted for a future
structural pass; this project stays focused on low-risk, high-impact wins for
the checkout path.
