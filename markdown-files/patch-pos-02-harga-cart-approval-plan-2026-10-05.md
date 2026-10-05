# Harga, Keranjang dan Persetujuan Implementation Plan

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

**Dependensi:** C1–C4 setelah P1–P5. C5 setelah layanan stok S1–S2; editor dan quote dapat dikerjakan lebih awal, tetapi integrasi persetujuan tidak dianggap selesai tanpa layanan stok.

## Task C1: Satu urutan harga khusus → member → reguler

**Files:**

- Modify: apps/web/features/customer-category-pricing/helpers/pricing-rules.ts
- Modify: apps/web/features/customer-category-pricing/helpers/__tests__/pricing-rules.test.ts
- Modify: apps/web/features/pos-checkout/helpers/checkout-pricing.ts
- Modify: apps/web/features/pos-checkout/helpers/__tests__/checkout-pricing.test.ts
- Modify: apps/web/app/(main)/pos/POSClientPage.tsx
- Modify: apps/web/components/PaymentModal.tsx
- Modify: apps/web/hooks/useTransactions.ts
- Modify: apps/web/app/api/transactions/route.ts
- Modify: apps/web/app/api/offline-sync/transactions/route.ts
- Modify: apps/web/lib/offline/offline-db.ts
- Modify: apps/web/features/transactions-draft/components/ApproveDraftDialog.tsx
- Modify: apps/web/app/api/transactions/draft/route.ts
- Delete: apps/web/features/pos-checkout/components/PricingPreferenceSelector.tsx

**Interfaces:** priceProductForCustomerType(product: PriceableProduct, customerType: CustomerType, rules: CategoryPricingRule[], legacyPreference?: PricingPreference): PricedProductLine; argument lama diterima tetapi diabaikan. Produces perilaku harga tunggal; tipe legacy tetap untuk decoder offline, bukan kontrol UI.

- [ ] **Step 0: Impact sebelum edit.** Target: priceProductForCustomerType, priceCartItemsForCheckout, POST transaction/offline-sync/draft. Jika graph tidak dapat dipercaya, perbaiki index sebelum edit simbol; jangan mengganti langkah ini dengan asumsi risk rendah.
- [ ] **Step 1: Tulis tes perilaku yang gagal.** Isi tes baru/append pada suite existing berikut:

```ts
it("harga khusus menang meskipun payload lama meminta MEMBER", () => {
  const product = {categoryId:"atk",price:10000,hargaAgen:7000,unit:"Dus"};
  const rules = [{
    id:"special",categoryId:"atk",customerType:"AGEN" as const,
    mode:"PERCENT_DISCOUNT" as const,value:10,isActive:true,
  }];
  expect(priceProductForCustomerType(product,"AGEN",rules,"MEMBER").unitPrice).toBe(9000);
  expect(priceProductForCustomerType(product,"AGEN",[],"MEMBER").unitPrice).toBe(7000);
  expect(priceProductForCustomerType({...product,hargaAgen:null},"AGEN",[]).unitPrice).toBe(10000);
});
```

- [ ] **Step 2: Pastikan RED.**

```powershell
pnpm --filter @pos/web exec vitest run 'features/customer-category-pricing/helpers/__tests__/pricing-rules.test.ts'
```

Expected: FAIL karena export/perilaku baru belum ada atau assertion perilaku lama salah. Kegagalan dependency/environment yang tidak terkait tidak dihitung sebagai RED; selesaikan penyebabnya dahulu.

- [ ] **Step 3: Implementasi aturan inti dan integrasi berikut.**

```ts
// Isi akhir keputusan di priceProductForCustomerType setelah specialPrice/memberPrice dihitung:
if (specialPrice.appliedPricing) return specialPrice;
return memberPrice ?? specialPrice;
```

Hapus cabang pricingPreference===MEMBER. Hapus state/control preference dari POS/PaymentModal dan panggilan API baru. PriceCartItemsForCheckout input tidak lagi mewajibkan preference; tetap support legacy parameter optional ketika memigrasi call sites. Decode offline versionlama tanpa membuang queue dan tanpa mengubah originalPayload; normalisasi preference di server. Temukan seluruh caller dengan rg pricingPreference, periksa setiap produksi caller. Harga transaksi lama tidak dihitung ulang. Update tests prioritas MEMBER menjadi kontrak lama diterima/specialmenang, bukan hapus seluruh tes. Validasi override manual existing tetap aktif.



