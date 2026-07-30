# Harga Khusus Priority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menjadikan matching Harga Khusus sebagai prioritas default dan memberi kasir satu pilihan transaksi untuk mengutamakan Harga Agen/Dinas.

**Architecture:** Shared pricing helper menerima `PricingPreference` dan menjadi sumber aturan prioritas bagi client serta server. Payment modal mengirim preference eksplisit; API transaksi, draft dari Payment modal, dan offline sync menghitung ulang harga dari product master serta rule aktif. Draft Nota Penawaran yang tidak mengirim preference mempertahankan custom quote price existing.

**Tech Stack:** Next.js 15, React 19, TypeScript, Zod, Prisma, Vitest, Dexie, pnpm monorepo.

## Global Constraints

- User-visible copy wajib memakai Bahasa Indonesia yang ramah.
- Matching Harga Khusus menang secara default, termasuk rule `ALL`, tipe pelanggan, kategori, unit, dan merek.
- Harga Khusus transaksi/manual tetap memiliki prioritas tertinggi.
- Selector berlaku sekali untuk seluruh transaksi dan hanya tampil untuk pelanggan `AGEN` atau `PEMERINTAH`.
- Mode Harga Agen/Dinas tetap fallback ke matching Harga Khusus ketika harga member tidak tersedia.
- Request transaksi lama tanpa `pricingPreference` memakai default `"SPECIAL"`.
- Jangan menambah dependency atau migrasi database.
- Jangan menjalankan `pnpm build`, `pnpm dev`, atau menghentikan development server.
- Pertahankan semua unrelated worktree changes.

---

### Task 1: Shared pricing preference and deterministic priority

**Files:**
- Modify: `apps/web/features/customer-category-pricing/helpers/pricing-rules.ts`
- Test: `apps/web/features/customer-category-pricing/helpers/__tests__/pricing-rules.test.ts`

**Interfaces:**
- Produces: `PricingPreference = "SPECIAL" | "MEMBER"`.
- Produces: `priceProductForCustomerType(product, customerType, rules, pricingPreference?)`.
- Default argument: `pricingPreference = "SPECIAL"`.

- [ ] **Step 1: Write failing domain tests**

Add focused tests that use a product with both member price and a matching rule:

```ts
it("uses matching Harga Khusus before Harga Agen by default", () => {
  const priced = priceProductForCustomerType(
    {
      categoryId: "cat-atk",
      categoryName: "ATK",
      price: 100_000,
      hargaAgen: 95_000,
      unit: "pcs",
    },
    "AGEN",
    [{
      id: "rule-all-atk",
      categoryId: "cat-atk",
      customerType: "ALL",
      mode: "PERCENT_DISCOUNT",
      value: 10,
      isActive: true,
      unit: null,
    }],
  );

  expect(priced.unitPrice).toBe(90_000);
  expect(priced.appliedPricing?.ruleId).toBe("rule-all-atk");
});

it("uses Harga Agen first when MEMBER is selected", () => {
  const priced = priceProductForCustomerType(productWithHargaAgen, "AGEN", rules, "MEMBER");
  expect(priced.unitPrice).toBe(95_000);
  expect(priced.appliedPricing?.ruleId).toBe("harga-agen");
});

it("falls back to matching Harga Khusus in MEMBER mode", () => {
  const priced = priceProductForCustomerType(
    { ...productWithHargaAgen, hargaAgen: null },
    "AGEN",
    rules,
    "MEMBER",
  );
  expect(priced.appliedPricing?.ruleId).toBe("rule-all-atk");
});
```

Add equivalent default coverage for `PEMERINTAH` with `hargaDinas`.

- [ ] **Step 2: Run the domain tests and verify RED**

Run:

```bash
pnpm --filter @pos/web exec vitest run features/customer-category-pricing/helpers/__tests__/pricing-rules.test.ts
```

