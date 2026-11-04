# Pengecualian Kategori Pembulatan Harga Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` to implement this plan task by task. Steps use checkbox syntax for tracking.

**Goal:** Pemilik toko dapat mengecualikan satu atau beberapa kategori produk dari seluruh pembulatan harga jual.

**Architecture:** Kebijakan pembulatan menyertakan ID kategori yang dikecualikan, disimpan sebagai relasi kategori agar penghapusan kategori membersihkan referensi. Fungsi pembulatan menerima kategori produk dan dipakai konsisten oleh tampilan dan server, dengan validasi kebijakan yang berubah pada transaksi.

**Tech Stack:** Next.js, React, TypeScript, TanStack Query, Prisma/PostgreSQL, Vitest.

**Spec:** `markdown-files/pengecualian-kategori-pembulatan-harga-design-2026-11-04.md`.

## Global Constraints

- Pertahankan perubahan lokal yang sudah ada; lakukan analisis dampak upstream GitNexus sebelum mengubah setiap fungsi atau metode.
- User-visible text harus ramah dalam bahasa Indonesia. Hormati izin `settings.price_rounding` yang sudah ada.
- Semua jenis harga produk di kategori yang dipilih melewati pembulatan; tanpa pilihan, perilaku lama tetap sama.
- Nota selesai dan harga master tidak diubah. Draft, persetujuan, dan offline mengikuti penanganan kebijakan berubah yang sudah ada.
- Jangan jalankan `pnpm build`, `pnpm dev`, atau menghentikan server pengembangan. Tulis uji gagal sebelum implementasi.
- Perbarui Bantuan, workflow AI Assistant, dokumentasi, dan Catatan Perubahan dengan tanggal rilis WIB sebenarnya.

## Review Focus

1. Cache lama tidak mempunyai daftar ID: normalisasi menjadi daftar kosong tanpa menghapus daftar di server pada PATCH lama (uji Task 1).
2. Kategori yang dihapus atau digabung tidak meninggalkan referensi rusak; produk yang dipindahkan memakai kategori barunya (uji Task 1 dan 3).
3. Harga khusus dan satuan produk yang dikecualikan tidak boleh tetap dibulatkan di server ketika UI sudah menampilkan harga asli (uji Task 2 dan 3).
4. Perubahan daftar saat checkout atau replay offline tidak boleh menyelesaikan harga berbeda tanpa penanganan konflik aplikasi (uji Task 3).
5. Daftar kategori gagal dimuat tidak boleh menghapus pilihan yang tersimpan; pencarian dan banyak centang dapat dipakai lewat keyboard (uji Task 4).

---

### Task 1: Simpan dan validasi pengecualian

**Files:** `packages/db/prisma/schema.prisma`; migration baru di `packages/db/prisma/migrations/`; `apps/web/features/product-price-rounding/rounding.ts`; `apps/web/features/product-price-rounding/server/rounding-settings.ts`; `apps/web/app/api/settings/price-rounding/route.ts`; `apps/web/features/product-price-rounding/hooks/usePriceRoundingSettings.ts`.

**Tests:** `apps/web/features/product-price-rounding/__tests__/rounding-settings.test.ts`, `rounding.test.ts`, `price-rounding-hooks.test.ts`; `apps/web/app/api/settings/price-rounding/__tests__/route.test.ts`.

**Interfaces:** `PriceRoundingSettings` menerima `excludedCategoryIds?: string[]`; kebijakan yang dibaca mengembalikan array yang dinormalisasi. `updatePriceRoundingSettings(settings)` mempertahankan relasi lama bila properti tidak dikirim. `GET` mengembalikan array; `PATCH` menerima array opsional yang hanya berisi ID kategori yang ada.

- [ ] Tambahkan uji gagal untuk default `[]`, dua ID yang tersimpan, ID duplikat, ID tidak dikenal, penghapusan kategori, dan PATCH lama yang tidak mengirim ID; pastikan respons kesalahan tidak membocorkan detail internal.
- [ ] Jalankan `pnpm --filter @pos/web exec vitest run features/product-price-rounding/__tests__/rounding-settings.test.ts features/product-price-rounding/__tests__/rounding.test.ts app/api/settings/price-rounding/__tests__/route.test.ts`; pastikan kasus baru gagal karena fitur belum ada.
- [ ] Tambahkan relasi kategori pada singleton `StoreSettings` dengan foreign key `ON DELETE CASCADE`, migration yang kompatibel dengan data lama, normalisasi dan validasi ID, serta pembacaan/penulisan atomik yang mempertahankan properti yang tidak dikirim.
- [ ] Jalankan `pnpm db:generate` dan uji Task 1 hingga lulus. Jangan terapkan migration ke database yang belum dipastikan aman.

### Task 2: Hitung harga menurut kategori produk

**Files:** `apps/web/features/product-price-rounding/rounding.ts`; `apps/web/features/customer-category-pricing/helpers/product-pricing.ts`; `apps/web/features/pos-checkout/helpers/checkout-pricing.ts`.

**Tests:** `apps/web/features/product-price-rounding/__tests__/rounding.test.ts`, `pricing-integration.test.ts`; `apps/web/features/pos-checkout/helpers/__tests__/checkout-pricing.test.ts`; `apps/web/features/customer-category-pricing/helpers/__tests__/product-pricing.test.ts`.

