# Legacy Shopping Request → Goods Purchase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow shopping requests carrying a legacy expense (created by the old approval flow) to be selected for a goods purchase, clearly flagged in the UI, and reconciled financially by replacing the legacy expense at finalization.

**Architecture:** Relax the eligibility filter in the goods-purchases repository so requests whose expense has `goodsPurchaseId: null` (legacy) are no longer excluded. Surface a legacy discriminator through the `EligibleShoppingRequest` type to the create modal, which shows an amber banner + a confirmation checkbox that gates submit. At finalization, delete the legacy expense inside the same transaction before creating the new goods-purchase expense, avoiding the `@unique` conflict on `Expense.shoppingRequestId` and double-counting.

**Tech Stack:** Next.js (apps/web), TypeScript, Prisma 6 (`@pos/db`, PostgreSQL/Supabase), React Query, Vitest, `@pos/ui`.

## Global Constraints

- All user-facing copy is Indonesian.
- Legacy discriminator: a shopping request is **legacy** iff it has a related `Expense` with `goodsPurchaseId === null`. An expense with `goodsPurchaseId` set belongs to a goods purchase and must still exclude the request.
- The relaxed eligibility filter is exactly: `OR: [{ expense: null }, { expense: { is: { goodsPurchaseId: null } } }]`.
- The same relaxed filter must be applied identically in `listEligibleShoppingRequests` and in `createGoodsPurchaseRecord`'s eligibility `findFirst`.
- `Expense.shoppingRequestId` and `Expense.goodsPurchaseId` are both `@unique` — legacy expense MUST be deleted before creating the new one.
- No bulk data migration — legacy expenses are reconciled on-demand at finalization only.
- Existing goods-purchase behavior for non-legacy requests must not change.

---

## File Structure

- `apps/web/features/suppliers/goods-purchases/types/goods-purchase.ts` — add three fields to `EligibleShoppingRequest`.
- `apps/web/features/suppliers/goods-purchases/repositories/goods-purchases-repository.ts` — relax filter in two functions, add expense/stock select + derivation, delete legacy expense at finalize.
- `apps/web/features/suppliers/goods-purchases/repositories/__tests__/goods-purchase-create.test.ts` — update the eligibility-filter assertion; add legacy-derivation test.
- `apps/web/features/suppliers/goods-purchases/repositories/__tests__/goods-purchase-review.test.ts` — add legacy-expense-deletion test at finalize.
- `apps/web/features/suppliers/goods-purchases/components/GoodsPurchaseCreateModal.tsx` — dropdown marker, amber banner, confirmation checkbox gating submit.
- `apps/web/features/suppliers/goods-purchases/components/__tests__/goods-purchase-ui.test.ts` — assert new modal copy/markers.

---

## Task 1: Add legacy fields to `EligibleShoppingRequest` type

**Files:**
- Modify: `apps/web/features/suppliers/goods-purchases/types/goods-purchase.ts:89-96`

**Interfaces:**
- Produces: `EligibleShoppingRequest` now has `isLegacy: boolean`, `legacyExpenseAmount: number | null`, `stockApplied: boolean`. Consumed by the repository mapper (Task 2) and the modal (Task 5).

- [ ] **Step 1: Add the three fields to the type**

Change the `EligibleShoppingRequest` type (currently ending at the `items` field) to:

```ts
export type EligibleShoppingRequest = {
  id: string;
  number: string;
  supplierId: string;
  supplierName: string;
  approvedAt: string | null;
  isLegacy: boolean;
  legacyExpenseAmount: number | null;
  stockApplied: boolean;
  items: EligibleShoppingRequestItem[];
};
```

- [ ] **Step 2: Verify the type compiles**

Run: `pnpm --filter @pos/web type-check`
Expected: FAIL — `goods-purchases-repository.ts` no longer returns an object matching `EligibleShoppingRequest` (missing `isLegacy`, `legacyExpenseAmount`, `stockApplied`). This confirms the type is now enforced; Task 2 makes it pass.

- [ ] **Step 3: Commit**

