# Pengadaan dan Penerimaan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menerapkan seluruh fitur pada spesifikasi patch POS yang disetujui, kemudian merilisnya bersama.
**Architecture:** Pertahankan model pengadaan dan layanan stok existing. Pisahkan aturan harga, mutasi keranjang, piutang, dan waktu sebagai helper teruji; gunakan transaksi database untuk persetujuan dan pembalikan stok.
**Tech Stack:** Next.js 15, React 19, TypeScript, Prisma 6/PostgreSQL, TanStack Query, Dexie, Vitest, Playwright, pnpm.

## Global Constraints

- Satu rilis besar setelah seluruh tahap selesai dan lolos validasi.
- Default Owner; dapat diberikan kepada peran lain melalui RBAC.
- Pembaruan otomatis modal master ditunda dari patch ini.
- Pertahankan UMUM, AGEN, INDUSTRI, PEMERINTAH.
- 2 Dus → 2 Bal; pergantian satuan mempertahankan angka jumlah.
- Jakarta WIB: `Asia/Jakarta`, timestamp database UTC.
- Jangan menjalankan `pnpm build`; server lifecycle tetap dikelola pengguna.
- TDD berlaku: tes harus gagal karena perilaku yang belum benar sebelum implementasi.
- Gunakan systematic-debugging untuk kegagalan atau perilaku tak terduga.
- Sebelum edit simbol, jalankan GitNexus impact upstream dan laporkan callers, proses, serta risk. HIGH/CRITICAL wajib diberitahukan sebelum edit.
- Sebelum commit, jalankan GitNexus detect-changes staged, periksa diff, dan stage hanya file tugas. Hasil kosong dari index rusak bukan bukti aman.
- Jangan timpa override RBAC tersimpan, harga historis, timestamp manual, atau kontrak stok SURAT_JALAN lama.
- Bahasa UI Indonesia. Perbarui Bantuan dan AI workflow yang berubah sebelum rilis.
- Lokasi dokumen: `C:\Projects\pos-system-monorepo\markdown-files`; nama berakhiran `2026-10-05.md`.
- Jalankan migrasi hanya pada database pengujian terisolasi ketika memverifikasi. Rencana ini tidak memberikan izin deploy/migrasi produksi.
- Tidak menambah dependency; browser test memakai Playwright existing dan `PLAYWRIGHT_SKIP_WEBSERVER=1` terhadap server pengujian yang disediakan pengguna.

## Cara menjalankan setiap tugas

Semua path relatif terhadap `C:\Projects\pos-system-monorepo`. Kode tes dan kode implementasi di bawah adalah isi yang harus ditambahkan saat eksekusi, bukan kode yang sudah dijalankan. Tes helper perlu dilengkapi assertion integrasi yang disebutkan pada tugas; keberhasilan helper saja tidak membuktikan handler/UI sudah memakai perilaku baru.

Setiap tugas: analisis impact → tulis tes → jalankan dan pastikan RED → implementasi → jalankan GREEN serta type-check → detect-changes → review diff → commit. Perintah commit hanya dijalankan setelah file pada **Files** diperiksa. Gunakan skill using-git-worktrees saat memulai eksekusi, dan baca instruksi AGENTS pada checkout tujuan.

---

**Dependensi:** Tidak bergantung tahap lain. Sebelum kode, selesaikan preflight index pada checklist rilis.

## Task P1: Nama Daftar Belanja unik beserta migrasi dan form

**Files:**

- Create: apps/web/features/suppliers/shopping-requests/helpers/shopping-request-name.ts
- Create: apps/web/features/suppliers/shopping-requests/helpers/__tests__/shopping-request-name.test.ts
- Create: packages/db/prisma/migrations/202610050001_shopping_request_name/migration.sql
- Modify: packages/db/prisma/schema.prisma
- Modify: apps/web/features/suppliers/shopping-requests/types/shopping-request.ts
- Modify: apps/web/features/suppliers/shopping-requests/services/shopping-requests-service.ts
- Modify: apps/web/features/suppliers/shopping-requests/repositories/shopping-requests-repository.ts
- Modify: apps/web/features/suppliers/shopping-requests/hooks/useShoppingRequests.ts
- Modify: apps/web/features/suppliers/shopping-requests/components/ShoppingRequestCreateModal.tsx
- Modify: apps/web/features/suppliers/shopping-requests/components/ShoppingRequestEditModal.tsx
- Modify: apps/web/features/suppliers/shopping-requests/components/ShoppingRequestList.tsx
- Modify: apps/web/app/api/suppliers/shopping-requests/route.ts
- Modify: apps/web/app/api/suppliers/shopping-requests/[id]/route.ts
- Test: apps/web/features/suppliers/shopping-requests/services/__tests__/shopping-requests-service.test.ts

