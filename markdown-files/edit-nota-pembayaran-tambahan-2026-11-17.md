# Pembayaran tambahan saat edit Nota Percetakan

## Tujuan

Edit nota Percetakan yang sudah diproses dapat mengubah rincian pembayaran awal dan mencatat uang baru yang diterima ketika nota dikoreksi. Penambahan item yang membuat total bertambah tidak lagi menghalangi pencatatan pembayaran baru dalam alur Edit Nota yang sama.

## Perilaku

- Pembayaran awal dapat dipindah ke metode lain atau dipecah menjadi beberapa metode. Total dan waktu penerimaan dari setiap pembayaran awal tetap sama.
- Pembayaran tambahan mewakili uang baru yang diterima saat koreksi. Nominal, metode, dan waktu saat disimpan dicatat sebagai riwayat pembayaran piutang.
- Total pembayaran bersih, sisa piutang, dan status transaksi dihitung ulang bersama perubahan nota. Bila pembayaran menutup seluruh tagihan, status menjadi Lunas; jika masih ada sisa, transaksi tetap DP.
- Pembayaran tambahan tidak boleh melebihi sisa tagihan setelah nota dikoreksi. Transaksi yang masih menunggu persetujuan belum dapat menerima pembayaran tambahan.
- Koreksi ditolak bila total nota baru di bawah pembayaran bersih yang telah diterima. Ketidaksesuaian riwayat pembayaran lama tidak diperbaiki otomatis.
- UI hanya menawarkan pembayaran baru kepada role dengan izin `customer.receivable:read` dan `customer.receivable.payment:create`. API memvalidasi kedua izin tersebut saat menyimpan. Jika isi nota menaikkan sisa piutang, role juga memerlukan `customer.receivable:update` sesuai aturan Edit Nota yang sudah ada.

## Alur pengguna

1. Buka nota Percetakan yang sudah diproses dari Riwayat atau Kasir > Percetakan, pilih Edit nota diproses, baca peringatan, lalu lanjutkan.
2. Pada Data transaksi, ubah metode pembayaran awal atau gunakan Pecah pembayaran awal. Jika menerima uang baru, tambahkan pembayaran, pilih metode dan nominal.
3. Tinjau total, jumlah terbayar, sisa piutang, status, dan pemakaian bahan, lalu simpan perubahan.

## Implementasi

- UI Edit Nota menampilkan alokasi awal, pembayaran baru, riwayat pembayaran piutang, status sebelum/sesudah, dan validasi nominal.
- Service menyimpan perubahan nota, alokasi pembayaran awal, log pembayaran baru, saldo pelanggan, dan status dalam satu transaksi database.
- Hak akses pembayaran tambahan diperiksa pada UI dan server. Tidak ada perubahan skema database.
- Bantuan, katalog workflow AI, dan Catatan Perubahan mengikuti langkah pengguna yang terbaru.

## Verifikasi

- Vitest: suite terfokus service, API, dan panduan (50 tes pada 3 file).
- Browser: `processed-edit.browser.mjs` pada lebar desktop dan ponsel.
- Pemeriksaan: `pnpm --filter @pos/web lint` (termasuk `tsc --noEmit`).