```bash
git add apps/web/features/suppliers/goods-purchases/types/goods-purchase.ts
git commit -m "feat: add legacy discriminator fields to EligibleShoppingRequest"
```

---

## Task 2: Relax eligibility filter + derive legacy fields in `listEligibleShoppingRequests`

**Files:**
- Modify: `apps/web/features/suppliers/goods-purchases/repositories/goods-purchases-repository.ts:184-276`
- Test: `apps/web/features/suppliers/goods-purchases/repositories/__tests__/goods-purchase-create.test.ts:25-46`

**Interfaces:**
- Consumes: `EligibleShoppingRequest` (Task 1).
- Produces: `listEligibleShoppingRequests(storeId, q?)` returns rows including legacy requests, each with `isLegacy`, `legacyExpenseAmount`, `stockApplied` set.

- [ ] **Step 1: Update the existing filter test to expect the relaxed OR**

In `goods-purchase-create.test.ts`, replace the assertion body of the test `"only lists approved requests without legacy expense or active purchase"` (rename it too). The current assertion checks `expense: null`. Replace that whole `it(...)` block with:

```ts
  it("lists approved requests without an expense or with only a legacy expense", async () => {
    await listEligibleShoppingRequests("store-1");

    expect(shoppingRequestFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          storeId: "store-1",
          status: "APPROVED",
          OR: [
            { expense: null },
            { expense: { is: { goodsPurchaseId: null } } },
          ],
          goodsPurchases: {
            none: { activeShoppingRequestKey: { not: null } },
          },
          items: {
            some: {
              decisionStatus: "APPROVED",
              approvedQty: { gt: 0 },
            },
          },
        }),
      }),
    );
  });

  it("marks a request with a legacy expense and reads its amount and stock flag", async () => {
    shoppingRequestFindMany.mockResolvedValue([
      {
        id: "req-legacy",
        number: "DPB-202607-001",
        supplierId: "supplier-1",
        approvedAt: new Date("2026-07-01T00:00:00.000Z"),
        stockAppliedAt: new Date("2026-07-01T00:00:00.000Z"),
        supplier: { name: "CV Kertas" },
        expense: {
          id: "exp-1",
          amount: { toString: () => "150000" },
          goodsPurchaseId: null,
        },
        items: [
          {
            id: "item-1",
            productId: "product-1",
            productName: "Kertas",
            approvedQty: 3,
            product: {
              sku: "SKU-1",
              unit: "rim",
              unitMultiplierToBase: 1,
              costPrice: { toString: () => "50000" },
              isActive: true,
            },
          },
        ],
      },
    ]);

    const result = await listEligibleShoppingRequests("store-1");

    expect(result).toEqual([
      expect.objectContaining({
        id: "req-legacy",
        isLegacy: true,
        legacyExpenseAmount: 150000,
        stockApplied: true,
      }),
    ]);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @pos/web test -- goods-purchase-create`
Expected: FAIL — the WHERE still has `expense: null` (not the `OR`), and the returned objects lack `isLegacy`/`legacyExpenseAmount`/`stockApplied`.

- [ ] **Step 3: Replace the `expense: null` filter with the relaxed OR**

In `goods-purchases-repository.ts`, inside `listEligibleShoppingRequests`, in the `where` object (line ~189-216), remove the line `expense: null,` and add the `OR` clause:

```ts
    where: {
      storeId,
      status: "APPROVED",
      supplierId: { not: null },
      supplier: { isActive: true },
      OR: [
        { expense: null },
        { expense: { is: { goodsPurchaseId: null } } },
      ],
      goodsPurchases: {
        none: { activeShoppingRequestKey: { not: null } },
      },
      items: {
        some: {
          decisionStatus: "APPROVED",
          approvedQty: { gt: 0 },
        },
      },
      ...(q
        ? {
            OR: [
              { number: { contains: q, mode: "insensitive" as const } },
              {
                supplier: {
                  name: { contains: q, mode: "insensitive" as const },
                },
              },
            ],
          }
        : {}),
    },
```

**Important:** The existing search block also uses a top-level `OR`. A second `OR` key in the same object literal would overwrite the first. To keep both, move the eligibility OR into an `AND` array. Replace the two OR usages so the final `where` is:

```ts
    where: {
      storeId,
      status: "APPROVED",
      supplierId: { not: null },
      supplier: { isActive: true },
      AND: [
        {
          OR: [
            { expense: null },
            { expense: { is: { goodsPurchaseId: null } } },
          ],
        },
        ...(q
          ? [
              {
                OR: [
                  { number: { contains: q, mode: "insensitive" as const } },
                  {
                    supplier: {
                      name: { contains: q, mode: "insensitive" as const },
                    },
                  },
                ],
              },
            ]
          : []),
      ],
      goodsPurchases: {
        none: { activeShoppingRequestKey: { not: null } },
      },
      items: {
        some: {
          decisionStatus: "APPROVED",
          approvedQty: { gt: 0 },
        },
      },
    },
```

Update the Step 1 test assertion to match: change the `where` matcher from the top-level `OR` to the `AND` shape above (i.e. assert `AND: expect.arrayContaining([{ OR: [{ expense: null }, { expense: { is: { goodsPurchaseId: null } } }] }])`). Adjust the first `it` accordingly before running.

- [ ] **Step 4: Add expense + stock fields to the select**

In the same function's `select` block (line ~217-246), add `stockAppliedAt: true` at the request level and an `expense` select. Insert after `approvedAt: true,`:

```ts
      approvedAt: true,
      stockAppliedAt: true,
      supplier: { select: { name: true } },
      expense: {
        select: { id: true, amount: true, goodsPurchaseId: true },
      },
```

- [ ] **Step 5: Derive the three fields in the mapper**

In the `.map((row) => ({ ... }))` return (line ~259-275), add the derived fields alongside `approvedAt`:

```ts
    .map((row) => ({
      id: row.id,
      number: row.number,
      supplierId: row.supplierId,
      supplierName: row.supplier.name,
      approvedAt: row.approvedAt?.toISOString() ?? null,
      isLegacy: row.expense?.goodsPurchaseId === null && row.expense !== null,
      legacyExpenseAmount:
        row.expense && row.expense.goodsPurchaseId === null
          ? Number(row.expense.amount.toString())
          : null,
      stockApplied: row.stockAppliedAt !== null,
      items: row.items.map((item) => ({
        shoppingRequestItemId: item.id,
        productId: item.productId,
        productName: item.productName,
        sku: item.product.sku,
        unit: item.product.unit,
        unitMultiplierToBase: item.product.unitMultiplierToBase,
        approvedQty: item.approvedQty ?? 0,
        currentCostPrice: decimalToNumber(item.product.costPrice),
      })),
    }));
```

Note: `row.expense?.goodsPurchaseId === null && row.expense !== null` is `true` only when an expense exists and its `goodsPurchaseId` is null. (When `row.expense` is `undefined`/`null`, `?.goodsPurchaseId` is `undefined`, so the first comparison is `false`.)

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter @pos/web test -- goods-purchase-create`
Expected: PASS — both the relaxed-filter assertion and the legacy-derivation test.

- [ ] **Step 7: Run type-check**

Run: `pnpm --filter @pos/web type-check`
Expected: PASS — the mapper now satisfies `EligibleShoppingRequest`.

- [ ] **Step 8: Commit**

```bash
git add apps/web/features/suppliers/goods-purchases/repositories/goods-purchases-repository.ts apps/web/features/suppliers/goods-purchases/repositories/__tests__/goods-purchase-create.test.ts
git commit -m "feat: include legacy-expense shopping requests in eligibility list"
```

---

## Task 3: Relax eligibility WHERE in `createGoodsPurchaseRecord`

**Files:**
- Modify: `apps/web/features/suppliers/goods-purchases/repositories/goods-purchases-repository.ts:347-368`

**Interfaces:**
- Consumes: nothing new.
- Produces: submitting a goods purchase for a legacy request no longer throws `REQUEST_NOT_ELIGIBLE`.

- [ ] **Step 1: Replace `expense: null` in the create eligibility findFirst**

In `createGoodsPurchaseRecord`, the `tx.shoppingRequest.findFirst` `where` (line ~348-358) currently has `expense: null,`. Replace that single line with the relaxed OR:

```ts
      const request = await tx.shoppingRequest.findFirst({
        where: {
          id: input.shoppingRequestId,
          storeId: actor.storeId,
          status: "APPROVED",
          supplierId: { not: null },
          supplier: { isActive: true },
          OR: [
            { expense: null },
            { expense: { is: { goodsPurchaseId: null } } },
          ],
          goodsPurchases: {
            none: { activeShoppingRequestKey: { not: null } },
          },
        },
        include: {
          supplier: true,
          items: {
            where: {
              decisionStatus: "APPROVED",
              approvedQty: { gt: 0 },
            },
          },
        },
      });