Expected: FAIL because the current helper returns `harga-agen`/`harga-dinas` before matching the special rule and does not accept `"MEMBER"`.

- [ ] **Step 3: Implement the minimal shared priority**

Add:

```ts
export const PRICING_PREFERENCES = ["SPECIAL", "MEMBER"] as const;
export type PricingPreference = (typeof PRICING_PREFERENCES)[number];
```

Extract the existing Agen/Dinas branches into a private helper returning
`PricedProductLine | null`. In `priceProductForCustomerType`, find and apply the
matching special rule once, then choose:

```ts
const specialPrice = applyCategoryPricingRule(product, customerType, matchingRule);
const memberPrice = priceProductForMemberType(product, customerType);

if (pricingPreference === "MEMBER") {
  return memberPrice ?? specialPrice;
}
if (specialPrice.appliedPricing) {
  return specialPrice;
}
return memberPrice ?? specialPrice;
```

Do not alter `findMatchingCategoryPricingRule` sorting or rounding behavior.

- [ ] **Step 4: Run the domain tests and verify GREEN**

Run the command from Step 2.

Expected: PASS, including the pre-existing specificity tests.

- [ ] **Step 5: Commit the domain change**

```bash
git add apps/web/features/customer-category-pricing/helpers/pricing-rules.ts apps/web/features/customer-category-pricing/helpers/__tests__/pricing-rules.test.ts
git commit -m "feat: prioritize matching special prices"
```

---

### Task 2: Checkout selector and client payload plumbing

**Files:**
- Create: `apps/web/features/pos-checkout/components/PricingPreferenceSelector.tsx`
- Create: `apps/web/features/pos-checkout/__tests__/PricingPreferenceSelector.test.tsx`
- Modify: `apps/web/features/pos-checkout/helpers/checkout-pricing.ts`
- Test: `apps/web/features/pos-checkout/helpers/__tests__/checkout-pricing.test.ts`
- Modify: `apps/web/components/PaymentModal.tsx`
- Modify: `apps/web/app/(main)/pos/POSClientPage.tsx`
- Modify: `apps/web/hooks/useTransactions.ts`
- Modify: `apps/web/features/transactions-draft/types/draft.ts`
- Modify: `apps/web/lib/offline/offline-core.ts`
- Modify: `apps/web/lib/offline/offline-db.ts`

**Interfaces:**
- Consumes: `PricingPreference` and the updated pricing helper from Task 1.
- Produces: `PricingPreferenceSelector({ customerType, value, onChange })`.
- Produces: `pricingPreferenceReducer` with explicit `SELECT` and `RESET`
  events so reset behavior is independently testable.
- Produces: `pricingPreference` in confirm, Payment-modal draft, and offline payloads.
- Produces: optional `transactionPrice` on draft/offline product items.

- [ ] **Step 1: Write failing checkout-helper and selector tests**

Change the old checkout test that expected Harga Agen to win and split it into:

```ts
it("uses matching Harga Khusus by default when Harga Agen also exists", () => {
  const [priced] = priceCartItemsForCheckout({
    items: [{ ...paperRim, hargaAgen: 9500 }],
    customerType: "AGEN",
    pricingRules: [{ ...allPaperRimBrandRule, value: 50 }],
    pricingPreference: "SPECIAL",
    manualPrices: {},
    role: "CASHIER",
  });
  expect(priced.appliedPricing?.ruleId).toBe("rule-all-paper-rim-brand");
});

it("uses Harga Agen when the cashier selects MEMBER", () => {
  const [priced] = priceCartItemsForCheckout({
    items: [{ ...paperRim, hargaAgen: 9500 }],
    customerType: "AGEN",
    pricingRules: [{ ...allPaperRimBrandRule, value: 50 }],
    pricingPreference: "MEMBER",
    manualPrices: {},
    role: "CASHIER",
  });
  expect(priced.appliedPricing?.ruleId).toBe("harga-agen");
});
```

