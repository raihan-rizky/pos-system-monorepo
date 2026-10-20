# Piutang manual pelanggan

Tanggal rilis: 2026-10-20 (Asia/Jakarta / WIB).

## Tujuan

Mencatat utang lama atau tagihan pelanggan di luar kasir, tanpa membuat transaksi penjualan, order, atau pergerakan stok. Piutang manual disimpan terpisah dari invoice DP/Tempo dan tetap menjadi riwayat setelah lunas.

Pelanggan yang memiliki riwayat piutang manual tidak dapat dihapus, termasuk yang sudah lunas. Riwayat piutang dan pembayaran tetap tersimpan.

## Alur penggunaan

1. Buka **Pelanggan**, pilih detail pelanggan yang sudah terdaftar, lalu temukan **Piutang Manual**.
2. Klik **Tambah Piutang**. Pelanggan mengikuti detail yang sedang dibuka.
3. Isi **Nominal piutang** lebih dari nol dengan maksimal dua desimal, **Tanggal utang** paling lambat hari ini dalam WIB, serta **Tanggal jatuh tempo** sama dengan atau setelah tanggal utang. **Catatan** opsional. Klik **Simpan Piutang**.
4. Periksa catatan pada detail pelanggan atau bagian **Piutang Manual** di tab **Piutang**. Cari berdasarkan pelanggan atau catatan dan pilih status **Belum lunas** atau **Semua piutang**.
5. Pada catatan yang dituju, klik **Bayar Piutang Manual**. Isi **Nominal pembayaran** lebih dari nol hingga maksimal sisa piutang. Pilih satu **Metode pembayaran**: Tunai (`CASH`), Debit (`DEBIT`), Kartu Kredit (`CREDIT`), QRIS, atau Transfer (`TRANSFER`). Tambahkan catatan bila perlu, lalu **Simpan Pembayaran**.
6. Buka **Riwayat pembayaran** untuk memeriksa cicilan dan pelunasan. Pilih **Semua piutang** untuk melihat kembali catatan yang sudah selesai.

Invoice DP/Tempo tetap dibayar melalui **Bayar Piutang** atau **Bayar Cicilan**, dengan dukungan beberapa metode pembayaran. Setiap pembayaran manual memakai satu metode untuk satu catatan piutang.

## Izin akses

- `customer.read`: melihat daftar dan detail piutang manual.
- `customer.update`: membuat piutang dan mencatat pembayaran.

## Catatan teknis dan verifikasi

- Migrasi database `20261020140000_customer_receivables` telah diterapkan pada database development (DEV).
- Prisma Client telah dibuat ulang setelah perubahan schema.
- Pengujian API, layanan piutang, rekap pelanggan, Bantuan, workflow AI, dan catatan perubahan pada salinan isi commit: 283 pengujian dalam 43 file lulus.
- Pengujian browser UI piutang manual dan pemeriksaan TypeScript lulus.
- Pengujian dokumentasi memverifikasi label filter, pembedaan pembayaran invoice dan manual, serta pembatasan hapus pelanggan dengan riwayat piutang.
- Pengujian tambahan mencakup batas nominal/tanggal, isolasi toko, retry UUID, konflik pembayaran, penghapusan pelanggan, paginasi, dan kegagalan layanan tanpa membocorkan rincian database.
- Pengujian browser mencakup navigasi keyboard, fokus validasi, tampilan HP, batas catatan, pemulihan daftar, serta retry penyimpanan/pembayaran dengan UUID yang konsisten.
- Regresi rekap memastikan piutang `0,80` yang dibayar `0,10 + 0,70` terhitung lunas menggunakan perbandingan sen, termasuk nilai pelunasan dan rata-rata harinya.
- Suite seluruh repositori sempat dijalankan lalu dihentikan setelah regresi area terdampak lulus; hasil 283 tes tersebut bukan klaim seluruh tes repositori lulus.
- Headroom dipanggil sesuai instruksi, tetapi pengiriman diff ditolak pemeriksaan otomatis karena risiko ekspor kode privat. Review dilanjutkan dengan potongan lokal terbatas.

## Dokumentasi terkait

- Bantuan: panduan Owner tentang piutang, Admin tentang pelanggan, dan Kasir tentang pembayaran piutang.
- AI Assistant: FAQ Q41 untuk pencatatan piutang manual dan Q15 untuk pembayaran invoice maupun manual.
- Catatan Perubahan: `customer-manual-receivables`, revision `1`, tanggal `2026-10-20`.
- Gambar rilis: `apps/web/public/images/changelog/piutang-manual-pelanggan.png`, tangkapan layar UI dengan data contoh.

## Catatan lokasi

Lokasi dokumentasi `D:\main_project\pos-system-monorepo\markdown-files` pada instruksi repositori tidak tersedia di workspace ini. Dokumen disimpan di direktori `markdown-files` repositori aktif, `C:\Projects\pos-system-monorepo`.
