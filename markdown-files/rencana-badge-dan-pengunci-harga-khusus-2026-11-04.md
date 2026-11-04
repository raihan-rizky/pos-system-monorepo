# Rencana implementasi badge dan pengunci Harga Khusus

> Pelaksanaan: gunakan superpowers:executing-plans secara langsung dalam sesi ini.

**Tujuan:** Membedakan asal harga dan mengunci pengelolaan aturan saat fitur toko nonaktif.

**Arsitektur:** Satu komponen badge menentukan label dan gaya dari `ruleId` harga yang diterapkan. Tab aturan memakai status pengaturan toko untuk menampilkan daftar yang inert di belakang blocker, dan tautan Owner membuka tab pengaturan yang sesuai. Perhitungan harga dan data aturan tetap sama.

**Teknologi:** Next.js, React, TypeScript, Tailwind CSS, Vitest.

**Rancangan:** `markdown-files/badge-dan-pengunci-harga-khusus-2026-11-04.md`.

## Batasan

- Gunakan bahasa Indonesia yang ramah untuk teks pengguna.
- Jangan menjalankan `pnpm build` atau memulai/menghentikan server development.
- Pertahankan harga Agen/Dinas manual dan harga custom nota ketika aturan otomatis nonaktif.
- Lakukan analisis dampak GitNexus sebelum mengubah simbol dan deteksi perubahan sebelum commit.
- Jangan sertakan perubahan checkout lain dalam commit ke `main`.

## Tugas 1: Bedakan asal harga

**Berkas:** `SpecialPriceBadge.tsx`, `MemberPriceField.tsx`, `pricing-rules.ts`, `ProductCard.tsx`, `VariantSelector.tsx`, `ProductsClientPage.tsx`, `ProductTable.tsx`, `CartSidebar.tsx`, `PaymentModal.tsx`, dan tes di direktori fitur terkait.

- [x] Tambahkan tes yang membandingkan `ruleId: "harga-agen"` dan `ruleId: "harga-dinas"` dengan ID aturan lain: yang pertama menghasilkan label **Harga manual**, yang lain **Harga Khusus**, dan nilai tanpa harga terapan tidak menghasilkan badge.
- [x] Jalankan tes dan pastikan gagal karena label manual belum tersedia.
- [x] Implementasikan penentuan label berdasarkan `ruleId`; tampilkan badge berlabel dan warna berbeda di setiap pemanggil, termasuk teks pada pilihan satuan. Pada kolom harga Agen/Dinas manual, gunakan label **Harga manual**. Jangan mengubah badge **Harga custom** untuk nota.
- [x] Jalankan tes badge dan tes komponen POS/Produk yang terdampak.

## Tugas 2: Kunci aturan dan arahkan ke pengaturan

**Berkas:** `CustomerCategoryPricingRulesTab.tsx`, `settings/page.tsx`, tes komponen aturan dan pengaturan.

- [x] Tambahkan tes untuk status nonaktif, memuat, gagal, dan aktif: status nonaktif menampilkan pesan serta daftar yang `inert`; Owner memperoleh tautan `/settings?tab=special-pricing`; gagal menyediakan cara mencoba kembali; status aktif menampilkan tindakan aturan yang dapat digunakan.
- [x] Jalankan tes dan pastikan gagal pada blocker yang belum ada.
- [x] Hubungkan tab aturan ke `useSpecialPricingSettings`; tampilkan blocker dan cegah interaksi mouse serta keyboard selagi belum aktif. Izinkan Owner membuka pengaturan langsung; berikan petunjuk menghubungi Owner untuk pengguna lain. Tutup editor atau konfirmasi jika fitur menjadi nonaktif saat dialog terbuka.
- [x] Baca parameter `tab=special-pricing` pada halaman Pengaturan dengan tetap memeriksa role Owner.
- [x] Jalankan tes terkait dan periksa perilaku responsif serta navigasi keyboard dengan browser atau tes browser yang tersedia.

## Tugas 3: Dokumentasi, validasi, dan publikasi

**Berkas:** `HelpContent.tsx`, `workflow-catalog.ts`, dokumen bantuan AI terkait, `changelog.ts`, dan dokumen rancangan ini.

- [x] Perbarui bantuan untuk membedakan sumber badge serta menjelaskan blocker dan langkah mengaktifkan fitur.
- [x] Tambahkan entri Catatan Perubahan tanggal 2026-11-04 WIB dengan `id` stabil, `revision`, ringkasan, rute, dan tiga langkah yang sesuai implementasi.
- Verifikasi publikasi mencakup tes regresi, TypeScript/lint, `git diff --check`, analisis `detect_changes`, dan pemeriksaan commit pada `origin/main`. Jangan menjalankan build.

## Hasil pemeriksaan terarah

- Tes awal membuktikan label referensi keranjang, keterangan pembayaran, akses non-Owner, dan badge kartu sempit belum sesuai sebelum perbaikan; 31 tes terarah lulus setelahnya.
- Browser memeriksa blocker, keyboard, status pengaturan, dan badge di layar seluler menggunakan data contoh. Kartu selebar 160 px juga diuji dengan harga panjang.
- TypeScript `@pos/web` dan `git diff --check` lulus sebelum integrasi dengan `main`.
- Headroom MCP mengembalikan statistik, tetapi proxy kompresinya tidak terhubung; keluaran pemeriksaan dibatasi.