In the new selector test, use `renderToStaticMarkup` and assert:

```ts
expect(renderSelector("AGEN")).toContain("Prioritas Harga");
expect(renderSelector("PEMERINTAH")).toContain("Harga Agen/Dinas");
expect(renderSelector("UMUM")).toBe("");
expect(renderSelector("INDUSTRI")).toBe("");

expect(
  pricingPreferenceReducer("MEMBER", { type: "RESET" }),
).toBe("SPECIAL");
```

- [ ] **Step 2: Run focused client tests and verify RED**

Run:

```bash
pnpm --filter @pos/web exec vitest run features/pos-checkout/helpers/__tests__/checkout-pricing.test.ts features/pos-checkout/__tests__/PricingPreferenceSelector.test.tsx
```

Expected: FAIL because checkout pricing has no preference input and the selector does not exist.

- [ ] **Step 3: Implement selector and checkout preference**

Add `pricingPreference: PricingPreference` to `priceCartItemsForCheckout` and
pass it to `priceProductForCustomerType`.

Create a controlled selector that returns `null` unless the customer type is
`AGEN` or `PEMERINTAH`. Use two native radio inputs with friendly copy:

```tsx
<legend>Prioritas Harga</legend>
<span>Harga Khusus (Default)</span>
<span>Harga Agen/Dinas</span>
<p>Pilihan ini berlaku untuk seluruh transaksi.</p>
```

In `PaymentModal`:

```ts
const [pricingPreference, dispatchPricingPreference] =
  useReducer(pricingPreferenceReducer, "SPECIAL");
```

Pass it into checkout pricing, render the selector after customer selection,
dispatch `RESET` when the modal closes/reopens or `selectedCustomerType`
changes, and include it in both `onConfirm` and Payment-modal `onSaveDraft`.
Update the pricing-query warning to say that preview falls back to Harga
Agen/Dinas when available, then Harga Normal.

- [ ] **Step 4: Plumb typed payloads without changing quotation behavior**

Add `pricingPreference` to:

- `PaymentModal` confirm/save-draft callback data;
- `POSClientPage.handleCheckout`;
- `CreateTransactionInput`;
- the Payment-modal branch of `POSClientPage.handleSaveDraft`;
- `DraftCreateInput` as optional, because Nota Penawaran shares the endpoint;
- `OfflineTransactionPayload`;
- `OfflineCartItem`/draft items with optional `transactionPrice`.

When queueing an offline transaction, copy `data.pricingPreference`. When
saving from Payment modal, copy each product item's `transactionPrice`.
Quotation callers continue omitting `pricingPreference`.

- [ ] **Step 5: Run focused client tests and type-check touched contracts**

Run:

```bash
pnpm --filter @pos/web exec vitest run features/pos-checkout/helpers/__tests__/checkout-pricing.test.ts features/pos-checkout/__tests__/PricingPreferenceSelector.test.tsx features/pos-checkout/__tests__/PaymentModal.test.tsx
pnpm --filter @pos/web type-check
```

Expected: PASS.

- [ ] **Step 6: Commit checkout UI and payload plumbing**

```bash
git add apps/web/features/pos-checkout apps/web/components/PaymentModal.tsx apps/web/app/\(main\)/pos/POSClientPage.tsx apps/web/hooks/useTransactions.ts apps/web/features/transactions-draft/types/draft.ts apps/web/lib/offline/offline-core.ts apps/web/lib/offline/offline-db.ts
git commit -m "feat: let cashiers choose checkout price priority"
```

---

### Task 3: Authoritative online transaction pricing

**Files:**
- Modify: `apps/web/app/api/transactions/route.ts`
- Test: `apps/web/app/api/transactions/__tests__/create-route.test.ts`

**Interfaces:**
- Consumes: `PRICING_PREFERENCES`, `PricingPreference`, and
  `priceProductForCustomerType(..., pricingPreference)` from Task 1.
