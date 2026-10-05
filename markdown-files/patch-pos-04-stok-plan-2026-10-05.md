# Siklus Stok dan Void/Hapus Implementation Plan

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

**Dependensi:** S1–S2 adalah fondasi untuk C5/T1. S3 setelah T2 agar kontribusi piutang Tempo bisa dibalik dalam transaksi yang sama.

## Task S1: Rencana stok produk/bahan baku dan bukti pengurangan aktual

**Files:**

- Create: apps/web/features/transactions-stock/helpers/stock-lifecycle.ts
- Create: apps/web/features/transactions-stock/helpers/__tests__/stock-lifecycle.test.ts
- Create: packages/db/prisma/migrations/202610050004_transaction_stock_audit/migration.sql
- Modify: packages/db/prisma/schema.prisma

**Interfaces:** Produces StockLifecycleItem {productId:string|null;quantity:number;rawMaterialProductId?:string|null;rawMaterialQuantity?:number|null}; StockJournalEntry {productId:string;stockGroupIdSnapshot:string|null;baseDelta:number|null}; StockReturn {productId:string;stockGroupIdSnapshot:string|null;baseDelta:number}; collectStockItems(items:readonly StockLifecycleItem[]):Array<{productId:string;quantity:number}>; planOutstandingReturns(status:string,entries:readonly StockJournalEntry[],requiresProof:boolean):StockReturn[].

- [ ] **Step 0: Impact sebelum edit.** Target: Simbol baru planOutstandingReturns dan collectStockItems; schema InventoryLog, ProductionActivityLog, Expense. Jika graph tidak dapat dipercaya, perbaiki index sebelum edit simbol; jangan mengganti langkah ini dengan asumsi risk rendah.
- [ ] **Step 1: Tulis tes perilaku yang gagal.** Isi tes baru/append pada suite existing berikut:

```ts
import {expect,it} from "vitest";
import {collectStockItems,planOutstandingReturns} from "../stock-lifecycle";
it("raw material ikut dan pending tidak mengembalikan stok",()=>{
 expect(collectStockItems([{productId:null,quantity:5,
 rawMaterialProductId:"paper",rawMaterialQuantity:2}]))
 .toEqual([{productId:"paper",quantity:2}]);
 expect(planOutstandingReturns("DRAFT",[],true)).toEqual([]);
 expect(planOutstandingReturns("COMPLETED",[
 {productId:"paper",stockGroupIdSnapshot:null,baseDelta:-2},
 {productId:"paper",stockGroupIdSnapshot:null,baseDelta:1},
 ],true)).toEqual([{productId:"paper",stockGroupIdSnapshot:null,baseDelta:1}]);
 expect(()=>planOutstandingReturns("COMPLETED",[],true)).toThrow("Riwayat stok");
});
```

- [ ] **Step 2: Pastikan RED.**

```powershell
pnpm --filter @pos/web exec vitest run 'features/transactions-stock/helpers/__tests__/stock-lifecycle.test.ts'
```

Expected: FAIL karena export/perilaku baru belum ada atau assertion perilaku lama salah. Kegagalan dependency/environment yang tidak terkait tidak dihitung sebagai RED; selesaikan penyebabnya dahulu.

- [ ] **Step 3: Implementasi aturan inti dan integrasi berikut.**

```ts
export interface StockLifecycleItem {
 productId:string|null;quantity:number;
 rawMaterialProductId?:string|null;rawMaterialQuantity?:number|null;
}
export interface StockJournalEntry {
 productId:string;stockGroupIdSnapshot:string|null;baseDelta:number|null;
}
export interface StockReturn {
 productId:string;stockGroupIdSnapshot:string|null;baseDelta:number;
}
export function collectStockItems(items:readonly StockLifecycleItem[]){
 const quantities=new Map<string,number>();
 const add=(id:string|null|undefined,n:number|null|undefined)=>{
   if(!id||n==null) return;
   if(!Number.isFinite(n)||n<0) throw new Error("Jumlah stok tidak valid.");
   if(n>0) quantities.set(id,(quantities.get(id)||0)+n);
 };
 for(const item of items){
   add(item.productId,item.quantity);
   add(item.rawMaterialProductId,item.rawMaterialQuantity);
 }
 return [...quantities].map(([productId,quantity])=>({productId,quantity}));
}
export function planOutstandingReturns(
 status:string,entries:readonly StockJournalEntry[],requiresProof:boolean,
):StockReturn[] {
 if(["DRAFT","PENDING_APPROVAL"].includes(status)) return [];
 if(requiresProof && !entries.length) throw new Error("Riwayat stok perlu diperiksa.");
 const totals=new Map<string,StockReturn>();
 for(const row of entries){
   if(row.baseDelta==null || !Number.isFinite(row.baseDelta))
     throw new Error("Riwayat stok perlu diperiksa.");
   const key=JSON.stringify([row.productId,row.stockGroupIdSnapshot]);
   const total=totals.get(key)||{productId:row.productId,
     stockGroupIdSnapshot:row.stockGroupIdSnapshot,baseDelta:0};
   total.baseDelta-=row.baseDelta;
   totals.set(key,total);
 }
 if([...totals.values()].some(row=>row.baseDelta < -1e-8))
   throw new Error("Riwayat stok perlu diperiksa.");
 return [...totals.values()].filter(row=>row.baseDelta>1e-8);
}
```

