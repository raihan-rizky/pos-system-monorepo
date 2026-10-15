# Desain UI/UX Grup Stok Produk

Tanggal: 13 Oktober 2026 (Asia/Jakarta)

Status per 15 Oktober 2026: spesifikasi dan rencana disetujui; Task 1 dan Task 2 selesai beserta perbaikan hasil review. Implementasi Task 3 selesai, verifikasi terarah berjalan, review akhir controller dan suite menyeluruh masih diproses. Lihat `grup-stok-ui-ux-implementation-2026-10-15.md` untuk hasil dan batas verifikasi.

## Tujuan dan keputusan yang disepakati

Mempermudah seluruh alur grup stok produk untuk staf yang baru memakai fitur. Pendekatan yang dipilih adalah pembuatan grup secara bertahap, diikuti pengelolaan cepat untuk grup yang sudah terbentuk. Antislop diterapkan selama desain dan pengerjaan.

Dokumentasi disimpan di `C:\Projects\pos-system-monorepo\markdown-files` berdasarkan persetujuan pengguna karena drive D: yang disebut AGENTS.md tidak tersedia.

Keberhasilan berarti pengguna dapat menjelaskan bahwa satuan dalam grup mewakili persediaan yang sama, memilih sumber stok dengan sadar, membaca konversi tanpa istilah pengali teknis, dan memahami dampak sebelum menyimpan.

## Konteks aplikasi

- Halaman Pusat Produk membuka `BulkStockGroupDrawer` untuk mengelompokkan produk terpilih dan `StockGroupWorkspaceModal` untuk mengelola grup.
- Workspace memiliki ringkasan, pengaturan satuan, harga, tambah varian, dan riwayat. Label masih mencampurkan Shared Stock, Unit Management, dan istilah teknis lainnya.
- Tab riwayat dalam workspace masih berupa placeholder. Endpoint `/api/product-stock-groups/{id}/history` sudah tersedia untuk aktivitas dan perubahan konversi.
- Halaman Inventori memiliki `StockGroupBulkPanel` untuk pengajuan tambah, kurangi, atau tetapkan stok akhir dengan approval.
- Penggabungan ke grup yang sudah ada dapat memengaruhi stok anggota lama juga. Ringkasan wajib mempertimbangkan anggota grup tujuan, bukan hanya produk terpilih.

## Batas perubahan

Perbaikan mencakup penemuan aksi di Pusat Produk, pembuatan/penggabungan grup, workspace, harga, tambah satuan, riwayat, dan penjelasan hubungan dengan pengajuan stok di Inventori.

Gunakan endpoint, aturan transaksi, penguncian stok, dan pemeriksaan izin yang tersedia. Desain ini tidak mengubah rumus bisnis, persetujuan stok, atau struktur database. Penyesuaian frontend tetap harus mematuhi respons dan validasi server.

Formulir tambah produk yang sudah mendukung beberapa satuan mengikuti istilah yang sama bila perlu penyesuaian copy. Pembuatan ulang formulir itu, halaman baru khusus grup, dan fitur pemisahan grup berada di luar cakupan.

## Bahasa dan model pemahaman

Gunakan istilah konsisten: Grup stok, Stok bersama, Satuan, Satuan acuan, Sumber stok, Konversi satuan, Harga jual, HPP, Tambah satuan, dan Riwayat.

Penjelasan ringkas pada ringkasan grup: "Semua satuan di grup ini memakai persediaan yang sama. Stok tiap satuan adalah hasil konversi, bukan stok tambahan."

Contoh "1 dus = 12 pcs" hanya digunakan sebagai contoh berlabel dalam bantuan. Angka pada ringkasan dan preview berasal dari data grup dan input pengguna.

Istilah Satuan acuan menjelaskan unit tempat sistem mencatat stok grup. Gunakan Satuan terkecil hanya bila memang merupakan satuan terkecil berdasarkan konversi; jangan mengasumsikan satuan sumber selalu yang terkecil.

## Pembuatan dan penggabungan grup