- [ ] **Step 4: Pastikan GREEN dan verifikasi integrasi.**

```powershell
pnpm --filter @pos/web exec vitest run 'features/customer-category-pricing/helpers/__tests__/pricing-rules.test.ts'
pnpm --filter @pos/web exec tsc --noEmit --incremental false
```

Tes rule spesifik unit/brand/customer menang sesuai existing; AGEN/DINASfallback, regularfallback, manualallowed/forbidden, offlineoldqueue accepted. Vitest pricing-rules dan checkout-pricing. Server transaksi/draft/offline-sync menghasilkan harga sama untuk data sama.

Untuk schema: generate Prisma client tanpa build dan type-check DB package setelah migrasi pada target pengujian. Untuk UI: gunakan browser test pada server pengujian existing; jangan mengubah lifecycle server pengguna.

- [ ] **Step 5: Review scope dan commit tugas.**

```powershell
gitnexus detect-changes --scope staged --repo pos-system-monorepo
git diff --cached --check
git diff --cached --name-only
git commit -m 'feat: apply special pricing directly across checkout'
```

Stage terlebih dahulu hanya file pada Files yang benar-benar diubah, termasuk tests/migration. Tidak memakai git add .; jangan ikutkan .serena, index GitNexus, env, atau artefak test. Jika folder dokumentasi diabaikan Git, force-add hanya file dokumentasi patch yang disengaja.


---

## Task C2: Urutkan varian berdasarkan faktor unit

**Files:**

- Create: apps/web/features/pos-product-variants/helpers/unit-order.ts
- Create: apps/web/features/pos-product-variants/helpers/__tests__/unit-order.test.ts
- Modify: apps/web/features/pos-product-variants/components/ProductCard.tsx
- Modify: apps/web/features/pos-product-variants/components/VariantSelector.tsx
- Modify: apps/web/features/pos-product-variants/__tests__/ProductCard.test.tsx

**Interfaces:** Produces orderUnits<T extends {id:string;unit:string;unitMultiplierToBase?:number|null}>(variants: readonly T[], baseUnit?:string|null): T[]. Missing valid multiplier ditempatkan setelah known dan ditandai melalui conversionNeedsReviewexisting; jangan tebak harga.

- [ ] **Step 0: Impact sebelum edit.** Target: ProductCardComponent, VariantSelector. Jika graph tidak dapat dipercaya, perbaiki index sebelum edit simbol; jangan mengganti langkah ini dengan asumsi risk rendah.
- [ ] **Step 1: Tulis tes perilaku yang gagal.** Isi tes baru/append pada suite existing berikut:

```ts
import {expect,it} from "vitest";
import {orderUnits} from "../unit-order";
it("Dus kecil di kiri Bal besar meskipun harga/urutan berbeda", () => {
  const variants=[
    {id:"bal",unit:"Bal",unitMultiplierToBase:20,price:1000},
    {id:"dus",unit:"Dus",unitMultiplierToBase:1,price:9000},
  ];
  expect(orderUnits(variants).map(v=>v.id)).toEqual(["dus","bal"]);
  expect(variants[0].id).toBe("bal");
});
```

- [ ] **Step 2: Pastikan RED.**

```powershell
pnpm --filter @pos/web exec vitest run 'features/pos-product-variants/helpers/__tests__/unit-order.test.ts'
```

Expected: FAIL karena export/perilaku baru belum ada atau assertion perilaku lama salah. Kegagalan dependency/environment yang tidak terkait tidak dihitung sebagai RED; selesaikan penyebabnya dahulu.

- [ ] **Step 3: Implementasi aturan inti dan integrasi berikut.**

