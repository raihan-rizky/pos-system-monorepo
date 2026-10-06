# Status Implementasi Patch Besar POS

Tanggal pembaruan: 2026-10-06. Fitur dikerjakan sebagai satu patch terpadu sesuai pilihan pengguna. Pengguna telah meminta commit dan merge lokal ke `main`; push dan rilis server belum diminta. Atas arahan pengguna, migrasi tertunda juga telah diterapkan pada database dev lokal; database uji terisolasi dihapus setelah seluruh migrasi lulus.

Dokumen pendamping: [desain patch](C:/Projects/pos-system-monorepo/markdown-files/patch-besar-pos-design-2026-10-05.md) dan [rencana implementasi](C:/Projects/pos-system-monorepo/markdown-files/patch-besar-pos-implementation-plan-2026-10-05.md).

## Cakupan implementasi

| Area | Perilaku yang sudah diimplementasikan |
| --- | --- |
| Daftar Belanja | Terhubung ke alur pembelian barang. Nama otomatis memakai nomor dokumen, nama khusus boleh diisi pengguna dan wajib unik per toko; aksi kunci/selesai menutup popup setelah berhasil. Cetak A4 menyediakan lembar ringkas No/Nama Barang/Kebutuhan Belanja serta lembar kedua dengan kolom lengkap. |
| Pembelian dan Penerimaan Barang | Pembelian barang menunggu persetujuan Owner/Admin sebelum penerimaan. Tab Penerimaan Barang tersedia di Supplier, akses awal Gudang/Owner, dan izin tetap dapat disesuaikan lewat RBAC. Penerimaan menerima jumlah fisik serta biaya modal aktual; nilai awal memakai modal saat ini dan harga penerimaan tersimpan sebagai snapshot. Pembaruan HPP master otomatis ditunda. |
| POS dan harga | Harga khusus/diskon kategori mendapat prioritas. Satuan kecil tampil di kiri dan satuan besar di kanan. Satuan dapat diganti dari keranjang; angka jumlah dipertahankan dan harga dihitung ulang. Kuantitas bisa diketik langsung. |
| Nota sementara | Owner/Admin dapat menambah, mengurangi, atau mengubah barang dan jumlah sebelum persetujuan. Modal, normal, Agen, Dinas, harga khusus, dan harga efektif ditampilkan. Server mengutip ulang harga; persetujuan menolak kutipan usang agar pengguna meninjau perubahan. |
| Kategori pelanggan | Tipe yang ada—UMUM, AGEN, INDUSTRI, PEMERINTAH—dipertahankan; kategori tidak diubah oleh patch ini. |
| Tempo dan piutang | Tempo/Tagihan terpisah dari DP, membutuhkan pelanggan, dapat dimulai dengan pembayaran nol atau sebagian, memiliki badge tersendiri, dan mencatat hanya uang yang benar-benar diterima ke pembayaran/laporan kas. Pelunasan mengurangi piutang. |
| Stok transaksi | Transaksi final mengurangi stok saat dibuat; nota pending mengurangi stok hanya setelah disetujui. Void/hapus membalik jurnal yang terbukti tepat satu kali, termasuk bahan baku dan pola historis Surat Jalan. Riwayat lama yang ambigu atau memakai kelompok/konversi stok ditolak untuk pemeriksaan, bukan ditebak. Penghapusan default hanya Owner; izin tetap dapat disesuaikan melalui RBAC. Penghapusan transaksi yang masih terhubung ke Surat Jalan tetap ditolak; gunakan void. |
| Waktu invoice | Default waktu diambil dari API UTC TimeAPI.io dengan timeout 2 detik, cache 60 detik, perkiraan latensi, dan status sumber/waktu sinkronisasi. Hook mempertahankan jangkar saat offline; format tanggal memakai `Asia/Jakarta` dan WIB. Jika layanan/jaringan tidak tersedia, UI menandai fallback. Penyedia menyebut layanannya belum memiliki SLA dan memerlukan HTTPS keluar dari host. |
| Produk terlaris | Dashboard mengelompokkan produk menjadi Stationery/ATK, Paper, Cartridge, dan Ink. |
| Bantuan dan AI | Konten Bantuan serta workflow catalog diperbarui agar mencakup alur belanja, pembelian/penerimaan, POS/satuan, persetujuan nota, Tempo, stok, waktu, dan harga. |

Antislop dipakai selama pengerjaan UI. Implementasi mengikuti hierarki dan komponen POS yang sudah ada; tidak menambahkan dekorasi atau animasi baru pada alur kasir.

## Validasi