Pemilihan produk tetap berlangsung di Pusat Produk. Aksi utama menjadi "Buat atau gabungkan grup stok". Jelaskan kebutuhan minimal dua produk dengan satuan berbeda sesuai kontrak API saat ini.

Drawer menggunakan tiga tahap setelah produk dipilih:

1. **Tujuan grup:** pilih "Buat grup baru" atau "Gabungkan ke grup yang ada". Grup baru memerlukan nama; grup yang ada menampilkan nama, satuan acuan, dan anggota yang dimuat dari detail grup.
2. **Satuan dan stok:** pilih sumber stok dan isi hubungan setiap satuan. Tampilkan persamaan lengkap, misalnya `1 [satuan produk] = [jumlah] [satuan sumber]`. Pilihan sumber disertai stok saat ini. Jelaskan: "Stok bersama mengikuti produk sumber yang Anda pilih. Stok semua produk tidak dijumlahkan."
3. **Tinjau dan simpan:** tampilkan tujuan grup, daftar anggota yang terdampak, sumber stok, konversi, dan stok sekarang dibanding hasil perhitungan. Tombol akhir menyebut tindakan: "Buat grup stok" atau "Gabungkan ke grup stok".

Tombol Kembali mempertahankan input. Validasi dilakukan per tahap. Klik Berikutnya pada tahap tidak valid mengarahkan fokus ke kesalahan pertama dan menjelaskan perbaikannya. Tombol akhir dinonaktifkan saat menyimpan atau ketika hasil tinjauan tidak valid.

Jika grup tujuan gagal dimuat, tampilkan error dan Coba lagi; jangan mengartikan kegagalan sebagai daftar grup kosong. Jika tidak ada grup, jelaskan bahwa pengguna dapat membuat grup baru.

Saat sumber stok atau tujuan berubah, hitung ulang konversi dan preview dari pilihan terbaru. Jangan mempertahankan angka yang kini memiliki arti satuan berbeda tanpa memperbaruinya. Konflik satuan ditampilkan pada anggota terkait, termasuk anggota grup tujuan.

Untuk grup yang sudah ada, tinjauan menggunakan anggota lama dan produk terpilih, dengan aturan penyelesaian konversi yang sama seperti server. Bila konversi belum dapat menghubungkan semua anggota secara valid, blokir simpan dan jelaskan hubungan satuan yang belum lengkap. Jangan menampilkan perkiraan stok yang seolah sudah pasti.

Penyesuaian implementasi sesuai kontrak endpoint: saat bergabung ke grup yang ada, sumber stok dikunci pada anggota aktif dengan satuan acuan grup dan pengali 1. Satuan acuan grup tujuan tetap. Jika anggota acuan yang valid tidak tersedia, tinjauan diblokir dan pengguna diminta memeriksa acuan terlebih dahulu. Pemilihan sumber bebas hanya berlaku pada grup baru; ini mencegah preview berbeda dari normalisasi server tanpa mengubah aturan bisnis.

Peringatan perubahan stok muncul hanya bila preview menunjukkan perubahan. Produk yang sebelumnya ada dalam grup lain diberi keterangan perpindahan yang sesuai data. Keputusan terakhir tetap divalidasi server untuk menangani perubahan bersamaan.

## Pengelola grup

Header menampilkan nama grup, stok bersama dalam satuan acuan, dan jumlah satuan dari data nyata. Navigasi: **Ringkasan**, **Satuan**, **Harga**, **Tambah satuan**, **Riwayat**.

Ringkasan menampilkan hubungan konversi dan stok setara tiap satuan dengan nama, SKU, dan harga. Stok tiap satuan tidak dijumlahkan. Status stok negatif, satuan duplikat, atau konversi yang perlu diperiksa menggunakan pesan konkret dan arah perbaikan bila tersedia.

Gunakan ringkasan sebagai tampilan awal. Formulir perubahan muncul melalui aksi yang jelas sehingga staf baru tidak langsung dihadapkan pada semua kolom pengaturan.

### Tetapkan stok akhir

