# Pemilihan Pelanggan melalui Modal Pembayaran Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menghapus dropdown Pelanggan di atas daftar produk POS sehingga pemilihan pelanggan dilakukan melalui modal Pembayaran.

**Architecture:** Hapus satu titik render `CustomerCheckoutSelect` di `POSClientPage`, beserta import komponen yang menjadi tidak terpakai. Pertahankan state `pricingCustomer` dan props `initialCustomerSelection` / `onCustomerSelectionChange` pada `PaymentModal`: pilihan dari modal tetap memperbarui tipe pelanggan, harga kartu produk, keranjang, dan subtotal. Komponen pemilih pelanggan bersama tetap digunakan modal.

**Tech Stack:** Next.js, React, TypeScript, Vitest, pnpm.

## Global Constraints

- Teks pengguna memakai bahasa Indonesia yang ramah.
- Jalankan TDD sesuai AGENTS.md; verifikasi pengujian baru gagal sebelum mengubah implementasi.
- Sebelum mengubah simbol, jalankan GitNexus `impact({target: "symbolName", direction: "upstream"})`; laporkan direct callers, proses terdampak, dan tingkat risiko. Peringatkan pengguna jika HIGH/CRITICAL.
- Headroom MCP stats wajib pada awal/akhir sesi implementasi dan kompresi untuk keluaran besar. Bila tidak tersedia, catat dan gunakan keluaran terbatas.
- Jangan menjalankan `pnpm build`; lifecycle server development dikelola pengguna.
- Tidak memerlukan dependensi baru atau perubahan database.
- Dokumentasi implementasi wajib berada di `D:\main_project\pos-system-monorepo\markdown-files` dengan nama `remove-pos-customer-selector-2026-10-10.md`. Drive D tidak tersedia pada sesi perencanaan ini; pastikan lokasi tersedia saat implementasi atau minta lokasi pengganti.

## Temuan kode dan risiko

- `apps/web/app/(main)/pos/POSClientPage.tsx:839`: dropdown duplikat di atas `ProductGrid`.
- `POSClientPage.tsx:221`: state pelanggan juga menentukan `customerType` dan hasil `priceCartItemsForCheckout`.
- `POSClientPage.tsx:953`: modal menerima state pelanggan dan mengirim perubahan kembali ke halaman POS.
- `apps/web/components/PaymentModal.tsx:538`: callback memilih pelanggan memperbarui state modal dan memanggil `onCustomerSelectionChange`.
- `apps/web/app/(main)/pos/__tests__/pos-pricing-render.test.tsx`: pengujian harga pelanggan saat ini bergantung pada dropdown halaman dan perlu dialihkan ke callback modal.
- Risiko utama adalah hilangnya harga Agen/Industri/Pemerintah bila state atau callback ikut dihapus. Penghapusan dibatasi pada titik render halaman.
- Saat halaman baru dibuka, harga memakai pelanggan Umum. Harga kategori pelanggan mengikuti pilihan di modal Pembayaran, termasuk ketika modal ditutup lalu dibuka lagi.
- GitNexus MCP dan Headroom MCP tidak tersedia saat perencanaan. Analisis graf belum dijalankan; temuan di atas berasal dari cuplikan source terbatas, bukan hasil penilaian blast radius GitNexus.

## Task 1: Hapus dropdown halaman dan verifikasi alur pelanggan dari modal

**Files:**
- Modify: `apps/web/app/(main)/pos/POSClientPage.tsx`
- Test: `apps/web/app/(main)/pos/__tests__/pos-pricing-render.test.tsx`
- Regression tests: `apps/web/features/pos-checkout/__tests__/PaymentModal.test.tsx`, `customer-selection.test.ts`, `pos-pricing-choice.test.ts`
- Reference: `apps/web/components/PaymentModal.tsx`, `apps/web/features/pos-checkout/components/CustomerCheckoutSelect.tsx`