```ts
export function orderUnits<T extends {
  id:string; unit:string; unitMultiplierToBase?:number|null;
}>(variants:readonly T[], baseUnit?:string|null):T[] {
  const factor=(v:T):number => {
    const n=v.unitMultiplierToBase;
    if(typeof n==="number" && Number.isFinite(n) && n>0) return n;
    return baseUnit && v.unit.toLowerCase()===baseUnit.toLowerCase()
      ? 1 : Number.POSITIVE_INFINITY;
  };
  return [...variants].sort((a,b)=>{
    const fa=factor(a),fb=factor(b);
    return (fa===fb ? 0 : fa<fb ? -1 : 1)
      || a.unit.localeCompare(b.unit,"id") || a.id.localeCompare(b.id);
  });
}
```

ProductCard useMemo orderedVariants=orderUnits(product.variants??[],product.stockGroup?.baseUnit); map tombol dua unit dari orderedVariants. VariantSelector memakai orderUnits pula atau menerima array sudah terurut, tetap tidak mutate props. selectedVariantId/defaultVariant tidak di-reset oleh sorting. Variants 3+urutdropdown. Faktor konversi bermasalah diperiksa dengan conversionNeedsReviewexisting; data tanpa bukti unit kecil/besar tidak memenuhi gate data rilis.



- [ ] **Step 4: Pastikan GREEN dan verifikasi integrasi.**

```powershell
pnpm --filter @pos/web exec vitest run 'features/pos-product-variants/helpers/__tests__/unit-order.test.ts'
pnpm --filter @pos/web exec tsc --noEmit --incremental false
```

Tes 2/3varian, faktor equal stabil, undefined/null/invalid, baseUnit fallback, selected id tetap setelahsort/refetch. SSR ProductCard urutanlabel Dus sebelumBal; harga tidak memengaruhiurutan.

Untuk schema: generate Prisma client tanpa build dan type-check DB package setelah migrasi pada target pengujian. Untuk UI: gunakan browser test pada server pengujian existing; jangan mengubah lifecycle server pengguna.

- [ ] **Step 5: Review scope dan commit tugas.**

```powershell
gitnexus detect-changes --scope staged --repo pos-system-monorepo
git diff --cached --check
git diff --cached --name-only
git commit -m 'feat: order POS units from smallest to largest'
```

Stage terlebih dahulu hanya file pada Files yang benar-benar diubah, termasuk tests/migration. Tidak memakai git add .; jangan ikutkan .serena, index GitNexus, env, atau artefak test. Jika folder dokumentasi diabaikan Git, force-add hanya file dokumentasi patch yang disengaja.


---

## Task C3: Ganti satuan keranjang atomik, tahan reload/offline

**Files:**

- Create: apps/web/features/pos-checkout/helpers/cart-unit-change.ts
- Create: apps/web/features/pos-checkout/helpers/__tests__/cart-unit-change.test.ts
- Modify: apps/web/hooks/useCart.ts
- Modify: apps/web/hooks/useProducts.types.ts
- Modify: apps/web/features/pos-search/services/cart-mapping.ts
- Modify: apps/web/components/CartSidebar.tsx
- Modify: apps/web/app/(main)/pos/POSClientPage.tsx
- Modify: apps/web/features/pos-checkout/__tests__/CartSidebar.test.tsx

**Interfaces:** Add CartUnitOption=Pick<ProductCartItem,'productId'|'name'|'price'|'catalogPrice'|'costPrice'|'hargaAgen'|'hargaDinas'|'unit'|'stock'|'unitMultiplierToBase'|'stockGroup'|'brandId'|'brandName'|'categoryId'|'categoryName'|'size'|'material'>; ProductCartItem.unitOptions?: CartUnitOption[]; stockGroup.id?:string. Produces changeCartUnit(items:CartItem[],lineId:string,target:CartUnitOption):CartItem[]; useCart.changeUnit(lineId,target); CartSidebar.onChangeUnit?: (lineId:string,target:CartUnitOption)=>void.

