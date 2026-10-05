# Waktu WIB, Dashboard dan Rilis Implementation Plan

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

**Dependensi:** D1–D2 dapat dimulai setelah model/kontrak stabil; D3 hanya setelah P1–P5, C1–C5, T1–T3, S1–S3 selesai.

## Task D1: Waktu server, default invoice, dan format WIB konsisten

**Files:**

- Create: apps/web/app/api/time/route.ts
- Create: apps/web/features/invoice-date/helpers/server-clock.ts
- Create: apps/web/features/invoice-date/helpers/__tests__/server-clock.test.ts
- Create: apps/web/features/invoice-date/hooks/useServerClock.ts
- Modify: apps/web/features/invoice-date/helpers/invoice-date-core.ts
- Modify: apps/web/lib/utils.ts
- Modify: apps/web/app/(main)/pos/POSClientPage.tsx
- Modify: apps/web/components/PaymentModal.tsx
- Modify: apps/web/components/ReceiptModal.tsx
- Modify: apps/web/features/invoice-pdf/helpers/invoice-pdf-data.ts
- Modify: apps/web/features/invoice-pdf/helpers/draft-pdf-data.ts
- Modify: apps/web/app/api/transactions/route.ts
- Modify: apps/web/app/api/transactions/draft/route.ts
- Modify: apps/web/app/api/transactions/[id]/approve-draft/route.ts
- Modify: apps/web/app/api/offline-sync/transactions/route.ts
- Modify: apps/web/lib/offline/offline-db.ts
- Modify: apps/web/features/invoice-date/helpers/history-invoice-date-display.ts

**Interfaces:** Produces ClockAnchor {serverEpochMs:number;receivedMonotonicMs:number}; estimateServerNow(anchor:ClockAnchor,monotonicMs:number):Date; formatInvoiceWib(date:Date|string):string. GET /api/time {serverEpochMs:number;timeZone:'Asia/Jakarta';source:'SERVER'}, no-store. OfflineTransactionPayload.timeSource?:'SERVER_ESTIMATE'|'DEVICE_UNVERIFIED'; createdAt existing dipertahankan; new manual invoice request mode default/explicit.

- [ ] **Step 0: Impact sebelum edit.** Target: formatDate, formatIndonesianDate, POST transaction/draft/approve-draft/offline-sync, invoice-date helpers. Jika graph tidak dapat dipercaya, perbaiki index sebelum edit simbol; jangan mengganti langkah ini dengan asumsi risk rendah.
- [ ] **Step 1: Tulis tes perilaku yang gagal.** Isi tes baru/append pada suite existing berikut:

```ts
import {expect,it} from "vitest";
import {estimateServerNow,formatInvoiceWib} from "../server-clock";
import {jakartaDateKey} from "../invoice-date-core";
it("jam perangkat tidak mengubah anchor; pergantian tanggal mengikuti WIB",()=>{
 const anchor={serverEpochMs:Date.parse("2026-10-05T17:00:00Z"),receivedMonotonicMs:1000};
 const now=estimateServerNow(anchor,301000);
 expect(now.toISOString()).toBe("2026-10-05T17:05:00.000Z");
 expect(jakartaDateKey(now)).toBe("2026-10-06");
 expect(formatInvoiceWib(now)).toContain("WIB");
});
```

- [ ] **Step 2: Pastikan RED.**

```powershell
pnpm --filter @pos/web exec vitest run 'features/invoice-date/helpers/__tests__/server-clock.test.ts'
```

Expected: FAIL karena export/perilaku baru belum ada atau assertion perilaku lama salah. Kegagalan dependency/environment yang tidak terkait tidak dihitung sebagai RED; selesaikan penyebabnya dahulu.

- [ ] **Step 3: Implementasi aturan inti dan integrasi berikut.**

```ts
export interface ClockAnchor {serverEpochMs:number;receivedMonotonicMs:number}
export function estimateServerNow(anchor:ClockAnchor,monotonicMs:number):Date {
 return new Date(anchor.serverEpochMs+Math.max(0,monotonicMs-anchor.receivedMonotonicMs));
}
export function formatInvoiceWib(date:Date|string):string {
 return new Intl.DateTimeFormat("id-ID",{timeZone:"Asia/Jakarta",
 day:"numeric",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit",
 hourCycle:"h23"}).format(typeof date==="string"?new Date(date):date)+" WIB";
}
```