```

(This `where` has no `q`/search branch, so a single top-level `OR` is safe here.)

- [ ] **Step 2: Run the review repository tests to confirm no regression**

Run: `pnpm --filter @pos/web test -- goods-purchase-review`
Expected: PASS (unchanged behavior for existing cases).

- [ ] **Step 3: Run type-check**

Run: `pnpm --filter @pos/web type-check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/features/suppliers/goods-purchases/repositories/goods-purchases-repository.ts
git commit -m "feat: allow legacy request through goods-purchase eligibility check"
```

---

## Task 4: Delete legacy expense before creating the new one at finalization

**Files:**
- Modify: `apps/web/features/suppliers/goods-purchases/repositories/goods-purchases-repository.ts:685-699`
- Test: `apps/web/features/suppliers/goods-purchases/repositories/__tests__/goods-purchase-review.test.ts`

**Interfaces:**
- Consumes: `purchase.shoppingRequestId` (already on the loaded purchase row).
- Produces: at finalize, any expense with `{ shoppingRequestId, goodsPurchaseId: null }` is deleted, then the new expense is created.

- [ ] **Step 1: Add `deleteMany` to the test tx mock**

In `goods-purchase-review.test.ts`, the hoisted `tx` mock (line ~21) has `expense: { create: vi.fn() }`. Change it to:

```ts
  expense: { create: vi.fn(), deleteMany: vi.fn() },
```

And in `beforeEach` (line ~152-153 area, near `tx.expense.create.mockResolvedValue({});`) add:

```ts
    tx.expense.deleteMany.mockResolvedValue({ count: 0 });
```

- [ ] **Step 2: Write the failing test asserting delete-before-create**

Add this test inside the `describe("goods purchase item review transaction", ...)` block:

```ts
  it("deletes any legacy expense before creating the goods-purchase expense", async () => {
    const last = item("item-last", "product-keep", "PENDING");
    const approvedItems = [{ ...last, reviewStatus: "APPROVED" as const }];
    tx.goodsPurchase.findFirst
      .mockResolvedValueOnce(purchase([last]))
      .mockResolvedValueOnce(purchase(approvedItems))
      .mockResolvedValueOnce(purchase(approvedItems, "APPROVED"));
    tx.product.findMany.mockResolvedValue([]);

    await approveGoodsPurchaseItemRecord(
      "purchase-1",
      "item-last",
      actor,
      now,
    );

    expect(tx.expense.deleteMany).toHaveBeenCalledWith({
      where: { shoppingRequestId: "shopping-1", goodsPurchaseId: null },
    });
    expect(tx.expense.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      tx.expense.create.mock.invocationCallOrder[0],
    );
  });
```

(The `purchase(...)` helper sets `shoppingRequestId: "shopping-1"`.)

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @pos/web test -- goods-purchase-review`
Expected: FAIL — `tx.expense.deleteMany` was never called.

- [ ] **Step 4: Add the `deleteMany` call before `tx.expense.create`**

In `finalizeGoodsPurchaseIfReady`, immediately before the existing `await tx.expense.create({ ... })` (line ~685), insert:

```ts
  await tx.expense.deleteMany({
    where: {
      shoppingRequestId: purchase.shoppingRequestId,
      goodsPurchaseId: null,
    },
  });

  await tx.expense.create({
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @pos/web test -- goods-purchase-review`
Expected: PASS — including the existing finalize tests (which now also call `deleteMany` with `count: 0`).

