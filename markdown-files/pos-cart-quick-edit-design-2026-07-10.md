# Desain Edit Cepat Produk di Keranjang POS - 2026-07-10

## Status

Desain divalidasi dan disetujui pada 10 Juli 2026. Implementasi diselesaikan pada 11 Juli 2026; rincian terdapat pada `pos-cart-quick-edit-implementation-2026-07-11.md`.

## Understanding Summary

- POS membutuhkan kontrol **Edit Cepat** di header keranjang agar pengguna dapat memelihara produk tanpa meninggalkan transaksi.
- Harga Normal, Harga Agen, dan Harga Dinas selalu ditampilkan pada setiap baris produk di keranjang.
- Saat Edit Cepat aktif, setiap baris produk menampilkan ikon **Ubah produk** dan **Ubah harga produk**.
- Modal **Ubah Harga Produk** mengubah Harga Normal, Harga Agen, dan Harga Dinas secara permanen untuk varian terpilih. Modal yang sama menyediakan Harga Khusus yang hanya berlaku untuk transaksi aktif.
- Modal **Ubah Produk** mengubah Nama Produk, Kategori, dan Merek secara permanen untuk seluruh varian dalam grup.
- Setelah penyimpanan berhasil, daftar produk, seluruh baris keranjang terkait, harga aktif, dan subtotal diperbarui tanpa reload.
- Fitur Edit Cepat hanya terlihat bagi pengguna yang memiliki permission RBAC `product:update`.

## Tujuan

- Mempercepat koreksi data produk dan harga ketika kasir sedang menyusun transaksi.
- Menampilkan Harga Agen dan Harga Dinas sebagai referensi tanpa mengubah aturan penerapan harga otomatis.
- Memberikan Harga Khusus situasional dengan penjelasan yang tegas bahwa nilainya hanya berlaku untuk transaksi aktif.
- Menjaga grup varian, cart state, cache produk, audit harga, dan checkout tetap konsisten.

## Non-goals

- Tidak menambahkan edit cepat untuk item layanan cetak.
- Tidak membuat Kategori atau Merek baru dari modal POS.
- Tidak mengubah Harga Normal/Agen/Dinas seluruh varian sekaligus; harga master hanya berubah untuk varian terpilih.
- Tidak mengantre perubahan master produk saat offline.
- Tidak mengganti atau menghapus fitur Harga Khusus manual yang sudah ada di modal Pembayaran.
- Tidak menggabungkan grup produk secara otomatis ketika Nama/Kategori target bertabrakan dengan grup lain.

## Assumptions

### Perilaku dan UX

- Edit Cepat tersedia pada keranjang desktop dan mobile, serta dapat diklik kembali untuk menyembunyikan ikon aksi.
- Kategori dan Merek dipilih dari data existing. Merek boleh dikosongkan melalui opsi **Tanpa merek**.
- Harga Normal wajib lebih dari 0.
- Harga Agen dan Harga Dinas opsional, dapat dikosongkan, dan tidak boleh negatif.
- Harga Khusus transaksi opsional, wajib lebih dari 0 jika diisi, dan dapat dihapus untuk memulihkan harga otomatis.
- Harga di bawah HPP menampilkan peringatan, tetapi tetap boleh disimpan.
- Catatan perubahan harga bersifat opsional.
- Harga Khusus transaksi menjadi harga aktif dan menang atas Harga Agen, Harga Dinas, serta Harga Khusus otomatis.

### Performa dan Skala

- Toggle Edit Cepat adalah operasi lokal tanpa request jaringan.
- Keranjang diasumsikan memiliki hingga sekitar 100 baris tanpa lag yang terasa.
- Satu grup produk diasumsikan memiliki hingga sekitar 50 varian.
- Kategori dan Merek memakai cache/query yang sudah tersedia dan tidak diambil ulang per baris keranjang.

### Keamanan dan Privasi

- Client menyembunyikan Edit Cepat jika `canPerform("product", "update")` bernilai false.
- Server tetap menjadi sumber otorisasi dan memanggil `requirePermission("product", "update")`.
- Product, Category, Brand, dan grup varian harus berasal dari store pengguna yang sama.
- Pesan error tidak membocorkan data produk milik store lain.

