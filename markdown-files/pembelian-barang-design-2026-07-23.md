# Design Spec: Pembelian Barang Supplier

Tanggal: 23 Juli 2026
Status: Disetujui untuk dilanjutkan ke implementation planning

## Ringkasan

Menambahkan tab **Pembelian Barang** pada halaman Supplier sebagai tahap transaksi aktual setelah **Daftar Belanja** disetujui. Daftar Belanja tetap berfungsi sebagai dokumen perencanaan dan estimasi, sedangkan Pembelian Barang menyimpan jumlah serta harga aktual, melewati proses approval/rejection, dan baru mencatat Pengeluaran ketika disetujui.

Pembuatan maupun approval Pembelian Barang tidak mengubah stok dan tidak membuat stock log. Penerimaan serta perubahan stok tetap menjadi tanggung jawab workflow inventory yang terpisah.

## Keputusan Produk

- Pembelian Barang memakai model data terpisah dari Daftar Belanja dan Pengeluaran.
- Hanya Daftar Belanja berstatus `APPROVED` yang dapat dipilih.
- Satu Daftar Belanja hanya boleh memiliki satu Pembelian Barang yang `PENDING` atau `APPROVED`.
- Jika Pembelian Barang `REJECTED`, record tetap tersimpan sebagai riwayat dan Daftar Belanja boleh diajukan kembali.
- Pengajuan baru selalu berstatus `PENDING`.
- Pembelian Barang membutuhkan aksi approve dan reject.
- Approval Pembelian dilakukan per produk dan setiap aksi langsung tersimpan.
- Status Pembelian tetap `PENDING` sampai semua produk tersisa disetujui.
- Owner dapat mengedit, menghapus, dan menambahkan produk selama Pembelian masih `PENDING`.
- Pembelian otomatis menjadi `APPROVED` setelah semua produk tersisa disetujui.
- Reject wajib memiliki alasan.
- Approval mencatat satu Pengeluaran berdasarkan total transaksi aktual.
- Pengeluaran tidak lagi dibuat ketika Daftar Belanja selesai disetujui.
- Stok tidak berubah pada create, approve, maupun reject Pembelian Barang.
- Perubahan HPP master dipilih per produk dan hanya ditawarkan jika harga transaksi berbeda dari HPP master.
- Permission approve dan reject dipisah dan secara default hanya dimiliki role `OWNER`.

## Model Data

### GoodsPurchase

Menyimpan header transaksi:

- `id`
- `storeId`
- `number` dan sequence sesuai pola penomoran transaksi repository
- `shoppingRequestId`
- `supplierId`
- snapshot identitas supplier yang diperlukan untuk menjaga histori
- `status`: `PENDING`, `APPROVED`, atau `REJECTED`
- `totalAmount`
- `rejectionReason`, nullable dan wajib ketika status `REJECTED`
- `createdById`
- `approvedById`, nullable
- `rejectedById`, nullable
- `createdAt`, `updatedAt`, `approvedAt`, dan `rejectedAt`
- relasi opsional satu-ke-satu ke Pengeluaran yang dibuat saat approval
- `activeShoppingRequestKey`, nullable dan unique, untuk menjamin hanya satu pengajuan aktif/approved per Daftar Belanja

Saat create, `activeShoppingRequestKey` diisi dengan ID Daftar Belanja. Nilai tersebut tetap dipertahankan ketika `APPROVED` dan diubah menjadi `null` ketika `REJECTED`. Unique constraint pada kolom nullable ini, ditambah pemeriksaan transaksi, mencegah dua record `PENDING`/`APPROVED` untuk Daftar Belanja yang sama termasuk ketika request datang bersamaan. Record `REJECTED` tidak mengambil slot aktif tersebut.

### GoodsPurchaseItem

Menyimpan detail transaksi dan snapshot:

- `id`
- `goodsPurchaseId`
- `productId`
- snapshot nama dan kode produk
- snapshot nama satuan dan multiplier satuan
- `quantity`
- `masterCostPriceSnapshot`
- `latestUnitPrice`
- `lineTotal`
- `updateMasterHpp`
- `reviewStatus`: `PENDING` atau `APPROVED`
- `approvedById`, nullable
- `approvedAt`, nullable
- timestamps

`lineTotal` dihitung server-side dari `quantity x latestUnitPrice`. `totalAmount` merupakan penjumlahan seluruh `lineTotal`.

