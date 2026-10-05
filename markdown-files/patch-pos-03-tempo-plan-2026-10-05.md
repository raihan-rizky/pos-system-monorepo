# Tempo, Piutang dan Nota Implementation Plan

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

**Dependensi:** T1–T3 setelah C1, C5 dan S2; gunakan transaksi/stock service yang sama. Jangan menambah stok saat pelunasan.

## Task T1: Metode Tempo, validasi pembayaran, dan migrasi enum

**Files:**

- Create: apps/web/features/customer-debt/helpers/payment-terms.ts
- Create: apps/web/features/customer-debt/helpers/__tests__/payment-terms.test.ts
- Create: packages/db/prisma/migrations/202610050003_payment_method_tempo/migration.sql
- Modify: packages/db/prisma/schema.prisma
- Modify: apps/web/hooks/useTransactions.ts
- Modify: apps/web/components/PaymentModal.tsx
- Modify: apps/web/features/transactions-draft/components/ApproveDraftDialog.tsx
- Modify: apps/web/app/(main)/history/components/ApproveModal.tsx
- Modify: apps/web/app/api/transactions/route.ts
- Modify: apps/web/app/api/transactions/[id]/approve/route.ts
- Modify: apps/web/app/api/transactions/[id]/approve-draft/route.ts
- Modify: apps/web/app/api/transactions/draft/route.ts
- Modify: apps/web/app/api/offline-sync/transactions/route.ts
- Modify: apps/web/lib/offline/offline-db.ts

**Interfaces:** Produces isActiveDebt(input:{status:string;paymentMethod:string;total:number;amountPaid:number}):boolean; assertTempoCustomer(method:string,customerId:string|null|undefined):void. Transaction.paymentMethod enum TEMPO, TransactionPayment.method/debtPaymentLog.paymentMethod tetap metode uang aktual.

- [ ] **Step 0: Impact sebelum edit.** Target: POST create/approve/approve-draft/offline-sync, PaymentModal, ApproveDraftDialog. Jika graph tidak dapat dipercaya, perbaiki index sebelum edit simbol; jangan mengganti langkah ini dengan asumsi risk rendah.
- [ ] **Step 1: Tulis tes perilaku yang gagal.** Isi tes baru/append pada suite existing berikut:

```ts
import {expect,it} from "vitest";
import {isActiveDebt,assertTempoCustomer} from "../payment-terms";
it("Tempo final nol pembayaran menjadi piutang dan butuh pelanggan",()=>{
 expect(isActiveDebt({status:"COMPLETED",paymentMethod:"TEMPO",total:100000,amountPaid:0})).toBe(true);
 expect(isActiveDebt({status:"VOIDED",paymentMethod:"TEMPO",total:100000,amountPaid:0})).toBe(false);
 expect(isActiveDebt({status:"COMPLETED",paymentMethod:"CASH",total:100000,amountPaid:0})).toBe(false);
 expect(()=>assertTempoCustomer("TEMPO",null)).toThrow("Pilih pelanggan");
});
```

- [ ] **Step 2: Pastikan RED.**

```powershell
pnpm --filter @pos/web exec vitest run 'features/customer-debt/helpers/__tests__/payment-terms.test.ts'
```

Expected: FAIL karena export/perilaku baru belum ada atau assertion perilaku lama salah. Kegagalan dependency/environment yang tidak terkait tidak dihitung sebagai RED; selesaikan penyebabnya dahulu.

- [ ] **Step 3: Implementasi aturan inti dan integrasi berikut.**

```ts
export function isActiveDebt(input:{
 status:string;paymentMethod:string;total:number;amountPaid:number;
}):boolean {
 const final=input.status==="COMPLETED"||input.status==="DP";
 return final && (input.status==="DP"||input.paymentMethod==="TEMPO")
   && Math.max(0,input.total-input.amountPaid)>0;
}
export function assertTempoCustomer(method:string,customerId:string|null|undefined):void {
 if(method==="TEMPO"&&!customerId?.trim())
   throw new Error("Pilih pelanggan untuk transaksi Tempo.");
}
```

SQL ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'TEMPO'; tambahkan enum Prisma. Generateclient via pnpm --filter @pos/db exec prisma generate tanpa build. Semua create/approvalschema acceptTEMPO dan amountPaid>=0; Tempo finalstatusCOMPLETED, change0, remainingtotal-paid. UI Tempo pilihan terpisah dariDP/kredit; pelangganregisteredmandatory tervalidasi store. Jika ada bayarawal, request initialPayments berisi CASH/DEBIT/CREDIT/QRIS/TRANSFER besertajumlah, tanpa TEMPO sebagai actualmoney; sum sama amountPaid<=total. Customer.totalDebt bertambahremaining hanya saatfinalapprove/create dan satuDBtxbersamastok S2. Pending/draft tidakmenambahdebt. Codec offlinebaru supportTEMPO, payloadlama tetapaccepted. Jangan membuat TransactionPayment amount0 atau rowTEMPO sebagai kas.



