# Pembelian Barang Supplier

Tanggal pembaruan: 24 Juli 2026

## Ringkasan

Fitur **Pembelian Barang** memisahkan pencatatan kebutuhan dari pembelian aktual:

- **Daftar Belanja** hanya mencatat kebutuhan, jumlah yang di-ACC, dan estimasi pengeluaran.
- **Pembelian Barang** mencatat jumlah serta harga supplier terbaru, keputusan per produk, pilihan update HPP, dan pengeluaran final.
- Kedua workflow tersebut tidak mengubah stok. Barang fisik tetap diproses melalui workflow inventaris.

Analogi sederhananya: Daftar Belanja adalah wishlist yang sudah disetujui, sedangkan Pembelian Barang adalah nota pembelian aktual. Stok gudang baru berubah lewat pintu inventaris, bukan lewat nota.

## Alur Pengguna

### Membuat Pembelian Barang

1. Buka **Supplier > Pembelian Barang**.
2. Klik **Buat Pembelian Barang**.
3. Pilih Daftar Belanja berstatus disetujui dan masih eligible.
4. Sistem menampilkan supplier serta semua produk yang di-ACC.
5. Jumlah awal memakai jumlah yang di-ACC; harga terbaru memakai HPP master.
6. Jika harga berbeda dari HPP master, pengguna menentukan per produk apakah HPP perlu diperbarui.
7. Total pengeluaran dihitung dari jumlah dikali harga terbaru.
8. Klik **Ajukan Pembelian Barang** untuk membuat dokumen berstatus `PENDING`.

Satu Daftar Belanja hanya boleh memiliki satu Pembelian Barang aktif atau disetujui. Dokumen yang ditolak membebaskan Daftar Belanja agar dapat dipilih kembali. Daftar Belanja lama yang sudah memiliki Expense otomatis tidak eligible agar biaya tidak tercatat dua kali.

### Review dan Keputusan

Approver membuka modal review dan dapat:

- menyetujui produk;
- mengedit jumlah, harga terbaru, dan pilihan update HPP;
- menghapus produk, selama minimal satu produk tersisa;
- menambah produk master dengan satuan unit besar.

Produk tambahan dianggap unit besar jika multiplier lebih dari 1 atau nama unit termasuk dus, box, pak, pack, krat, karton, bal, atau sak.
Saat mengedit produk, approver dapat mencari dan mengganti unit hanya ke varian satuan besar dari grup stok yang sama. Picker Daftar Belanja tetap menampilkan semua produk toko; batasan unit besar hanya berlaku di Pembelian Barang.

Perubahan produk langsung tersimpan. Produk yang belum diputuskan ditandai **Belum Ada Aksi**. Jika produk yang sudah disetujui diedit, sistem meminta konfirmasi dan mengembalikan status item menjadi Belum Ada Aksi.

Ketika semua produk tersisa disetujui, sistem menjalankan transaksi atomik:

1. menandai Pembelian Barang sebagai `APPROVED`;
2. memperbarui HPP hanya untuk produk yang dipilih;
3. mencatat log perubahan harga;
4. membuat tepat satu Expense kategori Bahan;
5. menutup modal dan menampilkan **Pembelian Barang Telah Disetujui**.

Tidak ada mutasi stok atau log inventaris pada pengajuan, review, approval, penolakan, maupun retry.

Perubahan pada satu Pembelian Barang dikunci dan diproses bergantian di database. Jadi, dua aksi approval/reject yang datang bersamaan tidak dapat membuat status header, item, HPP, atau Expense saling menimpa. Nomor pembelian juga dialokasikan berurutan per toko dan unik dalam toko tersebut.

### Penolakan

Penolakan berlaku untuk seluruh dokumen dan mewajibkan alasan. Status berubah menjadi `REJECTED`, lalu Daftar Belanja sumber dapat dipakai kembali untuk pengajuan baru.

## RBAC

Permission keputusan dipisahkan:

- `supplier.goods_purchase.approve:update`
- `supplier.goods_purchase.reject:update`

Default keduanya hanya OWNER. Owner dapat mendelegasikan permission kepada role lain melalui pengaturan RBAC.

## Integrasi Keuangan

- Expense baru hanya dibuat setelah Pembelian Barang final `APPROVED`.
- Badge sumber di Keuangan adalah **Pembelian Barang**.
- Expense otomatis tidak dapat diedit, dihapus, atau diubah lampirannya dari halaman Keuangan.
- Data lama tetap dikenali sebagai **Daftar Belanja (Legacy)**.
- Jurnal laporan memprioritaskan nomor Pembelian Barang.

## Notifikasi

Inbox dan browser push memakai deep link `/suppliers?tab=goods-purchases`:

- pengajuan baru memberi tahu OWNER;
- approval final dan penolakan memberi tahu OWNER/ADMIN selain pelaku aksi;
- kegagalan notifikasi tidak membatalkan transaksi utama.

## Komponen Teknis

### Database

Migration: `packages/db/prisma/migrations/20260724_add_goods_purchases`

Model utama:

- `GoodsPurchase`
- `GoodsPurchaseItem`
- relasi `Expense.goodsPurchaseId`

### API

Endpoint berada di `/api/suppliers/goods-purchases`, termasuk:

- list dan create;
- detail;
- daftar Daftar Belanja eligible;
- daftar produk unit besar;
- add/edit/remove item;
- approval per item;
- reject pembelian.

### UI

Komponen utama berada di `apps/web/features/suppliers/goods-purchases` dan dihubungkan ke tab baru melalui `SupplierPageShell`.

## Validasi

Coverage utama mencakup:

- aturan eligibility dan tenant;
- ketepatan item Daftar Belanja;
- larangan unit kecil dan produk duplikat;
- pergantian unit hanya dalam grup stok yang sama;
- serialisasi aksi paralel serta nomor unik per toko;
- keputusan per item serta finalisasi atomik;
- tidak adanya mutasi stok;
- HPP opsional per produk;
- Expense tunggal;
- API, cache React Query, UI modal, laporan, Keuangan, notifikasi, Help, dan workflow AI.