- Consumes: `pricingPreference` from Task 2 transaction payload.
- Produces: persisted item pricing metadata for whichever source wins.

- [ ] **Step 1: Write failing API tests**

Mock an `AGEN` customer, a product with `hargaAgen: 95000`, and a matching
10-percent special rule:

```ts
it("recalculates with Harga Khusus as the default priority", async () => {
  const response = await POST(transactionRequest({ pricingPreference: "SPECIAL" }));
  expect(response.status).toBe(201);
  expect(createdItem()).toEqual(expect.objectContaining({
    unitPrice: 90000,
    pricingRuleId: "rule-atk",
  }));
});

it("recalculates with Harga Agen when MEMBER is selected", async () => {
  const response = await POST(transactionRequest({ pricingPreference: "MEMBER" }));
  expect(response.status).toBe(201);
  expect(createdItem()).toEqual(expect.objectContaining({
    unitPrice: 95000,
    pricingRuleId: "harga-agen",
  }));
});

it("defaults legacy requests to SPECIAL", async () => {
  const response = await POST(transactionRequest({}));
  expect(createdItem().pricingRuleId).toBe("rule-atk");
});
```

- [ ] **Step 2: Run the transaction route test and verify RED**

Run:

```bash
pnpm --filter @pos/web exec vitest run app/api/transactions/__tests__/create-route.test.ts
```

Expected: FAIL because the route schema and server helper call ignore
`pricingPreference`.

- [ ] **Step 3: Implement schema validation and server recomputation**

Add to `createTransactionSchema`:

```ts
pricingPreference: z.enum(PRICING_PREFERENCES).optional().default("SPECIAL"),
```

Destructure the value and pass it to every product call to
`priceProductForCustomerType`. Keep printing-service pricing unchanged.
Continue persisting the existing pricing metadata fields from
`resolved.appliedPricing`.

- [ ] **Step 4: Run transaction API tests and verify GREEN**

Run the command from Step 2.

Expected: PASS.

- [ ] **Step 5: Commit online API support**

```bash
git add apps/web/app/api/transactions/route.ts apps/web/app/api/transactions/__tests__/create-route.test.ts
git commit -m "feat: enforce checkout pricing preference on server"
```

---

### Task 4: Payment-modal draft pricing without breaking quotations

**Files:**
- Modify: `apps/web/app/api/transactions/draft/route.ts`
- Test: `apps/web/app/api/transactions/draft/__tests__/route.test.ts`

**Interfaces:**
- Consumes: optional `pricingPreference` and optional item
  `transactionPrice` from Task 2.
- Produces: authoritative auto-pricing only when preference is present.
- Preserves: legacy Nota Penawaran custom item prices when preference is absent.

- [ ] **Step 1: Write failing draft tests**

Add pricing-rule DB mocks and product fields needed by the domain helper.
Test both paths:

```ts
it("reprices Payment-modal drafts using the selected preference", async () => {
  const response = await POST(draftRequest({
    pricingPreference: "SPECIAL",
    customerId: "agen-1",
    items: [{ productId: "p1", name: "ATK", price: 95000, quantity: 1 }],
  }));
  expect(response.status).toBe(201);
  expect(createdDraftItem()).toEqual(expect.objectContaining({
    unitPrice: 90000,
    pricingRuleId: "rule-atk",
  }));
});

it("keeps quotation custom prices when pricingPreference is absent", async () => {
  const response = await POST(draftRequest({
    items: [{ productId: "p1", name: "ATK", price: 87500, quantity: 1 }],
  }));
  expect(createdDraftItem().unitPrice).toBe(87500);
});
```

Also assert a provided `transactionPrice` remains the final draft unit price.

- [ ] **Step 2: Run draft tests and verify RED**

Run:

```bash
pnpm --filter @pos/web exec vitest run app/api/transactions/draft/__tests__/route.test.ts
```