- [ ] **Step 0: Impact sebelum edit.** Target: useCart, normalizeStoredCartItems, mapProductToCartItem, CartSidebar, POSClientPage, applyProductPriceUpdate, applyProductGroupMetadataUpdate. Jika graph tidak dapat dipercaya, perbaiki index sebelum edit simbol; jangan mengganti langkah ini dengan asumsi risk rendah.
- [ ] **Step 1: Tulis tes perilaku yang gagal.** Isi tes baru/append pada suite existing berikut:

```ts
import {expect,it} from "vitest";
import type {ProductCartItem,CartUnitOption} from "@/hooks/useCart";
import {changeCartUnit} from "../cart-unit-change";
it("2 Dus menjadi 2 Bal; harga lama dan override tidak terbawa",()=>{
 const target:CartUnitOption={productId:"bal",name:"Amplop",unit:"Bal",
 price:70000,catalogPrice:70000,stock:10,unitMultiplierToBase:5,
 categoryId:"atk",categoryName:"ATK"};
 const dus:ProductCartItem={cartLineId:"PRODUCT:dus::",lineType:"PRODUCT",
 productId:"dus",name:"Amplop",price:15500,catalogPrice:15500,
 transactionPrice:10000,quantity:2,unit:"Dus",stock:50,
 categoryId:"atk",categoryName:"ATK",unitMultiplierToBase:1,
 unitOptions:[target]};
 const result=changeCartUnit([dus],dus.cartLineId,target);
 expect(result[0]).toMatchObject({productId:"bal",unit:"Bal",quantity:2,
 price:70000,transactionPrice:null,unitMultiplierToBase:5});
});
```

- [ ] **Step 2: Pastikan RED.**

```powershell
pnpm --filter @pos/web exec vitest run 'features/pos-checkout/helpers/__tests__/cart-unit-change.test.ts'
```

Expected: FAIL karena export/perilaku baru belum ada atau assertion perilaku lama salah. Kegagalan dependency/environment yang tidak terkait tidak dihitung sebagai RED; selesaikan penyebabnya dahulu.

- [ ] **Step 3: Implementasi aturan inti dan integrasi berikut.**

```ts
import type {CartItem,ProductCartItem,CartUnitOption} from "@/hooks/useCart";
export function changeCartUnit(items:CartItem[],lineId:string,target:CartUnitOption):CartItem[] {
 const source=items.find(i=>i.cartLineId===lineId);
 if(!source || source.lineType!=="PRODUCT") return items;
 if(source.productId===target.productId) return items;
 if(!source.unitOptions?.some(o=>o.productId===target.productId))
   throw new Error("Pilihan satuan tidak tersedia untuk produk ini.");
 const id=`PRODUCT:${target.productId}:${target.size||""}:${target.material||""}`;
 const existing=items.find(i=>i.lineType==="PRODUCT" && i.cartLineId===id);
 const replacement:ProductCartItem={...source,...target,cartLineId:id,
 lineType:"PRODUCT",transactionPrice:null,appliedPricing:null,
 price:target.catalogPrice,quantity:source.quantity};
 if(existing) return items.filter(i=>i.cartLineId!==lineId).map(i=>
   i.cartLineId===id ? {...i,quantity:i.quantity+source.quantity} : i);
 return items.map(i=>i.cartLineId===lineId?replacement:i);
}
```

cart-mapping menyertakan seluruh varianaktif unitOptions memakai mapper yang sama (tanpa quantity/transactionPrice). useCart.addItem menyimpan opsi; normalizeStoredCartItems memelihara opsi, oldcart belummemiliki opsi di-resolve lewat cache atau fetch detail produk berbasis id group, bukan hanya products pada halaman aktif. Consumer changeUnit setItems current=>changeCartUnit(...), tangani error pada UI. onChangeUnit selector mengirim objek opsi yang terverifikasi, lalu pricing C1 menghitung harga final sesuai customer/unit. Existing target override di pertahankan sesuai kebijakan existing; source override dibersihkan. Pilihan satuan tidak dikirim sebagai otoritas harga API. Update quick-edit harga/metadata juga memperbarui opsi unit tersimpan yang productId-nya cocok. Refetch atau mutation harga tidak boleh meninggalkan pilihan unit cache dengan harga lama. Group identity harus bersumber dari stockGroupId/groupKey API, bukan nama produk.