Aksi pengaturan langsung berlabel "Tetapkan stok akhir". Formulir meminta jumlah akhir dan satuan input; catatan bersifat opsional. Penjelasan: "Angka ini menjadi stok akhir grup, bukan jumlah yang ditambahkan."

Preview menampilkan stok sebelum dan sesudah untuk seluruh satuan aktif. Saat satuan input berubah, jumlah dikonversi otomatis agar mewakili kuantitas fisik yang sama. Bila jumlah sebelumnya atau konversinya tidak valid, kosongkan jumlah dan tampilkan instruksi untuk mengisinya kembali.

Simpan hanya melalui izin yang sudah tersedia. Nilai kosong atau bukan angka diblokir. Aturan nilai negatif mengikuti server dan disertai peringatan bila diizinkan. Tombol tidak aktif untuk nilai yang tidak berubah.

Pengajuan tambah/kurangi stok tetap melalui Inventori dan approval yang ada. Tautan "Ajukan perubahan stok di Inventori" menggunakan rute yang benar serta terlihat hanya pada akses yang sesuai. Penjelasan membedakan pengajuan dari pengaturan stok akhir langsung tanpa mengklaim keduanya memiliki approval yang sama.

### Satuan dan konversi

Editor default menampilkan persamaan dengan dua satuan dan jumlahnya. Pilihan satuan acuan diberi bantuan singkat. Label pengguna tidak menampilkan Pair conversion atau Direct multiplier.

Pengali langsung tetap tersedia di "Pengaturan lanjutan". Pembukaan pengaturan ini tidak menghapus draft. Setiap kolom menjelaskan persamaan terhadap satuan acuan.

Pilihan dampak stok menggunakan "Pertahankan stok bersama" dan "Ikuti stok satuan sumber" dengan penjelasan konsekuensi sesuai enum API yang ada. Meninjau perubahan wajib memperlihatkan satuan acuan, konversi lama/baru, dan stok sebelum/sesudah.

Preview harus konsisten dengan resolver server, termasuk perubahan satuan acuan dan pasangan yang tidak langsung melibatkan satuan acuan. Input yang belum lengkap, jumlah tidak positif, atau satuan asal sama dengan tujuan tidak menghasilkan preview seolah valid.

### Harga

Setiap satuan menampilkan Harga jual, HPP opsional, dan margin yang dihitung dari input valid. HPP yang belum diketahui ditampilkan "HPP belum diisi"; jangan memperlakukannya sebagai laba penuh. Margin negatif diberi keterangan.

Simpan dilakukan per satuan dengan tombol "Simpan harga [satuan]". Error, loading, dan keberhasilan terlihat pada formulir terkait. Penyimpanan satu formulir tidak membuang draft yang belum disimpan di satuan lain.

### Tambah satuan

Formulir memprioritaskan nama satuan, konversi terhadap satuan yang ada, dan harga jual. HPP, batas stok minimum, dan catatan tersedia sebagai detail tambahan.

Jelaskan bahwa satuan baru bergabung pada persediaan bersama dan tidak menambah persediaan. Endpoint saat ini menyimpan `stock` pada produk baru tanpa memperbarui `baseStock`; stok yang ditampilkan pada produk bergrup dihitung dari stok bersama. Karena itu tampilkan "Stok dari grup" sebagai hasil baca-saja dari `baseStock / unitMultiplierToBase`, lalu kirim nilai hasil itu pada field `stock` yang diwajibkan kontrak. Nama satuan duplikat dan konversi tidak valid diblokir sebelum submit.

### Riwayat

Ganti placeholder dengan permintaan ke `/api/product-stock-groups/{id}/history`. Filter "Semua aktivitas" menggunakan `tab=activity`; filter "Perubahan konversi" menggunakan `tab=conversion`. Gunakan pagination endpoint.

Tampilkan jenis aktivitas dalam bahasa Indonesia, waktu, pelaku, dan catatan yang tersedia. Data before/after ditampilkan hanya jika respons memiliki nilai yang dapat diinterpretasikan dengan benar. Jangan membuat angka perubahan atau identitas pelaku yang tidak tercatat.