**Interfaces:**
- Consumes: `CheckoutCustomerSelection`, `PaymentModal.initialCustomerSelection`, `PaymentModal.onCustomerSelectionChange`.
- Produces: halaman POS tanpa dropdown pelanggan; callback modal tetap memperbarui harga produk dan keranjang.

- [ ] Jalankan impact untuk `POSClientPage` sebelum mengubahnya dan laporkan hasilnya. Bila MCP tidak tersedia, periksa kemampuan GitNexus CLI yang tersedia; jangan menyatakan analisis graf sudah dilakukan tanpa hasilnya.
- [ ] Gunakan harness Vitest yang sudah ada. Tambahkan pencarian elemen modal berdasarkan props agar mock `next/dynamic` yang sekarang tetap dapat digunakan. Tambahkan field berikut dalam return helper `render()`:

```tsx
payment: findProps(tree, element =>
  typeof element.props.onCustomerSelectionChange === "function" &&
  "initialCustomerSelection" in element.props),
```

- [ ] Tambahkan assertion bahwa pemilih pelanggan halaman tidak dirender. Ganti test perubahan harga yang memakai `before.customer.onChange` dengan alur membuka pembayaran dan callback modal:

```tsx
it("selects customers only from payment and retains their pricing on reopen", () => {
  const before = render();
  expect(before.customer).toBeUndefined();
  before.cart.onCheckout();
  const opened = render();
  expect(opened.payment.initialCustomerSelection).toEqual({ kind: "general" });
  const selection = {
    kind: "existing" as const,
    customer: { id: "agent", name: "Agen", type: "AGEN" as const },
  };
  opened.payment.onCustomerSelectionChange(selection);
  const selected = render();
  expect(selected.grid.customerType).toBe("AGEN");
  expect(selected.cart.items[0].price).toBe(1800);
  expect(selected.cart.subtotal).toBe(1800);
  selected.payment.onClose();
  const closed = render();
  expect(closed.payment).toBeUndefined();
  closed.cart.onCheckout();
  expect(render().payment.initialCustomerSelection).toEqual(selection);
});
```

- [ ] Jalankan `pnpm --filter @pos/web test "app/(main)/pos/__tests__/pos-pricing-render.test.tsx"`. Pastikan assertion ketiadaan dropdown gagal karena dropdown masih dirender, bukan karena error harness.
- [ ] Hapus import `CustomerCheckoutSelect` dari `POSClientPage.tsx` dan blok wrapper `mb-3 max-w-md` beserta dropdown di atas `ProductGrid`. JSX area produk menjadi:

```tsx
<div className="flex-1 overflow-y-auto overflow-x-hidden px-3 md:px-6 py-3 md:py-4">
  <ProductGrid
    products={visibleProducts}
    onAddToCart={handleProductClick}
    isLoading={productsLoading}
    customerType={customerType}
    categoryPricingRules={pricingRules}
  />
</div>
```

- [ ] Pertahankan state, kalkulasi harga, dan kedua props pelanggan modal. Jangan hapus `CustomerCheckoutSelect.tsx`, karena modal menggunakannya.
- [ ] Jalankan tes terfokus berikut hingga lulus:

```powershell
pnpm --filter @pos/web test "app/(main)/pos/__tests__/pos-pricing-render.test.tsx" features/pos-checkout/__tests__/PaymentModal.test.tsx features/pos-checkout/__tests__/customer-selection.test.ts features/pos-checkout/__tests__/pos-pricing-choice.test.ts
pnpm --filter @pos/web type-check
```

- [ ] Pada server yang sudah dikelola pengguna, periksa desktop dan mobile: daftar produk langsung tampil; modal Pembayaran menyediakan pilihan Umum, pelanggan tersimpan, dan pelanggan baru; pelanggan Agen memperbarui total; menutup/membuka modal mempertahankan pilihan; konfirmasi/draft memakai pelanggan yang dipilih. Verifikasi Tempo masih mewajibkan pelanggan bernama dengan pengujian modal yang sudah tersedia.