- [ ] **Step 4: Pastikan GREEN dan verifikasi integrasi.**

```powershell
pnpm --filter @pos/web exec vitest run 'features/pos-checkout/helpers/__tests__/cart-unit-change.test.ts'
pnpm --filter @pos/web exec tsc --noEmit --incremental false
```

Helper tests targetnotmember ditolak tanpamutasi, qtytetap, targetexistingmerged, otherlinesuntouched, sourceoverridecleared,targetmanualpreserved, identicaltargetno-op. Session normalize reload menyimpan unitOptions. Browser: tambah Dus, pindah halamanproduk, pilih Bal daricart, qtytetap/subtotalupdate; offline cache dan oldcart gagalresolve tetap mempertahankan item.

Untuk schema: generate Prisma client tanpa build dan type-check DB package setelah migrasi pada target pengujian. Untuk UI: gunakan browser test pada server pengujian existing; jangan mengubah lifecycle server pengguna.

- [ ] **Step 5: Review scope dan commit tugas.**

```powershell
gitnexus detect-changes --scope staged --repo pos-system-monorepo
git diff --cached --check
git diff --cached --name-only
git commit -m 'feat: switch product units directly in cart'
```

Stage terlebih dahulu hanya file pada Files yang benar-benar diubah, termasuk tests/migration. Tidak memakai git add .; jangan ikutkan .serena, index GitNexus, env, atau artefak test. Jika folder dokumentasi diabaikan Git, force-add hanya file dokumentasi patch yang disengaja.


---

## Task C4: Input angka jumlah dengan state sementara dan validasi

**Files:**

- Create: apps/web/features/pos-checkout/helpers/cart-quantity.ts
- Create: apps/web/features/pos-checkout/helpers/__tests__/cart-quantity.test.ts
- Create: apps/web/features/pos-checkout/components/CartQuantityInput.tsx
- Modify: apps/web/components/CartSidebar.tsx
- Modify: apps/web/hooks/useCart.ts
- Modify: apps/web/features/pos-checkout/__tests__/CartSidebar.test.tsx

**Interfaces:** Produces parseCartQuantity(raw:string):number|null. CartQuantityInput props {name:string;quantity:number;onChange:(quantity:number)=>void;onValidityChange:(valid:boolean)=>void}; parent tracks invalid line ids and disables bayar while any invalid.

- [ ] **Step 0: Impact sebelum edit.** Target: CartSidebar, useCart.updateQuantity. Jika graph tidak dapat dipercaya, perbaiki index sebelum edit simbol; jangan mengganti langkah ini dengan asumsi risk rendah.
- [ ] **Step 1: Tulis tes perilaku yang gagal.** Isi tes baru/append pada suite existing berikut:

```ts
import {expect,it} from "vitest";
import {parseCartQuantity} from "../cart-quantity";
it("menolak nilai sementara/invalid tanpa menghapus item",()=>{
 for(const text of ["","0","-1","NaN","Infinity","2x"]) expect(parseCartQuantity(text)).toBeNull();
 expect(parseCartQuantity("12")).toBe(12);
 expect(parseCartQuantity("2,5")).toBe(2.5);
});
```

- [ ] **Step 2: Pastikan RED.**

```powershell
pnpm --filter @pos/web exec vitest run 'features/pos-checkout/helpers/__tests__/cart-quantity.test.ts'
```

Expected: FAIL karena export/perilaku baru belum ada atau assertion perilaku lama salah. Kegagalan dependency/environment yang tidak terkait tidak dihitung sebagai RED; selesaikan penyebabnya dahulu.

- [ ] **Step 3: Implementasi aturan inti dan integrasi berikut.**

```ts
export function parseCartQuantity(raw:string):number|null {
 const text=raw.trim();
 if(!/^\d+(?:[.,]\d+)?$/.test(text)) return null;
 const value=Number(text.replace(",","."));
 return Number.isFinite(value)&&value>0?value:null;
}
```