Endpoint GET timestampDate.now denganheaderCache-Control:no-store, zoneAsia/Jakarta, sourceSERVER; sessionauthenticatedexistingguard. useServerClock fetchstart/end performance.now, anchor responseEpoch+halfRTT atreceivedmono, refetch ketikaonline/focus dan setiap5menit; cleanup intervalabortcontroller, jangan fetch perdetik. Cache anchorserverepoch+receiveddeviceepoch untukreload; same-page memakai monotonic. Reload/offlinecache mengestimasi memakai positiveelapseddevice dan metadataestimated, belumcache deviceunverified dengan pesan waktubelumsinkron. Defaultdate input diinisialisasidariservertime tanpaoverwrite fielddirtymanual. Request invoiceDateMode?:'DEFAULT'|'MANUAL'; defaultserverDate.now, manual requireexistingpermission/audit dateandreason; oldpayloads with explicitinvoiceDate tetap kompatibel dengan existingvalidation. Online/sync beda: offline preserve record.createdAt original and source in offlineSyncMetadata, tidaknowunggah. Sharedformatter WIB kehistory/receipt/PDF/dateheaders, jangan doubleoffset. Verifikasi NTP deployment secaraoperasional sebelumrilis; endpointSERVER tidakmengklaim syncinternetverified sendiri.



- [ ] **Step 4: Pastikan GREEN dan verifikasi integrasi.**

```powershell
pnpm --filter @pos/web exec vitest run 'features/invoice-date/helpers/__tests__/server-clock.test.ts'
pnpm --filter @pos/web exec tsc --noEmit --incremental false
```

Tes devicesUTC/AsiaMakassar/AmericaNY tetapWIB, midnightUTC+7, DSTdevicesirrelevant, manualdirtynostomp, refetchfailurecachedestimate, offlinefirstunverified, reloadcache, syncpreservescreatedAt. Actualserverclock NTPverification evidence disimpan dirilisdoc, bukan unitmock.

Untuk schema: generate Prisma client tanpa build dan type-check DB package setelah migrasi pada target pengujian. Untuk UI: gunakan browser test pada server pengujian existing; jangan mengubah lifecycle server pengguna.

- [ ] **Step 5: Review scope dan commit tugas.**

```powershell
gitnexus detect-changes --scope staged --repo pos-system-monorepo
git diff --cached --check
git diff --cached --name-only
git commit -m 'feat: use synchronized server time and Jakarta invoice display'
```

Stage terlebih dahulu hanya file pada Files yang benar-benar diubah, termasuk tests/migration. Tidak memakai git add .; jangan ikutkan .serena, index GitNexus, env, atau artefak test. Jika folder dokumentasi diabaikan Git, force-add hanya file dokumentasi patch yang disengaja.


---

## Task D2: Kelompok produk terlaris dengan mapping kategori eksplisit

**Files:**

- Create: apps/web/features/dashboard/helpers/sales-groups.ts
- Create: apps/web/features/dashboard/helpers/__tests__/sales-groups.test.ts
- Create: packages/db/prisma/migrations/202610050005_category_sales_group/migration.sql
- Modify: packages/db/prisma/schema.prisma
- Modify: packages/db/src/seed.ts
- Modify: apps/web/app/api/dashboard/route.ts
- Modify: apps/web/app/api/dashboard/__tests__/route.test.ts
- Modify: apps/web/features/dashboard/types/index.ts
- Modify: apps/web/features/dashboard/hooks/useDashboard.ts
- Modify: apps/web/features/dashboard/components/TopProductsList.tsx
- Modify: apps/web/app/(main)/dashboard/page.tsx

**Interfaces:** Produces SalesGroup='ATK'|'PAPER'|'CARTRIDGE'|'INK'|'OTHER'; inferSalesGroup(name:string):SalesGroup untuk inisialisasi; runtime memakai Category.salesGroup enum ProductSalesGroup defaultOTHER. DashboardData.topProductGroups:Array<{key:SalesGroup;label:string;products:TopProduct[]}>; keep topProducts compatibility until consumers migrated.

- [ ] **Step 0: Impact sebelum edit.** Target: dashboard GET, TopProductsList, useDashboard. Jika graph tidak dapat dipercaya, perbaiki index sebelum edit simbol; jangan mengganti langkah ini dengan asumsi risk rendah.
- [ ] **Step 1: Tulis tes perilaku yang gagal.** Isi tes baru/append pada suite existing berikut:

