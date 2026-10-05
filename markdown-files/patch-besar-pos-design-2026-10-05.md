# Spesifikasi patch besar POS

Tanggal: 2026-10-05. Status: desain percakapan disetujui; dokumen ini untuk review sebelum rencana implementasi rinci.

## Tujuan dan batas rilis

Seluruh fitur berikut dirilis bersama dalam satu rilis besar. Pekerjaan dibagi menjadi tahap yang dapat diuji secara mandiri, tetapi tahap tersebut bukan rilis produksi terpisah.

Gunakan model dan layanan existing untuk Daftar Belanja, Pembelian Barang, Penerimaan Barang, transaksi, pelanggan, dan RBAC. Integrasi dilakukan melalui navigasi dan alur kerja; riwayat dokumen, penerimaan parsial, dan referensi database dipertahankan.

Lokasi spesifikasi, rencana, dan dokumentasi patch disetujui pengguna menjadi `C:\Projects\pos-system-monorepo\markdown-files`, menggantikan lokasi D: pada AGENTS.md untuk pekerjaan ini. Nama dokumen berakhiran tanggal.

## Keputusan pengguna yang menjadi kontrak

| Area | Perilaku yang disepakati |
| --- | --- |
| Rilis | Satu rilis besar setelah seluruh tahap selesai dan lolos validasi. |
| Nama Daftar Belanja | Default nomor invoice/dokumen otomatis; pengguna dapat menggantinya dengan nama unik. |
| Kunci/Selesai | Tutup popup otomatis setelah aksi berhasil; pertahankan mekanisme penguncian existing. |
| Pembelian | Persetujuan Owner/Admin diperlukan sebelum penerimaan. |
| Penerimaan | Input modal per barang, default modal master saat pembuatan baris penerimaan. |
| Modal master | Pembaruan otomatis modal master ditunda dari patch ini. |
| RBAC | Ubah default akses; seluruh akses tetap dikonfigurasi melalui pengaturan RBAC. |
| Hapus transaksi | Default Owner; dapat diberikan kepada peran lain melalui RBAC. |
| Stok | Transaksi final memotong stok saat dibuat; nota sementara saat disetujui. |
| Void/hapus | Kembalikan stok yang benar-benar terpotong, tepat sekali. |
| Harga | Harga khusus/diskon kategori menjadi utama; pilihan prioritas harga dihapus. |
| Tempo | Tagihan bayar kemudian, terpisah dari DP, dengan badge khusus. |
| Waktu | Default tanggal/jam dari waktu server yang tersinkronisasi internet; tampilkan Jakarta WIB. |
| Pelanggan | Pertahankan UMUM, AGEN, INDUSTRI, PEMERINTAH. |
| Persetujuan nota | Bisa menambah barang, mengurangi jumlah, dan menghapus barang; tampilkan informasi harga. |
| Cetak Daftar Belanja | Dua nota A4: versi ringkas tiga kolom dan versi lengkap existing. |
| Dashboard | Produk terlaris dikelompokkan ATK, Kertas, Cartridge, Tinta. |

## Arsitektur dan alur dokumen

Alur pengadaan: Daftar Belanja → persetujuan item → Pembelian Barang → persetujuan pembelian → Penerimaan Barang → persetujuan penerimaan existing → pencatatan stok masuk.

`ShoppingRequest`, `GoodsPurchase`, dan `InboundReceipt` tetap menjadi dokumen terpisah yang terhubung. Daftar Belanja terintegrasi ke alur pembelian sehingga pengguna tidak harus membuat ulang item. Entri operasional pembelian yang mengarah ke penerimaan ditampilkan sebagai **Penerimaan Barang**; tahap pembelian dan persetujuannya tetap tersedia sebagai dokumen sumber.

Supplier menyediakan tab **Penerimaan Barang**, dengan daftar, filter dokumen pembelian/supplier, detail, pembuatan, dan penerimaan parsial. Gunakan layanan penerimaan inventory existing agar navigasi Supplier dan Inventory membaca sumber data yang sama.

Stok masuk hanya dicatat pada finalisasi penerimaan yang berhasil. Pembuatan Daftar Belanja atau persetujuan pembelian tidak menambah stok. Kuantitas yang sudah diterima dan yang sedang diproses tetap membatasi sisa penerimaan.

