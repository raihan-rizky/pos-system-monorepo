# Daftar Belanja Terpadu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Satu persetujuan Daftar Belanja menetapkan jumlah dan harga, menghasilkan Pembelian Barang yang disetujui serta satu Pengeluaran, dan menyediakan pilihan unit pada item tanpa mengubah angka jumlah.

**Architecture:** `ShoppingRequest` tetap menjadi permohonan dan pusat tampilan; `GoodsPurchase` tetap menjadi dokumen keuangan serta sumber Penerimaan Barang. Endpoint finalisasi baru memvalidasi dan menulis keduanya dalam satu transaksi. Data lama tetap memakai alur lama berdasarkan `approvalFlowVersion`.

**Tech Stack:** Next.js App Router, TypeScript, React Query, Prisma/PostgreSQL, Vitest, Tailwind, `@pos/ui`.

## Global Constraints

- Seluruh teks yang terlihat pengguna memakai bahasa Indonesia yang ramah.
- Permohonan baru hanya memiliki satu persetujuan final dengan izin `supplier.goods_purchase.approve:update`; penolakan memakai `supplier.goods_purchase.reject:update`.
- Pergantian varian unit hanya dalam grup stok yang sama, dengan angka jumlah tetap (12 pcs menjadi 12 dus).
- Stok berubah hanya saat Penerimaan Barang; Pengeluaran dibuat tepat sekali saat persetujuan final.
- Riwayat dan API data lama tetap bisa dipakai, termasuk Pembelian Barang `PENDING` dan Pengeluaran legacy.
- Satu tindakan utama per kartu, tindakan tambahan dalam menu sekunder, label form terlihat jelas, modal satu layar dan nyaman di ponsel.
- Tulis dan jalankan tes yang gagal sebelum tiap perubahan kode. Jangan jalankan `pnpm build`, `pnpm dev`, atau menghentikan server pengguna.

---

### Task 1: Identitas alur baru dan status penolakan

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/20261010_unified_shopping_request_approval/migration.sql`
- Modify: `apps/web/features/suppliers/shopping-requests/types/shopping-request.ts`
- Modify: `apps/web/features/suppliers/shopping-requests/repositories/shopping-requests-repository.ts`
- Modify: `apps/web/features/suppliers/shopping-requests/services/shopping-requests-service.ts`
- Test: `apps/web/features/suppliers/shopping-requests/services/__tests__/shopping-requests-service.test.ts`

**Interfaces:** `ShoppingRequest.approvalFlowVersion: number` defaults to `1` for existing rows and is `2` for new rows. `ShoppingRequestStatus` adds `REJECTED`; optional rejection reason, actor, and time are returned in list/detail types.

- [ ] Write a failing service test showing `createShoppingRequest()` persists `approvalFlowVersion: 2` and existing version `1` remains readable.
- [ ] Run `pnpm --filter @pos/web test -- shopping-requests-service.test.ts` and verify the new assertion fails for the missing version.
- [ ] Add the enum value and additive columns in Prisma and SQL migration; set version `2` only on new writes, update mappers and status types. Core write shape:

```ts
await tx.shoppingRequest.create({ data: { ...requestData, approvalFlowVersion: 2 } });
```

- [ ] Run the focused test and `pnpm db:generate`; verify both pass. Run `pnpm type-check` after generated types change.
- [ ] Commit only Task 1 files after `gitnexus detect-changes --scope staged --repo pos-system-monorepo` and `git diff --cached --check`.

### Task 2: Pilihan unit pada item Daftar Belanja

**Files:**
- Create: `apps/web/features/suppliers/shopping-requests/services/shopping-request-unit-variants.ts`
- Create: `apps/web/app/api/suppliers/shopping-requests/unit-variants/route.ts`
- Create: `apps/web/features/suppliers/shopping-requests/helpers/shopping-request-unit-choice.ts`
- Create: `apps/web/features/suppliers/shopping-requests/helpers/__tests__/shopping-request-unit-choice.test.ts`
- Modify: `apps/web/features/suppliers/shopping-requests/components/ShoppingRequestCreateModal.tsx`
- Modify: `apps/web/features/suppliers/shopping-requests/components/ShoppingRequestEditModal.tsx`
- Test: `apps/web/features/suppliers/shopping-requests/components/__tests__/shopping-request-ui.test.ts`

**Interfaces:** `GET /api/suppliers/shopping-requests/unit-variants?productId=...` returns active products in the same store and stock group, each with ID, unit, SKU, stock, and cost. `chooseUnitVariant(items, currentId, nextVariant)` replaces the selected product while preserving `requestedQty` and rejecting a duplicate product ID.

- [ ] Write a failing helper test: `12 pcs` changed to a compatible dus returns `12 dus`; unrelated group or duplicate selection returns an error.
- [ ] Run `pnpm --filter @pos/web test -- shopping-request-unit-choice.test.ts` and verify failure from missing behavior.
- [ ] Implement the unit query with store scoping and a shared chooser. Add a labeled **Satuan** control to every added item in create/edit modals. Keep the quantity value; refresh the unit and stock label from the selected variant. Example core rule:

```ts
return items.map(item => item.product.id === currentId
  ? { ...item, product: nextVariant, requestedQty: item.requestedQty }
  : item);
