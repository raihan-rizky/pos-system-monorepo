# Supplier Shopping Regression Fixes Implementation Plan

**Goal:** Memperbaiki empat temuan review dan menjaga draft serta cache tetap konsisten.
**Architecture:** Cache pembelian memakai satu helper bersama untuk mutasi lama dan finalisasi baru. Modal memisahkan sesi permohonan dari pembaruan data latar belakang. Backend tetap membatasi pembelian pada produk aktif, tetapi mengizinkan penolakan produk asli yang nonaktif.
**Tech Stack:** React, TanStack Query, Prisma, Vitest.

## Batasan
- Kerjakan pada worktree supplier-shopping-merge dan pertahankan perubahan UI yang sudah ada.
- Jangan menjalankan build, mengganti dependency, atau mengelola lifecycle dev server.
- Persetujuan tetap satu transaksi; stok hanya berubah saat penerimaan.
- Drive D: yang disebut AGENTS.md tidak tersedia pada host ini; dokumentasi disimpan bersama worktree aktif.

## Langkah
- [x] Tulis tes gagal untuk sesi modal, invalidasi cache aktual dan mutasi lama, serta penolakan produk nonaktif.
- [x] Reset state saat ID permohonan berubah/ditutup; jangan menimpa draft pada refetch permohonan yang sama.
- [x] Gunakan helper invalidasi pembelian bersama untuk daftar belanja, finance, laporan, produk, dan varian satuan sesuai jenis mutasi.
- [x] Sertakan produk nonaktif dalam query finalisasi; validasi bahwa hanya produk asli dengan jumlah nol yang boleh nonaktif.
- [x] Jalankan regresi supplier/API, pemeriksaan TypeScript terarah, review ulang, dan perbarui catatan verifikasi.

## Tidak berubah
Izin, pergantian unit tanpa konversi jumlah, angka dan pembukuan pembelian, serta proses penerimaan tetap mengikuti spesifikasi fitur sebelumnya. Tidak ada alur panduan baru sehingga Bantuan dan katalog workflow tidak memerlukan perubahan.

## Verifikasi
- Tes baru gagal sebelum implementasi pada state lintas sesi, kehilangan draft pada refetch, cache pembelian/Keuangan, serta pembelian produk nonaktif.
- Regresi Supplier dan endpoint: 37 file, 165 tes lulus. Tes inspeksi string global tentang tidak adanya invalidasi Keuangan dihapus setelah digantikan tes callback hook dengan QueryClient nyata; kebijakan alur kuantitas lama dan finalisasi baru diuji terpisah.
- Review independen tidak menemukan regresi baru. Pemeriksaan browser nyata belum dijalankan; Chrome tidak memiliki halaman dev worktree yang aktif.
- TypeScript seluruh aplikasi dihentikan setelah tidak selesai; pemeriksaan file berubah beserta dependensinya lulus dengan 0 diagnostik.
- Setelah penguatan tes, 12 tes pada 3 file sesi/cache/repository kembali lulus. Review lifecycle UI memakai harness tanpa DOM; verifikasi browser nyata belum dilakukan.
- Headroom stats dipanggil awal/akhir dan compress digunakan, tetapi proxy localhost:8787 tidak tersambung.
