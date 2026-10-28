# Pembulatan Harga Jual Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for independent settings and badge tasks; the controller integrates pricing and verifies the combined result. Use TDD for each behavior.

**Goal:** Terapkan aturan pembulatan Rp500/ambang Rp50 yang dapat diatur, dengan badge arah dan RBAC default OWNER.

**Architecture:** Harga master dan kalkulasi asal dipertahankan. Fungsi murni membulatkan harga jual akhir serta menghasilkan metadata; konfigurasi StoreSettings dibaca oleh UI dan server.

**Tech Stack:** Next.js 15, React 19, TypeScript, Prisma, Zod, React Query, Vitest.

**Spec:** `markdown-files/pembulatan-harga-jual-design-2026-10-28.md`

## Global Constraints

- Default `enabled: true`, `increment: 500`, `threshold: 50`.
- Resource RBAC `settings.price_rounding`, default hanya OWNER, dapat didelegasikan.
- Teks pengguna Bahasa Indonesia. Semua perubahan lokal sebelumnya dipertahankan.
- Jalankan impact upstream sebelum mengubah simbol yang ada, catat keterbatasan indeks.
- Jangan menjalankan pnpm build; lifecycle pnpm dev dikelola pengguna.
- Tanggal rilis 2026-10-28 WIB.

## Kontrak bersama

```ts
type PriceRoundingSettings = { enabled: boolean; increment: number; threshold: number };
type PriceRoundingResult = {
  originalPrice: number; roundedPrice: number;
  direction: "UP" | "DOWN" | "NONE"; difference: number;
};
// features/product-price-rounding/rounding.ts
// DEFAULT_PRICE_ROUNDING_SETTINGS, validatePriceRoundingSettings,
// roundSellingPrice(price, settings?) -> PriceRoundingResult
// features/product-price-rounding/hooks/usePriceRoundingSettings.ts
// usePriceRoundingSettings(), useUpdatePriceRoundingSettings()
// features/product-price-rounding/server/rounding-settings.ts
// getPriceRoundingSettings(), updatePriceRoundingSettings(settings)
// features/product-price-rounding/components/PriceRoundingBadge.tsx
// <PriceRoundingBadge rounding={resultOrNull} />
```

### Task 1: Mesin pembulatan dan integrasi harga

Files: `features/product-price-rounding/rounding.ts`, `features/customer-category-pricing/helpers/product-pricing.ts`, `features/pos-checkout/helpers/checkout-pricing.ts`, endpoint transaksi/draft/offline-sync, approval quote.

- [x] Tulis tabel uji dengan hasil literal `[4049,4000], [4050,4500], [4500,4500], [4549,4500], [4550,5000], [4049.99,4000]` serta aturan mati dan validasi.
- [x] Jalankan `pnpm --filter @pos/web exec vitest run features/product-price-rounding/__tests__/rounding.test.ts` dan verifikasi gagal sebelum implementasi.
- [x] Implementasikan fungsi dan tipe kontrak. Tambahkan lapisan pembulatan akhir tanpa membulatkan HPP atau input rumus lebih awal.
- [x] Integrasikan konfigurasi server dan frontend secara eksplisit; metadata sampai ke katalog/keranjang. Harga khusus transaksi mengikuti aturan yang sama.
- [x] Jalankan unit dan integrasi harga, transaksi, approval, serta offline yang terdampak.

### Task 2: Settings, penyimpanan, dan RBAC

Files: direktori `features/product-price-rounding/server`, `hooks`, Settings tab baru, `/api/settings/price-rounding`, `schema.prisma`, migrasi aditif, `rbac-core.ts`, `rbac-settings-ui.ts`, halaman Settings.

- [x] Tulis tes konfigurasi default, penyimpanan, validasi parameter, penolakan akses, dan izin delegasi; jalankan dan verifikasi gagal.
- [x] Tambahkan kolom konfigurasi dengan default pada StoreSettings serta migrasi aditif. Hindari perubahan database produksi.
- [x] Implementasikan endpoint GET terautentikasi dan PATCH `requirePermission("settings.price_rounding", "update")`.
- [x] Implementasikan hook React Query dan tab formulir berlabel dengan pratinjau, status/error/success, serta invalidasi query setelah simpan.
- [x] Jalankan tes Settings/RBAC dan pemeriksaan TypeScript. Generate Prisma menggunakan perintah generate, bukan production build.

### Task 3: Badge dan pratinjau produk

Files: komponen badge baru dan tes, ProductCard/VariantSelector, ProductsClientPage, CartSidebar, formulir produk/harga/member, GroupPricingPanel, pratinjau impor.

- [x] Tulis tes badge yang membuktikan label/selisih arah, tidak tampil untuk NONE, serta detail keyboard/klik dan stop propagation; verifikasi gagal.
- [x] Implementasikan badge dengan elemen semantik dan rincian harga asal/final/selisih.
- [x] Gunakan hook kebijakan dan fungsi Task 1 pada setiap harga jual yang ditampilkan. Field master tetap menyimpan harga asal, dengan pratinjau harga efektif di dekatnya.
- [x] Jalankan tes komponen terkait dan periksa browser pada viewport desktop/mobile bila dev server sudah tersedia.

### Task 4: Dokumentasi, review, dan validasi akhir

Files: HelpContent.tsx, workflow-catalog.ts, changelog.ts, dokumen implementasi bertanggal.

- [x] Perbarui Bantuan dan workflow yang memandu Pengaturan > Pembulatan Harga dan pembacaan badge.
- [x] Tambahkan catatan perubahan dengan id unik, revision 1, highlight singkat, serta tepat tiga langkah penggunaan. Gunakan visual yang akurat dan diberi label jika screenshot tidak tersedia.
- [x] Review selisih perubahan terhadap baseline session; perbaiki hasil review spesifikasi dan kualitas.
- [x] Jalankan tes gabungan, lint terarah, type-check, serta GitNexus detect_changes dan Headroom stats akhir.
- [x] Laporkan hasil, jumlah tes, keterbatasan alat, dan kebutuhan penerapan migrasi bila belum dijalankan.

## Keputusan pelaksanaan

- Pengguna telah menyetujui rancangan lengkap. Implementasi diteruskan tanpa meminta persetujuan yang sama lagi.
- Checkout aktif memiliki perubahan relevan yang belum dikomit; gunakan checkout ini agar perubahan harga satuan tidak hilang. Jangan membuat commit yang mencakup pekerjaan pengguna lain.
- Task 2 dan Task 3 dapat didelegasikan dengan kepemilikan file terpisah. Task 1 dimiliki controller; Task 4 dimiliki controller setelah integrasi.

## Verifikasi dan publikasi lanjutan — 2026-10-28

- [x] Tambah 39 tes variasi numerik, total checkout, dan API settings; batch 51 tes lulus.
- [x] Terapkan migrasi dev lalu produksi; verifikasi schema, constraint, dan checksum secara langsung.
- [x] Validasi snapshot dari origin/main terbaru, termasuk regresi urutan FAQ dan fixture pembulatan pada tes yang sudah ada.
- Publikasi memakai branch `codex/product-price-rounding`, pesan `feat(pricing): add configurable selling price rounding`, serta hook lint-staged dan seluruh suite tes sebelum push.
