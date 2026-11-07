# POS Default Beli Langsung Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the POS payment modal default to Beli Langsung for every cart, including printing services and items with production attributes, while preserving manual Job Order selection.

**Architecture:** Keep the existing `isJobOrder` state and backend contract unchanged. Change only its initial client-side value in `PaymentModal`; verify the rendered selected state with component regression tests.

**Tech Stack:** Next.js, React, TypeScript, Vitest, `renderToStaticMarkup`.

## Global Constraints

- User-visible text remains friendly Indonesian.
- Do not modify routes, middleware, production APIs, or existing unrelated working-tree changes.
- Follow TDD: add and run a failing test before production code.
- Do not run `pnpm build`; use targeted tests, lint, and type-check as appropriate.

---

### Task 1: Default the payment modal to Beli Langsung

**Files:**
- Modify: `apps/web/components/PaymentModal.tsx:196-198` — initialize `isJobOrder` to `false` without changing the manual toggle or submission payload.
- Test: `apps/web/features/pos-checkout/__tests__/PaymentModal.test.tsx` — add a regression test for printing-service and production-attribute cart items.

**Interfaces:**
- Consumes: Existing `PaymentModal` `items: CartItem[]` prop and `isJobOrder` state.
- Produces: Existing `onConfirm`/`onSaveDraft` payload contract, with `isJobOrder` still controlled by the modal buttons.

- [x] **Step 1: Write the failing test**

Add this test inside the existing `describe("PaymentModal custom invoice date", ...)` block:

```tsx
it.each([
  {
    name: "layanan percetakan",
    item: {
      cartLineId: "service-1",
      lineType: "PRINTING_SERVICE" as const,
      printingServiceId: "printing-1",
      name: "Cetak A4",
      price: 5000,
      quantity: 1,
      unit: "lembar",
      needsMaterial: true,
      material: "Kertas A4",
    },
  },
  {
    name: "produk dengan bahan",
    item: {
      cartLineId: "product-1",
      lineType: "PRODUCT" as const,
      productId: "product-1",
      name: "Brosur",
      price: 10000,
      catalogPrice: 10000,
      quantity: 1,
      unit: "pcs",
      stock: 10,
      categoryId: "printing",
      categoryName: "Percetakan",
      material: "Art Paper",
      size: "A4",
    },
  },
] as const)("defaults to Beli Langsung for $name", ({ item }) => {
  const html = renderToStaticMarkup(
    <PaymentModal
      open
      onClose={vi.fn()}
      items={[item]}
      subtotal={item.price}
      onConfirm={vi.fn()}
    />,
  );
  const start = html.indexOf("Tipe Pesanan");
  const end = html.indexOf("Diskon", start);
  const typeSection = html.slice(start, end);

  expect(typeSection).toMatch(/<button[^>]*border-brand-500[^>]*>[\s\S]*Beli Langsung/);
  expect(typeSection).toMatch(/<button[^>]*border-surface-200[^>]*>[\s\S]*Job Order/);
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter web exec vitest run features/pos-checkout/__tests__/PaymentModal.test.tsx -t "defaults to Beli Langsung"`

Expected: FAIL because the current initializer marks production-related items as Job Order, so the Beli Langsung button does not have `border-brand-500`.

- [x] **Step 3: Write the minimal implementation**

In `apps/web/components/PaymentModal.tsx`, replace the initializer body:

```tsx
const [isJobOrder, setIsJobOrder] = useState(false);
```

Leave the existing `setIsJobOrder(false)`, `setIsJobOrder(true)`, `onConfirm`, and `onSaveDraft` paths unchanged.

- [x] **Step 4: Run the focused test to verify it passes**

Run: `pnpm --filter web exec vitest run features/pos-checkout/__tests__/PaymentModal.test.tsx -t "defaults to Beli Langsung"`

Expected: PASS for both table cases.

- [x] **Step 5: Run broader validation**

Run: `pnpm --filter web exec vitest run features/pos-checkout/__tests__/PaymentModal.test.tsx`

Expected: PASS with no failures.

Run: `pnpm lint`

Expected: ESLint completes without errors.

Run: `pnpm type-check`

Expected: TypeScript completes without errors.

- [x] **Step 6: Review the final diff and impacted scope**

Run: `git diff -- apps/web/components/PaymentModal.tsx apps/web/features/pos-checkout/__tests__/PaymentModal.test.tsx docs/superpowers/specs/2026-11-07-pos-default-beli-langsung-design.md docs/superpowers/plans/2026-11-07-pos-default-beli-langsung-plan.md`

Confirm the diff contains only the selected default behavior, its regression test, and the approved design/plan documents; do not stage or reset unrelated existing changes.
