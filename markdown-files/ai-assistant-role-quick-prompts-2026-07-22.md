# AI Assistant Role Quick Prompts

Tanggal: 22 Juli 2026

## Ringkasan

Quick prompt Pak Teladan sekarang memakai catalog terstruktur yang menghubungkan setiap label prompt ke tool AI Assistant. Setiap role hanya menerima prompt yang tool-nya memang tersedia untuk role tersebut.

Dua quick prompt Owner yang sudah memakai glow effect tidak diubah:

- `Rekap finansial bulanan`
- `Rekap pelanggan bulanan`

Keduanya tetap tampil paling awal untuk role Owner.

## Mapping Utama

- Owner: export dan analisis laporan, ringkasan penjualan, produk terlaris, stok rendah, transaksi pending, pencarian supplier, dan bantuan RBAC.
- Admin: export dan analisis laporan, tambah produk, supplier, sales, pengeluaran, transaksi pending, dan bantuan RBAC.
- Inventory: stok rendah, stok dan harga produk, update stok, penerimaan barang, dan bantuan stock opname.
- Cashier: stok dan harga produk, transaksi pending, tambah pelanggan, catat pengeluaran, mulai shift, dan bantuan transaksi.
- Sales: pencarian pelanggan, piutang, rekap transaksi pelanggan, export rekap pelanggan, tambah pelanggan, dan bantuan transaksi.

Role yang tidak dikenali hanya mendapat quick prompt bantuan sistem agar tidak diarahkan ke tool data yang belum tentu boleh dipakai.

## Struktur Teknis

Catalog berada di `features/ai-assistant/helpers/quick-prompt-catalog.ts`. Setiap entry menyimpan:

- label yang tampil ke user;
- nama tool tujuan;
- status glow khusus prompt laporan Owner.

Test contract memverifikasi bahwa tool tujuan tersedia dan mengizinkan role terkait. Ini seperti daftar menu per divisi: kasir tidak ditawari pekerjaan gudang, sementara Inventory langsung mendapat shortcut ke penerimaan dan update stok.

## Validasi

- Catalog role-to-tool diuji untuk Owner, Admin, Inventory, Cashier, dan Sales.
- Prompt glow Owner diuji agar label dan urutannya tidak berubah.
- Rendering Assistant Widget diuji untuk prompt khas setiap role.
- Bantuan user-facing diperbarui agar menjelaskan perilaku quick prompt berbasis role.
