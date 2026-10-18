# Pajak nota dan PPN penawaran

## Rancangan yang disetujui

- Pajak tersimpan pada transaksi dan memengaruhi total, sisa tagihan, serta laporan.
- Nota biasa menerima Pajak (%) dari jumlah setelah diskon. Nota mencetak persentase, bukan nominal pajaknya.
- Penawaran menerima PPN (%) pada Cetak Nota Penawaran. DPP Nilai Lain = jumlah setelah diskon × 11/12; PPN = DPP sebelum pembulatan × persentase. Pajak dibulatkan ke rupiah terdekat.
- Faktur sementara menampilkan Jumlah, DPP Nilai Lain, PPN, Total, dan terbilang sesuai total akhir. DPP dan PPN tampil sebagai nominal.
- Persentase 0 sampai 100, maksimal dua angka desimal. Nilai awal 0%.
- Metode pajak tersimpan dan dipertahankan saat penawaran dilanjutkan ke pembayaran. Mengganti format cetak tidak mengubah pajak.
- Perubahan disimpan sebelum mencetak, dan kegagalan penyimpanan menghentikan pencetakan.
- Pembayaran tercatat tetap dipertahankan; status, kembalian, dan piutang pelanggan disesuaikan secara atomik.
- Cetak browser dan PDF menggunakan nilai pajak yang sama. Transaksi lama tetap kompatibel.

## Rencana implementasi

**Goal:** Menambahkan pajak transaksi dengan dua dasar perhitungan dan tampilan nota yang sesuai.

**Architecture:** Helper murni untuk perhitungan, endpoint pajak terpisah dengan pemeriksaan hak akses dan transaksi database, serta hook dan field bersama untuk modal nota. Metadata pajak ditambahkan pada model Transaction.

**Tech stack:** TypeScript, React, Next.js, Prisma, PostgreSQL, Vitest, React PDF.

### 1. Perhitungan dan penyimpanan

- [x] Tambahkan tes gagal untuk perhitungan standar, DPP, diskon, pembulatan, validasi, dan perubahan saldo.
- [x] Implementasikan helper `calculateTransactionTax` dan metadata `taxRate`/`taxMethod` dengan migrasi aditif.
- [x] Tambahkan tes endpoint: hak akses toko, status batal, data tidak valid, konflik, piutang, serta kembalian.
- [x] Implementasikan GET/PATCH `/api/transactions/[id]/tax` dengan pembaruan atomik dan guard konkurensi.
- [x] Jalankan tes helper dan endpoint sampai lulus.

### 2. Nota dan kelanjutan penawaran

- [x] Tambahkan tes gagal untuk persentase pada nota biasa, nominal DPP/PPN pada penawaran, PDF, serta penghitungan ulang saat harga penawaran berubah.
- [x] Implementasikan hook dan field pajak bersama; simpan sebelum mencetak dan pertahankan input ketika gagal.
- [x] Tambahkan baris pajak pada ReceiptModal/DraftReceiptModal dan kedua template PDF.
- [x] Sesuaikan buildApprovalQuote agar menggunakan metode dan persentase tersimpan saat harga atau jumlah barang berubah.
- [x] Jalankan tes terkait hingga lulus.

### 3. Dokumentasi dan verifikasi

- [x] Perbarui Bantuan dan langkah katalog workflow cetak invoice.
- [x] Jalankan tes terarah, pemeriksaan TypeScript, pemeriksaan diff, dan review perubahan.
- [x] Verifikasi antarmuka menggunakan server pengembangan pengguna bila tersedia; jangan menjalankan build atau mengubah lifecycle server.

## Catatan lingkungan

Drive D: tidak tersedia. Dokumentasi disimpan pada folder markdown-files checkout aktif C:\Projects\pos-system-monorepo.
Headroom dipanggil sesuai petunjuk, tetapi proxy kompresi tidak terhubung. Gunakan keluaran pemeriksaan yang dibatasi.


## Hasil implementasi dan verifikasi

- Skill yang digunakan: brainstorming dan superpowers:test-driven-development. Uji perilaku baru diverifikasi gagal sebelum implementasi dan dijalankan ulang hingga lulus.
- Pajak nota biasa dihitung dari jumlah setelah diskon; PPN penawaran dari DPP sebelum pembulatan. Pembulatan pajak menggunakan pecahan bilangan bulat agar tarif desimal seperti 0,57% tidak kehilangan setengah rupiah.
- Contoh PDF: jumlah Rp706.000, DPP Rp647.167, PPN 12% Rp77.660, total Rp783.660. Kedua template PDF dirender dan diperiksa secara visual; masing-masing satu halaman dan nominal terbaca utuh.
- Kembalian yang telah diberikan tidak digunakan kembali untuk membayar tambahan pajak. Baris pembayaran mempertahankan alokasi tunai/transfer dan tetap konsisten saat pajak turun setelah pelunasan.
- Transaksi anonim yang memperoleh tambahan sisa tagihan ditolak dengan pesan memilih pelanggan. Pilih pelanggan saat membuat transaksi bila pajak akan menimbulkan piutang. Penawaran anonim tetap bisa diberi PPN sebelum disetujui.
- Pengguna yang memiliki surat_jalan.read tetap dapat mencetak nota tanpa memperoleh izin mengubah pajak. Izin perubahan mengikuti transaction.update atau transaction.draft.update.
- Pembaruan pajak, saldo pelanggan, dan pemeriksaan konflik berada dalam transaksi database. Persetujuan penawaran dan pembayaran piutang memakai guard terhadap perubahan total/pajak bersamaan.
- Migrasi 20261018120000_transaction_tax_rate telah diterapkan dan dicatat pada database development; Prisma Client telah dibuat ulang. Dua migrasi lama yang masih tertunda tidak diubah. Migrasi yang sama berhasil diterapkan ke production pada 18 Oktober 2026; smoke database production 1/1 lulus.
- Verifikasi akhir: 36 file / 412 tes terkait lulus, mencakup core, kasus batas, API, state transaksi, nota/PDF, approval, pembayaran piutang, dan laporan. Dua harness Chrome lulus: pajak nota dan nomor penawaran. Pemeriksaan TypeScript web/database dan git diff --check digunakan untuk validasi.
- Server development tidak tersedia pada port aplikasi saat diperiksa. Interaksi diverifikasi memakai harness Chrome dengan komponen aplikasi dan fixture API; server pengguna tidak dimulai atau dihentikan.
- Review kode independen dilakukan; temuan pada invoice anonim, konkurensi persetujuan, izin surat jalan, dan kembalian telah diperbaiki dengan uji regresi.
- Indeks GitNexus tersedia tetapi tidak mutakhir. Analisis dampak dijalankan pada simbol yang tersedia; simbol baru diperiksa melalui pemanggil dan tes. Pembaruan indeks gagal pada lingkungan ini.
- Perintah type-check root sempat memicu build lewat dependensi Turbo dan langsung dihentikan. Pemeriksaan berikutnya menggunakan tsc --noEmit langsung pada paket web/database.