Item yang dihapus benar-benar dihapus dari transaksi dan tidak disimpan sebagai audit trail. Pembelian harus selalu memiliki minimal satu item.

### Expense

- Tambahkan relasi nullable dari Pengeluaran ke Pembelian Barang.
- Relasi lama ke Daftar Belanja tetap dipertahankan agar data historis existing tetap dapat dibaca.
- Pengeluaran yang berasal dari Pembelian Barang bersifat otomatis dan mengikuti proteksi edit/delete yang sudah berlaku untuk Pengeluaran otomatis.
- Satu Pembelian Barang yang `APPROVED` hanya boleh menghasilkan satu Pengeluaran.

## Eligibility Daftar Belanja

Daftar Belanja ditampilkan di modal jika:

- milik toko aktif user;
- berstatus `APPROVED`;
- memiliki minimal satu item dengan `approvedQty > 0`;
- tidak memiliki Pembelian Barang yang sedang `PENDING`;
- tidak memiliki Pembelian Barang yang sudah `APPROVED`.
- tidak memiliki Pengeluaran otomatis legacy yang dahulu dibuat langsung oleh approval Daftar Belanja.

Daftar Belanja dengan pengajuan terakhir `REJECTED` eligible kembali. Pemeriksaan eligibility dilakukan ulang ketika submit untuk mencegah race condition.

Pengecualian record legacy mencegah Pengeluaran dicatat dua kali. History Daftar Belanja lama dan Pengeluaran lamanya tetap dapat dibaca seperti biasa.

## UI dan User Flow

### Tab Pembelian Barang

Tambahkan tab **Pembelian Barang** pada halaman Supplier dan dukung query parameter tab yang konsisten dengan tab Supplier lainnya.

Bagian utama berisi:

- deskripsi singkat fungsi tab;
- tombol **Buat Pembelian Barang**;
- daftar riwayat dengan pagination/filter mengikuti pola existing;
- kolom nomor pembelian, nomor Daftar Belanja, supplier, jumlah produk, total pengeluaran, status, pembuat, dan tanggal;
- aksi melihat detail;
- tombol **Approve** untuk membuka modal review per produk dan **Reject** untuk menolak seluruh transaksi, hanya ketika user memiliki permission yang sesuai.

Status ditampilkan dengan label Indonesia yang ramah:

- `PENDING`: Menunggu Persetujuan
- `APPROVED`: Disetujui
- `REJECTED`: Ditolak

### Modal Buat Pembelian Barang

1. User wajib memilih satu Daftar Belanja eligible.
2. Sebelum pilihan dibuat, detail supplier dan produk belum ditampilkan.
3. Setelah dipilih, tampilkan nama supplier dan hanya item dengan `approvedQty > 0`.
4. Input jumlah default ke `approvedQty`.
5. Input Harga Produk Terbaru default ke HPP master produk saat modal mengambil data.
6. Jumlah harus lebih dari nol. Harga tidak boleh negatif.
7. Jika harga input berbeda dari HPP master, tampilkan checkbox per item:
   **Update HPP master ke harga ini saat pembelian disetujui**.
8. Checkbox update HPP default tidak dicentang.
9. Jika harga kembali sama dengan HPP master, checkbox disembunyikan dan nilainya di-reset ke `false`.
10. Tampilkan total pengeluaran secara live dari seluruh jumlah dan harga input.
11. Sediakan tombol **Ajukan Pembelian Barang** dan **Tutup**.
12. Setelah submit berhasil, tutup modal, refresh eligibility dan riwayat, lalu tampilkan record baru berstatus `PENDING`.

Total pada UI bersifat preview. Server selalu menghitung ulang total final.

### Detail

Detail Pembelian Barang menampilkan:

- metadata transaksi dan Daftar Belanja asal;
- supplier;
- semua item, jumlah, HPP awal, harga transaksi, subtotal, dan keputusan update HPP;
- total pengeluaran;
- status, pembuat, approver/rejector, timestamps, serta alasan reject.

Reject membuka dialog dengan input alasan wajib.

### Modal Approval per Produk

Ketika Owner menekan **Approve**, buka modal review produk:

- setiap item memiliki status **Belum Ada Aksi** atau **Disetujui**;
- bagian header menampilkan counter, misalnya **1 Produk Belum Ada Aksi**;
- status Pembelian tetap `PENDING` selama counter lebih dari nol;
- setiap item menyediakan aksi **Setujui**, **Edit**, dan **Hapus**;
- semua aksi langsung disimpan ke server;
- tombol edit memungkinkan perubahan satuan, jumlah, harga terbaru, dan pilihan update HPP;
- perubahan jumlah atau harga langsung menghitung ulang subtotal dan total Pembelian.

Jika item berstatus **Disetujui** diedit, tampilkan konfirmasi:

> Barang ini sudah disetujui. Apakah ingin mengedit kembali? Status akan kembali menjadi Belum Ada Aksi.

Setelah edit disimpan, status item kembali menjadi `PENDING` dan harus disetujui ulang.

Penghapusan item berstatus **Disetujui** juga memerlukan confirmation popup karena langsung memengaruhi total. Item yang dihapus hilang dari transaksi tanpa audit trail. Sistem menolak penghapusan jika item tersebut merupakan satu-satunya item tersisa.

### Tambah Produk saat Approval

Di bagian bawah daftar produk tersedia tombol **Tambah Produk**:

- Owner dapat memilih produk apa pun dari master produk aktif milik toko;
- hanya varian satuan besar yang ditampilkan;
- varian dianggap satuan besar jika `unitMultiplierToBase > 1` atau nama unit termasuk daftar kemasan besar yang dinormalisasi, minimal: dus, box, pak, krat, karton, bal, dan sak;
- jika produk mempunyai beberapa varian satuan besar, Owner memilih varian/satuannya;
- jumlah default `1`;
- harga terbaru default dari HPP varian produk yang dipilih;
- pilihan update HPP mengikuti rule selisih harga yang sama;
- item baru berstatus **Belum Ada Aksi**.

Karena model existing menyimpan setiap satuan sebagai varian Product tersendiri, HPP default diambil langsung dari varian yang dipilih. Contoh: `Air Mineral - dus` memakai HPP dus dan tidak mengalikan HPP botol.

### Finalisasi Otomatis

Setelah setiap aksi item, server memeriksa jumlah item `PENDING`. Jika tidak ada item yang belum diproses dan minimal satu item masih tersisa, server melakukan finalisasi dalam transaction yang sama:

1. hitung ulang seluruh subtotal dan total;
2. update HPP untuk item yang memilih update HPP;
3. buat satu Pengeluaran otomatis;
4. ubah status Pembelian menjadi `APPROVED`;
5. simpan approver dan timestamp.

Jika finalisasi berhasil, modal otomatis tertutup dan tampil popup:

> Pembelian Barang Telah Disetujui

Finalisasi juga dapat terpicu ketika aksi terakhir adalah menghapus satu item dan semua item yang tersisa sudah disetujui. Tidak ada perubahan stok pada seluruh proses.

## Backend dan Transaction Boundary

Pisahkan operasi utama menjadi:

- list/detail riwayat;
- list Daftar Belanja eligible;
- create Pembelian Barang;
- approve satu item;
- edit satu item;
- hapus satu item;
- list dan tambah produk satuan besar;
- finalisasi otomatis Pembelian Barang;
- reject Pembelian Barang.

Semua endpoint:

- membatasi data berdasarkan `storeId`;
- menggunakan validasi schema di boundary API;
- tidak mempercayai total atau snapshot dari client;
- mengembalikan pesan error Indonesia yang actionable;
- mengikuti pola logging dan API response repository.

### Create

Dalam transaction:

1. Ambil dan validasi ulang Daftar Belanja.
2. Pastikan status `APPROVED` dan tidak memiliki pengajuan aktif/approved.
3. Pastikan seluruh product ID berasal dari item Daftar Belanja dengan `approvedQty > 0`.
4. Ambil HPP master terkini untuk snapshot.
5. Validasi jumlah dan harga.
6. Hitung subtotal dan total dengan tipe decimal yang aman untuk uang.
7. Simpan header serta items sebagai snapshot.
8. Buat status awal `PENDING` untuk header dan seluruh item.

Create tidak membuat Pengeluaran, tidak mengubah HPP, dan tidak menyentuh stok.

### Review Item dan Approve

Seluruh aksi review item hanya tersedia ketika header masih `PENDING` dan user memiliki permission approve.

Approve item dalam satu transaction:

1. Lock atau conditional-update item yang masih `PENDING`.
2. Ubah item menjadi `APPROVED`, lalu simpan approver dan timestamp.
3. Jalankan pemeriksaan finalisasi otomatis.

Edit item dalam satu transaction:

1. Validasi item berasal dari Pembelian dan toko yang benar.
2. Validasi varian satuan, jumlah, harga, serta pilihan update HPP.
3. Hitung ulang subtotal.
4. Jika sebelumnya `APPROVED`, reset status item ke `PENDING` serta kosongkan approver dan timestamp.
5. Hitung ulang total header.

Hapus item dalam satu transaction:

1. Pastikan minimal dua item tersedia sebelum delete.
2. Hapus item tanpa membuat audit trail.
3. Hitung ulang total header.
4. Jalankan pemeriksaan finalisasi otomatis.

Tambah item dalam satu transaction:

1. Pastikan Product aktif, milik toko, dan merupakan varian satuan besar.
2. Tolak varian Product yang sama jika sudah ada dalam transaksi.
3. Ambil snapshot produk, satuan, multiplier, dan HPP terkini.
4. Simpan jumlah, harga, subtotal, pilihan update HPP, dan status `PENDING`.
5. Hitung ulang total header.

Finalisasi otomatis melakukan conditional update terhadap header `PENDING`, memastikan minimal satu item tersedia dan seluruh item sudah `APPROVED`, lalu meng-update HPP pilihan, membuat satu Pengeluaran, dan mengubah header menjadi `APPROVED`.

Jika update HPP atau pembuatan Pengeluaran gagal, seluruh finalisasi rollback. Tidak ada mutasi stok atau stock log.

### Reject

Dalam satu database transaction:

1. Verifikasi record masih `PENDING`.
2. Verifikasi permission reject.
3. Validasi alasan yang sudah di-trim dan tidak kosong.
4. Ubah status menjadi `REJECTED`.
5. Simpan alasan, rejector, dan timestamp.
6. Set `activeShoppingRequestKey` menjadi `null` sehingga Daftar Belanja eligible untuk pengajuan berikutnya.

Reject tidak membuat Pengeluaran, tidak mengubah HPP, dan tidak menyentuh stok.

## RBAC

Read dan create mengikuti izin Supplier existing agar tab terintegrasi dengan akses halaman saat ini.

Tambahkan dua permission resource/action sesuai konvensi RBAC repository:

- `supplier.goods_purchase.approve:update`
- `supplier.goods_purchase.reject:update`

Kedua permission diberikan hanya kepada role `OWNER` pada default seed. UI menyembunyikan aksi tanpa permission, tetapi API tetap menjadi enforcement utama.

## Dampak ke Flow Daftar Belanja

- Approval Daftar Belanja tetap menyimpan keputusan dan `approvedQty`.
- Approval Daftar Belanja tetap tidak mengubah stok.
- Auto-create Pengeluaran saat seluruh item Daftar Belanja diputuskan dihapus.
- UI Daftar Belanja tetap menampilkan **Estimasi Pengeluaran** sebagai informasi planning.
- Dokumentasi finance dan laporan harus menggunakan Pembelian Barang sebagai sumber transaksi aktual baru, sambil tetap membaca data historis lama.

## Cache, Notifications, dan Integrasi

- Create meng-invalidasi riwayat Pembelian Barang dan daftar eligible.
- Approve meng-invalidasi riwayat/detail Pembelian Barang, produk/HPP, Pengeluaran, dan laporan keuangan.
- Reject meng-invalidasi riwayat/detail serta daftar eligible.
- Notifikasi mengikuti pola existing untuk memberi tahu user berwenang ketika pengajuan dibuat, disetujui, atau ditolak.
- Workflow Bantuan dan AI Assistant diperbarui agar membedakan Daftar Belanja, Pembelian Barang, Pengeluaran, dan Penerimaan Barang.

## Error Handling

Error domain minimal:

- Daftar Belanja tidak ditemukan atau bukan milik toko.
- Daftar Belanja belum disetujui.
- Daftar Belanja tidak memiliki item yang disetujui.
- Daftar Belanja sedang/sudah memiliki Pembelian Barang aktif.
- Daftar Belanja sudah memiliki Pengeluaran otomatis legacy.
- Item atau produk tidak valid.
- Jumlah atau harga tidak valid.
- Pembelian Barang tidak ditemukan.
- Pembelian Barang sudah diproses.
- Item Pembelian tidak ditemukan atau sudah diproses.
- Minimal satu produk wajib tersisa.
- Produk tambahan bukan satuan besar.
- Varian produk sudah ada dalam Pembelian.
- Alasan reject wajib diisi.
- User tidak memiliki permission.
- Supplier atau produk sudah tidak tersedia untuk transaksi baru.

