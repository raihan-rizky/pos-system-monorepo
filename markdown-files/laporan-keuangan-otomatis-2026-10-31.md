# Laporan keuangan otomatis dan hutang pemasok

Tanggal: 2026-10-31 (WIB)
Pembaruan dokumentasi: 2026-11-01 (WIB)

## Penggunaan

Ekspor Excel bulanan di halaman Laporan Keuangan mengisi modal awal, piutang, hutang, dan inventaris secara otomatis. Tidak ada kolom laporan yang perlu diisi pengguna. Bulan berjalan menggunakan nilai inventaris saat ekspor; bulan sebelumnya menggunakan nilai pada akhir periode dalam waktu Asia/Jakarta.

Nilai inventaris mengikuti halaman Produk. Produk aktif di luar grup dihitung `max(stok, 0) × harga jual`; grup stok dihitung sekali dengan `max(stok dasar, 0) × harga jual satuan dasar`. Stok negatif tidak mengurangi nilai inventaris. Untuk grup dengan stok dasar positif harus ada tepat satu produk dasar aktif, dengan satuan yang sama seperti satuan dasar grup dan pengali satu. Jika produk dasar tidak ada atau lebih dari satu, nilai inventaris yang memuat grup tersebut belum tersedia. Stok dasar nol atau negatif menyumbang nol meskipun produk dasarnya belum unik. Modal awal berasal dari nilai inventaris akhir bulan sebelumnya. Perhitungan pada sheet LAP KEU mengikuti contoh:

- Total harta = modal awal + piutang.
- Jumlah harta = total harta − total hutang − nilai inventaris akhir.

Jika nilai inventaris historis belum tersedia, sel yang bergantung padanya tetap kosong dan laporan memberi keterangan. Kosong tidak diartikan sebagai nol. Data yang dimasukkan atau dibayar dengan tanggal lampau dapat mengubah saldo hutang laporan periode lampau ketika laporan diekspor ulang.

## Hutang pemasok

Pada halaman Keuangan, **Tambahkan Hutang** menyimpan nama pemasok, nominal dan tanggal hutang, jatuh tempo dan catatan opsional, serta pembayaran awal opsional. Tombol **Catat pembayaran** menerima pembayaran sebagian maupun pelunasan. Saldo dihitung dari nominal hutang dikurangi pembayaran sampai tanggal akhir laporan. Daftar dan laporan hanya memuat hutang yang dicatat untuk toko pengguna.

Pembayaran hutang adalah catatan pelunasan dan tidak otomatis menambah pengeluaran. Catat pengeluaran melalui alur pengeluaran yang ada bila diperlukan, dengan menghindari pencatatan ganda. Daftar hutang saat ini belum menyediakan pengubahan atau penghapusan catatan dan pembayaran. Izin baca, tambah, dan pembayaran mengikuti `expense:read`, `expense:create`, dan `expense:update`.

## Riwayat inventaris dan penerapan

Migrasi `20261031010000_financial_inventory_and_payables` membuat saldo dasar inventaris awal. Metode tersebut menghitung setiap satuan produk dan tidak dapat direkonstruksi dengan pasti untuk grup stok. Migrasi `20261101140000_inventory_group_valuation_v2` menyiapkan riwayat baru berdasarkan keadaan produk dan grup. Riwayat sebelum saldo dasar metode baru tetap disimpan, tetapi nilai periode yang tidak dapat dibuktikan ditampilkan belum tersedia. Pencadangan dan retensi riwayat inventaris diperlukan untuk menjaga saldo periode.

Sistem hanya memakai saldo historis jika perubahan sebelum batas bulan telah terbukti selesai sebelum batas tersebut. Pengamatan juga dilakukan ketika statistik halaman Produk dibuka dan ketika ada perubahan inventaris berikutnya. Penutupan otomatis terjadwal dirancang untuk mengamati perubahan yang telah selesai menjelang pergantian bulan WIB. Jika penutupan terlewat atau pengamatan tidak cukup untuk membuktikan keadaan pada batas bulan, saldo periode tetap belum tersedia; menjalankan pengamatan setelah batas tidak merekonstruksi keadaan pada batas yang terlewat.

Migrasi penilaian grup dan penutupan bulanan menyiapkan struktur dan fungsi basis data; fungsi penutupan belum memasang atau mengaktifkan Cron sendiri. Status migrasi dan jadwal pada setiap lingkungan harus diperiksa secara terpisah. Panduan konfigurasi, pemantauan, dan penanganan kegagalan ada di `panduan-operasional-penutupan-inventaris-2026-11-01.md`.

## Komponen terkait

- `apps/web/features/financial-report/services/monthly-balances.ts`: perhitungan saldo inventaris dan hutang periode.
- `apps/web/features/financial-report/helpers/monthly-workbook.ts`: rumus dan nilai dalam Excel.
- `packages/db/prisma/migrations/20261101150000_inventory_month_close/migration.sql`: fungsi penutupan dan penanda cutoff untuk pemantauan.
- `apps/web/features/keuangan/components/SupplierPayablesPanel.tsx`: pencatatan hutang dan pembayaran.
- `apps/web/app/api/finance/supplier-payables/`: endpoint berizin untuk daftar, pencatatan, dan pembayaran.