### Reliabilitas dan Ketersediaan

- Cart dan cache tidak diperbarui sebelum server menyatakan perubahan permanen berhasil.
- Pembaruan Nama/Kategori/Merek seluruh varian dilakukan secara atomik.
- Tombol simpan dikunci saat request berlangsung untuk mencegah double-submit.
- Jika request permanen gagal, perubahan lokal dari aksi simpan yang sama juga tidak diterapkan.
- Jika hanya Harga Khusus transaksi yang berubah, tidak diperlukan request server dan perubahan tetap dapat dilakukan saat offline.
- Kegagalan quick edit tidak mengganggu keranjang atau kemampuan transaksi offline.

### Pemeliharaan

- Implementasi memakai tipe Product, cart state, React Query cache, RBAC guard, serta pricing helper existing.
- Dua modal POS tetap fokus dan tidak merefaktor modal inventaris existing secara luas.
- Dependency baru tidak ditambahkan kecuali ditemukan kebutuhan yang tidak dapat dipenuhi oleh stack saat ini.
- Harga Khusus transaksi disimpan di `sessionStorage` bersama cart agar bertahan dalam sesi browser yang sama.

## Pendekatan yang Dipertimbangkan

### A. Modal fokus dan orkestrasi POS khusus — dipilih

Dua modal khusus POS dipakai untuk memisahkan metadata grup, harga master varian, dan Harga Khusus transaksi. `POSClientPage` mengoordinasikan state desktop/mobile, sedangkan helper domain dan mutation existing digunakan kembali bila sesuai.

Kelebihan:

- Sesuai dengan alur yang diminta.
- Batas permanen dan transaksi jelas.
- Risiko regresi terhadap inventaris lebih rendah.
- Komponen lebih mudah diuji secara terfokus.

Kekurangan:

- Menambah dua komponen modal baru.
- Memerlukan endpoint atomik baru untuk metadata grup.

### B. Generalisasi modal inventaris existing

`EditProductModal` dan `PriceUpdateModal` dapat diberi mode POS dan menyembunyikan field yang tidak diperlukan.

Kelebihan: reuse UI tinggi.

Kekurangan: refaktor luas, form existing mengelola lebih banyak field, dan risiko mengubah alur halaman Produk lebih tinggi.

### C. Satu modal dengan dua mode/tab

Kedua ikon membuka satu komponen yang sama pada tab yang berbeda.

Kelebihan: pemuatan data dan kode UI terpusat.

Kekurangan: mencampurkan pembaruan grup permanen, harga varian permanen, dan override transaksi dalam satu state penyimpanan.

## Decision Log