**Interfaces:** Produces resolveShoppingRequestName(input: string | null | undefined, number: string): { name: string; normalizedName: string }. CreateShoppingRequestInput/UpdateShoppingRequestInput menerima name?: string; list/detail mengembalikan name: string.

- [ ] **Step 0: Impact sebelum edit.** Target: createShoppingRequest, updateShoppingRequest, createShoppingRequestWithItems, updateShoppingRequestWithItems. Jika graph tidak dapat dipercaya, perbaiki index sebelum edit simbol; jangan mengganti langkah ini dengan asumsi risk rendah.
- [ ] **Step 1: Tulis tes perilaku yang gagal.** Isi tes baru/append pada suite existing berikut:

```ts
import { describe, expect, it } from "vitest";
import { resolveShoppingRequestName } from "../shopping-request-name";
it("default memakai nomor; custom mengabaikan case dan spasi tepi untuk keunikan", () => {
  expect(resolveShoppingRequestName(undefined, "DPB-202610-001"))
    .toEqual({ name: "DPB-202610-001", normalizedName: "dpb-202610-001" });
  expect(resolveShoppingRequestName("  Belanja Oktober  ", "DPB-202610-001"))
    .toEqual({ name: "Belanja Oktober", normalizedName: "belanja oktober" });
});
```

- [ ] **Step 2: Pastikan RED.**

```powershell
pnpm --filter @pos/web exec vitest run 'features/suppliers/shopping-requests/helpers/__tests__/shopping-request-name.test.ts'
```

Expected: FAIL karena export/perilaku baru belum ada atau assertion perilaku lama salah. Kegagalan dependency/environment yang tidak terkait tidak dihitung sebagai RED; selesaikan penyebabnya dahulu.

- [ ] **Step 3: Implementasi aturan inti dan integrasi berikut.**

```ts
export function resolveShoppingRequestName(
  input: string | null | undefined, number: string,
): { name: string; normalizedName: string } {
  const name = input?.trim() || number;
  return { name, normalizedName: name.toLowerCase() };
}
```

Tambahkan name String dan normalizedName String ke ShoppingRequest serta @@unique([storeId, normalizedName]). SQL: tambah kolom nullable, isi name=number dan normalizedName=lower(btrim(number)), cek benturan per store. Untuk benturan, reservasi nama existing terlebih dahulu dan tambahkan suffix identitas id; ulangi sampai tidak bentrok dengan seluruh nama toko. Setelah backfill, set NOT NULL dan buat unique index. Pembuatan tetap memakai lock nomor/sequence existing; panggil resolveShoppingRequestName setelah nomor terpilih. Update nama hanya dalam status edit yang diizinkan. Translate Prisma P2002 khusus constraint nama menjadi HTTP 409 'Nama daftar belanja sudah digunakan.' Tambahkan schema name optional, payload form, serializer, pencarian nama/nomor, serta tampilan kedua identitas.

