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
- `quantity`
- `masterCostPriceSnapshot`
- `latestUnitPrice`
- `lineTotal`
- `updateMasterHpp`
- timestamps

`lineTotal` dihitung server-side dari `quantity x latestUnitPrice`. `totalAmount` merupakan penjumlahan seluruh `lineTotal`.

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
- tombol **Approve** dan **Reject** untuk record `PENDING`, hanya ketika user memiliki permission yang sesuai.

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

### Detail dan Approval

Detail Pembelian Barang menampilkan:

- metadata transaksi dan Daftar Belanja asal;
- supplier;
- semua item, jumlah, HPP awal, harga transaksi, subtotal, dan keputusan update HPP;
- total pengeluaran;
- status, pembuat, approver/rejector, timestamps, serta alasan reject.

Sebelum approve, tampilkan confirmation dialog berisi:

- nomor Pembelian Barang;
- total Pengeluaran yang akan dicatat;
- daftar produk yang HPP master-nya akan berubah beserta nilai lama dan baru;
- penegasan bahwa stok tidak akan berubah.

Reject membuka dialog dengan input alasan wajib.

## Backend dan Transaction Boundary

Pisahkan operasi utama menjadi:

- list/detail riwayat;
- list Daftar Belanja eligible;
- create Pembelian Barang;
- approve Pembelian Barang;
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
8. Buat status awal `PENDING`.

Create tidak membuat Pengeluaran, tidak mengubah HPP, dan tidak menyentuh stok.

### Approve

Dalam satu database transaction:

1. Lock atau lakukan conditional update terhadap Pembelian Barang `PENDING`.
2. Tolak double approval maupun status final.
3. Verifikasi permission approve.
4. Untuk setiap item dengan `updateMasterHpp = true`, update HPP hanya jika harga transaksi memang berbeda.
5. Buat satu Pengeluaran otomatis sebesar `totalAmount`.
6. Ubah status menjadi `APPROVED` dan simpan approver serta timestamp.

Jika update HPP atau pembuatan Pengeluaran gagal, seluruh perubahan rollback. Tidak ada mutasi stok atau stock log.

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
- HelpContent serta workflow catalog mencerminkan flow baru;
- regresi laporan finance dan proteksi Pengeluaran otomatis.

Validasi akhir menggunakan test terarah, lint pada file terkait, dan type-check. `pnpm build` serta lifecycle development server tidak dijalankan dalam sesi agent.

## Acceptance Criteria

1. Tab Pembelian Barang tersedia di halaman Supplier.
2. User dapat membuat pengajuan hanya dari Daftar Belanja approved yang eligible.
3. Produk dan nilai default mengikuti requirement.
4. Total pengeluaran tampil dan dihitung ulang oleh server.
5. Pengajuan baru muncul di history dengan status `PENDING`.
6. User berizin dapat approve atau reject; reject mewajibkan alasan.
7. Pengajuan rejected tidak mengunci Daftar Belanja.
8. Approval membuat Pengeluaran aktual tepat satu kali.
9. Update HPP terjadi per pilihan item dan hanya saat approval.
10. Tidak ada perubahan stok pada seluruh workflow Pembelian Barang.
11. Permission approve/reject baru tersedia dan default hanya untuk OWNER.
12. Daftar Belanja tidak lagi membuat Pengeluaran otomatis saat approval.
13. Dokumentasi Bantuan dan workflow AI Assistant sesuai dengan flow baru.