Component controlled draft string diinisialisasi String(quantity), disinkronkan saat quantity berubah di luar input hanya jika tidak editing. onChange simpan raw, parse; valid panggil onChange(value), onValidityChange(true); invalid jangan mutasi cart, onValidityChange(false). onBlur/Enter invalid resetString(quantity), seterror 'Masukkan jumlah lebih dari nol.', tandai validtrue karena nilai sebelumnya dipulihkan; Escape reset tanpa menghapus. Render input type=text inputMode=decimal aria-label='Jumlah '+name aria-invalid=Boolean(error), error terhubung aria-describedby. Ganti spanjumlah di CartSidebar dengan component; minus/plus tetap. Parent invalidSet via callback, clear ketika linehapus, checkoutdisabled pendinginvalid. Defensive useCart.updateQuantity menolak nonfinite; jalur minus<=0 tetap hapus existing. onChange directinput tidak mengubah catalogPrice; checkoutnegativeconfirmation existing tetap dipanggil.

Isi component baru (impor parseCartQuantity dari helper):
```tsx
"use client";
import {useEffect,useState,useId,useRef} from "react";
import {parseCartQuantity} from "../helpers/cart-quantity";
export function CartQuantityInput({name,quantity,onChange,onValidityChange}:{
 name:string;quantity:number;onChange:(n:number)=>void;
 onValidityChange:(valid:boolean)=>void;
}){
 const [draft,setDraft]=useState(String(quantity));
 const [focused,setFocused]=useState(false);
 const [error,setError]=useState("");
 const errorId=useId();
 const cancelled=useRef(false);
 useEffect(()=>{if(!focused) setDraft(String(quantity));},[quantity,focused]);
 const finish=()=>{
   if(cancelled.current){cancelled.current=false;setFocused(false);return;}
   if(parseCartQuantity(draft)===null){
     setDraft(String(quantity));setError("Masukkan jumlah lebih dari nol.");
   }
   onValidityChange(true);setFocused(false);
 };
 return <span>
   <input aria-label={`Jumlah ${name}`} type="text" inputMode="decimal"
     aria-invalid={Boolean(error)} aria-describedby={error?errorId:undefined} value={draft}
     onFocus={()=>setFocused(true)}
     onChange={e=>{
       const raw=e.target.value;setDraft(raw);setError("");
       const value=parseCartQuantity(raw);
       onValidityChange(value!==null);
       if(value!==null) onChange(value);
     }}
     onBlur={finish}
     onKeyDown={e=>{
       if(e.key==="Enter"){e.preventDefault();e.currentTarget.blur();}
       if(e.key==="Escape"){
         cancelled.current=true;
         setDraft(String(quantity));setError("");onValidityChange(true);
         e.currentTarget.blur();
       }
     }}/>
   {error && <span id={errorId} role="alert">{error}</span>}
 </span>;
}
```
useId membuat id pesan unik dan aria-describedby menghubungkan input ke pesan. Jangan membuat id dari nama produk yang mungkin sama. Unmount callback membersihkan invalidSet di parent, sehingga baris terhapus tidak mengunci Bayar.


- [ ] **Step 4: Pastikan GREEN dan verifikasi integrasi.**

```powershell
pnpm --filter @pos/web exec vitest run 'features/pos-checkout/helpers/__tests__/cart-quantity.test.ts'
pnpm --filter @pos/web exec tsc --noEmit --incremental false
```

SSR memberi input aksesibel. Browser interact: clearfieldtidakremove, type12subtotalsesuai, Enteremptyrestores, negatiferror, decimalcomma, Escape, plusminus, linehapuscleanupvalidity, qtymelebihistokmenjalankankebijakanconfirmexisting. Testhelper bukan penggantiinteraksibrowser; jalankan di servertestuser.

Untuk schema: generate Prisma client tanpa build dan type-check DB package setelah migrasi pada target pengujian. Untuk UI: gunakan browser test pada server pengujian existing; jangan mengubah lifecycle server pengguna.

- [ ] **Step 5: Review scope dan commit tugas.**

```powershell
gitnexus detect-changes --scope staged --repo pos-system-monorepo
git diff --cached --check
git diff --cached --name-only
git commit -m 'feat: edit cart quantities with direct numeric input'
```