Migration SQL setelah schema diperbarui:
```sql
ALTER TABLE "pos_shopping_requests" ADD COLUMN "name" TEXT, ADD COLUMN "normalizedName" TEXT;
UPDATE "pos_shopping_requests" SET "name"="number","normalizedName"=lower(btrim("number"));
DO $$
DECLARE duplicate_row RECORD; candidate TEXT; suffix INTEGER;
BEGIN
 FOR duplicate_row IN
  SELECT id,"storeId","number" FROM (
   SELECT id,"storeId","number",
    row_number() OVER (PARTITION BY "storeId","normalizedName" ORDER BY id) AS rank
   FROM "pos_shopping_requests"
  ) ranked WHERE rank>1
 LOOP
  suffix:=0;
  LOOP
   candidate:=duplicate_row."number" || ' #' || duplicate_row.id ||
    CASE WHEN suffix=0 THEN '' ELSE '-' || suffix::text END;
   EXIT WHEN NOT EXISTS (
    SELECT 1 FROM "pos_shopping_requests"
    WHERE "storeId"=duplicate_row."storeId" AND id<>duplicate_row.id
     AND "normalizedName"=lower(btrim(candidate))
   );
   suffix:=suffix+1;
  END LOOP;
  UPDATE "pos_shopping_requests" SET "name"=candidate,
   "normalizedName"=lower(btrim(candidate)) WHERE id=duplicate_row.id;
 END LOOP;
END $$;
ALTER TABLE "pos_shopping_requests" ALTER COLUMN "name" SET NOT NULL,
 ALTER COLUMN "normalizedName" SET NOT NULL;
CREATE UNIQUE INDEX "pos_shopping_requests_storeId_normalizedName_key"
 ON "pos_shopping_requests"("storeId","normalizedName");
```
Migration dan request baru memakai default nomor. Dokumen tetap dapat ditemukan memakai nomor asli walaupun nama mendapat suffix untuk benturan normalisasi.


- [ ] **Step 4: Pastikan GREEN dan verifikasi integrasi.**

```powershell
pnpm --filter @pos/web exec vitest run 'features/suppliers/shopping-requests/helpers/__tests__/shopping-request-name.test.ts'
pnpm --filter @pos/web exec tsc --noEmit --incremental false
```

Service tests: default, custom, nama sama beda case/spasi ditolak, lintas toko boleh, cancelled tetap memiliki nama. DB terisolasi: dua create paralel nama sama menghasilkan satu sukses dan satu 409; backfill tidak mengubah nomor dan menangani benturan suffix. Form kosong berarti default nomor. Run juga services/__tests__/shopping-requests-service.test.ts dan helpers/__tests__/shopping-request-migration.test.ts.

Untuk schema: generate Prisma client tanpa build dan type-check DB package setelah migrasi pada target pengujian. Untuk UI: gunakan browser test pada server pengujian existing; jangan mengubah lifecycle server pengguna.

- [ ] **Step 5: Review scope dan commit tugas.**

```powershell
gitnexus detect-changes --scope staged --repo pos-system-monorepo
git diff --cached --check
git diff --cached --name-only
git commit -m 'feat: add unique shopping request names'
```

Stage terlebih dahulu hanya file pada Files yang benar-benar diubah, termasuk tests/migration. Tidak memakai git add .; jangan ikutkan .serena, index GitNexus, env, atau artefak test. Jika folder dokumentasi diabaikan Git, force-add hanya file dokumentasi patch yang disengaja.


---

## Task P2: Default RBAC, integrasi pembelian, dan tab penerimaan Supplier

**Files:**

- Modify: apps/web/features/rbac/helpers/rbac-core.ts
- Modify: apps/web/features/rbac/helpers/__tests__/rbac-core.test.ts
- Modify: apps/web/features/rbac/helpers/__tests__/rbac-migration.test.ts
- Modify: apps/web/features/suppliers/components/SupplierPageShell.tsx
- Modify: apps/web/features/inventory-management/components/InboundReceiptTab.tsx
- Modify: apps/web/features/inventory-management/api/inventory-management-api.ts
- Modify: apps/web/features/inventory-management/services/inbound-receipt-service.ts
- Modify: apps/web/app/api/inventory-management/inbound-receipts/route.ts
- Modify: apps/web/features/suppliers/goods-purchases/components/GoodsPurchaseList.tsx
- Create: apps/web/features/suppliers/components/__tests__/supplier-inbound-navigation.test.tsx
- Modify: apps/web/features/rbac/helpers/rbac-settings-ui.ts
- Modify: apps/web/features/inventory-management/repositories/InventoryInboundReceiptRepository.ts
- Modify: apps/web/app/api/inventory-management/receiving-queue/route.ts
- Modify: apps/web/features/inventory-management/types/inventory-management.ts