**Interfaces:** `roundSellingPrice(price, settings?, categoryId?)` dan `roundSellingPriceLine(line, settings?, categoryId?)` mempertahankan tanda tangan lama ketika kategori tidak diberikan; kategori yang masuk daftar menghasilkan `direction: "NONE"`, harga asal yang sama, dan metadata pembulatan baris `null`.

- [ ] Tambahkan uji gagal: `4050` pada kategori terpilih tetap `4050`, kategori lain menjadi `4500`, kategori terpilih berlaku pada harga reguler/agen/dinas/rumus/manual, dan setiap satuan memakai kategori produk yang benar.
- [ ] Jalankan Vitest pada empat file di atas dan pastikan uji baru gagal karena harga masih dibulatkan.
- [ ] Terapkan pengecualian di fungsi murni dan kirim kategori dari katalog, opsi satuan, serta setiap baris keranjang. Pertahankan validasi nilai uang dan perilaku saat pembulatan global mati.
- [ ] Jalankan kembali uji Task 2 hingga lulus.

### Task 3: Samakan perhitungan server dan semua pratinjau

**Files:** `apps/web/app/api/transactions/route.ts`, `apps/web/app/api/transactions/draft/route.ts`, `apps/web/app/api/offline-sync/transactions/route.ts`, `apps/web/features/transactions-draft/services/approval-quote.ts`, `apps/web/app/api/customer-category-pricing-rules/preview/route.ts`, `apps/web/features/ai-assistant/repositories/assistant-tools-repository.ts`; komponen `CartSidebar`, `PriceRoundingPreview`, formulir produk, harga satuan, grup stok, dan editor transaksi yang memanggil fungsi pembulatan.

**Tests:** uji route transaksi, draft, offline, approval quote, dan `apps/web/features/product-price-rounding/__tests__/rounding-checkout-totals.test.ts` serta uji pratinjau yang relevan.

**Interfaces:** server mengambil kategori dari produk yang dimuat. Perbandingan kebijakan checkout memperlakukan daftar ID sebagai himpunan, termasuk saat satu klien masih membawa format lama; jalur offline memakai penanganan perubahan harga yang sudah ada.

- [ ] Tambahkan uji gagal untuk transaksi campuran kategori terpilih/tidak terpilih, harga khusus, varian, persetujuan draft, sinkronisasi offline, perbandingan daftar dalam urutan berbeda, dan kebijakan berubah setelah keranjang dimuat.
- [ ] Jalankan file uji yang diubah dan pastikan kasus baru gagal dengan harga atau status yang salah.
- [ ] Teruskan kategori tepercaya ke setiap pemanggil pembulatan yang menampilkan atau menghitung harga produk. Pastikan formulir produk baru menggunakan kategori yang dipilih, pratinjau tanpa kategori tidak menyesatkan, dan layanan nonproduk tetap mengikuti perilaku lama.
- [ ] Perluas pemeriksaan kebijakan checkout dan penanganan replay offline agar perubahan pengecualian tidak diam-diam mengubah total; jangan mengubah nota selesai.
- [ ] Jalankan kembali uji Task 3 dan pemeriksaan regresi pembulatan hingga lulus.

### Task 4: Pemilihan kategori di pengaturan

**Files:** `apps/web/features/product-price-rounding/components/PriceRoundingSettingsTab.tsx` dan, jika diperlukan, komponen pemilih terkolokasi; `apps/web/hooks/useProducts.ts` sebagai sumber daftar kategori yang sudah ada.

**Tests:** `apps/web/features/product-price-rounding/__tests__/PriceRoundingSettingsTab.test.tsx` dan uji interaksi browser terkait.

**Interfaces:** tampilan menerima kategori, status muat/gagal, dan daftar ID terpilih; setiap perubahan hanya memperbarui draft sampai `onSubmit` menyimpan seluruh kebijakan.

- [ ] Tambahkan uji gagal untuk pencarian, memilih dan menghapus beberapa kategori, jumlah pilihan, keadaan kosong, izin baca saja, kegagalan memuat, dan penyimpanan ulang tanpa kehilangan pilihan sebelumnya.
- [ ] Jalankan uji komponen dan uji interaksi terkait; pastikan kasus baru gagal.
- [ ] Tambahkan daftar centang dengan pencarian yang memakai kategori produk yang sudah ada, label serta status yang dapat diakses, dan kontrol simpan yang aman saat data kategori tidak tersedia.
- [ ] Jalankan kembali uji Task 4; periksa navigasi keyboard dan lebar layar kecil pada server yang sudah berjalan bila tersedia.

### Task 5: Dokumentasi dan pemeriksaan akhir

**Files:** `apps/web/features/help-documentation/components/HelpContent.tsx`, `apps/web/features/ai-assistant/workflows/workflow-catalog.ts`, `apps/web/features/changelog/data/changelog.ts`, dan dokumentasi fitur di `markdown-files`.

- [ ] Tambahkan uji gagal untuk deskripsi Bantuan, workflow, dan Catatan Perubahan yang sesuai alur sebenarnya.
- [ ] Perbarui materi tersebut, termasuk tepat tiga langkah pada Catatan Perubahan, tanggal rilis WIB sebenarnya, dan visual yang akurat bila tersedia.
- [ ] Jalankan uji terkait, `pnpm type-check`, dan pemeriksaan lint yang relevan. Laporkan kegagalan yang sudah ada atau kendala lingkungan secara jelas; jangan jalankan production build.
- [ ] Tinjau diff dan seluruh pemanggil yang terdampak serta pastikan tidak ada perubahan lokal pengguna yang tertimpa.