- [ ] **Step 4: Pastikan GREEN dan verifikasi integrasi.**

```powershell
pnpm --filter @pos/web exec vitest run 'features/customer-debt/helpers/__tests__/payment-terms.test.ts'
pnpm --filter @pos/web exec tsc --noEmit --incremental false
```

Route tests finalTempozero, partial, fullypaid, missingcustomer422, crossstore403/422, pendingnoledger, approvalonce, createofflineidempotency. DPexistingstillaccepted. Database migrasi enum tidakmengubah status/metodeoldrows.

Untuk schema: generate Prisma client tanpa build dan type-check DB package setelah migrasi pada target pengujian. Untuk UI: gunakan browser test pada server pengujian existing; jangan mengubah lifecycle server pengguna.

- [ ] **Step 5: Review scope dan commit tugas.**

```powershell
gitnexus detect-changes --scope staged --repo pos-system-monorepo
git diff --cached --check
git diff --cached --name-only
git commit -m 'feat: add invoice payment terms distinct from down payments'
```

Stage terlebih dahulu hanya file pada Files yang benar-benar diubah, termasuk tests/migration. Tidak memakai git add .; jangan ikutkan .serena, index GitNexus, env, atau artefak test. Jika folder dokumentasi diabaikan Git, force-add hanya file dokumentasi patch yang disengaja.


---

## Task T2: Piutang dan pelunasan untuk DP serta Tempo

**Files:**

- Modify: apps/web/features/customer-debt/helpers/customer-debt-summary.ts
- Modify: apps/web/features/customer-debt/helpers/__tests__/customer-debt-summary.test.ts
- Modify: apps/web/features/customer-debt/components/DebtTransactionsList.tsx
- Modify: apps/web/app/api/transactions/[id]/pay-debt/route.ts
- Modify: apps/web/app/api/customers/[id]/pay-debt/route.ts
- Modify: apps/web/app/api/transactions/[id]/pay-debt/__tests__/route.test.ts
- Modify: apps/web/app/api/customers/[id]/pay-debt/__tests__/route.test.ts
- Modify: apps/web/app/api/customers/route.ts
- Modify: apps/web/app/api/dashboard/route.ts
- Test: apps/web/features/customer-debt/helpers/__tests__/debt-payment.test.ts

**Interfaces:** Consumes isActiveDebt(T1). Keep loadCustomerDebtByActiveDp name for compatibility, expand query to DP OR COMPLETED/TEMPO; no rename-by-replace. Produces remainingdebt and settlement logs without overwriting originalTEMPOmethod.

- [ ] **Step 0: Impact sebelum edit.** Target: loadCustomerDebtByActiveDp, POST pay-debt transaction/customer, summarizeDebtByCustomer. Jika graph tidak dapat dipercaya, perbaiki index sebelum edit simbol; jangan mengganti langkah ini dengan asumsi risk rendah.
- [ ] **Step 1: Tulis tes perilaku yang gagal.** Isi tes baru/append pada suite existing berikut:

```ts
it("query piutang mencakup Tempo final dan menjaga filter pelanggan", async()=>{
 const findMany=vi.fn().mockResolvedValue([
  {customerId:"c1",customerName:"Budi",total:100000,amountPaid:25000},
 ]);
 const result=await loadCustomerDebtByActiveDp(
  {transaction:{findMany}} as unknown as Parameters<typeof loadCustomerDebtByActiveDp>[0],
  {storeId:"s1",customers:[{id:"c1",name:"Budi"}]});
 expect(result.get("c1")).toBe(75000);
 const query=findMany.mock.calls[0][0];
 expect(query.where.AND[0]).toEqual({OR:[
  {status:"DP"},{status:"COMPLETED",paymentMethod:"TEMPO"},
 ]});
});
```

- [ ] **Step 2: Pastikan RED.**

```powershell
pnpm --filter @pos/web exec vitest run 'features/customer-debt/helpers/__tests__/customer-debt-summary.test.ts'
```

Expected: FAIL karena export/perilaku baru belum ada atau assertion perilaku lama salah. Kegagalan dependency/environment yang tidak terkait tidak dihitung sebagai RED; selesaikan penyebabnya dahulu.

- [ ] **Step 3: Implementasi aturan inti dan integrasi berikut.**