InventoryLog tambah stockBaseDelta Float?, stockGroupIdSnapshot String?, unitMultiplierSnapshot Float?, sourceTransactionRef String?, sourceDocumentRef String?; hanya stocklifecycle writes yang mengisi fieldsini. IndexsourceTransactionRef dan sourceDocumentRef. transaction/suratJalan FK nullable onDelete:SetNull agar logselamat dariharddelete; source refs tetapimmutable. Expense.transaction onDelete:SetNull. ProductionActivityLog.transactionId jadi optional, relation optional onDelete:SetNull; invoiceNumber snapshot sudahada. Tambahkan model TransactionLifecycleAudit {id cuid,storeId String,transactionRef String,documentNumber String?,action String,actorId String,actorName String?,snapshot Json,createdAt DateTime defaultnow; @@unique([transactionRef,action]); @@index([storeId,createdAt]); @@map('pos_transaction_lifecycle_audits')}. Tidak adaFK ke transaksi pada audit. Migrationnullable tidakmengarangbaseDelta datahistoris.

Perubahan model audit yang disimpan pada schema:
```prisma
model TransactionLifecycleAudit {
 id             String   @id @default(cuid())
 storeId        String
 transactionRef String
 documentNumber String?
 action         String
 actorId        String
 actorName      String?
 snapshot       Json
 createdAt      DateTime @default(now())
 @@unique([transactionRef, action])
 @@index([storeId, createdAt])
 @@map("pos_transaction_lifecycle_audits")
}
```
Kolom InventoryLog snapshot menggunakan scalar nullable, tanpa FK ke group/transaction yang bisa dihapus. Buat SQL migration dari perubahan schema; perubahan constraint wajib hanya transaction/suratJalan inventory logs, Expense.transaction, dan ProductionActivityLog.transaction yang disebut pada task ini. Tidak mengubah FK product atau aturan hapus pelanggan.


- [ ] **Step 4: Pastikan GREEN dan verifikasi integrasi.**

```powershell
pnpm --filter @pos/web exec vitest run 'features/transactions-stock/helpers/__tests__/stock-lifecycle.test.ts'
pnpm --filter @pos/web exec tsc --noEmit --incremental false
```

Matrix draft/pending/final/void/refund; materialquantitytotal bukan qtyproduk dikalikanlagi; groupunits signednet, partialreturns, evidenceunknownreject, overreturnreject. DB migrationFKpreservesexistingrows. Auditindependen masihada sesudahtransaksihapus. Productonly/serviceonlymixed. Status REFUNDED/VOIDED sendiri bukan bukti seluruh stok sudah kembali; journal net zero yang membuktikan tidak perlu pengembalian kedua.

Untuk schema: generate Prisma client tanpa build dan type-check DB package setelah migrasi pada target pengujian. Untuk UI: gunakan browser test pada server pengujian existing; jangan mengubah lifecycle server pengguna.

- [ ] **Step 5: Review scope dan commit tugas.**

```powershell
gitnexus detect-changes --scope staged --repo pos-system-monorepo
git diff --cached --check
git diff --cached --name-only
git commit -m 'feat: model actual transaction stock movements and lifecycle audit'
```

Stage terlebih dahulu hanya file pada Files yang benar-benar diubah, termasuk tests/migration. Tidak memakai git add .; jangan ikutkan .serena, index GitNexus, env, atau artefak test. Jika folder dokumentasi diabaikan Git, force-add hanya file dokumentasi patch yang disengaja.


