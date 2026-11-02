# Perbaikan background impor stok

Tanggal: 2026-11-02 (Asia/Jakarta)

## Masalah

Pemrosesan impor dijalankan melalui `setTimeout` setelah respons API dikirim. Vercel tidak mendapat penanda bahwa pekerjaan tersebut masih perlu ditunggu. Job produksi berhenti pada fase `UPDATING_STOCK` tanpa menyimpan hasil, sementara progres 35% berasal dari perkiraan fase dan bukan jumlah baris yang sudah tersimpan.

## Perubahan

- Penjadwalan memakai `after()` dari Next.js agar pekerjaan ditunggu setelah respons API dikirim, termasuk ketika pengguna menutup panel atau halaman.
- Route pembuatan job memakai runtime Node.js dan `maxDuration = 300` detik. Anggaran pemrosesan job 260 detik; setiap percobaan transaksi dibatasi paling lama 240 detik dan mengikuti sisa anggaran.
- Job diklaim secara atomik dari `PENDING` ke `RUNNING`. Pemanggilan lain tidak menjalankan ulang job yang sudah diklaim.
- Saat status diminta, job `PENDING` atau `RUNNING` tanpa heartbeat selama enam menit ditandai `FAILED` dengan kode `JOB_EXECUTION_EXPIRED`. Job lama tidak diterapkan ulang secara otomatis.
- Selama transaksi berjalan, panel menampilkan **Sedang diproses**. Jumlah baris baru diperbarui setelah penyimpanan selesai.
- Batas transaksi diteruskan melalui service ke repository. Query bulk `UNNEST`, transaksi atomik, dan pelewatan stok yang tidak berubah tetap digunakan.
- Bantuan, katalog workflow AI Assistant, dan Catatan Perubahan diperbarui.

## Alur pengguna

1. Buka Produk > Impor > Impor Stok Massal, unggah berkas, lalu periksa pratinjau.
2. Klik Terapkan Impor Stok. Panel boleh ditutup; buka Progres Impor Stok untuk memantau hasil.
3. Jika proses terhenti dan status gagal muncul, periksa stok dan riwayat sebelum mengimpor ulang, terutama pada mode Tambah.

## Catatan pelaksanaan

- Tes, lint, type-check, build, dan server pengembangan tidak dijalankan sesuai instruksi pengguna. Mock suite yang sudah ada disesuaikan dengan pemanggilan database baru tanpa menjalankan suite.
- Tidak ada perubahan schema atau dependency dan tidak ada mutasi data produksi dalam perbaikan ini.
- `after()` tetap mengikuti batas waktu fungsi Vercel. Job yang terhenti karena batas platform akan terdeteksi saat status berikutnya diminta, bukan dilanjutkan otomatis.
- Analisis dampak menggunakan GitNexus lokal. Indeks tertinggal dari kode terbaru; cakupan diff dan pemanggil repository diperiksa langsung sebagai pelengkap.
- Headroom dipanggil, tetapi proxy kompresinya tidak terhubung. Keluaran dibatasi untuk peninjauan.
- Lokasi dokumentasi `D:\main_project\pos-system-monorepo\markdown-files` tidak tersedia. Dokumen disimpan di folder `markdown-files` worktree ini agar ikut dalam commit.