## Daftar Belanja

### Nama dan keunikan

Pertahankan nomor dokumen `DPB-YYYYMM-XXX` existing sebagai identitas otomatis. Dalam konteks Daftar Belanja, permintaan "default nomor invoice" menggunakan nomor dokumen ini; tidak membuat hubungan baru ke invoice penjualan.

Tambahkan nama tampilan yang dapat diedit dan nilai normalisasi untuk keunikan. Default nama adalah nomor dokumen. Keunikan berlaku per toko, sesuai lingkup nomor dokumen existing, dengan spasi awal/akhir dihapus dan huruf besar/kecil dianggap sama. Dokumen yang sudah dibatalkan tetap mempertahankan namanya agar pencarian riwayat tidak ambigu.

Validasi harus berlaku di server dan constraint database. Jika dua pengguna menyimpan nama sama bersamaan, satu penyimpanan ditolak dengan pesan **Nama daftar belanja sudah digunakan.** Data lama mendapat nama dari nomor dokumen; benturan normalisasi diselesaikan deterministik memakai identitas dokumen saat migrasi, tanpa mengubah nomor aslinya.

### Kunci dan selesai

Tombol Kunci/Selesai menjalankan aksi existing. Setelah respons sukses, refresh daftar dan tutup popup terkait. Jika gagal, popup tetap terbuka, mempertahankan isian, dan menampilkan pesan kegagalan. Hindari klik ganda selama penyimpanan.

Tidak menambahkan status finalisasi baru atau memperluas hak edit item yang sudah dikunci.

### Dua nota A4

Satu aksi cetak menghasilkan dua versi dokumen berurutan:

1. Nota ringkas: **No**, **Nama Barang**, **Kebutuhan Belanja**. Kuantitas mengikuti kebutuhan yang diminta, dengan satuan yang jelas.
2. Nota lengkap: pertahankan seluruh kolom, informasi, dan tanda tangan dari template existing.

Keduanya A4. Untuk daftar pendek, hasilnya dua halaman. Untuk daftar panjang, setiap versi boleh berlanjut ke halaman berikutnya; semua baris wajib tercetak, header tabel diulang, dan versi lengkap dimulai pada halaman baru. Hapus pembatas overflow yang dapat memotong isi. Perubahan ini hanya berlaku pada cetak Daftar Belanja.

## Penerimaan Barang dan modal

Setiap baris penerimaan menyediakan harga modal supplier. Default diambil dari modal master produk yang diterima ketika baris dibuat dan disimpan sebagai snapshot, sehingga perubahan modal produk berikutnya tidak mengubah dokumen tersebut.

Harga harus berupa angka rupiah yang valid, tidak negatif, dan sesuai satuan barang penerimaan. Untuk produk dalam kelompok stok, gunakan konversi satuan existing agar modal satuan besar tidak dianggap modal satuan dasar.

Input tersimpan pada baris penerimaan dan digunakan sebagai unit cost pencatatan stok masuk serta informasi detail penerimaan. Dokumen penerimaan lama tetap menggunakan snapshot/harga existing; tidak diisi ulang menggunakan modal master terbaru.

Patch ini tidak membuat input penerimaan memperbarui `Product.costPrice` otomatis. Mekanisme pembaruan modal opsional pada persetujuan pembelian existing berada di luar perubahan ini. Nilai pengeluaran pembelian tetap mengikuti dokumen pembelian yang disetujui; perbedaan modal penerimaan ditampilkan, tanpa otomatis mengubah expense atau membuat expense ganda.

Pertahankan persetujuan penerimaan, penerimaan parsial, validasi sisa kuantitas, pembatasan per toko, dan perlindungan finalisasi ganda existing.

## RBAC

Default penerimaan tersedia bagi Gudang (`INVENTORY`) dan Owner. Default persetujuan pembelian tersedia bagi Owner dan Admin. Default hapus transaksi tersedia bagi Owner. Aturan void mengikuti permission void/update existing; pengguna tidak meminta pembatasan baru untuk void.

Hak tersebut harus berasal dari konfigurasi RBAC, bukan pemeriksaan role Owner yang ditanam langsung dalam handler. UI dan API memeriksa permission efektif yang sama. Hak halaman Supplier dan hak aksi penerimaan harus selaras agar Gudang dapat membuka alur yang diizinkan.