## Test Strategy

Implementasi mengikuti TDD: setiap behavior ditulis sebagai failing test sebelum production code.

Coverage minimal:

- helper kalkulasi subtotal/total dan deteksi selisih HPP;
- eligibility Daftar Belanja;
- create dengan snapshot dan default data;
- penolakan double submission;
- Daftar Belanja dengan Pengeluaran otomatis legacy tidak eligible;
- daftar rejected dapat dipakai kembali;
- approve membuat tepat satu Pengeluaran;
- approve hanya meng-update HPP item yang dipilih;
- approve satu item langsung tersimpan;
- counter item yang belum diproses;
- header tetap `PENDING` selama masih ada item `PENDING`;
- item terakhir yang disetujui memicu finalisasi otomatis;
- edit item approved meminta konfirmasi dan mereset status ke `PENDING`;
- edit item pending menghitung ulang subtotal dan total;
- hapus item approved meminta konfirmasi;
- hapus item tidak menyimpan audit trail;
- item terakhir tidak boleh dihapus;
- penghapusan yang menyelesaikan seluruh review memicu finalisasi;
- tambah produk hanya menerima varian satuan besar;
- unit besar terdeteksi dari multiplier atau nama kemasan besar yang dinormalisasi;
- produk multi-unit memungkinkan pemilihan varian satuan;
- item tambahan default jumlah `1`, HPP varian terkini, dan status `PENDING`;
- produk tambahan duplikat ditolak;
- reject wajib alasan dan tidak membuat side effect finansial;
- permission approve/reject dan default OWNER;
- conditional update mencegah double approval;
- rollback ketika salah satu langkah approval gagal;
- create/approve/reject tidak mengubah stok atau membuat stock log;
- modal selection dan default input;
- checkbox update HPP hanya tampil ketika ada selisih dan default `false`;
- total live;
- refresh cache setelah mutasi;
- history, detail, badge status, confirmation approval, dan dialog reject;
- modal approval menutup otomatis dan menampilkan popup sukses setelah finalisasi;
- HelpContent serta workflow catalog mencerminkan flow baru;
- regresi laporan finance dan proteksi Pengeluaran otomatis.

Validasi akhir menggunakan test terarah, lint pada file terkait, dan type-check. `pnpm build` serta lifecycle development server tidak dijalankan dalam sesi agent.

## Acceptance Criteria

1. Tab Pembelian Barang tersedia di halaman Supplier.
2. User dapat membuat pengajuan hanya dari Daftar Belanja approved yang eligible.
3. Produk dan nilai default mengikuti requirement.
4. Total pengeluaran tampil dan dihitung ulang oleh server.
5. Pengajuan baru muncul di history dengan status `PENDING`.
6. Owner dapat menyetujui, mengedit, menghapus, dan menambahkan produk dari modal approval.
7. Status tetap `PENDING` dan counter ditampilkan selama masih ada produk Belum Ada Aksi.
8. Edit produk approved meminta konfirmasi dan mengembalikan status item ke Belum Ada Aksi.
9. Hapus produk approved meminta konfirmasi dan minimal satu produk wajib tersisa.
10. Produk tambahan berasal dari master produk toko dan dibatasi ke satuan besar.
11. Setelah semua produk tersisa disetujui, Pembelian otomatis approved, modal tertutup, dan popup sukses muncul.
12. User berizin dapat reject seluruh Pembelian dan wajib mengisi alasan.
13. Pengajuan rejected tidak mengunci Daftar Belanja.
14. Approval membuat Pengeluaran aktual tepat satu kali.
15. Update HPP terjadi per pilihan item dan hanya saat finalisasi approval.
16. Tidak ada perubahan stok pada seluruh workflow Pembelian Barang.
17. Permission approve/reject baru tersedia dan default hanya untuk OWNER.
18. Daftar Belanja tidak lagi membuat Pengeluaran otomatis saat approval.
19. Dokumentasi Bantuan dan workflow AI Assistant sesuai dengan flow baru.