---

## Task S2: Layanan stok atomik dipakai create/approve/edit/surat jalan

**Files:**

- Create: apps/web/features/transactions-stock/services/transaction-stock-service.ts
- Create: apps/web/features/transactions-stock/services/__tests__/transaction-stock-service.test.ts
- Modify: apps/web/features/product-stock-groups/stock-mutations.ts
- Modify: apps/web/app/api/transactions/route.ts
- Modify: apps/web/app/api/transactions/[id]/approve/route.ts
- Modify: apps/web/app/api/transactions/[id]/approve-draft/route.ts
- Modify: apps/web/app/api/transactions/[id]/items/route.ts
- Modify: apps/web/app/api/offline-sync/transactions/route.ts
- Modify: apps/web/app/api/transactions/[id]/surat-jalan/route.ts
- Modify: apps/web/app/api/surat-jalan/[id]/approval/route.ts
- Modify: apps/web/features/pos-checkout/post-commit.ts
- Test: apps/web/app/api/transactions/__tests__/create-route.test.ts

**Interfaces:** Consumes S1 types. Produces applyTransactionStockLifecycle(tx:Prisma.TransactionClient,input:{storeId:string;transactionId:string;mode:'CREATE'|'APPROVE'|'EDIT'|'REVERSE';actor:{id:string;name:string|null};previousItems?:readonly StockLifecycleItem[]}):Promise<StockMutationResult[]>; caller menyimpan item/status di tx yang sama dengan snapshot sebelumedit. Produces applySnapshotStockDeltas(tx,input:{storeId:string;items:readonly StockReturn[];allowNegative?:boolean}):Promise<StockMutationResult[]>.

- [ ] **Step 0: Impact sebelum edit.** Target: applyProductStockDeltas, POST create/approve/approve-draft/offline-sync, PUT items, POST surat-jalan/approval. Jika graph tidak dapat dipercaya, perbaiki index sebelum edit simbol; jangan mengganti langkah ini dengan asumsi risk rendah.
- [ ] **Step 1: Tulis tes perilaku yang gagal.** Isi tes baru/append pada suite existing berikut:

```ts
import {expect,it,vi} from "vitest";
import type {Prisma} from "@pos/db";
import {applyTransactionStockLifecycle} from "../transaction-stock-service";
it("draft dan nota pending tidak berkurang saat CREATE",async()=>{
 const fresh={id:"tx",storeId:"s",status:"PENDING_APPROVAL",
 stockDeductionSource:"TRANSACTION",items:[{productId:"p",quantity:2}]};
 const tx={$queryRaw:vi.fn().mockResolvedValue([{id:"tx"}]),
 transaction:{findFirst:vi.fn().mockResolvedValue(fresh)},
 inventoryLog:{createMany:vi.fn(),findMany:vi.fn().mockResolvedValue([])},
 } as unknown as Prisma.TransactionClient;
 const result=await applyTransactionStockLifecycle(tx,{
 storeId:"s",transactionId:"tx",mode:"CREATE",actor:{id:"u",name:"Owner"}});
 expect(result).toEqual([]);
 expect(tx.inventoryLog.createMany).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Pastikan RED.**

```powershell
pnpm --filter @pos/web exec vitest run 'features/transactions-stock/services/__tests__/transaction-stock-service.test.ts'
```

Expected: FAIL karena export/perilaku baru belum ada atau assertion perilaku lama salah. Kegagalan dependency/environment yang tidak terkait tidak dihitung sebagai RED; selesaikan penyebabnya dahulu.

- [ ] **Step 3: Implementasi aturan inti dan integrasi berikut.**

```ts
// Layanan mengunci row dalam transaction Prisma caller; identifier tabel berasal schema existing.
import {Prisma} from "@pos/db";
async function lockTransaction(tx:Prisma.TransactionClient,storeId:string,id:string){
 const rows=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`
   SELECT id FROM pos_transactions
   WHERE id=${id} AND "storeId"=${storeId} FOR UPDATE
 `);
 if(!rows.length) throw new Error("Transaksi tidak ditemukan.");
}
```

Gunakan previousItems?:readonly StockLifecycleItem[] khusus audit EDIT; sebelumreplace caller mengambil itemlama setelahlock lalu mengirimkannya, currentitemsread darifreshtransaction. CREATE nonfinal return[], APPROVE pending/draft calculatesnewcollect, EDIT final menghitung target kebutuhan base dari item final dan membandingkannya dengan pengurangan net pada journal yang terbukti; jangan memakai jumlah lama dikali faktor konversi terbaru, REVERSE load all provedjournal entries and planOutstandingReturns. Deductions via applyProductStockDeltas. Logsertiapactualresult tx.inventoryLog.createMany di dalamtx: stockBaseDelta=result.baseDelta, snapshotgroup/factoraktual saatlock, refs invoice/source; log quantity sesuai displayunit, reasonSALE atauUSAGE/material existing, signedbaseDelta authoritative. Pindahkan stockaudit dan financialcustomerdebt-criticalwrites dari after keDBtx, after hanya notifikasi/analytics yang tidakmengubahstok/piutang. Stock sourceSURAT_JALAN tidakdeduct lagi padainvoice; log all actualdelivery/implicitfirstinvoice reversal under sameparenttransactionlock. Untuk snapshotreturn lockgroup+productsorted, verify currentmembership cocok snapshot, convert baseDelta/currentmultiplier sebelumapply, simpan originalbaseDelta exactly untuk audit. Membership berbeda=>409perlucek, tidakmengembalikan kegrouplain. Tidak membuatdeduksi kedua saatpengiriman transaksi TRANSACTION. Service menerima snapshotmode darirowDB, bukanflagclient.

Inti applySnapshotStockDeltas yang ditambahkan ke stock-mutations.ts:
```ts
export async function applySnapshotStockDeltas(
 tx:Prisma.TransactionClient,input:{
 storeId:string;items:readonly {
   productId:string;stockGroupIdSnapshot:string|null;baseDelta:number;
 }[];allowNegative?:boolean;
 }):Promise<StockMutationResult[]> {
 if(!input.items.length) return [];
 const productIds=[...new Set(input.items.map(i=>i.productId))].sort();
 const stockGroupIds=[...new Set(input.items.map(i=>i.stockGroupIdSnapshot)
   .filter((id):id is string=>id!==null))].sort();
 await lockStockMutationRows(tx,{storeId:input.storeId,productIds,stockGroupIds});
 const products=await tx.product.findMany({where:{id:{in:productIds},storeId:input.storeId},
   select:{id:true,stockGroupId:true,unitMultiplierToBase:true}});
 const byId=new Map(products.map(product=>[product.id,product]));
 const items=input.items.map(item=>{
   const product=byId.get(item.productId);
   if(!product||product.stockGroupId!==item.stockGroupIdSnapshot)
     throw new Error("Riwayat stok perlu diperiksa.");
   const factor=product.stockGroupId ? product.unitMultiplierToBase : 1;
   if(!Number.isFinite(factor)||factor<=0||!Number.isFinite(item.baseDelta))
     throw new Error("Riwayat stok perlu diperiksa.");
   return {productId:item.productId,delta:item.baseDelta/factor};
 });
 return applyProductStockDeltas(tx,{storeId:input.storeId,items,
   allowNegative:input.allowNegative});
}
```
Mapper journal sebelum planOutstandingReturns:
```ts
const journal = logs.map(log=>({
 productId:log.productId,
 stockGroupIdSnapshot:log.stockGroupIdSnapshot,
 baseDelta:log.stockBaseDelta,
}));
```
Stock return memakai base aktual yang tersimpan. Field quantity/unit pada log hanya tampilan; perubahan multiplier produk tidak menjadi dasar untuk menebak pengurangan historis.


- [ ] **Step 4: Pastikan GREEN dan verifikasi integrasi.**

```powershell
pnpm --filter @pos/web exec vitest run 'features/transactions-stock/services/__tests__/transaction-stock-service.test.ts'
pnpm --filter @pos/web exec tsc --noEmit --incremental false
```

Mocksassert logs berada pada sameTx bukan after, servicematerial approvalikut, edit+/- logs signed benar, conversionchangeactualbase restoredbenar, invalidmembership rollback, offline replaynodouble. Existing stock-group locktests lulus. DB servicecaseCREATEfinalnegativeqtyandzero invalid beforecall, pendingnoeffect, approveonce. C5 integration membutuhkan serviceini.

Untuk schema: generate Prisma client tanpa build dan type-check DB package setelah migrasi pada target pengujian. Untuk UI: gunakan browser test pada server pengujian existing; jangan mengubah lifecycle server pengguna.

- [ ] **Step 5: Review scope dan commit tugas.**

```powershell
gitnexus detect-changes --scope staged --repo pos-system-monorepo
git diff --cached --check
git diff --cached --name-only
git commit -m 'refactor: apply transaction stock changes with atomic movement logs'
```

Stage terlebih dahulu hanya file pada Files yang benar-benar diubah, termasuk tests/migration. Tidak memakai git add .; jangan ikutkan .serena, index GitNexus, env, atau artefak test. Jika folder dokumentasi diabaikan Git, force-add hanya file dokumentasi patch yang disengaja.


---

## Task S3: Void/hapus memulihkan tepat sekali, termasuk legacy dan piutang

**Files:**

- Modify: apps/web/app/api/transactions/[id]/route.ts
- Modify: apps/web/app/api/transactions/[id]/cancel-draft/route.ts
- Modify: apps/web/app/api/surat-jalan/[id]/approval/route.ts
- Modify: apps/web/app/api/transactions/[id]/surat-jalan/route.ts
- Modify: apps/web/features/surat-jalan/helpers/surat-jalan-lifecycle.ts
- Create: apps/web/features/transactions-stock/services/transaction-reversal-service.ts
- Create: apps/web/features/transactions-stock/services/__tests__/transaction-reversal-service.test.ts
- Create: apps/web/features/transactions-stock/integration/transaction-reversal.db.test.ts
- Create: apps/web/features/transactions-stock/integration/fixtures.ts
- Create: apps/web/vitest.stock-db.config.ts
- Modify: apps/web/app/api/transactions/[id]/__tests__/route.test.ts

**Interfaces:** Produces reverseTransaction(tx:Prisma.TransactionClient,input:{storeId:string;transactionId:string;action:'VOID'|'DELETE';actor:{id:string;name:string|null}}):Promise<'APPLIED'|'ALREADY_VOIDED'|'NOT_FOUND'>. Consumes S2 REVERSE and T1/T2 debtpolicy. Testfixture creates real PostgreSQL isolated rows and callsactualservice in Prisma tx.

- [ ] **Step 0: Impact sebelum edit.** Target: PATCH/DELETE transaction, POST cancel-draft, planSuratJalanCreation, POST surat-jalan/approval. Jika graph tidak dapat dipercaya, perbaiki index sebelum edit simbol; jangan mengganti langkah ini dengan asumsi risk rendah.
- [ ] **Step 1: Tulis tes perilaku yang gagal.** Isi tes baru/append pada suite existing berikut:

```ts
import {expect,it} from "vitest";
import {planOutstandingReturns} from "../../helpers/stock-lifecycle";
it("void lalu delete tidak mengembalikan kembali raw material yang sudah dipulihkan",()=>{
 const returned=[
 {productId:"paper",stockGroupIdSnapshot:null,baseDelta:-2},
 {productId:"paper",stockGroupIdSnapshot:null,baseDelta:2},
 ];
 expect(planOutstandingReturns("VOIDED",returned,true)).toEqual([]);
 expect(planOutstandingReturns("PENDING_APPROVAL",[],true)).toEqual([]);
 expect(planOutstandingReturns("REFUNDED",returned,true)).toEqual([]);
});
```

- [ ] **Step 2: Pastikan RED.**

```powershell
pnpm --filter @pos/web exec vitest run 'features/transactions-stock/services/__tests__/transaction-reversal-service.test.ts'
```

Expected: FAIL karena export/perilaku baru belum ada atau assertion perilaku lama salah. Kegagalan dependency/environment yang tidak terkait tidak dihitung sebagai RED; selesaikan penyebabnya dahulu.

- [ ] **Step 3: Implementasi aturan inti dan integrasi berikut.**

```ts
// Inti urutan handler; reverseTransaction menyelesaikan row lock,
// stok, piutang, audit, status/delete dalam transaction caller.
const outcome = await db.$transaction(tx => reverseTransaction(tx, {
 storeId, transactionId: id, action: "DELETE",
 actor: {id: user.id, name: user.name ?? null},
}));
if (outcome === "NOT_FOUND")
 return NextResponse.json({message:"Transaksi tidak ditemukan."},{status:404});