Konfigurasi tersimpan yang dibuat pengguna tidak ditimpa oleh perubahan default. Instalasi tanpa override dan aksi Reset Default menggunakan default baru. Migrasi pengaturan harus membedakan nilai default yang diwariskan dengan override eksplisit sesuai mekanisme penyimpanan existing.

## Harga dan persetujuan nota

### Harga langsung

Hapus pilihan pengguna `SPECIAL/MEMBER`. Gunakan satu alur penentuan harga: aturan harga khusus/diskon kategori yang cocok → harga Agen/Dinas sesuai tipe pelanggan → harga reguler.

Jika aturan khusus tidak ditemukan, lanjut ke fallback; harga khusus yang sah tidak dikalahkan hanya karena harga member lebih murah. Pertahankan pemilihan aturan paling spesifik existing, konversi satuan, dan ketentuan override manual existing. Snapshot harga transaksi lama tidak dihitung ulang.

Perhitungan online, draft, persetujuan, dan sinkronisasi offline menggunakan aturan yang sama. Payload offline lama yang memuat `pricingPreference` tetap dapat dibaca, tetapi nilai tersebut tidak mengubah urutan harga baru.

### Editor persetujuan

Persetujuan nota sementara menampilkan editor yang memungkinkan tambah barang, perubahan jumlah, pengurangan jumlah, dan hapus baris. Tampilkan **Modal**, **Harga Reguler**, **Harga Agen**, **Harga Dinas**, **Harga Khusus**, dan **Harga Berlaku**. Nilai yang tidak tersedia ditampilkan sebagai tanda kosong yang jelas, bukan angka nol yang tampak sebagai harga.

Akses informasi modal mengikuti permission informasi modal existing. Menambahkan editor persetujuan tidak membuka informasi modal kepada peran yang sebelumnya tidak berhak.

Server memuat produk dan tipe pelanggan aktual, menentukan harga, memvalidasi override manual sesuai permission, serta menghitung subtotal, diskon, pajak, dan total. Jangan mempercayai harga akhir yang dikirim browser tanpa validasi.

Penyimpanan item dan persetujuan final berjalan dalam satu transaksi database. Server mengunci nota, memvalidasi status masih dapat disetujui, menghitung ulang item final, lalu memotong stok sekali. Permintaan persetujuan yang bersaing tidak boleh menghasilkan dua mutasi stok. Jika harga/produk berubah selama review, kembalikan rincian perubahan agar pengguna meninjau ulang sebelum persetujuan; jangan menyetujui diam-diam dengan total berbeda.

Tidak mengubah empat tipe pelanggan existing atau menambah pengelolaan kategori pelanggan baru.

## Tempo/Tagihan dan pelunasan

Tambahkan `TEMPO` sebagai metode pembayaran yang berbeda dari `CREDIT` kartu dan dari status DP. Transaksi Tempo yang disetujui merupakan transaksi final dengan kewajiban pembayaran pelanggan; jumlah pembayaran awal boleh nol. Tempo membutuhkan pelanggan terdaftar agar piutang dan pelunasan dapat ditelusuri.

Gunakan status transaksi final existing untuk status proses, dan metode `TEMPO` untuk jenis pembayaran. Piutang dihitung dari sisa `total - amountPaid`, dibatasi minimal nol. Jangan menentukan ada/tidaknya piutang hanya dari status DP.

Badge **TEMPO/TAGIHAN** muncul pada checkout, riwayat, detail, daftar piutang, dan nota. Tampilkan total, sudah dibayar, dan sisa tagihan. Setelah lunas, tampilkan informasi Tempo beserta status Lunas; riwayat tidak berubah menjadi DP.

Pelunasan mencatat metode pembayaran aktual pada riwayat pembayaran, tidak menghilangkan identitas Tempo transaksi. Pelunasan tidak memotong stok lagi. Void/hapus menghapus kontribusi piutang aktif secara atomik dengan perubahan transaksi.

Perbarui ringkasan piutang pelanggan, endpoint pelunasan, dashboard, laporan penjualan/pembayaran, label nota/PDF, dan kontrak offline. Nilai penjualan dan penerimaan kas dibedakan: Tempo yang belum dibayar bukan kas yang sudah diterima.

