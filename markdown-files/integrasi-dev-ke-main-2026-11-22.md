# Rencana integrasi dev ke main

## Tujuan

Siapkan satu cabang integrasi dari commit `main` yang menggabungkan riwayat `dev` dan mempertahankan perbaikan yang sudah dirilis. Cabang itu menjadi sumber PR ke `main` setelah pemeriksaan aplikasi dan latihan migrasi selesai.

## Titik awal

- `main` pada `a71e0f52d6211cf59a1d5b9b8241b8c5eafbedd5`
- `dev` pada `5dc44fb65895c17caf533f11a0ea6760a1125642`
- Commit leluhur bersama `17be9ee9cf4e806ea49a4858db9fe4c973e39eeb`

Simulasi Git menemukan 65 berkas konflik. CI lulus pada kedua commit secara terpisah. Periksa kembali posisi kedua cabang sebelum memulai penggabungan dan sebelum PR digabung. Jika salah satu ujung cabang bergerak, tinjau commit tambahan dan ulangi pemeriksaan pada pasangan commit yang baru. Gabungkan `dev` ke cabang integrasi yang mengikuti garis induk pertama dari `main`.

## Rekonsiliasi konflik

1. **Prisma dan migrasi.** Skema `dev` menambah 254 baris terhadap `main` tanpa penghapusan. Gunakan skema tersebut setelah memeriksa relasi, indeks, dan kecocokannya dengan SQL. Pertahankan nama dan checksum migrasi yang sudah tercatat. Verifikasi delapan migrasi dari daftar perbedaan Git terhadap riwayat migrasi di lingkungan tujuan. Pertahankan kontrol pembersihan bukti dalam keadaan nonaktif sesuai migrasi.
2. **Keuangan dan Sales.** Gunakan satu perhitungan penerimaan untuk tanggal WIB yang sama. Pertahankan cara `main` membaca transaksi, pembayaran, dan refund dalam snapshot database yang konsisten. Integrasikan kategori laporan, alokasi transfer, dan rincian piutang dari `dev`. Pertahankan kontrak respons tiap halaman. Uji bahwa DP bertanggal mundur, pelunasan, refund, dan pembatalan tercatat pada hari dan kategori yang sesuai. Cocokkan jumlah per kategori dengan total dan pastikan satu pembayaran dihitung satu kali.
3. **Giro dan hutang pemasok.** Pertahankan pengakuan giro pembelian pada bulan jatuh tempo dan aturan WIB untuk pembayaran bertanggal mendatang. Gabungkan ledger hutang manual dari `dev`. Pembayaran tercatat memakai tanggal aktual. Pada jatuh tempo, ledger memproyeksikan pelunasan otomatis sebesar sisa hutang dan memakai penanda asal pembayaran. Hutang tanpa jatuh tempo tetap terbuka sampai dibayar. Uji nominal parsial, koreksi, pengulangan permintaan, dan perbedaan versi ledger.
4. **RBAC dan POS.** Pertahankan pemulihan sesi dan draft kasir. Gabungkan pemeriksaan halaman, izin resource, dan identitas toko pada API. Pada perubahan hutang, periksa kembali izin di dalam transaksi database. Gunakan katalog offline sesuai identitas kasir, toko, dan fingerprint izin. Cocokkan katalog izin, data default, API, dan UI. Uji pengguna berizin, izin dicabut, pergantian toko, dan kegagalan verifikasi sesi atau izin.
5. **CI dan kemasan runtime.** Pertahankan pemilihan runtime produksi dan pengujian kemasan dari `main`. Tambahkan pemeriksaan migrasi dan penyimpanan pemeriksaan penerimaan dari `dev`. Periksa perilaku PR dan push cabang tujuan serta kondisi untuk cabang khusus pemulihan transaksi.
6. **Catatan Perubahan, Bantuan, dan AI Assistant.** Gabungkan entri berdasarkan ID, pertahankan tanggal WIB dan revisi yang sudah dipublikasikan, dan periksa bahwa ilustrasi tersedia. Selaraskan Bantuan, katalog workflow, dan pengujian UI dengan perilaku aplikasi hasil integrasi.

Gunakan leluhur bersama dan kedua ujung cabang untuk meninjau setiap hunk. Jalankan analisis dampak sebelum mengubah simbol. Pertahankan cakupan pengujian kedua cabang dan tambahkan kasus regresi ketika keduanya belum mencakup interaksi yang digabungkan.

## Verifikasi cabang integrasi

- Pastikan semua konflik terselesaikan, dua commit acuan menjadi leluhur cabang integrasi, dan perubahan di luar hasil penggabungan sesuai keputusan di atas. Jalankan `git diff --cached --check` dan pemeriksaan cakupan GitNexus sebelum commit.
- Jalankan `pnpm type-check`, `pnpm test`, dan pengujian E2E yang relevan. Periksa kasus Sales dan Keuangan, giro pada batas hari WIB, hutang manual dan alokasi transfer, koreksi pembelian, pemulihan transaksi void dan stok, serta POS offline. Jalankan POS CI pada PR.
- Latih migrasi pada salinan PostgreSQL produksi yang terisolasi. Bandingkan riwayat dan checksum migrasi, fingerprint, hak akses, dan total representatif sebelum serta sesudah migrasi. Catat jumlah dan total hutang lama yang memperoleh pelunasan otomatis dan tanggal pengakuannya. Uji pembacaan data lama serta pengulangan operasi.

## Persiapan rilis produksi

Prosedur cutover yang ada menargetkan empat migrasi di lingkungan development. Siapkan prosedur produksi untuk delapan migrasi yang belum ada di `main` dan verifikasi daftar itu terhadap database produksi. Gunakan konfigurasi lingkungan produksi di `pos-vps` pada pelaksanaan yang disetujui.

Sebelum penggabungan PR, siapkan urutan cutover yang menyelaraskan backup yang sudah diuji pulih, penghentian sementara penulisan, migrasi, verifikasi fingerprint, dan aktivasi runtime dengan auto-deploy. Pengelola rilis mensyaratkan fingerprint yang kompatibel untuk rollback aplikasi. Uji jalur pemulihan yang berlaku jika perubahan skema menghalangi rollback aplikasi. Setelah rilis dijalankan, pantau CI, deployment, dan pemeriksaan kesehatan hingga kandidat aktif.