**Interfaces:** Consumes konfigurasi RBAC effective existing. Produces Supplier tab='inbound-receipts', InboundReceiptTab props {goodsPurchaseId?: string|null; supplierId?: string|null}; filter supplierId diteruskan ke API dan repository dengan storeId actor.

- [ ] **Step 0: Impact sebelum edit.** Target: buildDefaultRolePermissions, normalizeRolePermissions, SupplierPageShell, InboundReceiptTab, getReceivingQueue. Jika graph tidak dapat dipercaya, perbaiki index sebelum edit simbol; jangan mengganti langkah ini dengan asumsi risk rendah.
- [ ] **Step 1: Tulis tes perilaku yang gagal.** Isi tes baru/append pada suite existing berikut:

```ts
it("hapus default Owner tetapi grant Admin tetap dihormati", () => {
  const defaults = buildDefaultRolePermissions();
  expect(canRolePerformAction("OWNER", "transaction", "delete", defaults)).toBe(true);
  expect(canRolePerformAction("ADMIN", "transaction", "delete", defaults)).toBe(false);
  const grants = normalizeRolePermissions([{
    role: "ADMIN", scope: "resource", target: "transaction",
    action: "delete", allowed: true,
  }]);
  expect(canRolePerformAction("ADMIN", "transaction", "delete", grants)).toBe(true);
  expect(canRoleAccessPage("INVENTORY", "/suppliers", defaults)).toBe(true);
  expect(canRolePerformAction("ADMIN", "supplier.goods_purchase.approve", "update", defaults)).toBe(true);
});
```

- [ ] **Step 2: Pastikan RED.**

```powershell
pnpm --filter @pos/web exec vitest run 'features/rbac/helpers/__tests__/rbac-core.test.ts'
```

Expected: FAIL karena export/perilaku baru belum ada atau assertion perilaku lama salah. Kegagalan dependency/environment yang tidak terkait tidak dihitung sebagai RED; selesaikan penyebabnya dahulu.

- [ ] **Step 3: Implementasi aturan inti dan integrasi berikut.**

```ts
LEGACY_PAGE_ACCESS["/suppliers"] = ["OWNER", "ADMIN", "INVENTORY"];
LEGACY_ACTION_ACCESS.transaction.delete = ["OWNER"];
LEGACY_ACTION_ACCESS.supplier.read = ["OWNER", "ADMIN", "INVENTORY"];
RESOURCE_GRANULAR_ACCESS["inventory.inbound_receipt.create"] = {
 read: ["INVENTORY"], create: ["INVENTORY"], update: [], delete: [],
};
RESOURCE_GRANULAR_ACCESS["supplier.goods_purchase.approve"] = {
 read: [], create: [], update: ["ADMIN"], delete: [],
};
// OWNER mendapat seluruh hak melalui canRolePerformAction existing.
// Tambahkan literal "inventory.inbound_receipt.create" ke RESOURCE_TARGETS.
```

Jangan tambahkan transaction.delete ke OWNER_LOCKED_RESOURCE_TARGETS. Default inventory/update Admin existing jangan dicabut untuk tindakan inventory lain. Gunakan resource baru inventory.inbound_receipt.create untuk create receipt, default create/read Owner/Gudang dan izin konfigurabel; GET tetap inventory/read. Tambahkan resource ke RESOURCE_TARGETS dan label RBAC. Semua handler/form create memakai permission baru; APPROVE/REJECT penerimaan memakai permission granular existing. Supplier shell tampilkan tab Penerimaan Barang serta tombol dari pembelian approved yang membuka tab ini dengan goodsPurchaseId. Daftar Belanja tetap terintegrasi sumber GoodsPurchaseCreateModal; tidak membuat item ulang. Pisahkan visibilitas tab dari hak edit supplier. Override persisted tidak ditimpa; Owner full-access existing tetap dipertahankan.



- [ ] **Step 4: Pastikan GREEN dan verifikasi integrasi.**

```powershell
pnpm --filter @pos/web exec vitest run 'features/rbac/helpers/__tests__/rbac-core.test.ts'
pnpm --filter @pos/web exec tsc --noEmit --incremental false
```