Tidak menambahkan kewajiban tanggal jatuh tempo atau notifikasi penagihan dalam patch ini.

## Siklus stok transaksi

### Waktu pengurangan

| Peristiwa | Perubahan stok |
| --- | --- |
| Simpan draft/nota menunggu persetujuan | Tidak ada. |
| Buat transaksi final | Kurangi sesuai item final. |
| Setujui draft/nota | Kurangi sesuai item final setelah perhitungan ulang. |
| Tambah/kurangi item transaksi final yang diizinkan | Terapkan selisih stok sesuai aturan edit existing. |
| Bayar piutang/Tempo | Tidak ada. |
| Void/batal transaksi | Kembalikan jumlah aktual yang masih terpotong. |
| Hapus transaksi | Kembalikan jumlah aktual yang masih terpotong sebelum penghapusan. |
| Hapus transaksi yang sudah di-void | Tidak ada pengembalian kedua. |
| Void/hapus draft atau nota yang belum memotong stok | Tidak ada penambahan stok. |

### Konsistensi dan kompatibilitas

Gunakan satu layanan siklus stok untuk pembuatan, persetujuan, edit item final, void, dan hapus. Layanan menangani produk biasa, konversi kelompok stok/satuan dasar, dan penggunaan bahan baku jasa cetak. Jumlah yang dikembalikan mengikuti stok aktual yang dikurangi, bukan asumsi semua item selalu memotong stok.

Kunci row transaksi sebelum perubahan status atau penghapusan. Periksa status dan kepemilikan mutasi stok dalam transaksi database yang sama. Terapkan selisih stok, pencatatan inventory, penyesuaian piutang, dan perubahan/penghapusan transaksi secara atomik. Audit pembatalan/penghapusan harus mempertahankan nomor dokumen, aktor, dan rincian stok setelah transaksi dihapus.

Permintaan void berulang, dua penghapusan bersamaan, atau void dan hapus bersamaan hanya boleh mengembalikan stok sekali. Jika operasi gagal, rollback juga membatalkan pengembalian stok dan penyesuaian piutang.

Pertahankan `stockDeductionSource` dan kompatibilitas `SURAT_JALAN` pada transaksi lama. Untuk transaksi yang stoknya dimiliki surat jalan, pengembalian dihitung dari stok pengiriman aktual yang belum dikembalikan, termasuk pengiriman parsial; jangan memulihkan seluruh kuantitas invoice. Jalur pembatalan surat jalan harus berbagi penjagaan pengembalian agar tidak mengembalikan lagi stok yang sudah dipulihkan oleh void/hapus transaksi.

Snapshot item dan riwayat mutasi menjadi sumber jumlah aktual. Riwayat lama yang tidak cukup membuktikan pengurangan tidak boleh menghasilkan penambahan stok berdasarkan tebakan; operasi ditolak dengan pesan bahwa riwayat stok perlu diperiksa, tanpa perubahan sebagian.

Kebijakan izin stok negatif existing tidak diubah oleh patch ini.

## Waktu invoice Jakarta WIB

Backend menjadi sumber waktu default, disimpan sebagai timestamp UTC. Host backend harus tersinkronisasi melalui layanan waktu internet/NTP; verifikasi sinkronisasi ini menjadi syarat rilis. Browser mendapatkan waktu server beserta offset dan waktu pengambilan melalui endpoint waktu ringan, lalu menggunakan selisih waktu monotonic untuk tampilan berjalan.

Tampilkan tanggal dan jam dengan zona eksplisit `Asia/Jakarta` dan label **WIB** pada checkout, riwayat, detail, dan nota/PDF yang menampilkan waktu. Jangan menambahkan tujuh jam ke timestamp lalu mengonversinya lagi. Default timestamp online ditetapkan server, bukan dipercaya dari jam perangkat kasir.

Perubahan tanggal invoice manual yang sudah memiliki permission/audit tetap tersedia. Jangan menimpa tanggal manual atau timestamp dokumen lama saat membuka halaman.