| Keputusan | Alternatif yang Dipertimbangkan | Alasan |
| --- | --- | --- |
| Satu toggle Edit Cepat di header keranjang. | Toggle per item; edit inline. | Lebih ringkas dan mudah dinonaktifkan. |
| Harga Normal/Agen/Dinas selalu terlihat. | Hanya saat Edit Cepat; hanya di modal. | Pengguna membutuhkan ketiganya sebagai referensi. |
| Dua ikon aksi pada setiap produk. | Satu modal gabungan. | Memisahkan perubahan metadata dan harga. |
| Edit Cepat tidak tersedia untuk layanan cetak. | Menampilkan aksi yang sama. | Layanan cetak tidak memakai master produk yang sama. |
| Harga Normal/Agen/Dinas disimpan permanen. | Override cart saja. | Perubahan harus berlaku untuk transaksi berikutnya. |
| Harga master hanya diperbarui pada varian terpilih. | Semua varian; proporsional. | Harga berbeda menurut satuan/varian. |
| Nama/Kategori/Merek diperbarui pada seluruh varian. | Varian terpilih saja; metadata campuran. | Menjaga grup produk konsisten. |
| Metadata grup diperbarui atomik. | Hasil parsial; retry lalu parsial. | Mencegah grup terpecah. |
| Category dan Brand hanya boleh dipilih dari existing data. | Quick-create keduanya; quick-create Brand saja. | Menjaga alur POS tetap fokus. |
| Akses mengikuti permission RBAC `product:update`. | Role tetap; semua pengguna POS. | Mengikuti konfigurasi akses store. |
| Kontrol disembunyikan bagi pengguna tanpa permission. | Disabled dengan tooltip; server-only denial. | Menghindari aksi yang tidak dapat dipakai. |
| Cart dan daftar produk sinkron setelah server berhasil. | Sinkron setelah reload; hanya baris terpilih. | Mencegah tampilan dan subtotal usang. |
| Harga Normal wajib positif; Harga Agen/Dinas opsional. | Semua wajib; nilai nol diperbolehkan. | Membedakan harga valid dan harga yang belum diatur. |
| Harga di bawah HPP hanya diberi warning. | Diblokir; tanpa warning. | Menjaga fleksibilitas dengan informasi risiko. |
| Catatan audit harga opsional. | Catatan wajib; tanpa audit. | Menjaga kecepatan sambil mempertahankan jejak perubahan. |
| Edit permanen ditolak saat offline. | Antrean sinkronisasi; blokir seluruh cart. | Menghindari konflik master data tanpa mengganggu transaksi. |
| Harga Khusus transaksi tetap ada di modal Pembayaran. | Dihapus; dijadikan permanen. | Kebutuhan transaksi situasional berbeda dari harga master. |
| Harga Khusus ditambahkan ke modal Ubah Harga Produk. | Hanya tersedia saat pembayaran. | Memungkinkan penyesuaian langsung dari cart. |
| Harga Khusus tersedia bagi pengguna dengan `product:update` untuk semua tipe pelanggan. | Aturan role/customer lama; semua pengguna. | Modal dibuka sebelum pelanggan dipilih dan tetap dibatasi permission. |
| Harga Khusus transaksi menang atas semua harga otomatis. | Harga Agen/Dinas menang; konfirmasi setiap perubahan pelanggan. | Menjaga intent manual pengguna dan hasil subtotal stabil. |
| Harga Khusus opsional dan dapat dihapus. | Wajib; nilai nol untuk gratis. | Menyediakan pemulihan aman ke harga otomatis. |
| Pendekatan A dipilih. | Pendekatan B dan C. | UX paling jelas dengan risiko regresi lebih rendah. |

## Final Design

### 1. Arsitektur dan Komponen

`POSClientPage` menjadi pemilik state berikut agar keranjang desktop dan mobile selalu sinkron:

- `isQuickEditEnabled`
- produk/cart line yang sedang diedit
- status modal Ubah Produk
- status modal Ubah Harga Produk

`CartSidebar` menerima state dan callback melalui props. Komponen ini tidak melakukan mutation produk secara langsung.

Komponen baru ditempatkan dalam fitur POS quick edit:

- `PosProductQuickEditModal`
- `PosPriceQuickEditModal`

Modal produk menangani Nama, Kategori, dan Merek. Modal harga menangani Harga Normal, Harga Agen, Harga Dinas, Harga Khusus transaksi, catatan opsional, dan ringkasan HPP/margin.

### 2. Model State Keranjang

`ProductCartItem` membedakan:

- `catalogPrice`: Harga Normal master.
- `hargaAgen`: Harga Agen master.
- `hargaDinas`: Harga Dinas master.
- Harga Khusus transaksi sebagai nilai override opsional.
- `price`: harga aktif yang dipakai untuk subtotal.
- Identitas grup/stock group yang diperlukan untuk sinkronisasi seluruh varian.

Override transaksi disimpan bersama cart dan dipakai sebagai sumber kebenaran bersama oleh keranjang serta modal Pembayaran. Migrasi pembacaan `sessionStorage` memberi fallback aman untuk cart lama yang belum memiliki field baru.

### 3. Tampilan Keranjang

Header menampilkan tombol ikon **Edit Cepat** jika pengguna memiliki `product:update`. Saat aktif, setiap product line menampilkan ikon:

- **Ubah produk**
- **Ubah harga produk**

Harga Normal, Agen, dan Dinas selalu terlihat. Nilai kosong ditampilkan sebagai **Belum diatur**. Harga aktif dan total baris tetap mendapat hierarki visual utama.