```ts
import {expect,it} from "vitest";
import {inferSalesGroup} from "../sales-groups";
it("mapping known dan unknown tidak dipaksa ke tinta",()=>{
 expect(inferSalesGroup("ATK")).toBe("ATK");
 expect(inferSalesGroup("Paper")).toBe("PAPER");
 expect(inferSalesGroup("Catridge HP")).toBe("CARTRIDGE");
 expect(inferSalesGroup("Tinta")).toBe("INK");
 expect(inferSalesGroup("Toner HP")).toBe("OTHER");
});
```

- [ ] **Step 2: Pastikan RED.**

```powershell
pnpm --filter @pos/web exec vitest run 'features/dashboard/helpers/__tests__/sales-groups.test.ts'
```

Expected: FAIL karena export/perilaku baru belum ada atau assertion perilaku lama salah. Kegagalan dependency/environment yang tidak terkait tidak dihitung sebagai RED; selesaikan penyebabnya dahulu.

- [ ] **Step 3: Implementasi aturan inti dan integrasi berikut.**

```ts
export type SalesGroup="ATK"|"PAPER"|"CARTRIDGE"|"INK"|"OTHER";
export function inferSalesGroup(name:string):SalesGroup {
 const normalized=name.trim().toLowerCase();
 if(["atk","stationery"].includes(normalized)) return "ATK";
 if(["kertas","paper"].includes(normalized)) return "PAPER";
 if(/^(cartridge|catridge)(?:\s|$)/.test(normalized)) return "CARTRIDGE";
 if(["tinta","ink"].includes(normalized)) return "INK";
 return "OTHER";
}
export const SALES_GROUP_LABELS:Record<SalesGroup,string>={
 ATK:"ATK",PAPER:"Kertas",CARTRIDGE:"Cartridge",INK:"Tinta",OTHER:"Lainnya",
};
```

Tambah Prisma enumProductSalesGroup lima nilai dan Category.salesGroup defaultOTHER; migrasi isi knownexactaliases/prefix sesuaihelper, jangannebakBot/Plano/Toner. Seed explicitsalesGroup saatcreates, tidakoverwrite kategorioperasional saatseed ulang. API pergroup groupByproductId top5 bukan globaltop5laludibagi; filter transactionstore/statusCOMPLETEDDP (Tempofinalincluded), product.category.salesGroup, PRODUCTlineonly, productIdnotnull. Cakupan produkterlaris existing AllTime dipertahankan. Fetch displayproductnames byids satuquery, gabungkan renamedhistoricalsameid. UI empatkelompokwajibdanLainnya, emptymessage. Categoryglobalmapping field bukanremovecategories. Bot/Plano dan kategori toko lainnya ditinjau di data gate; assignment menjadi perubahan data yang dicatat dan dijalankan saatdeploymentdiizinkan. Unknown tetapLainnya sampai mappingtervalidasi.

Migration enum/category:
```sql
CREATE TYPE "ProductSalesGroup" AS ENUM ('ATK','PAPER','CARTRIDGE','INK','OTHER');
ALTER TABLE "pos_categories" ADD COLUMN "salesGroup" "ProductSalesGroup"
 NOT NULL DEFAULT 'OTHER';
UPDATE "pos_categories" SET "salesGroup"=CASE
 WHEN lower(btrim(name)) IN ('atk','stationery') THEN 'ATK'::"ProductSalesGroup"
 WHEN lower(btrim(name)) IN ('kertas','paper') THEN 'PAPER'::"ProductSalesGroup"
 WHEN lower(btrim(name)) ~ '^(cartridge|catridge)([[:space:]]|$)' THEN 'CARTRIDGE'::"ProductSalesGroup"
 WHEN lower(btrim(name)) IN ('tinta','ink') THEN 'INK'::"ProductSalesGroup"
 ELSE 'OTHER'::"ProductSalesGroup" END;
```
Category.salesGroup dipakai saat query, bukan inferSalesGroup per transaksi; alias hanya untuk inisialisasi. Pemilik meninjau mapping kategori actual pada release data gate. Mengubah Bot/Plano/Toner hanya setelah makna kategori dikonfirmasi; tidak mengubah nama inventory.


- [ ] **Step 4: Pastikan GREEN dan verifikasi integrasi.**