Saat offline, gunakan estimasi waktu dari sinkronisasi server terakhir dan simpan metadata sumber waktu. Jika belum pernah tersinkronisasi, gunakan waktu perangkat dengan penanda belum tersinkronisasi. Saat sync, simpan waktu kejadian dan metadata existing; jangan mengganti seluruh waktu transaksi offline menjadi waktu unggah.

Pengecekan sinkronisasi host memerlukan lingkungan deployment; type-check atau tes lokal tidak membuktikan server produksi sudah tersinkronisasi.

## Produk terlaris menurut kategori

Dashboard menyediakan kelompok **ATK**, **Kertas**, **Cartridge**, dan **Tinta**, masing-masing dengan maksimal lima produk berdasarkan jumlah terjual. Gunakan cakupan toko dan periode dashboard existing. Hanya transaksi final aktif yang berkontribusi; void, refund, draft, dan nota belum disetujui tidak dihitung. Tempo final masuk penjualan seperti transaksi final lain.

Gunakan mapping eksplisit kategori produk existing ke empat kelompok laporan; tidak mengganti atau menghapus kategori inventory. Nilai awal mencakup padanan nama ATK/Stationery, Kertas/Paper, Cartridge/Catridge, dan Tinta/Ink. Kategori kertas existing seperti Bot/Plano perlu dipetakan berdasarkan definisi bisnis kategori, bukan dianggap tinta karena kecocokan parsial. Toner dan kategori lain yang belum terpetakan tidak dipaksa masuk kelompok yang salah; tampilkan kelompok **Lainnya** agar penjualan tetap terwakili.

Mapping kategori toko aktual diperiksa pada validasi rilis karena full scan source tidak membaca database operasional. Tampilkan **Belum ada penjualan** untuk kelompok kosong. Produk memiliki identitas yang stabil meskipun nama snapshot transaksi berbeda.

## Peta perubahan

| Bagian | Lokasi utama |
| --- | --- |
| Model/migrasi | `packages/db/prisma/schema.prisma`, `packages/db/prisma/migrations/` |
| Daftar Belanja | `apps/web/features/suppliers/shopping-requests/` |
| Pembelian | `apps/web/features/suppliers/goods-purchases/` |
| Navigasi Supplier | `apps/web/features/suppliers/components/SupplierPageShell.tsx` |
| Penerimaan | `apps/web/features/inventory-management/services/`, `apps/web/app/api/inventory-management/inbound-receipts/` |
| RBAC | `apps/web/features/rbac/helpers/`, `apps/web/lib/rbac/` |
| Pricing | `apps/web/features/customer-category-pricing/helpers/`, `apps/web/features/pos-checkout/` |
| Persetujuan nota | `apps/web/features/transactions-draft/`, `apps/web/app/(main)/history/components/`, API transaksi |
| Stok | `apps/web/features/product-stock-groups/stock-mutations.ts`, API transaksi/surat jalan |
| Tempo/piutang | `apps/web/features/customer-debt/`, API pelunasan, laporan, receipt/PDF, offline |
| Waktu | `apps/web/features/invoice-date/`, formatter bersama, endpoint waktu |
| Dashboard | `apps/web/app/api/dashboard/route.ts`, `apps/web/features/dashboard/` |
| Bantuan | `apps/web/features/help-documentation/components/HelpContent.tsx` |
| AI workflow | `apps/web/features/ai-assistant/workflows/workflow-catalog.ts`, dokumen panduan terkait |

## Tahap pengerjaan dalam satu rilis

1. Pengadaan: nama unik, integrasi navigasi, default RBAC, input modal penerimaan, popup, dua nota A4.
2. Harga dan persetujuan: harga khusus utama, editor item, informasi harga, validasi server, kontrak offline.
3. Tempo: pembayaran, badge, piutang/pelunasan, laporan dan nota.
4. Siklus stok: samakan pembuatan/persetujuan/edit, perbaiki void/hapus, bahan baku, concurrency, transaksi lama surat jalan.
5. Waktu dan dashboard: sumber waktu backend/WIB serta kelompok produk terlaris.
6. Integrasi rilis: migrasi, pengujian lintas alur, dokumentasi Bantuan dan workflow AI, review diff.

Rencana rinci dipisahkan per tahap setelah dokumen ini direview, dengan satu checklist rilis bersama. Tidak menjalankan migrasi produksi saat menyusun desain/rencana.