Jika override aktif, baris menampilkan badge **Harga khusus** dan informasi **Hanya berlaku untuk transaksi ini**.

Semua tombol memiliki tooltip, `aria-label`, focus state, dan target sentuh minimal 44px pada mobile.

### 4. Modal Ubah Produk

Field:

- Nama Produk
- Kategori existing
- Merek existing atau **Tanpa merek**

Modal menjelaskan bahwa perubahan berlaku untuk seluruh varian dan menampilkan jumlah varian jika tersedia.

Endpoint grup menerima ID varian terpilih. Server:

1. Memvalidasi `product:update` dan store scope.
2. Menentukan seluruh anggota grup, termasuk varian nonaktif.
3. Memvalidasi Category dan Brand berada dalam store yang sama.
4. Menolak collision dengan grup produk lain.
5. Memperbarui product rows dan metadata stock group dalam satu transaksi.
6. Mengembalikan seluruh ID varian serta metadata baru.

Client memperbarui semua cart item terkait dan meng-invalidasi query produk setelah respons berhasil.

### 5. Modal Ubah Harga Produk

Bagian **Harga master**:

- Harga Normal
- Harga Agen
- Harga Dinas
- Catatan opsional

Bagian **Harga transaksi**:

- Harga Khusus
- Informasi **Hanya berlaku untuk transaksi ini**
- Aksi **Hapus harga khusus** bila override aktif

Modal menampilkan HPP dan margin jika HPP tersedia. Harga di bawah HPP menghasilkan warning amber tanpa memblokir penyimpanan.

Jika harga master berubah, request server diselesaikan terlebih dahulu. Cart baru diperbarui setelah respons berhasil. Jika Harga Khusus juga berubah dalam aksi yang sama, override lokal diterapkan sesudah request master berhasil. Jika hanya override yang berubah, perubahan berlangsung lokal tanpa request.

### 6. Prioritas Harga dan Checkout

Urutan resolusi harga:

1. Harga Khusus transaksi.
2. Harga Agen untuk pelanggan AGEN atau Harga Dinas untuk pelanggan PEMERINTAH.
3. Harga Khusus otomatis berdasarkan customer/category/unit/brand.
4. Harga Normal.

Modal Pembayaran membaca override dari cart item. Input Harga Khusus existing tetap tersedia menurut aturan akses lama dan memperbarui sumber state yang sama. Jika override berasal dari cart tetapi input tidak tersedia untuk konteks pelanggan tersebut, modal tetap menampilkan badge dan harga final yang diterapkan.

Checkout menyimpan harga final pada snapshot transaction item seperti perilaku existing.

### 7. Audit Harga

Audit harga existing saat ini hanya mendukung `PRICE` dan `COST_PRICE`. Audit diperluas dengan field:

- `HARGA_AGEN`
- `HARGA_DINAS`

Setiap perubahan master menyimpan nilai lama, nilai baru, sumber, catatan opsional, pengguna, dan waktu. Harga Khusus transaksi bukan perubahan master sehingga tidak masuk product price log; harga finalnya tersimpan pada transaksi.

### 8. Error Handling

- `403`: **Anda tidak memiliki izin untuk mengubah produk.**
- `404`: **Produk tidak lagi tersedia. Muat ulang daftar produk.**
- `409`: collision grup atau konflik perubahan data.
- `422`: error ditampilkan di bawah field terkait.
- Network/`500`: modal tetap terbuka, input dipertahankan, dan tombol **Coba lagi** tersedia.

Cart/cache tidak berubah pada kegagalan server. Loading state mengunci aksi simpan dan tutup yang dapat menyebabkan double-submit.

### 9. Edge Cases

- Beberapa varian grup yang sama di cart menerima perubahan metadata yang sama.
- Harga master hanya berubah pada varian/cart line terpilih.
- Harga Khusus tetap aktif ketika Harga Normal berubah.
- Menghapus Harga Khusus memulihkan Harga Normal di cart dan harga otomatis saat checkout.
- Item yang dihapus saat modal terbuka membatalkan penerapan perubahan lokal.
- Gagal memuat Category/Brand menonaktifkan penyimpanan metadata, tetapi tidak mengganggu cart.
- Collision Nama/Kategori dengan grup berbeda ditolak dan tidak menyebabkan merge diam-diam.
- Harga master kosong ditampilkan sebagai **Belum diatur**, bukan `Rp0`.