- Pemeriksaan TypeScript langsung lulus untuk `@pos/web`, `@pos/db`, `@pos/ui`, `@pos/admin`, dan `@pos/product-import-worker` dengan `tsc --noEmit --incremental false`.
- Prisma schema: `prisma validate` lulus dengan URL lokal dummy; tidak ada koneksi atau perubahan database.
- Rangkaian tes web lengkap: **407 file lulus, 1 file dilewati; 2.194 tes lulus, 4 tes dilewati**.
- Tes sinkronisasi offline: **4/4 lulus**. Tes pemulihan transaksi, pengembalian stok, dan audit writer-lock: **35/35 lulus**.
- Probe PostgreSQL dengan dua sesi pada row-lock transaksi lulus: saat sesi pertama memegang `FOR UPDATE` selama 1,5 detik, sesi kedua tertahan 1.832 ms dibanding query acuan 357 ms. Probe tidak mengubah baris dan schema dummy dihapus setelahnya.
- Tes terarah akhir: sinkronisasi waktu dan konsumennya **16/16**; pemulihan stok lama + endpoint transaksi **20/20**; backfill/impor kategori penjualan **7 tes di 2 file**.
- Tes `PaymentModal` setelah mock tombol dirapikan: **5/5 lulus** tanpa warning prop React.
- Tes terarah sebelumnya mencakup POS/Daftar Belanja/workflow (37 tes), pembuatan transaksi/waktu/stok/offline (28 tes), approval nota (33 tes), purchasing (93 tes), finance (64 tes), serta beberapa rangkaian jurnal stok dan lifecycle. Rangkaian ini tidak menggantikan hasil tes lengkap.
- `prisma migrate deploy` menerapkan **68/68 migrasi** pada database sementara `pos_system_patch_test`; `prisma migrate status` menyatakan database terbaru. Database uji kemudian dihapus dan ketiadaan schema/database sementara diverifikasi.
- Pada QA lanjutan, delapan migrasi yang tertunda diterapkan pada database dev lokal sesuai arahan pengguna. `prisma migrate status` mengonfirmasi **68/68 migrasi** sudah diterapkan pada database dev.
- `git diff --check` lulus; Git hanya melaporkan peringatan normal konversi CRLF pada working copy.

## Batas operasi dan sisa pemeriksaan

- Percobaan awal memakai schema sementara `pos_patch_test` pada database dev dan berhenti di migrasi lama `20260509_query_performance_indexes`: extension `pg_trgm` berada di `public`, sementara Prisma membatasi `search_path` ke schema tersebut. Tiga migrasi dasar sempat diterapkan pada schema yang baru dibuat; schema itu beserta 13 tabel hasilnya kemudian dihapus. Migrasi patch tidak diubah. Validasi akhir menggunakan database terisolasi baru dan berhasil untuk semua 68 migrasi.
- `pnpm build` tidak dijalankan. Perintah root `pnpm lint` ternyata memicu dependency Turbo `^build` dan mulai membuat aset Next.js; proses itu dihentikan sebelum selesai. Type-check langsung untuk lima paket tetap lulus sebagaimana dicatat di atas.
- Tidak memulai atau menghentikan `pnpm dev`.
- Browser QA masuk ke POS dengan akun Owner lokal yang disediakan pengguna; katalog termuat dan uji keranjang sebelumnya membuktikan penggantian satuan, hitung ulang harga, serta input jumlah langsung. Keranjang dikosongkan kembali. Pada sesi live lanjutan, tab Supplier, Daftar Belanja, Pembelian Barang, dan Penerimaan Barang dapat dibuka. Riwayat penerimaan dev kosong. Formulir Catat Penerimaan terbuka, tetapi pilihan pembelian tetap memuat; Daftar Belanja dan Pembelian Barang juga menampilkan status memuat. Fetch baca-saja ke `/api/suppliers/shopping-requests`, ringkasan Daftar Belanja, `/api/suppliers`, dan `/api/time` masing-masing timeout pada batas 6–10 detik. Halaman Supplier melaporkan 0 error console dan 1 warning. Ini mengarah ke hambatan API lokal yang lebih luas; penyebab server belum terlihat karena terminal dev tidak terpasang pada thread. Sesi menampilkan shift aktif yang sudah ada; shift itu tidak diubah. Tidak ada dokumen, shift, atau transaksi dibuat.
- Mapping kategori pada data toko aktual belum diverifikasi. Permintaan jam daring membutuhkan HTTPS keluar; endpoint punya fallback, dan SLA penyedia tidak dijamin.
- Riwayat stok campuran jurnal lama/baru, bukti transaksi hilang/berbeda, satuan kelompok/konversi, atau Surat Jalan yang belum terkonfirmasi berhenti untuk pemeriksaan. Hapus transaksi yang masih punya Surat Jalan tertaut tetap diblokir oleh aturan yang ada; void mengembalikan stok yang terbukti.
- Perubahan masih berupa workspace; tidak ada commit atau deploy. GitNexus `detect_changes()` hanya diperlukan sebelum commit.

## Tooling

Headroom MCP dipakai untuk statistik sesi dan kompresi log/output; proxy lokal `http://127.0.0.1:8787` tidak terjangkau. GitNexus CLI lokal menunjukkan index yang segar terhadap HEAD; analisis impact sebelumnya memberi risiko LOW pada handler PATCH/DELETE transaksi dan jalur impor/seed yang diperiksa. `detect_changes()` belum dijalankan karena belum ada commit. MCP GitNexus tidak tersedia sebagai tool pada sesi ini.