Stage terlebih dahulu hanya file pada Files yang benar-benar diubah, termasuk tests/migration. Tidak memakai git add .; jangan ikutkan .serena, index GitNexus, env, atau artefak test. Jika folder dokumentasi diabaikan Git, force-add hanya file dokumentasi patch yang disengaja.


---

## Task C5: Quote server, editor item, dan persetujuan atomik

**Files:**

- Create: apps/web/features/transactions-draft/services/approval-quote.ts
- Create: apps/web/features/transactions-draft/services/__tests__/approval-quote.test.ts
- Create: apps/web/app/api/transactions/[id]/approval-quote/route.ts
- Modify: apps/web/app/api/transactions/[id]/approve/route.ts
- Modify: apps/web/app/api/transactions/[id]/items/route.ts
- Modify: apps/web/features/transactions-draft/components/ApproveDraftDialog.tsx
- Modify: apps/web/app/(main)/history/components/ApproveModal.tsx
- Modify: apps/web/app/(main)/history/components/TransactionCartEditor.tsx
- Modify: apps/web/hooks/useTransactions.ts
- Modify: apps/web/app/api/transactions/[id]/approve/__tests__/route.test.ts
- Modify: apps/web/app/api/transactions/[id]/approve-draft/route.ts
- Test: apps/web/app/api/transactions/[id]/approve-draft/__tests__/route.test.ts

**Interfaces:** Consumes C1 pricing, S2 applyTransactionStockLifecycle. Produces buildApprovalFingerprint(input:unknown):string; quote response {items:pricedrows,subtotal,discount,tax,total,fingerprint}; approve request {items,quoteFingerprint,paymentMethod,amountPaid}; mismatchHTTP409 {code:'APPROVAL_QUOTE_CHANGED',quote:newquote}. Quote includes category pricing data, modal/member, products revisions, normalized item quantities, customer identity/type, role-sensitive price overrides and taxes.

- [ ] **Step 0: Impact sebelum edit.** Target: POST approve, PATCH/PUT items, ApproveDraftDialog, ApproveModal, TransactionCartEditor. Jika graph tidak dapat dipercaya, perbaiki index sebelum edit simbol; jangan mengganti langkah ini dengan asumsi risk rendah.
- [ ] **Step 1: Tulis tes perilaku yang gagal.** Isi tes baru/append pada suite existing berikut:

```ts
import {expect,it} from "vitest";
import {buildApprovalFingerprint} from "../approval-quote";
it("fingerprint berubah jika item/harga berubah",()=>{
 const quote={customerId:"c1",items:[{productId:"dus",quantity:2,price:15500}],total:31000};
 expect(buildApprovalFingerprint(quote)).toBe(buildApprovalFingerprint(quote));
 expect(buildApprovalFingerprint({...quote,total:32000}))
   .not.toBe(buildApprovalFingerprint(quote));
});
```

- [ ] **Step 2: Pastikan RED.**

```powershell
pnpm --filter @pos/web exec vitest run 'features/transactions-draft/services/__tests__/approval-quote.test.ts'
```

Expected: FAIL karena export/perilaku baru belum ada atau assertion perilaku lama salah. Kegagalan dependency/environment yang tidak terkait tidak dihitung sebagai RED; selesaikan penyebabnya dahulu.

- [ ] **Step 3: Implementasi aturan inti dan integrasi berikut.**

```ts
import {createHash} from "node:crypto";
function canonical(value:unknown):unknown {
 if(Array.isArray(value)) return value.map(canonical);
 if(value && typeof value==="object")
   return Object.fromEntries(Object.entries(value)
     .sort(([a],[b])=>a.localeCompare(b)).map(([key,v])=>[key,canonical(v)]));
 return value;
}
export function buildApprovalFingerprint(input:unknown):string {
 return createHash("sha256").update(JSON.stringify(canonical(input))).digest("hex");
}
```