Expected: FAIL because draft schema and product query do not support checkout
pricing rules.

- [ ] **Step 3: Implement conditional authoritative draft pricing**

Extend the draft schema with optional `pricingPreference` and
`transactionPrice`. When preference is present:

- load customer type, active rules, and product category/unit/brand/member
  prices;
- call `priceProductForCustomerType`;
- apply explicit `transactionPrice` last;
- persist the winning pricing metadata on the draft item.

When preference is absent, preserve the current `item.price` and price-log
behavior so Nota Penawaran does not change.

- [ ] **Step 4: Run draft tests and verify GREEN**

Run the command from Step 2.

Expected: PASS, including existing custom quote-price tests.

- [ ] **Step 5: Commit draft support**

```bash
git add apps/web/app/api/transactions/draft/route.ts apps/web/app/api/transactions/draft/__tests__/route.test.ts
git commit -m "feat: preserve price priority in payment drafts"
```

---

### Task 5: Offline queue and sync pricing parity

**Files:**
- Modify: `apps/web/app/api/offline-sync/transactions/route.ts`
- Test: `apps/web/app/api/offline-sync/transactions/__tests__/route.test.ts`
- Test: `apps/web/lib/offline/__tests__/offline-core.test.ts`

**Interfaces:**
- Consumes: queued `pricingPreference` and optional `transactionPrice`.
- Consumes: shared pricing helper from Task 1.
- Produces: offline server items priced by the same priority as online checkout.

- [ ] **Step 1: Write failing offline sync tests**

Extend DB mocks with `categoryCustomerPricingRule.findMany`. Use an Agen
customer and a product with category/unit/brand/Harga Agen:

```ts
it("syncs queued SPECIAL preference with matching Harga Khusus", async () => {
  const response = await POST(request([offlineTx({
    customerId: "agen-1",
    pricingPreference: "SPECIAL",
    originalSubtotal: 90000,
    originalTotal: 90000,
  })]));
  expect(response.status).toBe(200);
  expect(createdOfflineItem()).toEqual(expect.objectContaining({
    unitPrice: 90000,
    pricingRuleId: "rule-atk",
  }));
});

it("syncs queued MEMBER preference with Harga Agen", async () => {
  await POST(request([offlineTx({
    customerId: "agen-1",
    pricingPreference: "MEMBER",
    originalSubtotal: 95000,
    originalTotal: 95000,
  })]));
  expect(createdOfflineItem().unitPrice).toBe(95000);
});
```

Add an offline-core regression proving stock adjustment preserves optional
`transactionPrice` through object spreading.

- [ ] **Step 2: Run offline tests and verify RED**

Run:

```bash
pnpm --filter @pos/web exec vitest run app/api/offline-sync/transactions/__tests__/route.test.ts lib/offline/__tests__/offline-core.test.ts
```

Expected: FAIL because sync currently replaces all queued prices with catalog
price and does not load pricing rules.

- [ ] **Step 3: Implement server-authoritative offline repricing**

Extend the Zod schemas with:

```ts
pricingPreference: z.enum(PRICING_PREFERENCES).optional().default("SPECIAL"),
transactionPrice: z.number().positive().optional().nullable(),
```

Load the validated customer type, full product pricing fields, and active
pricing rules. Build each server item with the shared helper and apply
`transactionPrice` last when present. Feed those prices to
`buildOfflineSyncDecision`, so its existing total-change approval behavior
compares the queued total with the newly authoritative total.

When creating transaction items, persist the existing pricing metadata fields
from the winning source. Keep printing services out of offline scope.

- [ ] **Step 4: Run offline tests and verify GREEN**

Run the command from Step 2.

Expected: PASS.

- [ ] **Step 5: Commit offline parity**