Permintaan dibatalkan atau diabaikan saat grup/filter berubah agar respons lama tidak mengganti tampilan terbaru. Loading, kosong, error, dan Coba lagi tersedia. Setelah perubahan berhasil, detail serta riwayat yang relevan diperbarui melalui invalidasi cache yang sesuai.

Daftar Aktivitas Grup di Pusat Produk mengikuti istilah yang sama dan mempertahankan kemampuan membuka grup.

## Responsivitas dan aksesibilitas

- Ikuti palet brand biru, permukaan netral, font Inter/system, dan radius aplikasi yang tersedia. Warna status hanya untuk status nyata.
- ENERGY 1 / RHYTHM 2 / MOTION 1: tenang untuk pekerjaan stok, hierarki berbeda untuk ringkasan dan formulir, serta gerak terbatas pada respons interaksi.
- Layar kecil memakai drawer/modal selebar ruang tersedia, satu kolom, header dan aksi utama tetap terjangkau, serta konten dapat digulir tanpa tertutup footer.
- Daftar dampak menjadi baris bertumpuk pada ponsel; tidak memaksa tabel empat kolom yang menyulitkan pembacaan.
- Target tombol minimal 44px, fokus terlihat, label terhubung dengan input, dan error memakai `aria-describedby`/`aria-invalid`.
- Dialog mengelola fokus, mendukung Escape, dan mengembalikan fokus ke pemicu. Navigasi Ringkasan/Satuan/Harga/Tambah satuan/Riwayat memakai semantik tab, tombol panah, Home/End, serta fokus keyboard yang benar.
- Pesan penyimpanan diumumkan melalui live region; error tidak hanya dibedakan melalui warna. Kontras teks memenuhi WCAG AA.

Alasan keputusan: tahap pembuatan mengurangi keputusan yang harus dipahami sekaligus; ringkasan dampak mencegah salah pengertian stok; pengaturan lanjutan menyembunyikan detail yang tidak dibutuhkan pemula; identitas visual yang sama memudahkan orientasi; jarak antarkelompok membantu pemindaian formulir; ikon dipakai untuk aksi atau status, bukan dekorasi.

## Draft, kesalahan, dan perubahan bersamaan

Draft dibandingkan dengan snapshot data yang dimuat atau terakhir berhasil disimpan. Menutup dialog atau drawer dengan perubahan meminta pilihan "Lanjutkan mengedit" atau "Buang perubahan". Escape mengikuti aturan yang sama. Konfirmasi berlaku pada draft pengguna, bukan sekadar pilihan navigasi atau filter.

Kegagalan submit mempertahankan draft, mengumumkan error, dan menyediakan tindakan mencoba lagi. Submit ganda dicegah. Keberhasilan memperbarui hanya snapshot/draft yang disimpan; input lain dipertahankan.

Untuk respons konflik, tampilkan pesan data berubah dan tindakan memuat ulang data. Memuat ulang tidak menimpa draft tanpa keputusan pengguna. Preview diberi keterangan bahwa server memvalidasi data terkini saat menyimpan.

## Komponen dan alur data

- `BulkStockGroupDrawer`: mengatur tahap, draft grup, detail tujuan, validasi, preview, dan submit melalui kontrak API yang ada.
- `StockGroupWorkspaceModal`: mengelola dialog, batas kesalahan, fokus, dan konfirmasi draft.
- Workspace: memisahkan panel ringkasan, stok, satuan, harga, tambah satuan, dan riwayat agar setiap panel dapat dipahami dan diuji sendiri.
- Helper frontend untuk validasi/preview menerima data dan draft, lalu mengembalikan hasil serta alasan tidak valid. Cocokkan hasil dengan resolver yang telah tersedia; hindari menyalin algoritma server secara berbeda.
- API/hook riwayat: membungkus endpoint riwayat dan query key berdasarkan grup/filter/halaman. Kontrak detail serta mutasi tetap mengikuti `stock-group-api.ts` dan `useStockGroup.ts`.
- `StockGroupBulkPanel`: penjelasan tindakan dan stok bersama diselaraskan; mekanisme approval tetap mengikuti flow sekarang.