```ts
// where pada loadCustomerDebtByActiveDp (ids/nameFilters existing):
const debtWhere = {
 storeId: input.storeId,
 AND: [
   {OR:[{status:"DP" as const},{status:"COMPLETED" as const,paymentMethod:"TEMPO" as const}]},
   {OR:[{customerId:{in:ids}},...nameFilters]},
 ],
};
```

Replace statusDP filtering di callerpelunasan/list/dashboard dengan active debtcondition. Pay-debt lock transaction dan customer rows, re-readremaining, validate sum actualpayments finite>0 <=remaining. Guardupdate expected amountPaid/remaining topreventraces; statusTempo tetapCOMPLETED dan paymentMethodTEMPO. DP ketika lunas tetapperilakuexistingstatusCOMPLETED. DebtPaymentLog tiapactualmethod, noTEMPOsettlementoption. Piutangcustomer adjustment dan logs satuDBtx; tidakcallstockservice. Customerbatchpay allocatestransactions yangremainingpositive denganfilterANDstore/active. Saat void/hapus S3 gunakan contributionremaining sebelumremove; totalSpent existing tidakdigandakan olehtotalpenjualan+pelunasan.



- [ ] **Step 4: Pastikan GREEN dan verifikasi integrasi.**

```powershell
pnpm --filter @pos/web exec vitest run 'features/customer-debt/helpers/__tests__/customer-debt-summary.test.ts'
pnpm --filter @pos/web exec tsc --noEmit --incremental false
```

Unit queryDPdanTempo, matchedlegacyname, completedCASHexcluded, void/refundexcluded. Handler payment partial/full, overpaymentreject, mixedmethods, two parallelpayments maxremaining, no stockupdate, nooriginalpaymentMethodrewrite. Cachedcustomersdebts refreshed afterpay. Pelunasan sejakperiodberbeda masukkas periodtanggalbayar.

Untuk schema: generate Prisma client tanpa build dan type-check DB package setelah migrasi pada target pengujian. Untuk UI: gunakan browser test pada server pengujian existing; jangan mengubah lifecycle server pengguna.

- [ ] **Step 5: Review scope dan commit tugas.**

```powershell
gitnexus detect-changes --scope staged --repo pos-system-monorepo
git diff --cached --check
git diff --cached --name-only
git commit -m 'feat: settle outstanding invoice terms through customer debt'
```

Stage terlebih dahulu hanya file pada Files yang benar-benar diubah, termasuk tests/migration. Tidak memakai git add .; jangan ikutkan .serena, index GitNexus, env, atau artefak test. Jika folder dokumentasi diabaikan Git, force-add hanya file dokumentasi patch yang disengaja.


---

## Task T3: Badge Tempo dan pemisahan penjualan dari uang diterima

**Files:**

- Create: apps/web/features/customer-debt/helpers/payment-presentation.ts
- Create: apps/web/features/customer-debt/helpers/__tests__/payment-presentation.test.ts
- Create: apps/web/features/customer-debt/components/PaymentTermsBadge.tsx
- Modify: apps/web/components/ReceiptModal.tsx
- Modify: apps/web/lib/receipt-payment-lines.ts
- Modify: apps/web/lib/__tests__/receipt-payment-lines.test.ts
- Modify: apps/web/features/invoice-pdf/helpers/invoice-pdf-data.ts
- Modify: apps/web/features/invoice-pdf/components/InvoicePdfDocument.tsx
- Modify: apps/web/features/invoice-pdf/helpers/__tests__/invoice-pdf-data.test.ts
- Modify: apps/web/features/customer-debt/components/DebtTransactionsList.tsx
- Modify: apps/web/components/PaymentModal.tsx
- Modify: apps/web/app/(main)/history/components/ApproveModal.tsx
- Modify: apps/web/app/api/finance/report/route.ts
- Modify: apps/web/features/financial-report/helpers/report-core.ts
- Modify: apps/web/features/financial-report/helpers/__tests__/report-core.test.ts
- Modify: apps/web/app/api/dashboard/route.ts
- Modify: apps/web/features/dashboard/components/ActiveDpList.tsx

**Interfaces:** Produces getPaymentPresentation(input:{status:string;paymentMethod:string;total:number;amountPaid:number}):{badge:string|null;remaining:number;settled:boolean}; PaymentTermsBadge consumes result. ReceiptPaymentSource legacyaccepted, viewstatusTEMPO separate from databaseTransactionStatus.