```

- [ ] Run helper and modal tests; verify an unchanged amount is sent with the new `productId` and the picker is keyboard usable.
- [ ] Commit only Task 2 files after GitNexus staged change detection and whitespace checks.

### Task 3: Finalisasi atomik dan pembelian hasil persetujuan

**Files:**
- Create: `apps/web/features/suppliers/shopping-requests/services/finalize-shopping-request.ts`
- Create: `apps/web/features/suppliers/shopping-requests/repositories/finalize-shopping-request-repository.ts`
- Modify: `apps/web/features/suppliers/goods-purchases/repositories/goods-purchases-repository.ts`
- Modify: `apps/web/features/suppliers/shopping-requests/types/shopping-request.ts`
- Test: `apps/web/features/suppliers/shopping-requests/services/__tests__/finalize-shopping-request.test.ts`
- Test: `apps/web/features/suppliers/goods-purchases/repositories/__tests__/goods-purchase-review.test.ts`

**Interfaces:**

```ts
type FinalizeShoppingRequestInput = {
  items: Array<{
    shoppingRequestItemId: string;
    productId: string;
    approvedQty: number;
    latestUnitPrice: number;
    updateMasterHpp: boolean;
  }>;
  extraItems: Array<{
    productId: string; quantity: number;
    latestUnitPrice: number; updateMasterHpp: boolean;
  }>;
  confirmOverRequested?: boolean;
};
```

`finalizeShoppingRequest(id, input, actor)` returns the approved request and purchase IDs. Existing `GoodsPurchase` financial finalization behavior becomes a shared transaction helper so HPP logs and legacy expense replacement retain identical rules.

- [ ] Write failing repository/service tests for one atomic approval; selected unit variant in the same group; zero quantity as rejected; additional product; expense total; no stock change; duplicate/concurrent submit conflict; rollback when expense creation fails.
- [ ] Run `pnpm --filter @pos/web test -- finalize-shopping-request.test.ts` and verify feature-specific failures.
- [ ] Implement server validation for store, supplier, flow version, status, item IDs, same-group variants, quantity and price that are not negative, at least one item with quantity above zero, and over-request confirmation. In one Prisma transaction claim the request, update item decisions, create an approved purchase, update selected HPP values and logs, replace legacy expense only when applicable, then create one expense. Transaction outline:

```ts
return db.$transaction(async tx => {
  await claimRequestedVersionTwo(tx, requestId, actor.storeId);
  await saveDecisions(tx, input.items, actor);
  const purchase = await createApprovedPurchase(tx, input, actor);
  await applyApprovedPurchaseFinancials(tx, purchase, actor);
  return { shoppingRequestId: requestId, goodsPurchaseId: purchase.id };
});
```

- [ ] Run focused tests plus existing goods purchase review and receiving tests. Verify financial totals, price logs, and stock behavior.
- [ ] Commit only Task 3 files after GitNexus staged change detection and whitespace checks.

### Task 4: API, hak akses, penolakan, dan perlindungan alur lama

**Files:**
- Create: `apps/web/app/api/suppliers/shopping-requests/[id]/finalize/route.ts`
- Create: `apps/web/app/api/suppliers/shopping-requests/[id]/reject/route.ts`
- Modify: `apps/web/app/api/suppliers/shopping-requests/[id]/approval/route.ts`
- Modify: `apps/web/app/api/suppliers/shopping-requests/[id]/items/[itemId]/approval/route.ts`
- Modify: `apps/web/features/suppliers/shopping-requests/services/shopping-requests-service.ts`
- Modify: `apps/web/features/suppliers/shopping-requests/api/shopping-requests-api.ts`
- Modify: `apps/web/features/suppliers/shopping-requests/hooks/useShoppingRequests.ts`
- Test: `apps/web/app/api/suppliers/shopping-requests/[id]/__tests__/finalize-route.test.ts`
- Test: `apps/web/app/api/suppliers/shopping-requests/[id]/__tests__/reject-route.test.ts`

**Interfaces:** `POST .../[id]/finalize` accepts `FinalizeShoppingRequestInput` and requires `supplier.goods_purchase.approve:update`. `POST .../[id]/reject` accepts `{ reason: string }` and requires `supplier.goods_purchase.reject:update`. Legacy approval endpoints reject `approvalFlowVersion: 2` with a 409 response and keep version 1 working.

- [ ] Write failing route tests for both permissions, malformed payloads, store isolation, repeated finalization, rejection reason, and version guards.
- [ ] Run the two route tests and verify the missing endpoints/guards fail.
- [ ] Add Zod schemas, service calls, Indonesian errors, notification links to `?tab=shopping-requests`, and query invalidation for request, purchase, finance, and receipt views. Guard legacy service methods on version 1 as well as UI paths.
- [ ] Run focused API and existing legacy approval tests; verify both versions behave as specified.
- [ ] Commit only Task 4 files after GitNexus staged change detection and whitespace checks.

### Task 5: Satu tab dengan tampilan ringkas dan riwayat lama

**Files:**
- Modify: `apps/web/features/suppliers/components/SupplierPageShell.tsx`
- Modify: `apps/web/features/suppliers/shopping-requests/components/ShoppingRequestList.tsx`
- Create: `apps/web/features/suppliers/shopping-requests/components/ShoppingRequestFinalApprovalModal.tsx`
- Modify: `apps/web/features/suppliers/shopping-requests/repositories/shopping-requests-repository.ts`
- Modify: `apps/web/features/suppliers/shopping-requests/types/shopping-request.ts`
- Modify: `apps/web/features/suppliers/goods-purchases/components/GoodsPurchaseList.tsx`
- Test: `apps/web/features/suppliers/shopping-requests/components/__tests__/shopping-request-ui.test.ts`
- Test: `apps/web/features/suppliers/goods-purchases/components/__tests__/goods-purchase-ui.test.ts`

**Interfaces:** Request list rows include a linked purchase summary and any legacy pending purchase. Existing purchase detail, review, receipt, and comparison modals remain reachable through the one list. Old `?tab=goods-purchases` routes to the shopping tab.

- [ ] Write failing UI tests for one visible main action per row, accessible secondary actions, version 2 approval modal, legacy pending purchase, approved legacy request without purchase, and old deep link.
- [ ] Run focused UI tests and verify the new requirements fail.
- [ ] Render only the Daftar Belanja tab. Replace the two separate history panels with one compact request card showing name, supplier, status, total, and one contextual action. Keep detail/print/edit/cancel/history in a labeled secondary menu. Use a semantic form in the final modal with visible **Jumlah**, **Satuan**, and **Harga Beli** labels; put HPP options in a disclosure and keep total and submit action visible. Show inline error messages after interaction and preserve edits on server errors.
- [ ] Run focused UI tests, keyboard checks, and a mobile viewport inspection using the running dev server if the user already has it running; do not start or stop it.
- [ ] Commit only Task 5 files after GitNexus staged change detection and whitespace checks.

### Task 6: Panduan, data lama, dan validasi akhir

**Files:**
- Modify: `apps/web/features/help-documentation/components/HelpContent.tsx`
- Modify: `apps/web/features/help-documentation/components/help-visual-registry.ts`
- Modify: `apps/web/features/help-documentation/components/app-shell-preview/pages/SuppliersPreview.tsx`
- Modify: `apps/web/features/ai-assistant/workflows/workflow-catalog.ts`
- Modify: `apps/web/features/ai-assistant/docs/help/suppliers.md`
- Modify: `markdown-files/supplier-daftar-belanja-terpadu-2026-10-10.md`
- Test: `apps/web/features/help-documentation/__tests__/goods-purchase-help.test.ts`
- Test: `apps/web/features/ai-assistant/workflows/__tests__/workflow-catalog.test.ts`

**Interfaces:** Bantuan, visual guide, dan katalog AI menjelaskan alur tunggal; dokumen lama dan deep link masih dapat dijangkau dari Daftar Belanja.

- [ ] Write failing help/workflow assertions for one approval, editable unit with unchanged numeric quantity, and the new navigation.
- [ ] Run the focused tests and verify outdated guidance causes failure.
- [ ] Replace obsolete two-stage instructions and update visual targets while keeping help for legacy records. Add an operational note to the dated feature document.
- [ ] Run focused supplier, finance, inventory, help, and workflow tests. Run `pnpm lint` and `pnpm type-check`; report any pre-existing errors from unrelated dirty files separately. Do not run `pnpm build`.
- [ ] Review `git diff` against the spec, run `gitnexus detect-changes --scope compare --base-ref main --repo pos-system-monorepo`, then commit only intended Task 6 files.
