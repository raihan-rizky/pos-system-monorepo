# Implementation Plan: Total Harian di RC Bulan

Status: selesai  
Base: `7f530d4803d3462a1c53d007da6e9e117bb045a4` (`origin/dev`)  
Spec: [total-harian-rc-bulan-2026-11-20.md](total-harian-rc-bulan-2026-11-20.md)

## Goal

Tambahkan baris subtotal harian berwarna mint ke sheet `RC {BULAN}` pada export laporan bulanan, tanpa menggandakan total bulanan atau mengubah hasil rekap harian.

## Constraints

- Kerjakan di branch `codex/total-harian-rc-bulan`.
- Pertahankan gaya workbook, formula cache, print area, dan rincian kategori yang ada.
- Tambahkan satu baris `TOTAL HARIAN` per tanggal yang memiliki penerimaan; hitung seluruh kategori termasuk `Perlu pemetaan` dan `TOTAL`.
- Total bulanan menghitung baris transaksi bertanggal saja.
- Pakai warna mockup: isi `#DFF3ED`, teks `#14564F`, garis atas `#15816F`.
- Tulis UI dalam bahasa Indonesia. Tidak ada perubahan API, RBAC, atau database.

## Tasks

### Task 1 — workbook TDD (selesai)

**RED:** Tambahkan tes regression pada `monthly-workbook.test.ts` dengan beberapa transaksi untuk tanggal yang sama dan satu transaksi untuk tanggal lain. Verifikasi posisi/label subtotal, rumus dan cache kategori termasuk `Perlu pemetaan`, total harian, total bulanan tanpa penghitungan ganda, gaya mint, serta tidak adanya subtotal di bulan kosong. Jalankan file tes dan pastikan gagal karena subtotal belum ada.

**GREEN:** Kelompokkan baris transaksi berdasarkan tanggal, sisipkan subtotal setelah setiap tanggal, ubah rumus total bulanan agar hanya menjumlah baris bertanggal, dan beri gaya mint ke seluruh sel subtotal. Pertahankan rumus rekap harian yang memakai pencocokan tanggal.

**Expected:** tes regresi yang baru lulus; tes workbook yang ditargetkan tetap hijau; subtotal tidak terhitung dua kali.

### Task 2 — dokumentasi pengguna dan release notes (selesai)

Perbarui kedua panduan export di `HelpContent.tsx`, dokumentasi rancangan ini, dan changelog. Buat ilustrasi RC Bulan yang menampilkan baris subtotal mint dengan nilai contoh.

**Expected:** panduan menyebut subtotal per tanggal pada sheet RC; changelog menjelaskan pemakaiannya dengan tiga langkah jika diterbitkan.

### Task 3 — review dan pemeriksaan akhir (selesai)

Jalankan tes aplikasi yang diwajibkan, pemeriksaan lint/type-check, tinjau diff penuh, dan jalankan `gitnexus detect_changes()` sebelum commit. Jangan jalankan `pnpm build`.

**Expected:** checks lulus dan dampak GitNexus terbatas ke export laporan bulanan, tes, bantuan, dokumentasi, dan changelog.

## Hasil verifikasi

- 96/96 tes terarah lulus pada lima file; setelah koreksi ilustrasi, tes changelog lulus 25/25 dan lint terarah lulus.
- Dua file suite yang sebelumnya gagal akibat dependensi Prisma kemudian lulus 23/23 setelah lingkungan worktree dilengkapi. Suite lengkap tidak dijalankan ulang.
- Type-check melaporkan 493 diagnostic baseline di modul yang tidak berubah; tidak ada diagnostic pada file yang diubah.
- pnpm build tidak dijalankan sesuai panduan repositori.