## Test Strategy

Implementasi wajib mengikuti test-driven development: test baru diverifikasi gagal sebelum kode produksi ditulis.

### Unit Tests

- Harga Khusus transaksi mengalahkan Harga Agen, Dinas, dan rule otomatis.
- Reset override memulihkan resolver otomatis.
- Sinkronisasi metadata mencakup seluruh cart item dalam grup.
- Sinkronisasi harga hanya mencakup varian terpilih.
- Validasi harga, HPP warning, dan payload audit.
- Migrasi cart session lama memberi default aman.

### Component Tests

- Edit Cepat hanya terlihat dengan `product:update`.
- Toggle hanya menampilkan ikon pada product line.
- Tiga harga referensi dan fallback **Belum diatur** selalu ditampilkan.
- Modal menampilkan field, warning, loading, error, dan informasi transaksi yang tepat.
- Harga Khusus langsung memperbarui harga aktif dan subtotal.
- Modal Pembayaran memakai override yang sama.
- Tombol dan modal dapat digunakan dengan keyboard dan memiliki nama aksesibel.

### API and Integration Tests

- Metadata grup diperbarui atomik untuk seluruh varian aktif/nonaktif.
- Permission, tenant scope, Category/Brand lintas store, product missing, dan collision ditolak.
- Kegagalan satu operasi me-roll back seluruh perubahan grup.
- Harga Agen/Dinas menghasilkan audit nilai lama dan baru.
- Checkout tidak mengganti override dengan harga otomatis.
- Override bertahan dalam `sessionStorage`.

### E2E

Alur utama:

1. Tambahkan produk ke cart.
2. Aktifkan Edit Cepat.
3. Ubah harga master dan Harga Khusus.
4. Verifikasi subtotal serta badge.
5. Ubah Nama/Kategori/Merek.
6. Verifikasi seluruh varian terkait.
7. Checkout dan verifikasi harga final.

### Verification Commands

- Targeted `pnpm test` untuk test yang berkaitan.
- `pnpm lint`.
- `pnpm type-check`.
- Jangan menjalankan `pnpm build`.
- Jangan memulai atau menghentikan development server.

## Documentation Sync During Implementation

Karena ini memodifikasi fitur POS yang terlihat pengguna, implementasi harus memperbarui:

- `apps/web/features/help-documentation/components/HelpContent.tsx`
- Preview Bantuan POS yang relevan.
- `apps/web/features/ai-assistant/docs/help/pos.md` dan/atau FAQ terkait.
- `apps/web/features/ai-assistant/workflows/workflow-catalog.ts` karena langkah penggunaan POS berubah.
- Dokumentasi implementasi Markdown bertanggal di `markdown-files`.

## Risks

- Perubahan metadata grup dapat berinteraksi dengan stock group identity dan perlu menjaga group key/display metadata tetap konsisten.
- Cart session lama membutuhkan normalisasi agar field baru tidak menghasilkan `undefined` yang salah.
- Dua sumber edit Harga Khusus sebelumnya dapat saling menimpa jika state tidak dipusatkan di cart.
- Audit Harga Agen/Dinas membutuhkan perubahan enum database dan migrasi yang kompatibel.
- Query cache POS berbentuk paginated/grouped data; invalidasi dan sinkronisasi perlu diuji agar produk tidak tampak terduplikasi atau hilang.

## Implementation Handoff

- Baca dan gunakan skill `test-driven-development` sebelum menulis test atau kode implementasi.
- Mulai dari test resolver/cart state, kemudian component test, API group test, dan audit test.
- Lanjutkan ke implementasi paling kecil yang membuat setiap kelompok test lulus.
- Verifikasi perubahan pada desktop dan mobile tanpa mengelola lifecycle development server milik pengguna.