```bash
git add apps/web/app/api/offline-sync/transactions/route.ts apps/web/app/api/offline-sync/transactions/__tests__/route.test.ts apps/web/lib/offline/__tests__/offline-core.test.ts
git commit -m "feat: keep checkout price priority during offline sync"
```

---

### Task 6: Help content, AI workflow, and full validation

**Files:**
- Modify: `apps/web/features/help-documentation/components/HelpContent.tsx`
- Modify: `apps/web/features/ai-assistant/workflows/workflow-catalog.ts`
- Modify: `markdown-files/harga-khusus-priority-design-2026-07-30.md` only if implementation details required a factual correction
- Create: `markdown-files/harga-khusus-priority-implementation-2026-07-30.md`

**Interfaces:**
- Consumes: final behavior from Tasks 1-5.
- Produces: matching user and AI-assistant guidance.

- [ ] **Step 1: Update friendly Indonesian help text**

Replace the old statements that Harga Agen/Dinas always wins. The help content
must state:

```text
Harga Khusus yang cocok dipakai lebih dulu secara default. Di modal Pembayaran,
kasir dapat memilih Harga Agen/Dinas untuk seluruh transaksi. Jika harga
tersebut belum tersedia, sistem kembali memakai Harga Khusus yang cocok.
```

Update the workflow steps with the same order and mention the
**Prioritas Harga** selector.

- [ ] **Step 2: Write implementation documentation**

Create `markdown-files/harga-khusus-priority-implementation-2026-07-30.md`
with:

- final priority tables for `"SPECIAL"` and `"MEMBER"`;
- UI behavior and reset conditions;
- online, draft, and offline data flow;
- backward compatibility for legacy transaction payloads and quotations;
- exact tests and validation commands run.

- [ ] **Step 3: Run all focused tests**

Run:

```bash
pnpm --filter @pos/web exec vitest run features/customer-category-pricing/helpers/__tests__/pricing-rules.test.ts features/pos-checkout/helpers/__tests__/checkout-pricing.test.ts features/pos-checkout/__tests__/PricingPreferenceSelector.test.tsx features/pos-checkout/__tests__/PaymentModal.test.tsx app/api/transactions/__tests__/create-route.test.ts app/api/transactions/draft/__tests__/route.test.ts app/api/offline-sync/transactions/__tests__/route.test.ts lib/offline/__tests__/offline-core.test.ts
```

Expected: PASS with no unhandled errors.

- [ ] **Step 4: Run repository validation**

Run:

```bash
pnpm --filter @pos/web type-check
pnpm --filter @pos/web exec eslint "features/customer-category-pricing/helpers/**/*.ts" "features/pos-checkout/**/*.{ts,tsx}" "components/PaymentModal.tsx" "app/(main)/pos/POSClientPage.tsx" "hooks/useTransactions.ts" "features/transactions-draft/types/draft.ts" "lib/offline/**/*.{ts,tsx}" "app/api/transactions/**/*.{ts,tsx}" "app/api/offline-sync/transactions/**/*.{ts,tsx}" "features/help-documentation/components/HelpContent.tsx" "features/ai-assistant/workflows/workflow-catalog.ts"
```

Expected: both commands exit 0. Do not use root `pnpm lint` or
`pnpm type-check` because this repository's Turbo graph makes both depend on
`@pos/web#build`. Do not run `pnpm build`.

- [ ] **Step 5: Review the final diff**

Run:

```bash
git diff --check
git status -sb
git diff --stat
```

Confirm only intended pricing, checkout, API, documentation, and test files
changed. Preserve the pre-existing upload/R2 and package changes.

- [ ] **Step 6: Commit documentation and final adjustments**

```bash
git add apps/web/features/help-documentation/components/HelpContent.tsx apps/web/features/ai-assistant/workflows/workflow-catalog.ts markdown-files/harga-khusus-priority-design-2026-07-30.md markdown-files/harga-khusus-priority-implementation-2026-07-30.md
git commit -m "docs: explain checkout pricing priority"
```