Extend tes normalisasi: custom grant tetap true, custom deny tetap false, resource baru mendapat default hanya jika tidak ada row override. UI/API: Gudang dapat list/create penerimaan dan tidak mendapat edit supplier otomatis; Admin approve pembelian default; pembelian PENDING/REJECTED ditolak receiving. Role lain dapat diberikan create via RBAC. Uji deep link Supplier dan Inventory membaca receipt id sama.

Untuk schema: generate Prisma client tanpa build dan type-check DB package setelah migrasi pada target pengujian. Untuk UI: gunakan browser test pada server pengujian existing; jangan mengubah lifecycle server pengguna.

- [ ] **Step 5: Review scope dan commit tugas.**

```powershell
gitnexus detect-changes --scope staged --repo pos-system-monorepo
git diff --cached --check
git diff --cached --name-only
git commit -m 'feat: integrate supplier goods receipts with configurable defaults'
```

Stage terlebih dahulu hanya file pada Files yang benar-benar diubah, termasuk tests/migration. Tidak memakai git add .; jangan ikutkan .serena, index GitNexus, env, atau artefak test. Jika folder dokumentasi diabaikan Git, force-add hanya file dokumentasi patch yang disengaja.


---

## Task P3: Modal supplier pada penerimaan tanpa pembaruan master

**Files:**

- Create: apps/web/features/inventory-management/helpers/receipt-cost.ts
- Create: apps/web/features/inventory-management/helpers/__tests__/receipt-cost.test.ts
- Create: packages/db/prisma/migrations/202610050002_receipt_supplier_cost/migration.sql
- Modify: packages/db/prisma/schema.prisma
- Modify: apps/web/features/inventory-management/types/inventory-management.ts
- Modify: apps/web/features/inventory-management/services/inbound-receipt-service.ts
- Modify: apps/web/features/inventory-management/services/inbound-receipt-finalizer.ts
- Modify: apps/web/features/inventory-management/repositories/InventoryInboundReceiptRepository.ts
- Modify: apps/web/features/inventory-management/components/InboundReceiptModal.tsx
- Modify: apps/web/features/inventory-management/components/InboundReceiptReviewModal.tsx
- Modify: apps/web/features/inventory-management/api/inventory-management-api.ts
- Modify: apps/web/app/api/inventory-management/inbound-receipts/route.ts
- Modify: apps/web/app/api/inventory-management/inbound-receipts/[id]/items/[itemId]/route.ts
- Test: apps/web/features/inventory-management/services/__tests__/inbound-receipt-finalizer.test.ts
- Modify: apps/web/app/api/inventory-management/receiving-queue/route.ts

**Interfaces:** Produces resolveReceiptCost(input: {supplierCostPrice?: number|null; masterCostPrice: number|null}): number|null. InventoryInboundReceiptLine.supplierCostPrice Decimal? adalah input/snapshot; null dokumen lama fallback costPriceSnapshot/latestUnitPrice existing.

- [ ] **Step 0: Impact sebelum edit.** Target: createAndSubmitGoodsPurchaseReceipt, editInboundReceiptItem, finalizeInboundReceiptIfReady. Jika graph tidak dapat dipercaya, perbaiki index sebelum edit simbol; jangan mengganti langkah ini dengan asumsi risk rendah.
- [ ] **Step 1: Tulis tes perilaku yang gagal.** Isi tes baru/append pada suite existing berikut:

```ts
import { expect, it } from "vitest";
import { resolveReceiptCost } from "../receipt-cost";
it("default modal sekarang, override termasuk nol, invalid ditolak", () => {
  expect(resolveReceiptCost({masterCostPrice: 7000})).toBe(7000);
  expect(resolveReceiptCost({supplierCostPrice: 6500, masterCostPrice: 7000})).toBe(6500);
  expect(resolveReceiptCost({supplierCostPrice: 0, masterCostPrice: 7000})).toBe(0);
  expect(() => resolveReceiptCost({supplierCostPrice: -1, masterCostPrice: 7000})).toThrow();
});
```

