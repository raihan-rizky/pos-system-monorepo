# Laporan Keuangan (Financial Report)

## Lokasi dan Fungsi

Buka sidebar **Keuangan > Laporan Keuangan** (`/financial-report`) untuk melihat analisis finansial toko secara mendalam. 

### Rentang Waktu (Periode)
Anda dapat memilih rentang analisis menggunakan preset berikut:
- **Hari ini**
- **7 hari terakhir**
- **30 hari terakhir**
- **Bulan ini**
- **Rentang tanggal manual** (hingga maksimal 366 hari)

*Catatan: Laporan hanya memproses transaksi yang berstatus **COMPLETED (Lunas)** dan **DP**.*

## Metrik Utama yang Ditampilkan
1. **Omzet (Revenue):** Total nilai penjualan kotor yang tercatat.
2. **Uang Terkumpul:** Jumlah nominal pembayaran kas yang sudah benar-benar diterima (tidak termasuk piutang yang belum terbayar).
3. **Laba Kotor (Gross Profit):** Omzet dikurangi HPP (Harga Pokok Penjualan) dan Loss Stok (kehilangan barang).
4. **Margin Laba:** Persentase keuntungan kotor dibandingkan omzet.
5. **Outstanding DP:** Sisa piutang/tagihan tempo pelanggan yang belum tertagih.
6. **Loss Stok:** Nilai kerugian akibat stok barang yang hilang, rusak, atau menyusut.
7. **Pengeluaran:** Total pengeluaran manual dan Pembelian Barang pada periode terpilih.
8. **Laba Bersih (Estimasi):** Laba Kotor dikurangi seluruh Pengeluaran. Angka ini adalah estimasi operasional, bukan laba akrual formal atau bukti pembayaran supplier.

## Analisis Detail
- **Tren Omzet, Cost, & Laba Kotor:** Grafik perbandingan harian.
- **Metode Pembayaran:** Distribusi pembayaran yang digunakan pelanggan (Cash, Transfer, QRIS, dll).
- **Loss Stok per Kategori:** Detail kerugian barang rusak/hilang berdasarkan kategori produk.
- **Sales Teratas & Produk Terlaris:** Peringkat penjualan berdasarkan performa agen sales dan produk terpopuler.
- **Rekonsiliasi Shift:** Laporan kecocokan uang di laci kasir pada akhir shift.

## Peringatan Penting (System Alerts)
Sistem akan memunculkan peringatan jika:
- Ada produk terjual yang belum diisi nilai **HPP**-nya (karena item tanpa HPP akan menyumbang Gross Profit senilai 0).
- Ada alasan **Loss Stok** (barang rusak/hilang) yang belum diklasifikasikan dengan benar.
- Ada data lama Daftar Belanja dengan harga modal yang tidak tersedia saat approval. Nilainya dihitung Rp0 sehingga Pengeluaran dan Laba Bersih (Estimasi) dapat lebih rendah dari biaya sebenarnya.

## Ekspor Laporan Keuangan

### Excel bulanan tujuh sheet

Klik **Ekspor** di halaman Laporan Keuangan. Pilihan awal **Laporan bulanan · Excel 7 sheet** menyediakan pilihan bulan dan tahun, termasuk bulan lampau. Periode menggunakan WIB; bulan berjalan memuat data sampai hari ini dan bulan mendatang belum dapat dipilih.

Klik **Unduh Excel** untuk mendapatkan **LAP KEU**, **BERSIH**, **nama bulan**, **RC nama bulan**, **RP nama bulan**, **PENGELUARAN BELANJA**, dan **PIUTANG & HUTANG**. Sheet Gaji dan Pengeluaran Non Teladan tidak disertakan, tetapi biaya gaji yang tercatat tetap masuk pengeluaran.

Isi **modal awal** sendiri di sel kuning **D8** pada LAP KEU. Rumus memperbarui hasil yang bergantung pada modal awal. Persediaan akhir dan hutang pemasok yang belum punya sumber historis lengkap tetap kosong dengan catatan; sel kosong bukan nol. Ringkasan kekayaan menunggu input lengkap.

Penerimaan dan pengeluaran memakai basis kas. Piutang mencakup saldo invoice dan piutang manual pada akhir periode; rincian belanja sudah masuk pengeluaran dan tidak dijumlahkan dua kali. Penerimaan yang belum dikenali kategorinya ditampilkan sebagai **Perlu pemetaan** dan tetap dihitung pada total. Biaya belum lengkap serta keterbatasan riwayat perubahan nominal diberi catatan dalam file.

Jika gagal, dialog menampilkan pesan dan tombol **Coba lagi** tanpa menghapus pilihan periode. Pengunduhan berikutnya dapat dilakukan setelah proses sebelumnya selesai.

### Jurnal transaksi dan ekspor dari chat

Pilih **Jurnal transaksi · Excel / PDF** di dialog untuk format jurnal yang sudah tersedia.
Laporan keuangan dapat diekspor ke file Excel atau PDF berdasarkan periode Harian, Mingguan, 30 hari terakhir, atau Bulanan. Jurnal memberi label pada pengeluaran dari Pembelian Barang; data otomatis lama tetap berlabel Daftar Belanja (Legacy). Panduan ekspor selengkapnya dapat dibaca di [FAQ](file:///d:/main_project/pos-system-monorepo/apps/web/features/ai-assistant/docs/help/faq.md#q21-bagaimana-cara-mengekspor-data-laporan-keuangan-ke-format-excel-atau-pdf).

Pak Teladan dapat menjalankan ekspor dengan fitur ekspor yang sama. Jika pengguna tidak menyebut periode atau format, default-nya adalah **30 hari terakhir** dan **PDF**. Permintaan seperti "analisis keuangan 30 hari" memeriksa seluruh bagian laporan—ringkasan, metode pembayaran, produk, kategori, sales, shift, loss stok, dan tren—sebelum memberikan temuan dan saran.

Ekspor dari chat tidak mengunduh file otomatis. Pak Teladan menampilkan kartu file dengan tombol **Download PDF/Excel**; setelah unduhan pertama berhasil, tombol berubah menjadi **Download ulang** dan kartu menyertakan saran berbasis laporan yang sama. Role OWNER juga memiliki quick prompt **Rekap finansial bulanan**.
