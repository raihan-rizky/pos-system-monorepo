# POS Hot-Path Performance Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut render-path work on the POS checkout screen so it stays responsive on weak x86 cashier PCs.

**Architecture:** Four independent React-primitive fixes — memoize the product card, stabilize the RBAC context value, defer the search value, and drop always-on CSS animations. No structural rewrites; each task preserves exact behavior and ships on its own.

**Tech Stack:** React 19, Next.js 15, TypeScript, Vitest (node env, `renderToStaticMarkup` for component tests), Tailwind.

## Global Constraints

- **No new dependencies.** Use only React primitives already imported in the repo (`React.memo`, `useMemo`, `useCallback`, `useDeferredValue`).
- **Exact behavior preserved** — pricing, RBAC gating, cart logic, variant selection must not change.
- Verify each task with `pnpm type-check` and `pnpm test` (run from repo root) before committing.
- Component tests render server-side via `renderToStaticMarkup` and assert on HTML strings — follow the existing pattern in `apps/web/features/pos-product-variants/__tests__/ProductCard.test.tsx`.
- Test files live under `features/**/__tests__/`, `app/**/__tests__/`, or `lib/**/__tests__/` (see `apps/web/vitest.config.ts` `include`).

---

### Task 1: Memoize `ProductCard` + hoist price-hint out of the render loop

**Files:**
- Modify: `apps/web/features/pos-product-variants/components/ProductCard.tsx:25` (wrap export in `React.memo`)
- Modify: `apps/web/components/ProductGrid.tsx:47-67,91-105` (replace inline `showRegularPriceHintFor(product)` call with a precomputed map)
- Test: `apps/web/features/pos-product-variants/__tests__/ProductCard.test.tsx` (existing — must stay green)

**Interfaces:**
- Consumes: `ProductCard` props unchanged (`product`, `onAddToCart`, `isEditMode`, `onEditProduct`, `onDeleteProduct`, `showRegularPriceHint`).
- Produces: `ProductCard` as a memoized component (default export + named export identity preserved). `ProductGrid` public props unchanged.

- [ ] **Step 1: Confirm the existing ProductCard test suite passes as a baseline**

Run: `pnpm --filter @pos/web test ProductCard`
Expected: PASS (13 tests). This is the behavior contract memoization must not break.

- [ ] **Step 2: Wrap `ProductCard` in `React.memo`**

In `apps/web/features/pos-product-variants/components/ProductCard.tsx`, change the component declaration and the export. Currently:

```tsx
export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  onAddToCart,
  isEditMode = false,
  onEditProduct,
  onDeleteProduct,
  showRegularPriceHint = false,
}) => {
  // ...body unchanged...
};

export default ProductCard;
```

Change to a memoized component. Rename the implementation to `ProductCardComponent` and wrap:

```tsx
const ProductCardComponent: React.FC<ProductCardProps> = ({
  product,
  onAddToCart,
  isEditMode = false,
  onEditProduct,
  onDeleteProduct,
  showRegularPriceHint = false,
}) => {
  // ...body unchanged...
};

export const ProductCard = React.memo(ProductCardComponent);

export default ProductCard;
```

Do NOT add a custom comparator. React's default shallow prop compare is correct here — `product` is a stable reference from the query cache, and the callbacks are stabilized in Task 2 (RBAC) and already-`useCallback`'d in `ProductGrid`.

- [ ] **Step 3: Run the ProductCard tests to confirm no behavior change**

Run: `pnpm --filter @pos/web test ProductCard`
Expected: PASS (same 13 tests). `React.memo` does not change server-rendered output.

- [ ] **Step 4: Precompute price hints in `ProductGrid`**

In `apps/web/components/ProductGrid.tsx`, the current code defines `showRegularPriceHintFor` as a `useCallback` and calls it inline per card at line 101. Replace the per-render call with a `useMemo` map computed once per `products`/`customerType`/`categoryPricingRules` change.

Replace the `showRegularPriceHintFor` `useCallback` (lines 47-67) with:

```tsx
  const regularPriceHintByProductId = useMemo(() => {
    const map = new Map<string, boolean>();
    if (!customerType || !categoryPricingRules) return map;
    for (const product of products) {
      const priced = priceProductForCustomerType(
        {
          categoryId: product.category.id,
          categoryName: product.category.name,
          price: product.price,
          hargaDinas: product.hargaDinas,
          hargaAgen: product.hargaAgen,
        },
        customerType,
        categoryPricingRules,
      );
      map.set(
        product.id,
        isRegularPriceFallback({
          appliedPricing: priced.appliedPricing,
          customerType,
        }),
      );
    }
    return map;
  }, [products, customerType, categoryPricingRules]);
```

Then change the card render (line 101) from:

```tsx
          showRegularPriceHint={showRegularPriceHintFor(product)}
```

to:

```tsx
          showRegularPriceHint={regularPriceHintByProductId.get(product.id) ?? false}
```

Add `useMemo` to the React import at the top of the file (line 1 currently imports `React, { useCallback }`):

```tsx
import React, { useCallback, useMemo } from "react";
```

- [ ] **Step 5: Type-check and run the full suite**

Run: `pnpm type-check`
Expected: PASS.
Run: `pnpm test`
Expected: PASS (ProductCard tests green; no regressions elsewhere).

- [ ] **Step 6: Commit**

```bash
git add apps/web/features/pos-product-variants/components/ProductCard.tsx apps/web/components/ProductGrid.tsx
git commit -m "perf: memoize ProductCard and hoist price-hint compute out of render loop"
```

---

### Task 2: Stabilize `RoleProvider` context value

**Files:**
- Modify: `apps/web/components/providers/RoleProvider.tsx:56-70`
- Test: `apps/web/features/ai-assistant/components/__tests__/RoleProvider.test.tsx` (existing — must stay green)

**Interfaces:**
- Consumes: `RoleProviderProps` unchanged.
- Produces: `useRole()` returns a context object whose `canAccess`/`canPerform` function identities and whose `value` object are stable across renders when `role`/`permissions` are unchanged. Public shape of the context is identical.

- [ ] **Step 1: Confirm the existing RoleProvider test passes as a baseline**

Run: `pnpm --filter @pos/web test RoleProvider`
Expected: PASS (1 test).

- [ ] **Step 2: Wrap the callbacks and value in memo hooks**

In `apps/web/components/providers/RoleProvider.tsx`, add `useCallback` and `useMemo` to the React import (line 3 currently `import React, { createContext, useContext } from "react";`):

```tsx
import React, { createContext, useContext, useCallback, useMemo } from "react";
```

Replace the `canAccess`/`canPerform` definitions and the provider return (lines 56-70) with:

```tsx
  const canAccess = useCallback(
    (path: string) => {
      if (!role) return false;
      return canRoleAccessPage(role, path, permissions);
    },
    [role, permissions],
  );

  const canPerform = useCallback(
    (resource: string, action: Action) => {
      if (!role) return false;
      return canRolePerformAction(role, resource, action, permissions);
    },
    [role, permissions],
  );

  const value = useMemo(
    () => ({
      role,
      userId,
      userName,
      storeId,
      authorizationFingerprint,
      canAccess,
      canPerform,
    }),
    [role, userId, userName, storeId, authorizationFingerprint, canAccess, canPerform],
  );

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
```

- [ ] **Step 3: Type-check and run tests**

Run: `pnpm type-check`
Expected: PASS.
Run: `pnpm --filter @pos/web test RoleProvider`
Expected: PASS (same 1 test — server-rendered output unchanged).

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/providers/RoleProvider.tsx
git commit -m "perf: memoize RoleProvider context value and callbacks"
```

---

### Task 3: Defer POS search value

**Files:**
- Modify: `apps/web/app/(main)/pos/POSClientPage.tsx:3` (import), `:100` (state), `:168` (query call), `:189` (`parseSearchQuery`)

**Interfaces:**
- Consumes: `useProductsPage(search, selectedCategory, options)` — already debounces internally (`useProducts.ts:495`, 300ms).
- Produces: no signature change. The `<Input>` stays controlled by `search` (immediate); the deferred value drives the query and the grid.

- [ ] **Step 1: Add `useDeferredValue` to the React import**

In `apps/web/app/(main)/pos/POSClientPage.tsx`, line 3 currently:

```tsx
import React, { useState, useCallback, useEffect, useMemo } from "react";
```

Change to:

```tsx
import React, { useState, useCallback, useEffect, useMemo, useDeferredValue } from "react";
```

- [ ] **Step 2: Derive a deferred search value**

Immediately after the `search` state declaration (line 100, `const [search, setSearch] = useState("");`), add:

```tsx
  const deferredSearch = useDeferredValue(search);