```powershell
pnpm --filter @pos/web exec vitest run 'features/dashboard/helpers/__tests__/sales-groups.test.ts'
pnpm --filter @pos/web exec tsc --noEmit --incremental false
```

Fixtures 6ATKdan6Paper masingmasingtop5benar, globalrankingtidakmenelansemuacategory, renameproductidnotduplicated, voidrefunddraftpendingexcluded, storesisolated, Tempocount, tiesstableid. MigrationunknownOTHER. LainnyamenampilkanToner sampaiownerconfirmsmapping.

Untuk schema: generate Prisma client tanpa build dan type-check DB package setelah migrasi pada target pengujian. Untuk UI: gunakan browser test pada server pengujian existing; jangan mengubah lifecycle server pengguna.

- [ ] **Step 5: Review scope dan commit tugas.**

```powershell
gitnexus detect-changes --scope staged --repo pos-system-monorepo
git diff --cached --check
git diff --cached --name-only
git commit -m 'feat: group best selling products by reporting category'
```

Stage terlebih dahulu hanya file pada Files yang benar-benar diubah, termasuk tests/migration. Tidak memakai git add .; jangan ikutkan .serena, index GitNexus, env, atau artefak test. Jika folder dokumentasi diabaikan Git, force-add hanya file dokumentasi patch yang disengaja.


---

## Task D3: Dokumentasi Bantuan, workflow AI, dan tes lintas alur

**Files:**

- Modify: apps/web/features/help-documentation/components/HelpContent.tsx
- Modify: apps/web/features/help-documentation/__tests__/HelpContent.test.tsx
- Modify: apps/web/features/ai-assistant/workflows/workflow-catalog.ts
- Modify: apps/web/features/ai-assistant/workflows/__tests__/workflow-catalog.test.ts
- Modify: apps/web/features/ai-assistant/docs/help/faq.md
- Modify: apps/web/features/ai-assistant/docs/help/pos.md
- Modify: apps/web/features/ai-assistant/docs/help/suppliers.md
- Modify: apps/web/features/ai-assistant/docs/help/inventory.md
- Modify: apps/web/features/ai-assistant/docs/help/customers.md
- Modify: apps/web/features/ai-assistant/docs/help/history.md
- Modify: apps/web/features/ai-assistant/docs/help/financial-report.md
- Create: apps/web/e2e/pos-unit-cart.spec.ts
- Modify: apps/web/e2e/fixtures/mock-data.ts
- Modify: apps/web/e2e/fixtures/app.ts
- Create: markdown-files/patch-besar-pos-rilis-2026-10-05.md
- Create: apps/web/e2e/suppliers-goods-receipt.spec.ts

**Interfaces:** Existingfaqids/routes remainstable; workflowreceiving uses Supplier/inbound-receipts routeand inventory.inbound_receipt.create. UItests use app fixtureexisting; isolatedDBtests S3 remainseparate from browsermock.

- [ ] **Step 0: Impact sebelum edit.** Target: HelpContent, FAQ_WORKFLOWS, getWorkflowPayload. Jika graph tidak dapat dipercaya, perbaiki index sebelum edit simbol; jangan mengganti langkah ini dengan asumsi risk rendah.
- [ ] **Step 1: Tulis tes perilaku yang gagal.** Isi tes baru/append pada suite existing berikut:

```ts
it("alur penerimaan memuat input modal dan akses Supplier",()=>{
 const inbound=FAQ_WORKFLOWS.find(workflow=>workflow.faqNumber===18);
 expect(inbound).toBeDefined();
 const body=JSON.stringify(inbound);
 expect(body).toContain("Harga modal");
 expect(body).toContain("Penerimaan Barang");
 expect(body).toContain("inventory.inbound_receipt.create");
});
it("panduan membedakan Tempo dan DP",()=>{
 expect(JSON.stringify(FAQ_WORKFLOWS)).toContain("TEMPO/TAGIHAN");
});
```

- [ ] **Step 2: Pastikan RED.**

```powershell
pnpm --filter @pos/web exec vitest run 'features/ai-assistant/workflows/__tests__/workflow-catalog.test.ts'
```

Expected: FAIL karena export/perilaku baru belum ada atau assertion perilaku lama salah. Kegagalan dependency/environment yang tidak terkait tidak dihitung sebagai RED; selesaikan penyebabnya dahulu.

- [ ] **Step 3: Implementasi aturan inti dan integrasi berikut.**

