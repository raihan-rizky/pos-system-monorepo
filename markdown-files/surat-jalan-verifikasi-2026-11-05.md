# Verifikasi Surat Jalan edit langsung

Tanggal: 2026-11-05 (WIB)

## Checkout publikasi dari main

Perubahan Surat Jalan dipisahkan dari checkout sumber yang berisi pekerjaan lain dan diterapkan pada checkout tersendiri dari origin/main. Hanya komponen/API Surat Jalan, pengujian, metadata izin yang terkait, panduan Q8, Bantuan Surat Jalan, satu entri Catatan Perubahan, screenshot contoh, dan dokumentasi fitur yang dipublikasikan.

## Hasil pemeriksaan

- Vitest terarah: **18 file dan 196 tes lolos**. Cakupan meliputi helper dan komponen Surat Jalan, endpoint pembuatan/edit/approval, RBAC, Catatan Perubahan, Bantuan, serta katalog workflow AI.
- TypeScript seluruh paket web: **lolos**, menggunakan pnpm --filter @pos/web type-check secara langsung agar tidak memanggil build melalui Turbo.
- Browser Chromium: **lolos** untuk edit langsung, payload nama/jumlah/keterangan, satu penyimpanan saat klik ganda, respons kanonik sebelum cetak, cetak ulang, konflik, close/switch saat dirty, Escape, refresh ketika dirty maupun clean, unmount safety, izin baca saja, ponsel 390 px, dan isolasi media print.
- Browser mencetak dokumen 42 baris menjadi PDF lima halaman: ukuran 215 × 165 mm, header berulang, baris terakhir tersedia, tanpa toolbar atau kontrol edit.
- ESLint pada **24 file: 0 error dan 0 warning**. Resolusi plugin menggunakan direktori dependency pnpm lokal; tidak ada perubahan dependency atau lockfile aplikasi.
- git diff --cached --check: lolos.
- GitNexus detect-changes --scope staged: exit 0; melaporkan 30 file teks, 15 simbol terindeks, 0 proses terdampak, dan risiko rendah. Scope publikasi diverifikasi juga melalui manifest eksplisit dan diff Git.

Tes API memverifikasi izin bawaan dan penolakan role, lintas toko, konflik versi, status transaksi tertutup, batas jumlah termasuk reservasi PENDING, pencegahan pengurangan stok ganda, pembuktian jurnal stok lama, penguncian grup stok, serta approval yang membaca ulang dokumen setelah kunci transaksi diperoleh.

## Riwayat pemeriksaan checkout sumber

Sebelum isolasi publikasi, 168 tes fitur dan pengujian browser telah lolos pada checkout sumber. Suite seluruh checkout sumber mencatat 38 file gagal, 636 lolos, dan 6 dilewati; hasil tes 220 gagal, 5021 lolos, dan 42 dilewati. Empat error TypeScript saat itu berada pada tes inventaris/supplier dari pekerjaan lain. Hasil tersebut berasal dari checkout sumber yang memuat banyak perubahan lain; pemeriksaan paket web di checkout publikasi lolos tanpa error.

Suite seluruh proyek tidak dijalankan ulang di checkout publikasi. Pemeriksaan integrasi menggunakan 196 tes terarah, TypeScript seluruh paket web, ESLint, dan browser nyata. Detail log dan artefak lokal tersedia pada output/surat-jalan-publish-20261105 di checkout sumber dan output/surat-jalan-inline-20261105 di checkout publikasi.

## Batas lingkungan

- Indeks GitNexus masih usang dan FTS tidak tersedia; pemetaan tidak membuktikan seluruh simbol baru. Pemeriksaan sumber, tes API, browser, dan TypeScript melengkapi pemetaan tersebut. Nama repo GitNexus yang ambigu diatasi dengan path absolut.
- Headroom MCP digunakan pada awal/akhir sesi serta untuk keluaran besar. Penyimpanan lokal bekerja; proxy yang dikonfigurasi tidak terjangkau.
- Dependensi checkout publikasi disiapkan dari lockfile/cache lokal. Binary engine Prisma versi yang sama dipakai dari cache lokal untuk menghasilkan client sesuai schema checkout publikasi; tidak ada perubahan atau koneksi database.
- Tidak menjalankan production build maupun mengubah lifecycle dev server pada sesi publikasi.
- Dokumentasi disimpan di markdown-files pada checkout aktif karena drive D yang disebut panduan tidak tersedia.