## Task 2: Sinkronkan panduan alur POS

**Files:**
- Modify: `apps/web/features/help-documentation/components/HelpContent.tsx` pada panduan POS/harga pelanggan.
- Modify: `apps/web/features/ai-assistant/workflows/workflow-catalog.ts` pada workflow `pos-sale` dan petunjuk harga POS yang relevan.
- Modify: `apps/web/features/ai-assistant/docs/help/pos.md`.
- Create: `D:\main_project\pos-system-monorepo\markdown-files\remove-pos-customer-selector-2026-10-10.md` saat lokasi tersedia.

- [ ] Jalankan impact sebelum mengubah simbol yang memuat panduan Help/workflow, sesuai AGENTS.md.
- [ ] Perjelas lokasi pemilihan pelanggan dengan kalimat: "Klik Bayar, lalu pilih pelanggan di modal Pembayaran. Harga dan total otomatis mengikuti tipe pelanggan serta satuan yang dipilih."
- [ ] Pada penjelasan harga POS, sebutkan harga awal menggunakan pelanggan Umum dan harga kategori diperbarui setelah memilih pelanggan di modal. Sesuaikan kalimat yang dapat menyiratkan pemilihan pelanggan di daftar produk.
- [ ] Catat tujuan, file terdampak, perilaku harga, serta hasil validasi aktual dalam dokumentasi implementasi. Jangan menuliskan pengujian lulus sebelum menjalankannya.
- [ ] Jalankan `pnpm --filter @pos/web type-check` setelah perubahan TSX/TS terakhir. Tinjau diff agar hanya UI pelanggan halaman, pengujiannya, dan panduan terkait yang berubah.
- [ ] Bila akan melakukan commit, jalankan GitNexus `detect_changes()` dahulu dan pastikan simbol/proses yang berubah sesuai scope. Commit hanya jika diminta pengguna.

## Acceptance criteria

- Halaman POS tidak menampilkan dropdown Pelanggan di atas produk.
- Pemilihan pelanggan tetap tersedia di modal Pembayaran.
- Harga kategori dan subtotal tetap tersinkronisasi setelah pemilihan pelanggan di modal.
- Pilihan pelanggan bertahan ketika modal ditutup dan dibuka kembali selama transaksi yang sama.
- Konfirmasi pembayaran dan penyimpanan draft tetap menerima pelanggan yang dipilih.
- Panduan Bantuan dan workflow AI menjelaskan pemilihan pelanggan melalui modal Pembayaran.

## Status

Implementasi dilanjutkan atas instruksi pengguna. Dropdown halaman dan import-nya sudah dihapus; state pelanggan dan callback modal dipertahankan. Bantuan, workflow AI, dan panduan POS diperbarui.

TDD: pengujian baru gagal karena dropdown masih dirender sebelum perubahan; setelah perubahan, 18 pengujian dalam 4 file lulus. Pengujian mencakup ketiadaan dropdown halaman, pembaruan harga Agen melalui callback modal, dan pilihan yang bertahan setelah modal dibuka kembali. `git diff --check` lulus. Pemeriksaan TypeScript gagal pada validator `.next-e2e` (stock-history dan params route internal-stock-out) serta `features/app-shell/__tests__/development-bundler.test.ts`, di luar file yang diubah untuk tugas ini. Tidak ada error dilaporkan pada file perubahan ini.

GitNexus impact dijalankan melalui CLI untuk `POSClientPage`, helper test `render`, `FAQ_WORKFLOWS`, dan `HELP_ROLE_CONTENT`; indeks tidak menemukan target dan melaporkan risiko UNKNOWN. Headroom stats dan compression digunakan; proxy yang dikonfigurasi tidak terjangkau. Dokumentasi perubahan pada lokasi wajib D: menunggu lokasi pengganti dari pengguna karena drive tersebut tidak tersedia. Pemeriksaan browser belum dilakukan.