```

- [ ] **Step 3: Feed the deferred value into the query and token parse**

At line 168, change the query call from:

```tsx
  const productsQuery = useProductsPage(search, selectedCategory, {
```

to:

```tsx
  const productsQuery = useProductsPage(deferredSearch, selectedCategory, {
```

At line 189, change:

```tsx
  const searchTokens = parseSearchQuery(search);
```

to:

```tsx
  const searchTokens = parseSearchQuery(deferredSearch);
```

Leave the `<Input value={search}` binding (line 613) and the clear button (`onClick={() => setSearch("")}`, line 622) untouched — the input must stay immediate/controlled.

- [ ] **Step 4: Type-check and run the full suite**

Run: `pnpm type-check`
Expected: PASS.
Run: `pnpm test`
Expected: PASS (no test targets this state directly; confirm no regressions).

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(main)/pos/POSClientPage.tsx"
git commit -m "perf: defer POS search value to lower-priority render"
```

---

### Task 4: Trim always-on CSS animations on the POS card

**Files:**
- Modify: `apps/web/features/pos-product-variants/components/ProductCard.tsx:75` (`animate-fade-in` wrapper), `:266` (`animate-pulse` low-stock dot)
- Test: `apps/web/features/pos-product-variants/__tests__/ProductCard.test.tsx` (existing — must stay green)

**Interfaces:**
- Consumes: nothing new.
- Produces: identical DOM structure and text; only two animation utility classes removed. Color/state indicators remain.

- [ ] **Step 1: Remove the always-on fade-in from the card wrapper**

In `apps/web/features/pos-product-variants/components/ProductCard.tsx`, the root `<div>` className block (lines 70-81) contains `animate-fade-in` on line 74. Delete that one line from the template literal. The surrounding classes (`transition-all duration-200`, the conditional state classes) stay. Result:

```tsx
      className={`
        relative flex h-full flex-col items-start p-3.5
        rounded-2xl border text-left
        transition-all duration-200
        ${isEditMode
```

- [ ] **Step 2: Remove the infinite pulse from the low-stock dot**

At line 266, the low-stock indicator is:

```tsx
        <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
```

Remove `animate-pulse` (keep the amber dot so the low-stock state is still visible):

```tsx
        <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-amber-400" />
```

- [ ] **Step 3: Run the ProductCard tests**

Run: `pnpm --filter @pos/web test ProductCard`
Expected: PASS. The tests assert on text/structure, not animation classes, so they stay green and confirm nothing else moved.

- [ ] **Step 4: Type-check**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 5: Flag for human visual verification**

The browser cannot be driven in this environment. Before merging, a human should open `/pos` on a low-spec machine and confirm: (a) cards still appear correctly (no missing fade is jarring), and (b) the low-stock amber dot is still visible on low-stock products. Note this explicitly in the PR/handoff.

- [ ] **Step 6: Commit**

```bash
git add apps/web/features/pos-product-variants/components/ProductCard.tsx
git commit -m "perf: drop always-on card animations to ease weak-GPU compositor load"
```

---

## Self-Review Notes

- **Spec coverage:** Step 1 → Task 1; Step 2 → Task 2; Step 3 → Task 3; Step 4 → Task 4. All four spec steps mapped.
- **Out of scope (unchanged):** POSClientPage split, list virtualization, recharts lazy-load, `useFitText` reflow, `InventoryWorkspace` interval — none touched, per spec.
- **Note for implementer:** POS's `<ProductGrid>` usage (`POSClientPage.tsx:755`) does not pass `customerType`/`categoryPricingRules`, so the Task 1 hint map is empty there (returns `false`, matching today's behavior). The precompute still benefits any caller that does pass pricing props, and removes the per-render function allocation regardless.