- [ ] **Step 0: Impact sebelum edit.** Target: getReceiptPrintStatus, buildReceiptPaymentLines, computeTotals, buildInvoicePdfData, buildFinancialReport, dashboard GET. Jika graph tidak dapat dipercaya, perbaiki index sebelum edit simbol; jangan mengganti langkah ini dengan asumsi risk rendah.
- [ ] **Step 1: Tulis tes perilaku yang gagal.** Isi tes baru/append pada suite existing berikut:

```ts
import {expect,it} from "vitest";
import {getPaymentPresentation} from "../payment-presentation";
it("tagihan nol bayar tidak pernah dilabeli lunas/DP",()=>{
 expect(getPaymentPresentation({status:"COMPLETED",paymentMethod:"TEMPO",total:100000,amountPaid:0}))
 .toEqual({badge:"TEMPO/TAGIHAN",remaining:100000,settled:false});
 expect(getPaymentPresentation({status:"COMPLETED",paymentMethod:"TEMPO",total:100000,amountPaid:100000}))
 .toEqual({badge:"TEMPO/TAGIHAN",remaining:0,settled:true});
});
```

- [ ] **Step 2: Pastikan RED.**

```powershell
pnpm --filter @pos/web exec vitest run 'features/customer-debt/helpers/__tests__/payment-presentation.test.ts'
```

Expected: FAIL karena export/perilaku baru belum ada atau assertion perilaku lama salah. Kegagalan dependency/environment yang tidak terkait tidak dihitung sebagai RED; selesaikan penyebabnya dahulu.

- [ ] **Step 3: Implementasi aturan inti dan integrasi berikut.**

```ts
export function getPaymentPresentation(input:{
 status:string;paymentMethod:string;total:number;amountPaid:number;
}):{badge:string|null;remaining:number;settled:boolean} {
 const active=input.status==="COMPLETED"||input.status==="DP";
 const terms=input.paymentMethod==="TEMPO";
 const remaining=active&&(terms||input.status==="DP")
   ? Math.max(0,input.total-input.amountPaid):0;
 return {badge:terms?"TEMPO/TAGIHAN":input.status==="DP"?"DP":null,
 remaining,settled:active&&remaining===0};
}
```

Badge berada di checkout/history/detail/listpiutang/receipt/PDF; Lunas sebagaiindikatorsekunder hanya settledtrue, void tetapvoid. getReceiptPrintStatus mengembalikan TEMPO untuk displayfinalTempo, tambahkanmappingdisplay bukan enumstatusbaru. PDF computeTotals remainingmenurutpaymentpresentation, balanceLabel SISA TAGIHAN ketikaTempo, historicalDP labeldipertahankan. buildReceiptPaymentLines janganfallback amountPaid keTEMPO sebagaiactualmethod; gunakan initialpayments actualmethod dan debtlogs, subLabel 'Pembayaran awal' untukTempo bukanDP. Report sales menghitungfinalTempototal; paymentmix/cashreceived memakai initialactualpayments + debtlogs pada tanggalmasingmasing. AmountPaid tidakdijumlahkan lagi jika ledger tersedia. KasunpaidTempo0; noncashtransferjangan dianggap drawerCASH. Temukan seluruh statusDP/paymentMethod references dan perbarui consumer relevan, termasukhistory rowbadge existing.



- [ ] **Step 4: Pastikan GREEN dan verifikasi integrasi.**

```powershell
pnpm --filter @pos/web exec vitest run 'features/customer-debt/helpers/__tests__/payment-presentation.test.ts'
pnpm --filter @pos/web exec tsc --noEmit --incremental false
```

PDF totalsTempozero/partial/full, receiptoutputnoLUNAS/DPbeforepaid, labelbadge +remainingcorrect. Report invoice100000createdtoday unpaidsales100000 cash0; tomorrowpay25000 salesuntouched cash25000 hanya actualCASH. Mixedmethodsumwithoutdoublecount. Refund/voidexcludedactive. Dashboard 'DP'heading diperluas Piutang tanpa hilangkanhistoricalDP.

Untuk schema: generate Prisma client tanpa build dan type-check DB package setelah migrasi pada target pengujian. Untuk UI: gunakan browser test pada server pengujian existing; jangan mengubah lifecycle server pengguna.

- [ ] **Step 5: Review scope dan commit tugas.**

```powershell
gitnexus detect-changes --scope staged --repo pos-system-monorepo
git diff --cached --check
git diff --cached --name-only
git commit -m 'feat: label invoice terms and report actual payment receipts'
```

Stage terlebih dahulu hanya file pada Files yang benar-benar diubah, termasuk tests/migration. Tidak memakai git add .; jangan ikutkan .serena, index GitNexus, env, atau artefak test. Jika folder dokumentasi diabaikan Git, force-add hanya file dokumentasi patch yang disengaja.
