# Largest Client Pages Server Boundary Implementation Plan

> **For agentic workers:** Keep implementation behavior-preserving and limited to the products, history, and customers route entries plus directly affected tests and required documentation.

**Goal:** Convert the three largest client `page.tsx` files into thin Server Component route entries backed by dedicated Client Component modules without changing UI, data fetching, permissions, or user-visible behavior.

**Architecture:** Each route keeps `page.tsx` as a server-by-default wrapper. The existing interactive implementation moves unchanged into a sibling `*ClientPage.tsx` file. Existing source-contract tests follow the client implementation, while a new boundary test protects the server/client split.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Vitest.

## Global Constraints

- Only refactor `products`, `history`, and `customers`.
- Preserve all existing UI, hooks, data fetching, permissions, lazy loading, and exports allowed by the App Router.
- Do not run `pnpm build` or start/stop the development server.
- Preserve unrelated working-tree changes.

---

### Task 1: Characterize the three route boundaries

**Files:**
- Create: `apps/web/app/(main)/__tests__/largest-client-page-boundaries.test.ts`
- Modify: `apps/web/app/(main)/products/__tests__/products-page-inventory-surface.test.ts`
- Modify: `apps/web/app/(main)/history/__tests__/page-exports.test.ts`
- Modify: `apps/web/lib/__tests__/low-spec-performance.test.ts`
- Modify: `apps/web/features/help-documentation/__tests__/help-visual-guide.test.tsx`

**Produces:** A failing contract requiring server `page.tsx` wrappers and sibling client implementations.

- [ ] Add source-level assertions that each `page.tsx` has no `"use client"` directive, imports its sibling Client Page, and renders it.
- [ ] Point implementation-specific source tests at the future `*ClientPage.tsx` files.
- [ ] Run the focused Vitest files and confirm failure because the client files and server wrappers do not exist yet.

### Task 2: Split the products page

**Files:**
- Create by moving: `apps/web/app/(main)/products/ProductsClientPage.tsx`
- Replace: `apps/web/app/(main)/products/page.tsx`

**Produces:** `ProductsClientPage` as the unchanged interactive implementation and `ProductsPage` as the Server Component route entry.

- [ ] Move the current source to `ProductsClientPage.tsx`.
- [ ] Rename its default component to `ProductsClientPage`.
- [ ] Add a minimal `page.tsx` that imports and renders `ProductsClientPage`.
- [ ] Run the boundary, products-surface, and low-spec tests.

### Task 3: Split the history page

**Files:**
- Create by moving: `apps/web/app/(main)/history/HistoryClientPage.tsx`
- Replace: `apps/web/app/(main)/history/page.tsx`

**Produces:** `HistoryClientPage` as the unchanged interactive implementation and `HistoryPage` as the Server Component route entry.

- [ ] Move the current source to `HistoryClientPage.tsx`.
- [ ] Rename its default component to `HistoryClientPage`.
- [ ] Add a minimal `page.tsx` that imports and renders `HistoryClientPage`.
- [ ] Run the boundary, App Router export, low-spec, and history tests.

### Task 4: Split the customers page

**Files:**
- Create by moving: `apps/web/app/(main)/customers/CustomersClientPage.tsx`
- Replace: `apps/web/app/(main)/customers/page.tsx`

**Produces:** `CustomersClientPage` as the unchanged interactive implementation and `CustomersPage` as the Server Component route entry.

- [ ] Move the current source to `CustomersClientPage.tsx`.
- [ ] Rename its default component to `CustomersClientPage`.
- [ ] Add a minimal `page.tsx` that imports and renders `CustomersClientPage`.
- [ ] Run the boundary, low-spec, and help visual-guide tests.

### Task 5: Document and validate

**Files:**
- Create: `markdown-files/largest-client-pages-server-boundary-2026-07-30.md`

**Produces:** Repository-required documentation and a clean validation result.

- [ ] Document the new route/client boundary and explicitly state that runtime behavior is unchanged.
- [ ] Run all directly affected Vitest files.
- [ ] Run ESLint for the modified TypeScript files.
- [ ] Run `pnpm --filter @pos/web type-check`.
- [ ] Confirm `git diff --check` and inspect the final scoped diff.