- [ ] **Step 2: Pastikan RED.**

```powershell
pnpm --filter @pos/web exec vitest run 'features/inventory-management/helpers/__tests__/receipt-cost.test.ts'
```

Expected: FAIL karena export/perilaku baru belum ada atau assertion perilaku lama salah. Kegagalan dependency/environment yang tidak terkait tidak dihitung sebagai RED; selesaikan penyebabnya dahulu.

- [ ] **Step 3: Implementasi aturan inti dan integrasi berikut.**

```ts
export function resolveReceiptCost(input: {
  supplierCostPrice?: number | null; masterCostPrice: number | null;
}): number | null {
  const value = input.supplierCostPrice ?? input.masterCostPrice;
  if (value === null) return null;
  if (!Number.isFinite(value) || value < 0 || value > 9999999999.99)
    throw new Error("Harga modal supplier tidak valid.");
  return Math.round(value * 100) / 100;
}
```

Migrasi hanya tambah supplierCostPrice Decimal? @db.Decimal(12,2) di InventoryInboundReceiptLine; tidak backfill history dari master terbaru. Payload line supplierCostPrice optional nonnegative maksimal batas Decimal. Load current master modal pada server ketika create (abaikan modal default dari client sebagai kebenaran). Jika tidak tersedia, pengguna harus mengisi biaya untuk baris diterima sebelum submit. UI state draft mempertahankan input, label Rp/[unit]. Persist snapshot sekali; edit mengikuti status/permission existing. Finalizer unitCost = line.supplierCostPrice ?? snapshot existing; konversi ke unit/base memakai helper stok existing hanya saat log berbasis base. Jangan mengubah Product.costPrice, GoodsPurchase.latestUnitPrice, atau Expense amount. Tampilkan selisih terhadap pembelian pada review.

Migration SQL untuk nama tabel yang telah diverifikasi dari schema:
```sql
ALTER TABLE "pos_inventory_inbound_receipt_lines"
 ADD COLUMN "supplierCostPrice" DECIMAL(12,2);
```
Harga kosong pada dokumen legacy tidak diisi dari modal saat ini. Field ditambahkan pada InventoryInboundReceiptLine, bukan model pembelian.


- [ ] **Step 4: Pastikan GREEN dan verifikasi integrasi.**

```powershell
pnpm --filter @pos/web exec vitest run 'features/inventory-management/helpers/__tests__/receipt-cost.test.ts'
pnpm --filter @pos/web exec tsc --noEmit --incremental false
```

Finalizer tests: modal=6500 masuk log, product.update costPrice tidak dipanggil, expense tidak digandakan, legacy null menggunakan harga lama, zero tidak dianggap kosong. Receiving quantity parsial/race tests existing tetap lulus. DB isolated migration mempertahankan semua line lama.

Untuk schema: generate Prisma client tanpa build dan type-check DB package setelah migrasi pada target pengujian. Untuk UI: gunakan browser test pada server pengujian existing; jangan mengubah lifecycle server pengguna.

- [ ] **Step 5: Review scope dan commit tugas.**

```powershell
gitnexus detect-changes --scope staged --repo pos-system-monorepo
git diff --cached --check
git diff --cached --name-only
git commit -m 'feat: capture supplier cost on goods receipts'
```

Stage terlebih dahulu hanya file pada Files yang benar-benar diubah, termasuk tests/migration. Tidak memakai git add .; jangan ikutkan .serena, index GitNexus, env, atau artefak test. Jika folder dokumentasi diabaikan Git, force-add hanya file dokumentasi patch yang disengaja.


---

## Task P4: Tutup popup setelah Kunci/Selesai berhasil

**Files:**

- Modify: apps/web/features/suppliers/shopping-requests/components/ShoppingRequestApproveModal.tsx
- Modify: apps/web/features/suppliers/shopping-requests/components/ShoppingRequestApprovedQtyModal.tsx
- Create: apps/web/features/suppliers/shopping-requests/helpers/shopping-request-completion.ts
- Create: apps/web/features/suppliers/shopping-requests/helpers/__tests__/shopping-request-completion.test.ts

