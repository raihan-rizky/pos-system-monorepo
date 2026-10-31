# Laporan keuangan otomatis dan hutang pemasok

Tanggal: 2026-10-31 (WIB)

## Penggunaan

Ekspor Excel bulanan di halaman Laporan Keuangan mengisi modal awal, piutang, hutang, dan inventaris secara otomatis. Tidak ada kolom laporan yang perlu diisi pengguna. Bulan berjalan menggunakan nilai inventaris saat ekspor; bulan sebelumnya menggunakan nilai pada akhir periode dalam waktu Asia/Jakarta.

Nilai inventaris mengikuti halaman Produk: jumlah `max(stok, 0) × harga jual` untuk produk aktif. Stok negatif tidak mengurangi nilai inventaris. Modal awal berasal dari nilai inventaris akhir bulan sebelumnya. Perhitungan pada sheet LAP KEU mengikuti contoh:

- Total harta = modal awal + piutang.
- Jumlah harta = total harta − total hutang − nilai inventaris akhir.

Jika nilai inventaris historis belum tersedia, sel yang bergantung padanya tetap kosong dan laporan memberi keterangan. Kosong tidak diartikan sebagai nol. Data yang dimasukkan atau dibayar dengan tanggal lampau dapat mengubah saldo hutang laporan periode lampau ketika laporan diekspor ulang.

## Hutang pemasok

Pada halaman Keuangan, **Tambahkan Hutang** menyimpan nama pemasok, nominal dan tanggal hutang, jatuh tempo dan catatan opsional, serta pembayaran awal opsional. Tombol **Catat pembayaran** menerima pembayaran sebagian maupun pelunasan. Saldo dihitung dari nominal hutang dikurangi pembayaran sampai tanggal akhir laporan. Daftar dan laporan hanya memuat hutang yang dicatat untuk toko pengguna.

Pembayaran hutang adalah catatan pelunasan dan tidak otomatis menambah pengeluaran. Catat pengeluaran melalui alur pengeluaran yang ada bila diperlukan, dengan menghindari pencatatan ganda. Daftar hutang saat ini belum menyediakan pengubahan atau penghapusan catatan dan pembayaran. Izin baca, tambah, dan pembayaran mengikuti `expense:read`, `expense:create`, dan `expense:update`.

## Riwayat inventaris dan penerapan

Migrasi `20261031010000_financial_inventory_and_payables` membuat saldo dasar inventaris untuk setiap toko saat migrasi diterapkan. Trigger basis data mencatat perubahan nilai ketika produk dibuat, diubah, atau dihapus, sehingga saldo akhir periode setelah saldo dasar dapat dihitung kembali. Saldo sebelum saldo dasar tidak direkonstruksi; nilai tersebut tetap belum tersedia. Pencadangan dan retensi tabel saldo dasar dan perubahan inventaris diperlukan untuk menjaga riwayat.

Trigger mencatat waktu perubahan produk dalam transaksi. Jika sebuah transaksi melintasi pergantian bulan, waktu perubahan dapat berbeda dari waktu transaksi selesai; saldo pada batas bulan tersebut dapat memerlukan peninjauan.

Migrasi ini telah diterapkan dan diverifikasi pada basis data pengembangan dan produksi pada 2026-11-01 WIB. Trigger aktif dan jumlah saldo dasar beserta perubahannya cocok dengan nilai inventaris produk aktif. Nilai sebelum saldo dasar tetap belum tersedia. Migrasi lain yang masih tertunda tidak dijalankan.

## Komponen terkait

- `apps/web/features/financial-report/services/monthly-balances.ts`: perhitungan saldo inventaris dan hutang periode.
- `apps/web/features/financial-report/helpers/monthly-workbook.ts`: rumus dan nilai dalam Excel.
- `apps/web/features/keuangan/components/SupplierPayablesPanel.tsx`: pencatatan hutang dan pembayaran.
- `apps/web/app/api/finance/supplier-payables/`: endpoint berizin untuk daftar, pencatatan, dan pembayaran.