Setiap symbol yang diubah harus melalui GitNexus impact upstream dan blast radius dilaporkan sebelum edit. Index diperbarui bila diperlukan; HIGH/CRITICAL diperingatkan. Detect changes dijalankan sebelum commit.

## Dokumentasi produk

Perbarui `HelpContent.tsx` untuk tahap membuat/menggabungkan grup, persediaan bersama, pengaturan stok akhir, satuan, harga, tambah satuan, dan riwayat. Perbarui `workflow-catalog.ts` untuk prosedur yang berubah, termasuk pemisahan pengaturan langsung dari pengajuan stok melalui approval.

## Kriteria penerimaan dan pengujian

Pengujian perilaku mengikuti TDD: tulis tes, pastikan gagal karena perilaku belum tersedia, baru implementasikan perubahan. Tes utama:

1. Tahap pembuatan menjaga draft saat Kembali dan memblokir perpindahan untuk input tidak valid.
2. Preview sumber stok tidak menjumlahkan stok produk; perubahan sumber memperbarui persamaan dan hasil.
3. Penggabungan memuat anggota lama, menangkap satuan duplikat, dan menampilkan dampak sesuai resolver server.
4. Input stok akhir dan satuan input menghasilkan preview yang sesuai; tidak ada submit ganda.
5. Konversi biasa/lanjutan, pergantian acuan, dan pilihan dampak stok mengikuti perhitungan server.
6. HPP kosong tidak menghasilkan margin menyesatkan; penyimpanan harga satu satuan tidak menghapus draft lain.
7. Tambah satuan menolak satuan duplikat dan konversi tidak valid serta memperlihatkan perilaku stok yang benar.
8. Riwayat menggunakan endpoint sebenarnya, pagination, filter, serta state loading/kosong/error/retry; respons usang diabaikan.
9. Tutup/Escape dengan draft memberi konfirmasi; pembatalan konfirmasi mempertahankan input dan fokus.
10. Izin yang tersedia tetap membatasi aksi dan endpoint; error server mempertahankan draft.

Jalankan tes fitur terkait, lint, dan type-check yang sesuai. Uji interaksi desktop dan ponsel (minimal lebar 375px dan 1280px), keyboard, fokus dialog, kontras, dan tema aplikasi yang tersedia. Catat hasil dan keterbatasan secara faktual.

Tidak menjalankan `pnpm build`. Pengguna mengelola lifecycle dev server sesuai AGENTS.md. Gunakan server dev yang tersedia untuk verifikasi UI; bila belum tersedia, nyatakan bahwa verifikasi browser belum selesai tanpa mengklaim UI telah teruji.

## Catatan pemeriksaan spesifikasi

Status perbaikan review 15 Oktober 2026: aksi **Coba lagi** telah diuji setelah kegagalan awal GET menghabiskan retry, lalu berhasil memuat workspace saat server pulih. Tautan **Ajukan perubahan stok di Inventori** memakai `/inventory`, izin update dan akses halaman yang tersedia, serta keputusan buang draft sebelum keluar. Fixture browser dan 72 tes fitur lulus bersama direct web tsc dan ESLint (nol error). Pernyataan ini mencakup pemeriksaan terarah; scoped re-review dan hasil suite menyeluruh akhir tetap dicatat oleh controller.

Spesifikasi telah diperiksa terhadap keputusan pengguna, kontrak API sumber, dan cakupan. Tidak ada perubahan kode aplikasi pada tahap desain. Daftar kriteria penerimaan mengikat rencana implementasi, bukan klaim hasil pengujian yang sudah lulus.

Headroom MCP tidak tersedia pada eksplorasi awal; pembacaan dibatasi per bagian. Tool tersedia kembali saat penulisan spesifikasi dan statistik sesi dipanggil. GitNexus context menemukan workspace; pencarian konsep mengalami degradasi karena FTS tidak tersedia. Analisis dampak mutakhir diperlukan sebelum implementasi.
