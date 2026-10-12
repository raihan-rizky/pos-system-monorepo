# All-unit category pricing implementation plan

**Goal:** Pilihan Semua satuan tersedia untuk diskon dan rumus modal, mencakup satuan kategori saat ini dan yang ditambahkan nanti.

**Architecture:** Gunakan cakupan `unit: null` yang sudah didukung mesin harga. Hilangkan pembatasan rumus modal pada formulir dan schema API, lalu aktifkan pratinjau semua satuan. Pertahankan rumus, prioritas aturan, dan pemeriksaan konflik.

**Tech stack:** TypeScript, React, Next.js, Zod, Vitest.

## Batasan

Tidak menambah dependency atau mengubah rumus harga. Teks UI berbahasa Indonesia. Gunakan TDD, analisis dampak sebelum perubahan simbol, dan Headroom untuk keluaran besar. Jangan menjalankan build atau mengubah lifecycle server development. Eksekusi langsung di sesi ini sesuai permintaan pengguna.

## 1. Validasi dan penyimpanan

- [x] Tambahkan pengujian `validatePricingForm({ ...form, unit: "" })` menghasilkan `{}` untuk kedua mode modal, serta pratinjau pcs, rim, dan box.
- [x] Tambahkan pengujian POST dan PATCH kedua mode modal dengan `unit: null`, mengharapkan status 201 dan 200 serta null tersimpan. Ubah pengujian lama yang mewajibkan satuan.
- [x] Jalankan `pnpm --filter @pos/web test features/customer-category-pricing/helpers/__tests__/pricing-form.test.ts app/api/customer-category-pricing-rules` dan pastikan kegagalan disebabkan pembatasan satuan.
- [x] Hapus kondisi `form.mode.startsWith("COST_PLUS") && !form.unit.trim()` di `pricing-form.ts` dan kondisi sepadan dalam `pricingRuleSchema` di `rule-persistence.ts`. Bersihkan import normalisasi bila tidak lagi dipakai.
- [x] Jalankan pengujian API dan helper hingga lulus.

## 2. Formulir dan pratinjau

- [x] Tambahkan pengujian markup untuk opsi Semua satuan, bantuan cakupan, dan dropdown yang tetap tersedia saat daftar satuan memuat atau kosong. Pastikan hook pratinjau menerima `["paper", null, null, { enabled: true }]`.
- [x] Jalankan pengujian `PricingRuleForm.test.tsx` dan pastikan gagal karena opsi serta pratinjau belum tersedia.
- [x] Dalam `PricingRuleForm.tsx`, ubah opsi kosong menjadi Semua satuan, nonaktifkan dropdown hanya tanpa kategori, hilangkan tanda wajib Satuan, dan gunakan `{ enabled: Boolean(form.categoryId) }` pada hook pratinjau.
- [x] Hilangkan cabang pratinjau yang meminta satuan untuk rumus modal. Bantuan saat satuan kosong: “Aturan berlaku pada semua satuan dalam kategori ini, termasuk satuan yang ditambahkan nanti.” Bantuan satuan tertentu tetap seperti semula.
- [x] Jalankan seluruh pengujian fitur harga kategori dan API terkait.

## 3. Bantuan dan verifikasi

- [x] Ubah petunjuk cakupan di `HelpContent.tsx` dan workflow `customer-special-pricing` dalam `workflow-catalog.ts`: Semua satuan berlaku untuk diskon dan rumus modal, termasuk satuan baru. Pilihan satuan tertentu tetap membatasi aturan.
- [x] Periksa diff hanya mencakup fitur ini, jalankan lint dan type-check, lalu catat hasil dan keterbatasan pada spesifikasi.
- [x] Jangan memaksa commit bila lock Git milik proses lain masih tersedia.