return new NextResponse(null,{status:204});
```

reverseTransaction parentrowFORUPDATE lalu freshincludeitems/debt/payments/suratJalan/inventoryjournal; notfoundreturn. VOIDED+VOID dengan journal net zero return ALREADY_VOIDED. VOIDED+DELETE memeriksa journal aktual; ketika net zero tidak mengembalikan stok lagi, tetapi tetap mencatat DELETE audit. VOIDED/REFUNDED historis dengan bukti stok belum dipulihkan mengembalikan hanya sisanya. Jangan mengurangi piutang/analytics kedua kali untuk VOIDED. Jika bukti historis tidak lengkap, return409 tanpa perubahan sebagian. Pending/draft skipstock/financialcontribution, audit thenstatus/delete. Final: runS2REVERSE sebelumstatus/deletion, debtremainingT1 snapshotdecrement withinlockedcustomer existing aggregatecontribution rules, audit immutable with items/payments/stockbeforeafter/actor/number/status. Auditactionunique preventsdoubleevent. VOID updateMany expectedstatus; DELETE remove relations/cascade afterproof/logsrelinked, preserving InventoryLogrefs/Audit/Expense/ProductionActivity. Surat jalan cancel/approve/create acquire parenttransaction lock first so cannot race void/delete, rejectwhenparentvoid/refund/deleted. Legacygather actual OUT+IN invoice-reversal+delivery+materiallogs dedupid, return onlynetactual. Legacyprooffromverifiedhistoricalquantity+conversion maybackfill via explicitofflineanalysis; ifunproven409 'Riwayat stok perlu diperiksa.' No massguess ormastercurrentfactorbackfill. Void/hapusauditmuststillwritewhenservice hasnostock. Tidak ditemukan endpoint pembatalan surat jalan aktif pada scan. Jangan menambah UI/endpoint pembatalan baru; verifikasi record CANCELLED legacy dan journal SALE_RETURN yang sudah ada, serta pastikan seluruh mutasi surat jalan aktif mengunci transaksi induk dan menolak transaksi void.

Konfigurasi DB test terpisah, sehingga suite web biasa tidak diam-diam menulis database:
```ts
// apps/web/vitest.stock-db.config.ts
import {defineConfig,mergeConfig} from "vitest/config";
import base from "./vitest.config";
export default mergeConfig(base,defineConfig({test:{
 include:["features/transactions-stock/integration/**/*.db.test.ts"],
 fileParallelism:false,maxWorkers:1,
}}));
```
Isi integration/fixtures.ts:
```ts
import {randomUUID} from "node:crypto";
import {PrismaClient} from "@pos/db";
const url=process.env.POS_TEST_DATABASE_URL;
if(!url) throw new Error("POS_TEST_DATABASE_URL diperlukan untuk tes DB terisolasi.");
const parsed=new URL(url);
if(!parsed.pathname.endsWith("_test") &&
 parsed.searchParams.get("schema")!=="pos_patch_test")
 throw new Error("Gunakan database _test atau schema pos_patch_test yang terisolasi.");