Tambahkan buildApprovalQuote(tx,input:{storeId,transactionId,items,actorRole}) pada file sama. Reuse loader products/rules dan priceProductForCustomerType; server derivesprice, validatespositivefiniteqty and productstore, resolves permitted manual override, computes currency same existing totalhelper; noemptycart. Load referencedservice/material too. Return safe pricedrows + fingerprint of canonical numeric/string data (Date=>ISO sebelumcanonical). Quote endpoint requirePermission transaction.approve/update, store scoped, pending/draftonly. Approve db.$transaction: lock transaction row, load/reprice finalitems under locks of pricingrows/produk supaya perubahanpricingtidakmelewatireview, comparefingerprint, replaceitems and total, call S2 stocklifecycle approval, adjustcustomerdebt within tx, setfinalstatus. Rejectmismatch409withquote androllback. Editor allowsadd/remove/changeqty, shows modal only allowed permissionexisting, Agen/Dinas/regular/special/final. UI storesquote, refreshafteredit, displays mismatch changes and userconfirmnewquote. Items endpoint likewise serverreprice for editablefinals; never trust appliedUnitPrice. Persetujuan quote memakai isolationLevel Serializable dan retry maksimal tiga kali untuk P2034; re-load/reprice setelah retry dan tetap bandingkan fingerprint. Jangan retry business mismatch 409 atau menyetujui total baru secara otomatis.

Kontrak data exported pada approval-quote.ts:
```ts
import type {Prisma} from "@pos/db";
export interface ApprovalItemInput {
 productId:string|null;printingServiceId?:string|null;quantity:number;
 rawMaterialProductId?:string|null;rawMaterialQuantity?:number|null;
 size?:string|null;material?:string|null;submittedPrice?:number|null;
}
export interface ApprovalQuotedItem {
 input:ApprovalItemInput;name:string;unit:string;
 modal:number|null;regular:number;agent:number|null;government:number|null;
 special:number|null;appliedUnitPrice:number;subtotal:number;
}
export interface ApprovalQuote {
 items:ApprovalQuotedItem[];subtotal:number;discount:number;tax:number;
 total:number;fingerprint:string;
}
export interface ApprovalQuoteInput {
 storeId:string;transactionId:string;items:ApprovalItemInput[];actorRole:string;
}
// Bentuk exported implementation: buildApprovalQuote(
// tx: Prisma.TransactionClient, input: ApprovalQuoteInput,
// ): Promise<ApprovalQuote>
```
Implementasi quote memuat diskon/pajak dan customer dari transaksi DB; seluruh angka Decimal menjadi number sebelum fingerprint. Gunakan rule lookup/permission existing, termasuk batas role SALES pada approve-draft. Keduanya memakai shared quote/service, sementara permission transaction.approve versus transaction.draft tetap mengikuti endpoint existing.


- [ ] **Step 4: Pastikan GREEN dan verifikasi integrasi.**

```powershell
pnpm --filter @pos/web exec vitest run 'features/transactions-draft/services/__tests__/approval-quote.test.ts'
pnpm --filter @pos/web exec tsc --noEmit --incremental false
```

Route tests manipulate clientprice, addedwrongstoreproduct, removeitem, materialusage, negativeqty, permissiondeny. Quotechangeafterreview409withoutstock/statuschange. DB raceapproveonce, finalitems2unitsnotoldquantity. Editor add/reduce/remove shows recalculatedtotal and pricerowinfo; approvalcannot runempty/invalidcart. Call S2 and T1 whenTempoarrives, notduplicate deductionlogic.

Untuk schema: generate Prisma client tanpa build dan type-check DB package setelah migrasi pada target pengujian. Untuk UI: gunakan browser test pada server pengujian existing; jangan mengubah lifecycle server pengguna.

- [ ] **Step 5: Review scope dan commit tugas.**

```powershell
gitnexus detect-changes --scope staged --repo pos-system-monorepo
git diff --cached --check
git diff --cached --name-only
git commit -m 'feat: edit and reprice temporary receipts during approval'
```

Stage terlebih dahulu hanya file pada Files yang benar-benar diubah, termasuk tests/migration. Tidak memakai git add .; jangan ikutkan .serena, index GitNexus, env, atau artefak test. Jika folder dokumentasi diabaikan Git, force-add hanya file dokumentasi patch yang disengaja.