```ts
const receivingStep = {
 title:"Isi Harga modal",
 description:"Harga modal awal mengikuti modal produk. Ubah sesuai harga supplier untuk satuan barang yang diterima. Nilai ini tersimpan pada penerimaan dan tidak memperbarui modal master otomatis.",
};
const posStep = {
 title:"Pilih satuan dan jumlah",
 description:"Pilih satuan langsung dari Keranjang. Jumlah tetap saat satuan diganti; harga dan subtotal mengikuti satuan baru. Ketik jumlah atau gunakan tombol tambah dan kurang.",
};
// Masukkan object ini ke daftar steps workflow existing melalui builder existing.
```

Updatecopybagian existing pengadaan/approval/stock/WIB/pricing/Tempo sesuaifinalUI. Hapusarahpricingpriorityselector. Ganti hardcodedOwneronlydelete dengan defaultOwnerconfigRBAC. UntukFAQexistingreceiver18/shopping19/DPpiutang/POSpricing, update steps danrequiredCapabilities secara tepat; janganmengubahcount38tanpa menambahFAQnyata. Help danAI docs jelaskanreturactualstockonce, pendingnodouble, modaldeferred, duaA4. Extend testfixture products with linkedDus/Bal unitOptions and conversiongroup, intercept time endpoint/mapping/Tempo accordingtonewcontracts. Add Playwright specactualdirectinput +unitselector +price; no source-stringonlyvalidation. Rilisdoccatatmigrations, roledefaultvsstored, keybehaviors, knownlegacyproofrejections, data mappingdecision, tesresults/skipreason, NTPevidence, rollbackcompatibleenum, screenshots/PDF.

Playwright direct quantity menggunakan fixture existing:
```ts
// apps/web/e2e/pos-unit-cart.spec.ts
import {test,expect} from "./fixtures/app";
test("jumlah bisa diketik tanpa menghapus baris ketika kosong",async({appPage:page})=>{
 await page.goto("/pos");
 await page.getByText("Kertas HVS A4").first().click();
 const qty=page.getByRole("textbox",{name:"Jumlah Kertas HVS A4",exact:true});
 await qty.fill("");
 await expect(qty).toBeVisible();
 await qty.fill("12");
 await expect(qty).toHaveValue("12");
 await qty.fill("0");
 await qty.press("Enter");
 await expect(qty).toHaveValue("12");
});
```
Tambahkan skenario pergantian Dus/Bal memakai fixture Amplop baru (stockGroup.id sama, faktor1/5, harga15500/70000): pilih Dus, isi2, pilihBal, assertjumlah2 dan baristotal140000. Untuk suppliers-goods-receipt.spec.ts mock purchase APPROVED, quantity ordered10/received4/pending2/available4, mastermodal7000. Uji pilih inputmodal6500, submit payload6500, popupcloseonsuccess, failure409 inputtetap. Backend stock correctness tetap dibuktikan oleh service/DB tests, bukan mock endpoint browser.


- [ ] **Step 4: Pastikan GREEN dan verifikasi integrasi.**

```powershell
pnpm --filter @pos/web exec vitest run 'features/ai-assistant/workflows/__tests__/workflow-catalog.test.ts'
pnpm --filter @pos/web exec tsc --noEmit --incremental false
```

Runworkflowcatalog/help/pricing/inbound/debt/stocksuite, fullweb Vitest, allfivepackageTSdirect, Playwright POS/approval/receipt supplier onexistingisolatedserver withskipwebserver1. Checklistmasterwajibcomplete; unitmockpassingtidakmenggantirealDBrace atauprintvisual. Tidak deploy otomatis.

Untuk schema: generate Prisma client tanpa build dan type-check DB package setelah migrasi pada target pengujian. Untuk UI: gunakan browser test pada server pengujian existing; jangan mengubah lifecycle server pengguna.

- [ ] **Step 5: Review scope dan commit tugas.**

```powershell
gitnexus detect-changes --scope staged --repo pos-system-monorepo
git diff --cached --check
git diff --cached --name-only
git commit -m 'docs: align POS help workflows and release validation'
```

Stage terlebih dahulu hanya file pada Files yang benar-benar diubah, termasuk tests/migration. Tidak memakai git add .; jangan ikutkan .serena, index GitNexus, env, atau artefak test. Jika folder dokumentasi diabaikan Git, force-add hanya file dokumentasi patch yang disengaja.