export const testDb=new PrismaClient({datasources:{db:{url}}});
export async function createReversalFixture(){
 const key="pos-patch-"+randomUUID();
 const store=await testDb.store.create({data:{name:key}});
 const category=await testDb.category.create({data:{name:key}});
 const product=await testDb.product.create({data:{name:"Fixture",sku:key,
 storeId:store.id,categoryId:category.id,price:10,stock:97,unit:"pcs"}});
 const transaction=await testDb.transaction.create({data:{
 storeId:store.id,invoiceNumber:key,status:"COMPLETED",paymentMethod:"CASH",
 subtotal:30,total:30,amountPaid:30,stockDeductionSource:"TRANSACTION",
 items:{create:[{productId:product.id,productName:"Fixture",quantity:3,
 unitPrice:10,subtotal:30}]},
 }});
 await testDb.inventoryLog.create({data:{productId:product.id,type:"OUT",
 reason:"SALE",quantity:3,transactionId:transaction.id,
 sourceTransactionRef:transaction.id,stockBaseDelta:-3,
 stockGroupIdSnapshot:null,unitMultiplierSnapshot:1}});
 return {storeId:store.id,transactionId:transaction.id,productId:product.id,
 async cleanup(){
   await testDb.inventoryLog.deleteMany({where:{productId:product.id}});
   await testDb.transactionLifecycleAudit.deleteMany({where:{storeId:store.id}});
   await testDb.transaction.deleteMany({where:{id:transaction.id}});
   await testDb.product.delete({where:{id:product.id}});
   await testDb.category.delete({where:{id:category.id}});
   await testDb.store.delete({where:{id:store.id}});
 }};
}
```
Isi integration/transaction-reversal.db.test.ts:
```ts
import {afterAll,expect,it} from "vitest";
import {reverseTransaction} from "../services/transaction-reversal-service";
import {createReversalFixture,testDb} from "./fixtures";
afterAll(()=>testDb.$disconnect());
it.each([
 ["VOID","VOID"],["DELETE","DELETE"],["VOID","DELETE"],
] as const)("race %s/%s hanya mengembalikan 3",async(first,second)=>{
 const fixture=await createReversalFixture();
 try{
   const input={storeId:fixture.storeId,transactionId:fixture.transactionId,
     actor:{id:"test-owner",name:"Test Owner"}};
   const outcomes=await Promise.allSettled([first,second].map(action=>
     testDb.$transaction(tx=>reverseTransaction(tx,{...input,action}))));
   expect(outcomes.every(result=>result.status==="fulfilled")).toBe(true);
   const product=await testDb.product.findUniqueOrThrow({where:{id:fixture.productId}});
   expect(product.stock).toBe(100);
 }finally{await fixture.cleanup();}
});
it("kegagalan sesudah reversal rollback seluruh perubahan",async()=>{
 const fixture=await createReversalFixture();
 try{
   await expect(testDb.$transaction(async tx=>{
     await reverseTransaction(tx,{storeId:fixture.storeId,
       transactionId:fixture.transactionId,action:"VOID",
       actor:{id:"test-owner",name:"Test Owner"}});
     throw new Error("forced rollback");
   })).rejects.toThrow("forced rollback");
   const product=await testDb.product.findUniqueOrThrow({where:{id:fixture.productId}});
   const transaction=await testDb.transaction.findUniqueOrThrow({where:{id:fixture.transactionId}});
   expect(product.stock).toBe(97);
   expect(transaction.status).toBe("COMPLETED");
   expect(await testDb.transactionLifecycleAudit.count({where:{storeId:fixture.storeId}})).toBe(0);
 }finally{await fixture.cleanup();}
});
```
Tambahkan varian fixture material, group conversion, customer debt dan legacy partial delivery dengan pola rows eksplisit yang sama; gunakan matrix expected pada Verify. Suite ini wajib gagal saat precondition environment tidak tersedia, bukan dilewati dan kemudian dilaporkan sebagai pass.


- [ ] **Step 4: Pastikan GREEN dan verifikasi integrasi.**

```powershell
pnpm --filter @pos/web exec vitest run 'features/transactions-stock/services/__tests__/transaction-reversal-service.test.ts'
pnpm --filter @pos/web exec tsc --noEmit --incremental false
```

Handler actualDELETE unitmock: draftstock0, pending0, finalproducts+3, materials+2, voided0, authorizedAdminRBACallow succeeds, defaultAdmindoesnot. RealDB matrix Promise.allSettled twoVOID, twoDELETE, VOIDversusDELETE, concurrentedit/approve/cancelsurat. Startstock100 createfinalqty3 ->97 then anycancel/delete ->100; never103. Injectfailureinside log/audit creation verifies stock/status/debtunchanged97. Legacyinvoiceqty10 deliveryconfirmed4 returns4; priorcancelreturned4=>zero, materialincluded. Ledger/costsnapshotschanged do notguess. Unknownlegacyproofrejectatomic.

Untuk schema: generate Prisma client tanpa build dan type-check DB package setelah migrasi pada target pengujian. Untuk UI: gunakan browser test pada server pengujian existing; jangan mengubah lifecycle server pengguna.

- [ ] **Step 5: Review scope dan commit tugas.**

```powershell
gitnexus detect-changes --scope staged --repo pos-system-monorepo
git diff --cached --check
git diff --cached --name-only
git commit -m 'fix: restore actual stock once on transaction void or delete'
```

Stage terlebih dahulu hanya file pada Files yang benar-benar diubah, termasuk tests/migration. Tidak memakai git add .; jangan ikutkan .serena, index GitNexus, env, atau artefak test. Jika folder dokumentasi diabaikan Git, force-add hanya file dokumentasi patch yang disengaja.
