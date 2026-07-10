# Implementasi Edit Cepat Produk di Keranjang POS - 2026-07-11

## Ringkasan

Keranjang POS kini selalu menampilkan Harga Normal, Harga Agen, dan Harga Dinas untuk setiap produk. Pengguna dengan permission RBAC `product:update` dapat mengaktifkan Edit Cepat untuk membuka dua tindakan: Ubah Produk dan Ubah Harga Produk.

## Perilaku Utama

- Ikon Edit Cepat hanya terlihat jika permission `product:update` tersedia.
- Ikon produk membuka modal Nama Produk, Kategori, dan Merek. Penyimpanan memperbarui seluruh varian dalam grup secara atomik.
- Ikon harga membuka modal Harga Normal, Harga Agen, Harga Dinas, catatan opsional, dan Harga Khusus transaksi.
- Harga master hanya berubah pada varian yang dipilih.
- Harga Khusus diberi keterangan **Hanya berlaku untuk transaksi ini**, langsung mengubah subtotal, tersimpan dalam cart session, dan menang atas pricing otomatis.
- Harga Khusus yang diubah dari modal Pembayaran memakai cart state yang sama.
- Harga di bawah HPP menampilkan warning tetapi tetap dapat disimpan.
- Layanan cetak tidak menampilkan aksi Edit Cepat produk.

## Backend dan Konsistensi Data

- Endpoint `PUT /api/products/[id]` menerima mode `quickEditGroup` untuk pembaruan Nama/Kategori/Merek.
- Server menentukan seluruh varian berdasarkan stock group; produk lama tanpa stock group memakai identitas Nama/Kategori existing.
- Product rows dan metadata stock group diperbarui dalam satu transaksi database.
- Collision group key ditolak dengan status 409 dan tidak menyebabkan merge diam-diam.
- Brand divalidasi terhadap store pengguna dan Category divalidasi sebelum transaksi.
- Respons mengembalikan ID seluruh varian agar cart dapat disinkronkan tepat sasaran.

## Audit Harga

Enum `ProductPriceLogField` ditambah:

- `HARGA_AGEN`
- `HARGA_DINAS`

Migrasi: `packages/db/prisma/migrations/20260711002000_add_harga_agen_dinas_price_log_fields/migration.sql`.

Perubahan Harga Agen/Dinas kini mencatat nilai lama, nilai baru, sumber, catatan, pengguna, dan waktu melalui product price log existing.

## Cart dan Checkout

- `ProductCartItem` memiliki `transactionPrice` terpisah dari `catalogPrice`.
- Reducer cart menangani set/reset override, sinkronisasi harga varian, dan sinkronisasi metadata seluruh grup.
- Normalisasi `sessionStorage` mempertahankan override ketika halaman dimuat ulang dalam sesi yang sama.
- Prioritas checkout: Harga Khusus transaksi, Harga Agen/Dinas, Harga Khusus otomatis, lalu Harga Normal.
- Modal Pembayaran menampilkan badge Harga khusus transaksi dan tidak menggantinya ketika tipe pelanggan berubah.

## Dokumentasi Pengguna

- Panduan Edit Cepat ditambahkan ke Bantuan role Kasir.
- Preview visual POS menampilkan Edit Cepat serta Harga Normal/Agen/Dinas.
- FAQ POS, dokumen bantuan AI POS, dan workflow `pos-sale` diperbarui.

## Verifikasi TDD

Setiap irisan utama melalui test RED sebelum implementasi GREEN:

- Prioritas override checkout.
- Tiga referensi harga dan ikon Edit Cepat di CartSidebar.
- Cart reducer dan pemulihan session.
- Pemisahan payload harga master/transaksi serta validasi harga.
- Modal harga dan modal metadata produk.
- Endpoint metadata grup atomik.
- Audit Harga Agen/Dinas.
- Bantuan pengguna.

Hasil verifikasi:

- Verifikasi akhir: 10 file test terfokus, 70 test lulus.
- `pnpm --filter @pos/web type-check` lulus.
- Prisma client berhasil dibuat dengan `pnpm --filter @pos/db generate`.
- Production build dan lifecycle development server tidak dijalankan sesuai pedoman repository.

## Deployment Note

Jalankan migrasi Prisma sesuai prosedur environment sebelum merilis aplikasi agar enum audit Harga Agen/Dinas tersedia di database target.