**Interfaces:** Produces finishShoppingRequest(action: () => Promise<unknown>, close: () => void): Promise<void>; error diteruskan ke catch UI existing.

- [ ] **Step 0: Impact sebelum edit.** Target: ShoppingRequestApproveModal, ShoppingRequestApprovedQtyModal. Jika graph tidak dapat dipercaya, perbaiki index sebelum edit simbol; jangan mengganti langkah ini dengan asumsi risk rendah.
- [ ] **Step 1: Tulis tes perilaku yang gagal.** Isi tes baru/append pada suite existing berikut:

```ts
import { expect, it, vi } from "vitest";
import { finishShoppingRequest } from "../shopping-request-completion";
it("menutup hanya sesudah berhasil dan menjaga popup jika gagal", async () => {
  const close = vi.fn();
  await expect(finishShoppingRequest(async () => { throw new Error("gagal"); }, close))
    .rejects.toThrow("gagal");
  expect(close).not.toHaveBeenCalled();
  await finishShoppingRequest(async () => ({ok: true}), close);
  expect(close).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Pastikan RED.**

```powershell
pnpm --filter @pos/web exec vitest run 'features/suppliers/shopping-requests/helpers/__tests__/shopping-request-completion.test.ts'
```

Expected: FAIL karena export/perilaku baru belum ada atau assertion perilaku lama salah. Kegagalan dependency/environment yang tidak terkait tidak dihitung sebagai RED; selesaikan penyebabnya dahulu.

- [ ] **Step 3: Implementasi aturan inti dan integrasi berikut.**

```ts
export async function finishShoppingRequest(
  action: () => Promise<unknown>, close: () => void,
): Promise<void> {
  await action();
  close();
}
```

Pada handler Kunci/Selesai, bungkus mutateAsync existing dengan finishShoppingRequest, bukan handler approve per-item yang belum menyelesaikan aksi. setActionError(null) sebelum aksi; set processing/pending selama aksi dan disable tombol terkait; catch menampilkan error existing. Invalidasi query existing diselesaikan oleh mutation hook sebelum menutup. ApprovedQtyModal yang sudah onClose setelah sukses tetap memakai urutan ini tanpa penutupan kedua. Tidak mengubah status/penguncian database.



- [ ] **Step 4: Pastikan GREEN dan verifikasi integrasi.**

```powershell
pnpm --filter @pos/web exec vitest run 'features/suppliers/shopping-requests/helpers/__tests__/shopping-request-completion.test.ts'
pnpm --filter @pos/web exec tsc --noEmit --incremental false
```

Browser pada server test existing: success menutup popup, failure409 mempertahankan input dan menampilkan pesan, dua klik cepat menghasilkan satu request. Jangan tambah source-string test untuk sekadar mencari onClose.

Untuk schema: generate Prisma client tanpa build dan type-check DB package setelah migrasi pada target pengujian. Untuk UI: gunakan browser test pada server pengujian existing; jangan mengubah lifecycle server pengguna.

- [ ] **Step 5: Review scope dan commit tugas.**

```powershell
gitnexus detect-changes --scope staged --repo pos-system-monorepo
git diff --cached --check
git diff --cached --name-only
git commit -m 'fix: close shopping request popup after successful finish'
```

Stage terlebih dahulu hanya file pada Files yang benar-benar diubah, termasuk tests/migration. Tidak memakai git add .; jangan ikutkan .serena, index GitNexus, env, atau artefak test. Jika folder dokumentasi diabaikan Git, force-add hanya file dokumentasi patch yang disengaja.


---

## Task P5: Dua versi cetak Daftar Belanja A4 tanpa truncation

**Files:**

- Modify: apps/web/features/suppliers/shopping-requests/helpers/shopping-request-print.ts
- Modify: apps/web/features/suppliers/shopping-requests/components/ShoppingRequestPrintModal.tsx
- Modify: apps/web/features/suppliers/shopping-requests/components/shopping-request-print.css
- Modify: apps/web/features/suppliers/shopping-requests/helpers/__tests__/shopping-request-print.test.ts
- Create: apps/web/features/suppliers/shopping-requests/components/__tests__/shopping-request-print-layout.test.tsx

**Interfaces:** Produces SHOPPING_REQUEST_PRINT_LAYOUTS readonly [{kind:'summary',columns:['no','productName','requestedQty']},{kind:'full',columns:['no','productName','requestedQty','stockOnHand','approvedQty']}]; existing row type/padding tetap.

- [ ] **Step 0: Impact sebelum edit.** Target: buildShoppingRequestPrintRows, ShoppingRequestPrintModal. Jika graph tidak dapat dipercaya, perbaiki index sebelum edit simbol; jangan mengganti langkah ini dengan asumsi risk rendah.
- [ ] **Step 1: Tulis tes perilaku yang gagal.** Isi tes baru/append pada suite existing berikut:

```ts
import { expect, it } from "vitest";
import { SHOPPING_REQUEST_PRINT_LAYOUTS } from "../../helpers/shopping-request-print";
it("dua nota dan nota pertama tepat tiga kolom", () => {
  expect(SHOPPING_REQUEST_PRINT_LAYOUTS).toEqual([
    {kind: "summary", columns: ["no", "productName", "requestedQty"]},
    {kind: "full", columns: ["no", "productName", "requestedQty", "stockOnHand", "approvedQty"]},
  ]);
});
```

- [ ] **Step 2: Pastikan RED.**

```powershell
pnpm --filter @pos/web exec vitest run 'features/suppliers/shopping-requests/components/__tests__/shopping-request-print-layout.test.tsx'
```

Expected: FAIL karena export/perilaku baru belum ada atau assertion perilaku lama salah. Kegagalan dependency/environment yang tidak terkait tidak dihitung sebagai RED; selesaikan penyebabnya dahulu.

- [ ] **Step 3: Implementasi aturan inti dan integrasi berikut.**

```ts
export const SHOPPING_REQUEST_PRINT_LAYOUTS = [
  {kind: "summary", columns: ["no", "productName", "requestedQty"]},
  {kind: "full", columns: ["no", "productName", "requestedQty", "stockOnHand", "approvedQty"]},
] as const;
```

Render dua section dengan header dokumen name/number yang sama; summary tepat tiga kolom No/Nama Barang/Kebutuhan Belanja, full salin template existing seluruh kolom/signature. CSS print: @page shopping-request {size:A4; margin:10mm}, .shopping-request-print-page {page:shopping-request}, section + section {break-before:page}, thead {display:table-header-group}, tr {break-inside:avoid}, container {height:auto; max-height:none; overflow:visible}. Hindari min-height297mm ditambah margin yang menghasilkan halaman kosong. Batasi semua selector ke shopping request print root.



- [ ] **Step 4: Pastikan GREEN dan verifikasi integrasi.**

```powershell
pnpm --filter @pos/web exec vitest run 'features/suppliers/shopping-requests/components/__tests__/shopping-request-print-layout.test.tsx'
pnpm --filter @pos/web exec tsc --noEmit --incremental false
```

SSR test render seluruh section dengan fixture 120 item memastikan nama terakhir ada di dua versi. Browser print/PDF pendek=dua halaman A4 tanpa halaman kosong; 120item semua terwakili, full mulai halaman baru, header repeat. Buka hasil PDF sebelum lulus; receipt transaksi lain tidak berubah. Jika browser/print environment belum tersedia, tandai validasi visual belum selesai dan jangan klaim siap rilis.

Untuk schema: generate Prisma client tanpa build dan type-check DB package setelah migrasi pada target pengujian. Untuk UI: gunakan browser test pada server pengujian existing; jangan mengubah lifecycle server pengguna.

- [ ] **Step 5: Review scope dan commit tugas.**

```powershell
gitnexus detect-changes --scope staged --repo pos-system-monorepo
git diff --cached --check
git diff --cached --name-only
git commit -m 'feat: print summary and full A4 shopping receipts'
```

Stage terlebih dahulu hanya file pada Files yang benar-benar diubah, termasuk tests/migration. Tidak memakai git add .; jangan ikutkan .serena, index GitNexus, env, atau artefak test. Jika folder dokumentasi diabaikan Git, force-add hanya file dokumentasi patch yang disengaja.