## Verifikasi dan kriteria penerimaan

TDD berlaku untuk seluruh implementasi: tulis tes regresi/perilaku, pastikan gagal karena perilaku yang belum benar, lalu implementasi minimal dan pastikan lulus. Investigasi kegagalan menggunakan systematic-debugging.

- Nama default, nama custom, benturan case/spasi, lintas toko, request bersamaan, dan backfill dokumen lama.
- Popup tertutup hanya pada sukses; kegagalan mempertahankan input.
- Pembelian belum disetujui tidak dapat diterima; penerimaan parsial tidak melewati sisa kuantitas.
- Modal default snapshot, perubahan input, konversi satuan, riwayat lama, stok masuk memakai harga penerimaan, modal master tidak otomatis berubah.
- Default RBAC baru dan override tersimpan diuji melalui API serta UI.
- Harga khusus mengalahkan member ketika cocok; fallback benar; manipulasi harga client ditolak; online/offline konsisten.
- Tambah/kurangi/hapus item persetujuan menghitung total dan stok final; perubahan harga saat review memerlukan review ulang.
- Tempo nol pembayaran, pembayaran sebagian/penuh, badge, saldo piutang, laporan kas, dan cetak tidak dilabeli lunas sebelum lunas.
- Void/hapus transaksi final memulihkan produk dan bahan baku; pending/draft tidak menambah stok; void lalu hapus tidak menggandakan pengembalian.
- Pengujian database terisolasi memverifikasi dua void, dua delete, void versus delete, serta rollback ketika mutasi stok gagal. Mock unit saja tidak cukup membuktikan locking database.
- Transaksi lama surat jalan, penerimaan/pengiriman parsial, konversi kelompok stok, dan pembatalan surat jalan setelah void tidak menggandakan stok.
- Zona perangkat berbeda tetap menampilkan WIB; pergantian tanggal WIB benar; timestamp manual dan offline tidak ditimpa.
- Dashboard hanya menghitung penjualan final aktif per toko/kategori dan memasukkan Tempo dengan benar.
- Print pendek menghasilkan dua A4; print panjang tidak memotong barang; template cetak selain Daftar Belanja tidak berubah.
- Bantuan dan AI workflow menjelaskan alur, badge, hak akses, harga, serta void/hapus sesuai implementasi.

Baseline full scan sebelumnya: 383 file tes web lulus dan satu file dilewati; 2.047 tes lulus dan empat dilewati. Tambahan enam tes helper stok dan empat tes offline lulus. Type-check langsung pada lima package lulus. Ini baseline sebelum implementasi, bukan bukti fitur baru sudah tersedia.

Jalankan tes terarah per tahap, lalu suite web dan type-check langsung package terkait pada integrasi akhir. Jangan menjalankan `pnpm build`. Root lint/type-check menggunakan dependency Turbo build, sehingga gunakan perintah package langsung yang tidak membangun production assets. Server lifecycle tetap dikelola pengguna. Pengujian browser/DB memerlukan lingkungan yang sesuai dan harus dilaporkan terpisah dari tes unit.

## Risiko dan batas bukti

Full scan menemukan penghapusan pending/draft menambah stok meskipun belum dikurangi, dan pembalikan stok tidak mencakup bahan baku jasa cetak. Reproduksi menggunakan handler aktual dengan database mock; belum menguji concurrency atau database produksi.

GitNexus belum memberikan graph yang dapat dipercaya setelah kegagalan rebuild index pada Windows. Sebelum implementasi simbol, pulihkan kemampuan impact analysis dan laporkan direct callers, proses terdampak, serta risk sesuai AGENTS.md. Jangan menganggap hasil graph kosong berarti tidak ada dampak. Dokumentasi ini tidak mengubah simbol aplikasi.

Penambahan enum Tempo dan kolom baru perlu migrasi kompatibel dengan data lama, kontrak offline, dan deployment bersama. Schema berubah tanpa menulis ulang harga/status transaksi lama. Penilaian rollback harus memastikan data Tempo tidak hilang atau diubah menjadi DP secara otomatis.

Tidak termasuk pembaruan otomatis modal master, kategori pelanggan baru, penagihan otomatis, penghapusan model pengadaan existing, atau refactor di luar alur terkait.