- [ ] **Step 6: Run type-check**

Run: `pnpm --filter @pos/web type-check`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/features/suppliers/goods-purchases/repositories/goods-purchases-repository.ts apps/web/features/suppliers/goods-purchases/repositories/__tests__/goods-purchase-review.test.ts
git commit -m "feat: replace legacy expense on goods-purchase finalization"
```

---

## Task 5: Modal — legacy marker, amber banner, confirmation checkbox

**Files:**
- Modify: `apps/web/features/suppliers/goods-purchases/components/GoodsPurchaseCreateModal.tsx`
- Test: `apps/web/features/suppliers/goods-purchases/components/__tests__/goods-purchase-ui.test.ts:32-43`

**Interfaces:**
- Consumes: `EligibleShoppingRequest.isLegacy`, `.legacyExpenseAmount`, `.stockApplied` (Task 1/2).
- Produces: UI that flags legacy requests and blocks submit until the user confirms.

- [ ] **Step 1: Add UI-source assertions to the existing UI test**

In `goods-purchase-ui.test.ts`, inside the test `"requires an approved shopping list before showing item inputs"`, append these assertions:

```ts
    expect(modal).toContain("LAMA");
    expect(modal).toContain("legacyConfirmed");
    expect(modal).toContain(
      "Saya paham ini Daftar Belanja lama, stok sudah berubah, dan expense lama akan diganti.",
    );
```

- [ ] **Step 2: Run the UI test to verify it fails**

Run: `pnpm --filter @pos/web test -- goods-purchase-ui`
Expected: FAIL — the modal source contains none of those strings yet.

- [ ] **Step 3: Add `legacyConfirmed` state and reset it on select/reset**

In `GoodsPurchaseCreateModal.tsx`, add state next to the existing `useState` hooks (after the `items` state, line ~40):

```ts
  const [legacyConfirmed, setLegacyConfirmed] = useState(false);
```

In `reset` (line ~42-45), add `setLegacyConfirmed(false);`:

```ts
  const reset = () => {
    setSelectedRequest(null);
    setItems([]);
    setLegacyConfirmed(false);
  };
```

In `selectRequest` (line ~50), reset the checkbox whenever the selection changes — add `setLegacyConfirmed(false);` right after `setSelectedRequest(request);`:

```ts
    setSelectedRequest(request);
    setLegacyConfirmed(false);
```

- [ ] **Step 4: Add the `⚠ LAMA` marker to legacy dropdown options**

Replace the option map (line ~146-150) with:

```tsx
            {(eligible.data?.data ?? []).map((request) => (
              <option key={request.id} value={request.id}>
                {request.isLegacy ? "⚠ LAMA - " : ""}
                {request.number} - {request.supplierName}
              </option>
            ))}
```

- [ ] **Step 5: Show an amber banner for legacy, cyan for new**

Replace the cyan banner block (line ~160-167) so legacy requests render an amber banner with the legacy explanation and expense amount:

```tsx
            {selectedRequest.isLegacy ? (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">
                <p className="font-black text-amber-900">
                  Supplier: {selectedRequest.supplierName}
                </p>
                <p className="text-amber-800">
                  Daftar Belanja {selectedRequest.number} (data lama)
                </p>
                <p className="mt-1 text-amber-800">
                  Daftar Belanja ini dibuat lewat alur lama. Stok sudah pernah
                  diubah saat disetujui
                  {selectedRequest.legacyExpenseAmount !== null
                    ? `, dan expense lama ${formatCurrency(
                        selectedRequest.legacyExpenseAmount,
                      )} akan diganti dengan pengeluaran baru`
                    : ""}
                  {" "}saat Pembelian Barang ini disetujui.
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-3 text-sm">
                <p className="font-black text-cyan-900">
                  Supplier: {selectedRequest.supplierName}
                </p>
                <p className="text-cyan-700">
                  Daftar Belanja {selectedRequest.number}
                </p>
              </div>
            )}
