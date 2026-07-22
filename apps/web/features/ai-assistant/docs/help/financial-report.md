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
7. **Pengeluaran:** Total pengeluaran manual dan Permohonan Belanja pada periode terpilih.
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
- Ada pengeluaran Permohonan Belanja dengan harga modal yang tidak tersedia saat approval. Nilainya dihitung Rp0 sehingga Pengeluaran dan Laba Bersih (Estimasi) dapat lebih rendah dari biaya sebenarnya.

## Ekspor Laporan Keuangan
Laporan keuangan dapat diekspor ke file Excel atau PDF berdasarkan periode Harian, Mingguan, 30 hari terakhir, atau Bulanan. Jurnal memberi label pada pengeluaran dari Permohonan Belanja dan menandai snapshot harga modal yang kosong. Panduan ekspor selengkapnya dapat dibaca di [FAQ](file:///d:/main_project/pos-system-monorepo/apps/web/features/ai-assistant/docs/help/faq.md#q21-bagaimana-cara-mengekspor-data-laporan-keuangan-ke-format-excel-atau-pdf).

Pak Teladan dapat menjalankan ekspor dengan fitur ekspor yang sama. Jika pengguna tidak menyebut periode atau format, default-nya adalah **30 hari terakhir** dan **PDF**. Permintaan seperti "analisis keuangan 30 hari" memeriksa seluruh bagian laporan—ringkasan, metode pembayaran, produk, kategori, sales, shift, loss stok, dan tren—sebelum memberikan temuan dan saran.

Ekspor dari chat langsung mengunduh file dan menampilkan kartu file yang dapat dipakai untuk **Download ulang**. Kartu tersebut juga menyertakan saran berbasis rasio pengeluaran, arus bersih, dan metode pembayaran dari laporan yang sama.
