# Edit nota percetakan diproses

Tanggal: 2026-10-21 (Asia/Jakarta). Desain disetujui melalui chat, termasuk sinkronisasi transaksi, stok, piutang, dan penolakan total di bawah pembayaran. Tambahan pengguna: RBAC default Owner.

## Desain

- Izin khusus `printing_receipt.processed.update`; default Owner, role lain harus diberi izin eksplisit di RBAC. API memeriksa izin ini.
- Tombol Edit nota diproses membuka dialog peringatan merah dan persetujuan dampak. Setelah setuju, isian menjadi draf lokal, tanpa autosave. Banner tetap terlihat. Pengguna dapat membatalkan.
- Tinjau perubahan menampilkan total, pembayaran bersih tercatat, piutang, dan pemakaian bahan sebelum/sesudah. Konfirmasi eksplisit menyimpan semuanya dalam satu transaksi database.
- Server menghitung ulang harga dari dokumen, mempertahankan diskon/pajak yang berlaku dan riwayat pembayaran, mengoreksi stok beserta jurnalnya, dan mengubah status lunas/DP sesuai saldo. Status menunggu persetujuan tetap menunggu, tanpa mutasi stok.
- Kembalian yang sudah diberikan dikurangkan dari uang masuk untuk menentukan pembayaran bersih. Total baru di bawah pembayaran bersih ditolak; pengembalian dana memakai alur terpisah.
- Cegah pembaruan basi, lintas toko, dan transaksi batal/refund. Tidak memproses pembayaran kedua kali. Perubahan pelanggan berpiutang harus tervalidasi. Tinjauan mengikat versi transaksi agar pembayaran bersamaan memaksa tinjauan ulang.

## Rencana implementasi

1. [x] TDD RBAC: resource dan modul pengaturan baru; default Owner; pemberian izin eksplisit; guard API.
2. [x] TDD layanan koreksi: hitung tinjauan, snapshot/versi, kunci transaksi, koreksi stok dan jurnal atomik, pembaruan nota dan transaksi, pembayaran/piutang, kegagalan dan konflik.
3. [x] TDD UI: persetujuan, draf lokal, tinjauan, pembatalan, larangan autosave, penyegaran data.
4. [x] Perbarui Bantuan, katalog workflow, changelog, dokumentasi; tes regresi, lint, type-check, browser desktop/mobile dan keyboard.

## Catatan eksekusi

- Checkout memiliki perubahan pengguna sebelumnya; pertahankan semuanya dan jangan commit/push tanpa instruksi.
- Tidak menjalankan build atau mengubah lifecycle server dev.
- Headroom stats digunakan; kompresi kode ditolak otomatis karena tujuan ekspor belum terverifikasi. Gunakan pembacaan lokal terbatas.
- GitNexus impact fungsi RBAC: CRITICAL, 17 pemanggil langsung / 44 proses. Simbol percetakan belum terindeks, pemeriksaan referensi lokal melengkapi dampak.
- Folder D:\main_project\pos-system-monorepo\markdown-files tidak tersedia pada host; dokumen disimpan pada checkout aktif C:\Projects\pos-system-monorepo\markdown-files.

## Hasil implementasi dan penggunaan

1. Buka Kasir > Percetakan, pilih nota diproses, lalu klik **Edit nota diproses**. Baca dialog merah, centang pemahaman dampak, lalu **Tetap edit nota**. Izin default hanya Owner; delegasi melalui Pengaturan > RBAC > Edit nota percetakan diproses (`printing_receipt.processed:update`).
2. Koreksi isian nota dan hubungan bahan. Nomor transaksi dan identitas pelanggan tetap; nama cetakan bisa dikoreksi. Perubahan tidak tersimpan otomatis. **Batal edit** meminta konfirmasi jika ada perubahan.
3. Klik **Tinjau perubahan** untuk membandingkan subtotal, total, pembayaran bersih, sisa piutang, dan pemakaian bahan. Klik **Simpan dan perbarui transaksi** untuk menyimpan semuanya bersama. Pembayaran atau dokumen berubah sejak tinjauan mengharuskan tinjauan ulang.

Penyimpanan memakai endpoint `POST/PATCH /api/printing-receipts/[id]/processed`. Review dan save memeriksa izin aktual di server, batas toko, revisi, status, dan hash snapshot. Save mengunci pelanggan, transaksi, nota, lalu grup dan produk stok. Koreksi bahan mengembalikan pemakaian lama sebelum pemakaian baru dalam transaksi yang sama dan menambahkan jurnal bertanda IN/OUT untuk pembatalan berikutnya. Tidak mengizinkan stok negatif baru. HPP tersimpan tetap untuk material yang sama; koreksi keterangan saja mempertahankan item asli.

Jika total berubah, pembayaran bersih adalah `amountPaid - change` dan nilai agregat pembayaran dinormalisasi dengan kembalian nol, sesuai alur koreksi pajak yang ada. Baris riwayat pembayaran tidak dihapus/diubah. Total di bawah pembayaran bersih ditolak untuk diselesaikan melalui refund. Status DP/COMPLETED mengikuti saldo, sementara PENDING_APPROVAL tetap menunggu dan tidak membukukan stok/piutang.

## Verifikasi

- Tes baru diamati gagal sebelum implementasi: RBAC/guard, layanan dan route, lembar koreksi, browser, penghitungan total pratinjau, input ekstrem, dan penyegaran cache piutang/stok/laporan.
- Regresi gabungan: **30 file, 355 tes lulus** (`output/processed-edit-regression-final.log`). Backend khusus **24 tes lulus**, termasuk rollback, shared stock group, HPP lama, stok pecahan kecil, konflik pembayaran, dan reversal jurnal.
- Chrome desktop **1280 px** dan mobile **390 px**: alur koreksi, peringatan/checkbox, tanpa autosave, bahan stok, galat review/save, simpan, buang perubahan, fokus keyboard, pencabutan izin, input ekstrem, dan invalidasi cache lulus (`output/processed-receipt-browser-final.log`). Regresi draft/checkout biasa lulus pada kedua ukuran (`output/processed-receipt-workspace-regression.log`).
- Lint berkas fitur lulus (`output/processed-edit-lint-final.log`). Pemeriksaan tipe memiliki hambatan di perubahan layout percetakan lain (`findLastIndex`/tipe ekspor `MeasuredReceiptRow`); pemeriksaan tanpa declaration dan dengan ES2023 juga menemukan tes `column-resize.test.ts` dari perubahan lain yang mengacu pada `header`/`columnWidths` yang belum ada. Tidak mengubah berkas tersebut untuk fitur ini (`output/processed-receipt-types-scoped.log`).
- Bantuan/workflow/changelog: 26 tes katalog dan 52 tes visual/arsip lulus. Screenshot peringatan asli dengan data contoh: `apps/web/public/images/changelog/edit-nota-diproses.png`; tidak menampilkan ringkasan keuangan.
- Review terpisah untuk RBAC, UI, backend selesai; tiga temuan backend diperbaiki dan ditinjau ulang.
