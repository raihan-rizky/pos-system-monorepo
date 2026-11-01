# Impor stok: lewati tanpa perubahan dan pantau job

Tanggal: 2026-11-02 (Asia/Jakarta).

## Perilaku pengguna

- Di Produk > Impor > Impor Stok Massal, perbandingan stok memakai hasil akhir per produk: mode ADD menjumlahkan baris duplikat, sedangkan SET memakai baris terakhir.
- Baris tanpa perubahan stok dilewati. ADD dengan kuantitas nol juga dilewati. Bila semua baris dilewati, tombol penerapan tidak aktif.
- Pemeriksaan ulang saat penyimpanan memakai stok terkini setelah penguncian untuk Owner. Produk yang sudah sesuai tidak menghasilkan mutasi stok, log inventaris, item batch, atau permintaan persetujuan.
- Jika semua perubahan sudah tidak diperlukan saat penyimpanan, hasilnya selesai dengan nol perubahan dan tanpa batch/undo (`batchOperationId: null`).
- Setelah Terapkan Impor Stok, panel impor boleh ditutup. Tombol Impor menjadi Progres Impor Stok dan membuka panel progres terpisah.
- Job aktif ditemukan dari database sesuai toko, sehingga dapat dipantau kembali setelah halaman dimuat ulang saat job masih berjalan. Hasil terakhir tetap tersedia di halaman yang sama sampai panel hasil ditutup.
- Kegagalan memuat progres mempertahankan informasi terakhir dan menyediakan tombol Muat ulang. Impor Admin yang memiliki perubahan tetap menunggu persetujuan Owner.

## Implementasi

- Helper pratinjau menghitung stok akhir sebelum menandai baris dilewati, sehingga duplikat SET `15, 10` dengan stok awal `10` tidak mengubah stok menjadi `15`.
- Builder dampak tidak mengirim agregat ADD dengan selisih nol.
- Repository menyaring dampak tanpa perubahan sebelum membuat batch, log, dan item persetujuan. Ringkasan hanya menghitung produk yang berubah.
- `GET /api/inventory/bulk/import/commit/jobs/active` memerlukan izin `inventory:update` dan mencari job PENDING/RUNNING pada toko pengguna.
- Hook pelacakan di halaman Produk memantau job di luar siklus hidup panel unggah, memuat detail sampai selesai, dan memperbarui cache produk, statistik produk, log, serta dashboard setelah berhasil. Polling tetap mencoba lagi bila permintaan detail pertama gagal. Hasil job yang dipantau dipertahankan sampai ditutup, lalu job aktif berikutnya bisa dibuka.
- Tidak ada perubahan skema database atau dependensi.

## Pemeriksaan UNNEST

Pembaruan stok produk mandiri dan stok dasar grup sudah memakai PostgreSQL `UPDATE ... FROM unnest(...)` dengan parameter array. Sinkronisasi stok varian memakai satu UPDATE berdasarkan grup; log inventaris dan item batch memakai `createMany`.

Impor produk massal juga memakai UNNEST, dengan pemrosesan job per chunk. Impor stok tetap memakai transaksi massal yang sudah ada; pelacakan progres ini tidak mengubahnya menjadi worker per chunk atau menjamin kelanjutan proses setelah server dimatikan. Menutup panel/browser tidak membatalkan pekerjaan yang sudah dimulai di server.

## Verifikasi

- Tes regresi untuk duplikat SET, ADD nol, agregat ADD nol, pemulihan job dari database, dan penyaringan stok terkini sebelum batch/log.
- Tes panel progres mencakup job mandiri, hasil tanpa perubahan, dan alasan kegagalan.
- Tes browser: unggah dan mulai job, tutup panel, buka progres kembali, muat ulang halaman, tampilan seluler, Escape, kegagalan polling, pemulihan kegagalan detail pertama, hasil akhir, dan hasil job pertama tetap terlihat saat job berikutnya mulai. Fixture memakai data uji; screenshot changelog tidak berisi data pelanggan atau ringkasan keuangan.
- Jalankan `pnpm --filter @pos/web test features/bulk-stock-import app/api/inventory/bulk/import --reporter=dot`.
- Jalankan `node apps/web/features/bulk-stock-import/components/__tests__/bulk-stock-import-progress.browser.test.mjs`.
- Jalankan `pnpm --filter @pos/web type-check`.
- Hasil akhir: 91 tes fitur/API lulus, tes browser lulus, dan pemeriksaan TypeScript lulus. Review ulang tidak menemukan masalah Important/Critical yang tersisa.
- Verifikasi publikasi pada `main` terbaru: 169 tes fitur/API dan dokumentasi terkait lulus. Kegagalan dokumentasi di workspace awal tidak muncul pada checkout publikasi. Panduan impor stok sudah mencakup langkah kelima dan pemetaan visualnya.

## Catatan lingkungan

Path dokumentasi AGENTS.md pada drive D tidak tersedia; dokumen disimpan di `markdown-files` pada checkout aktif `C:\Projects\pos-system-monorepo`.

Headroom MCP dipanggil di awal/akhir dan untuk kompresi keluaran besar; proxy kompresinya tidak tersambung. Indeks GitNexus usang dan pembaruannya gagal saat worker mulai berjalan. Analisis impact telah dijalankan; hasil nama tertentu memiliki pemanggil yang tidak sesuai, sehingga ruang lingkup diperiksa langsung pada kode dan tes.
