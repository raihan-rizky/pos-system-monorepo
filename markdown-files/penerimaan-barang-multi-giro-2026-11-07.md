# Penerimaan Barang: Koreksi Produk dan Multi-Giro

Tanggal rilis: 2026-11-07 (Asia/Jakarta).

## Pemakaian

1. Buka Inventaris > Transaksi > Penerimaan Barang atau tab Penerimaan Barang di Supplier. Pilih Catat Penerimaan, pilih Pembelian Barang yang sudah disetujui, lalu isi jumlah, kesesuaian dan harga satuan.
2. Pada Pembayaran Pembelian, isi metode dan nominal. Untuk dua giro, pilih Giro, isi sebagian nominal dan tanggal jatuh tempo, lalu Tambah Giro untuk sisa nominal dengan tanggal lain. Pengguna menentukan tanggal kalender, misalnya 7 hari dan 30 hari. Total alokasi harus sama dengan total pembelian. Kombinasi transfer dan giro juga didukung.
3. Ajukan ke Owner. Untuk koreksi dokumen Diajukan, buka Proses atau Ubah Penerimaan > Edit. Pilih Barang Diterima dari pembelian yang sama, ubah Jumlah Diterima, periksa harga/satuan dan catatan, lalu Simpan Perubahan. Produk tujuan tidak boleh sudah ada pada baris lain; hapus baris tujuan dahulu bila perlu. Status baris kembali Belum Ada Aksi untuk persetujuan ulang.

## Aturan dan konsistensi

- Editor hanya mengubah penerimaan yang belum difinalisasi. Produk pengganti harus aktif, berasal dari toko dan pembelian yang sama, dan tidak duplikat. Transaksi mengunci pembelian dan menghitung ulang sisa termasuk penerimaan pending lain.
- Harga dan konversi produk pengganti diperiksa terhadap data yang tampil saat dipilih. Jika berubah selama form terbuka, simpan ditolak dengan konflik agar pengguna memuat ulang sebelum meneruskan.
- Pembayaran pada pengajuan merupakan usulan. Jadwal resmi ditetapkan saat penerimaan pertama yang berisi barang disetujui, lalu digunakan kembali. Usulan berbeda ditolak dengan konflik. Jika seluruh jumlah 0, pembayaran dan Pengeluaran belum ditetapkan.
- Nominal baru harus positif, maksimal Rp9.999.999.999,99 dan dua angka desimal. Giro wajib memiliki tanggal kalender yang valid; transfer tidak memakai jatuh tempo. Maksimal 50 baris.
- Data lama tanpa rincian memakai kolom metode/tanggal lama. Pembelian Rp0 tetap dapat menerima barang tanpa alokasi nominal baru.
- Satu Pengeluaran tetap mencatat total pembelian penuh pada penerimaan positif pertama. Jika ada giro, satu Hutang Supplier mencatat subtotal seluruh giro dengan tanggal kewajiban penerimaan dalam WIB dan jatuh tempo paling awal. Transfer tidak menambah hutang giro.
- Giro Pembelian menampilkan seluruh nominal dan tanggal giro. Pembayaran aktual tetap dicatat terhadap satu hutang pembelian; sistem tidak menyatakan giro individual tertentu sudah dicairkan.
- Laporan bulanan menjadwalkan tiap giro pada bulan jatuh temponya dan subtotal transfer pada bulan penerimaan. Pembayaran giro aktual dihitung sekali. Saldo hutang tetap agregat sebesar subtotal giro dikurangi pembayaran aktual.
- Kartu Daftar Belanja menampilkan seluruh rincian. Filter metode dan jatuh tempo harus cocok pada baris pembayaran yang sama. Perlindungan reset Pengeluaran juga mencakup pembayaran campuran yang memiliki giro.

## Hak akses

- Membuat: inventory.inbound_receipt.create:create.
- Membaca riwayat dan opsi produk: inventory:read, dibatasi toko pengguna.
- Mengubah: inventory.inbound_receipt.edit:update. Role edit tanpa persetujuan mendapat tombol Ubah Penerimaan.
- Menyetujui atau menolak: inventory.inbound_receipt.approve:update dan inventory.inbound_receipt.reject:update.
- Giro keuangan mempertahankan izin expense.giro; akses hutang manual tetap memakai expense.payable. Tidak ada permission baru.

## Database dan publikasi

Migrasi 20261107090000_goods_purchase_payment_schedule menambahkan GoodsPurchasePayment / pos_goods_purchase_payments, serta InventoryInboundReceipt.paymentSchedule untuk usulan JSON. Migrasi mengisi satu rincian dari kolom pembayaran lama bila metode sudah tersedia. Kolom ringkasan lama tetap dipertahankan; pembacaan baru memakai seluruh rincian.

Migrasi berhasil diterapkan ke development, diverifikasi, lalu diterapkan ke production dan diverifikasi pada 2026-11-07. Kedua database memiliki checksum SQL yang sama (1e19f3ee815edab823cd5da6737c7eeaeaa918a9869a97ecc823b7c38412a1e5), tabel dan kolom tersedia, serta tidak ada rincian pembayaran tidak valid. Hanya migrasi fitur ini yang diterapkan; migrasi dari pekerjaan lain tidak ikut dijalankan.

Publikasi disiapkan pada worktree terpisah berbasis main. Perubahan harga satuan, penerimaan nol, pembalikan stok, pembatalan pembelian, dan utang supplier dari main dipertahankan. Lihat validasi-penerimaan-multi-giro-2026-11-07.md untuk bukti pemeriksaan.

## Catatan lingkungan

Drive dokumentasi D:\main_project tidak tersedia. Dokumen disimpan dalam markdown-files pada worktree repository publikasi. Tidak ada dev server yang dijalankan atau dihentikan dalam publikasi. Headroom stats/compress digunakan; proxy lokal tidak dapat dihubungi sehingga log besar disimpan lokal dengan pembacaan terbatas.
