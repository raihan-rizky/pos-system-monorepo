# Implementasi Koreksi Daftar Belanja

Tanggal rilis: 2026-11-07 WIB

Koreksi daftar belanja kini menyediakan pratinjau dan audit perubahan untuk daftar yang sudah diproses. Pengguna berizin dapat mengubah jumlah diterima, harga, kebutuhan, pesanan, barang, pemasok, pembayaran, tanggal usaha, serta pilihan HPP dan harga jual katalog. Perubahan stok dan keuangan diterapkan atomik; sumber penerimaan lama dipertahankan.

## Alur pengguna

1. Buka **Supplier > Daftar Belanja**, pilih **Tindakan lainnya > Edit daftar**, lalu isi alasan.
2. Periksa pratinjau stok, total berdasarkan barang diterima, periode laporan, pembayaran, dan peringatan kelebihan pembayaran.
3. Pilih **Simpan perubahan**, lalu gunakan badge **Diubah** atau **Stok berubah** untuk membuka riwayat.

## Integritas data

Koreksi memakai versi editor dan kunci idempotensi. Stok, audit, pembelian, pengeluaran, utang, alokasi pembayaran, dan status penerimaan diproses dalam transaksi yang sama. Penghapusan barang menggunakan `removedAt` agar sumber penerimaan dan pembalikan stok tetap dapat dilacak. Migrasi `20261106103000_shopping_request_correction` diterapkan ke dev dan produksi pada 2026-11-07 setelah migration history jadwal pembayaran dan izin harian diselaraskan.

## Verifikasi

- API dan RBAC koreksi: 19 tes terarah lulus.
- UI koreksi: 7 tes lulus.
- Regresi PostgreSQL stok, penerimaan, rollback, pengulangan, dan audit: 41 tes lulus.
- TypeScript web dan `git diff --check` lulus.

Catatan: jadwal pembayaran campuran Transfer/Giro dari migrasi terpisah harus tetap diperlakukan sebagai sumber pembayaran tersimpan dan tidak boleh dinormalisasi menjadi satu metode tanpa alokasi yang eksplisit.