```

- [ ] **Step 6: Add the confirmation checkbox for legacy requests**

Immediately after the banner block from Step 5 (still inside the `<>...</>` that renders when `selectedRequest` is set, before the `<section>` of items), add:

```tsx
            {selectedRequest.isLegacy && (
              <label className="flex items-start gap-2 rounded-xl border border-amber-300 bg-white p-3 text-sm font-semibold text-amber-900">
                <input
                  type="checkbox"
                  checked={legacyConfirmed}
                  onChange={(event) =>
                    setLegacyConfirmed(event.target.checked)
                  }
                />
                Saya paham ini Daftar Belanja lama, stok sudah berubah, dan
                expense lama akan diganti.
              </label>
            )}
```

- [ ] **Step 7: Gate submit on the checkbox for legacy requests**

Update `canSubmit` (line ~94-103) to require confirmation when the selected request is legacy:

```ts
  const canSubmit =
    Boolean(selectedRequest) &&
    (!selectedRequest?.isLegacy || legacyConfirmed) &&
    items.length > 0 &&
    items.every(
      (item) =>
        Number.isFinite(item.quantity) &&
        item.quantity > 0 &&
        Number.isFinite(item.latestUnitPrice) &&
        item.latestUnitPrice >= 0,
    );
```

- [ ] **Step 8: Run the UI test to verify it passes**

Run: `pnpm --filter @pos/web test -- goods-purchase-ui`
Expected: PASS.

- [ ] **Step 9: Run type-check**

Run: `pnpm --filter @pos/web type-check`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/web/features/suppliers/goods-purchases/components/GoodsPurchaseCreateModal.tsx apps/web/features/suppliers/goods-purchases/components/__tests__/goods-purchase-ui.test.ts
git commit -m "feat: flag legacy shopping requests and require confirmation in create modal"
```

---

## Task 6: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the whole goods-purchases test surface**

Run: `pnpm --filter @pos/web test -- goods-purchase`
Expected: PASS — create, review, service, and UI suites.

- [ ] **Step 2: Run type-check across the web app**

Run: `pnpm --filter @pos/web type-check`
Expected: PASS.

- [ ] **Step 3: Manual smoke (if a dev DB with legacy data is available)**

Open Suppliers → Pembelian Barang → Buat Pembelian Barang. Confirm the legacy DPB (e.g. DPB-202607-001) now appears with the `⚠ LAMA` marker, selecting it shows the amber banner + checkbox, submit stays disabled until the checkbox is ticked, and finalizing the purchase replaces the legacy expense (one expense row with `goodsPurchaseId` set, none with it null for that request).

---

## Self-Review

**Spec coverage:**
- Repository `listEligibleShoppingRequests` filter relax + derive → Task 2. ✓
- Repository `createGoodsPurchaseRecord` WHERE relax → Task 3. ✓
- Repository `finalizeGoodsPurchaseIfReady` delete legacy expense → Task 4. ✓
- Types `EligibleShoppingRequest` → Task 1. ✓
- UI modal dropdown marker + amber banner + checkbox → Task 5. ✓
- Testing plan (list includes legacy + marks isLegacy; finalize deletes legacy; UI checkbox gates submit) → Tasks 2, 4, 5. ✓
- Out of scope (no bulk migration) → honored; nothing schedules a data backfill. ✓

**Type consistency:**
- `isLegacy: boolean`, `legacyExpenseAmount: number | null`, `stockApplied: boolean` defined in Task 1 and produced identically in Task 2's mapper and consumed in Task 5. ✓
- Derivation uses `row.expense.amount.toString()` (Prisma.Decimal) via `Number(...)`, consistent with the existing `decimalToNumber` pattern in the file. ✓
- `legacyConfirmed` state name matches between Task 5 steps and the UI test assertion. ✓

**Placeholder scan:** No TBD/TODO; every code step shows the full code and exact commands. ✓

**Note on the search `OR` collision:** Task 2 Step 3 explicitly resolves the pre-existing top-level `OR` (search) vs the new eligibility `OR` by nesting both under `AND`, and instructs updating the Step 1 assertion to the `AND` shape. This is the one non-obvious hazard in the change and is handled inline.
