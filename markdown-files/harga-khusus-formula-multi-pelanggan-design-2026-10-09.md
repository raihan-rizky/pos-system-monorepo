# Desain Harga Khusus: Rumus Modal, Beberapa Tipe Pelanggan, dan Form Sederhana

Tanggal: 9 Oktober 2026

## Tujuan dan persetujuan

Pengguna meminta Harga Khusus mendukung rumus berdasarkan modal satuan terkecil produk, dengan harga hasil rumus tampil dinamis di POS dan Produk. Pengguna memilih tambahan rupiah dan tambahan persentase, penerapan hanya pada satuan yang dipilih, serta pilihan tipe pelanggan untuk melihat harga di Produk. Pengguna kemudian meminta satu aturan dapat berlaku untuk beberapa tipe pelanggan dan UI yang lebih sederhana.

Rancangan form satu halaman, daftar aturan ringkas, dan lokasi dokumentasi berikut disetujui melalui pesan `continue`: `C:\Projects\pos-system-monorepo\markdown-files`. Drive `D:` yang tercantum pada AGENTS tidak tersedia pada host ini. Nama dokumentasi mengikuti format `{filename}-{date}.md`.

Pengguna mengoreksi arti modal pada review spesifikasi: modal adalah modal satuan terkecil, misalnya Rp700/pcs. Untuk aturan Modal + Rp4.000 pada Rim, harga hasil adalah Rp4.700/rim. Modal Rp700 dipakai secara langsung dan tidak dikalikan isi satu rim. Koreksi ini menggantikan asumsi modal per satuan target pada versi sebelumnya.

Dokumen ini adalah spesifikasi desain untuk ditinjau sebelum rencana implementasi dibuat. Belum ada implementasi aplikasi atau migrasi database yang dijalankan pada tahap desain.

## Hasil yang diharapkan

Owner dapat memilih Kertas, Rim, pelanggan Umum dan Agen, lalu memilih Modal + rupiah dan mengisi 4.000. Jika modal satuan terkecil produk tersebut Rp700/pcs, harga efektif untuk Umum dan Agen adalah Rp4.700/rim. Industri dan Pemerintah mengikuti aturan harga yang berlaku untuk mereka. Harga satuan lain tidak diturunkan otomatis dari rumus Rim.

Ketika modal satuan terkecil berubah menjadi Rp800/pcs, hasil aturan yang sama menjadi Rp4.800/rim setelah data master terbaru diterima aplikasi. Harga tampil pada produk POS, pilihan satuan, keranjang, pembayaran, serta halaman Produk. Server mengambil modal satuan terkecil dari master produk untuk menghitung ulang harga saat menyimpan transaksi.

## Cakupan

- Dua cara hitung baru: Modal + rupiah dan Modal + persen.
- Pilihan beberapa tipe pelanggan dalam satu aturan, serta pilihan Semua pelanggan.
- Form tambah/ubah aturan yang sederhana, preview harga, dan daftar aturan yang mudah dibaca.
- Harga efektif pada tampilan POS dan Produk, termasuk varian/satuan.
- Perhitungan konsisten untuk transaksi online, draft, dan sinkronisasi offline.
- Kompatibilitas aturan diskon rupiah/persen yang sudah ada dan kontrak lama yang masih digunakan antrean offline.
- Pembaruan Bantuan, workflow AI Assistant, dan panduan AI yang terkait Harga Khusus.

Tidak termasuk parser rumus bebas, konversi keuntungan Rim ke satuan lain, pembaruan massal harga master dari rumus, perubahan stok, perubahan izin pengguna, atau perubahan harga transaksi yang sudah selesai.

## Cara hitung dan validasi

| Label pengguna | Mode domain | Perhitungan |
| --- | --- | --- |
| Modal + rupiah | `COST_PLUS_FLAT` | modal satuan terkecil + tambahan rupiah untuk satuan target |
| Modal + persen | `COST_PLUS_PERCENT` | modal satuan terkecil × (1 + tambahan persen / 100), dengan hasil sebagai harga satuan target |
| Diskon rupiah | `FLAT_DISCOUNT` | harga normal satuan - diskon rupiah |
| Diskon persen | `PERCENT_DISCOUNT` | harga normal satuan × (1 - diskon persen / 100) |

Nominal/persentase harus berupa angka finite, lebih dari nol, dan muat dalam presisi penyimpanan existing. Diskon persen maksimal 100. Tambahan persen adalah markup terhadap modal dan boleh lebih dari 100; ini berbeda dari persentase margin terhadap harga jual. Perhitungan uang mengikuti pembulatan existing ke dua angka desimal.

Aturan berbasis modal wajib memilih satuan tertentu. Aturan diskon existing tetap boleh berlaku untuk Semua satuan. Pencocokan satuan memakai trim dan normalisasi huruf existing, sehingga `Rim`, `rim`, dan ` rim ` cocok. Kategori dan merek tetap dicocokkan menggunakan ID.

Modal untuk rumus berasal dari `costPrice` produk/varian satuan terkecil yang terkait dengan produk target, bukan modal varian Rim ketika target aturan adalah Rim. Pada grup stok, ambil record yang mewakili `stockGroup.baseUnit`; modal dan satuan sumber ikut dibawa ke resolver sebagai `baseCostPrice` dan `baseCostUnit`. Pada produk standalone tanpa grup/varian terkait, satuan produk tersebut adalah satuan terkecilnya. Sumber modal harus berasal dari produk/grup dan toko yang sama, bukan produk kategori lain yang kebetulan menggunakan satuan pcs.

Rumus memakai nominal modal satuan terkecil secara langsung. Tidak mengalikan atau membaginya dengan `unitMultiplierToBase`, jumlah isi rim/dus, atau kuantitas keranjang. Hasil merupakan harga per satuan target; subtotal tetap hasil harga per satuan target × jumlah pembelian. Contoh: modal Rp700/pcs + Rp4.000 untuk Rim menghasilkan Rp4.700/rim; pembelian dua rim memiliki subtotal Rp9.400.

Modal satuan terkecil kosong, tidak finite, atau kurang dari/sama dengan nol tidak dianggap sebagai modal nol. Jika record sumber satuan terkecil tidak tersedia atau tidak dapat ditentukan dengan jelas, rumus juga tidak diterapkan. Resolver mengikuti fallback existing ke Harga Agen/Dinas yang valid sesuai pelanggan, kemudian Harga Normal. UI menandai bahwa modal satuan terkecil belum tersedia dan tidak menyatakan harga fallback sebagai hasil rumus yang berhasil.

Hasil diskon yang nol atau negatif mengikuti fallback existing. Pesan form harus menjelaskan fallback tersebut dengan benar, bukan menjanjikan harga Rp0.

## Pilihan pelanggan dan konflik

Tipe pelanggan tetap Umum (`UMUM`), Agen (`AGEN`), Industri (`INDUSTRI`), dan Pemerintah (`PEMERINTAH`). Form menggunakan checkbox dan pengguna dapat memilih lebih dari satu. Minimal satu target harus dipilih.

Semua pelanggan bersifat eksklusif: jika diaktifkan, aturan mencakup seluruh tipe pelanggan; memilih tipe tertentu mengubahnya menjadi pilihan spesifik. Ringkasan menampilkan Semua pelanggan atau nama tipe yang dipilih, misalnya Umum, Agen. Pemilihan seluruh empat tipe secara eksplisit dinormalisasi menjadi Semua pelanggan.

Satu aturan disimpan sebagai satu record dengan daftar target pelanggan. Mengubah atau menonaktifkan aturan berlaku pada seluruh daftar target tersebut secara atomik; sistem tidak menggandakan aturan menjadi record terpisah per pelanggan.

Dua aturan aktif dengan kategori, satuan, merek, dan pilihan pelanggan spesifik yang beririsan tidak boleh disimpan. Contoh: aturan Umum + Agen untuk Kertas/Rim/semua merek bertabrakan dengan aturan Agen pada scope yang sama. API mengembalikan konflik dengan nama pelanggan yang beririsan. Cek ini mengecualikan record yang sedang diedit.

Validasi konflik dan penyimpanan dilakukan dalam transaksi dengan penguncian scope yang konsisten agar dua request bersamaan tidak dapat menyimpan target pelanggan yang beririsan. Konflik tidak mengubah aturan tersimpan.

Aturan Semua pelanggan tetap boleh berdampingan dengan aturan untuk pelanggan spesifik. Aturan yang berbeda satuan atau merek mengikuti specificity existing. Jika aturan umum dan aturan yang lebih spesifik sama-sama cocok, resolver memakai urutan specificity existing. Kelompok pelanggan spesifik dihitung sebagai satu dimensi customer-specific, seperti aturan pelanggan tunggal existing.

## Urutan harga

1. Harga transaksi/manual yang sah mengikuti permission dan perilaku existing.
2. Aturan Harga Khusus aktif yang paling cocok dan menghasilkan harga valid.
3. Harga Agen untuk Agen atau Harga Dinas untuk Pemerintah, bila tersedia dan valid.
4. Harga Normal.

Parameter prioritas legacy boleh diterima untuk kompatibilitas payload lama, tetapi tidak mengubah urutan harga tunggal pada aplikasi saat ini. Tidak menambahkan kembali pilihan prioritas Harga Agen/Dinas pada pembayaran.

## UI Harga Khusus

### Daftar aturan

Halaman menampilkan judul Harga Khusus, penjelasan singkat, dan tombol Tambah aturan. Editor tidak lagi selalu terbuka pada panel sempit 360px.

Setiap baris menampilkan kategori dan satuan sebagai identitas utama; pelanggan dan merek sebagai keterangan; lalu cara hitung, status, dan aksi. Contoh ringkasan: `Kertas · Rim | Umum, Agen | Modal + Rp4.000`. Pada ponsel, informasi disusun vertikal tanpa tabel delapan kolom yang harus digeser.

Aksi memakai label Ubah dan Nonaktifkan. Aturan nonaktif tetap dapat dibuka dan diaktifkan kembali melalui form. Aksi simpan/nonaktifkan menampilkan status proses, kegagalan yang dapat dicoba ulang, serta keberhasilan yang jelas. Nonaktifkan bukan penghapusan record.

### Form satu halaman

Tambah aturan dan Ubah membuka Modal existing dari `@pos/ui`. Form memuat tiga kelompok:

1. Pilih produk: dropdown Kategori dan Satuan. Kategori baru dipilih secara sadar, bukan otomatis mengambil kategori pertama saat membuka form kosong.
2. Berlaku untuk siapa?: checkbox Umum, Agen, Industri, Pemerintah, dan Semua pelanggan.
3. Tentukan harga: pilihan empat cara hitung yang jelas dan satu input nilai dengan label sesuai konteks, misalnya Tambahan per rim (Rp) atau Tambahan (%).

Pengaturan tambahan dapat dibuka untuk membatasi Merek dan mengubah status aktif. Semua merek adalah default. Fasilitas tambah merek existing tetap dapat diakses di bagian tambahan, sehingga tidak mengganggu pengisian harga utama. Aturan baru aktif secara default.

Satuan berasal dari daftar satuan lengkap kategori pada toko pengguna, bukan hasil mengetik bebas atau hanya 200 produk pertama. Jika kategori diubah, pilihan satuan yang tidak tersedia di kategori baru dikosongkan. Saat mengedit aturan lama, satuan tersimpan tetap terlihat walaupun sudah tidak memiliki produk aktif; pengguna tidak kehilangan scope aturan saat membuka form.

### Preview dan umpan balik

Preview memakai sampel produk nyata yang sesuai kategori, satuan target, dan merek. Tampilkan hingga tiga contoh; setiap contoh rumus modal menjelaskan modal dan satuan sumber terkecil, tambahan, serta harga dan satuan target. Preview diskon memakai harga normal satuan target. Label menjelaskan bahwa angka berasal dari contoh produk, bukan satu harga seragam untuk seluruh kategori.

Contoh: `Modal satuan terkecil Rp700/pcs + tambahan Rp4.000 untuk Rim`, diikuti `Harga khusus Rp4.700/rim untuk Umum dan Agen`. Keterangan singkat pada pilihan rumus: Modal diambil dari satuan terkecil produk dan tidak dikalikan konversi satuan.

Preview dihitung ulang saat input nilai/cara hitung berubah. Scope baru memuat sampel yang sesuai dan menampilkan loading sampai datanya siap. Jika belum ada sampel produk yang cocok, tampilkan Belum ada produk yang cocok untuk contoh harga. Jika modal belum diisi, jelaskan bahwa produk tersebut akan memakai harga fallback.

Validasi muncul dekat kolom terkait, termasuk Pilih kategori terlebih dahulu, Pilih satuan untuk rumus modal, Pilih minimal satu tipe pelanggan, dan Isi tambahan lebih dari 0. Pesan konflik menyebut pelanggan yang bertabrakan. Setelah simpan, modal tertutup, daftar diperbarui, dan muncul Aturan harga berhasil disimpan. Saat gagal, input pengguna tetap tersimpan pada form.

Form memiliki label yang terhubung ke input, fokus terlihat, navigasi keyboard, pengelolaan fokus Modal existing, serta tombol yang dapat digunakan pada ponsel. Gaya warna, tipografi, spacing, dan komponen mengikuti aplikasi saat ini. Antislop diterapkan selama pengerjaan sesuai pilihan pengguna.

Design Read: form pengaturan harga untuk Owner toko dengan bahasa visual aplikasi POS existing; ENERGY 1 / RHYTHM 1 / MOTION 1. Hirarki menempatkan kategori/satuan, target pelanggan, lalu hasil harga; warna aksen existing dipakai pada aksi utama. Animasi sebatas feedback kontrol dan transisi Modal existing.

## Tampilan harga di POS dan Produk

### POS

Harga pada kartu produk, tombol/dropdown satuan, keranjang, dan pembayaran dihitung untuk tipe pelanggan aktif. Jika belum memilih pelanggan, gunakan Umum. Pergantian satuan memakai harga dan metadata scope varian target yang benar; modal rumus tetap berasal dari satuan terkecil terkait. Untuk dua satuan target dalam grup yang sama, sumber modal rumus tetap sama dan aturan/tambahan masing-masing satuan dapat berbeda.

Harga efektif ditampilkan sebagai angka utama dengan penanda Harga Khusus jika aturan diterapkan. Detail modal tetap mengikuti permission existing; penambahan rumus tidak membuka akses modal kepada role lain. Perubahan harga tidak mengubah angka jumlah saat pengguna mengganti satuan; perilaku stok/konversi existing dipertahankan.

Perubahan aturan atau modal satuan terkecil memicu refresh data terkait dan menghitung ulang harga dari data terbaru yang diterima, termasuk harga varian Rim/Dus yang bergantung pada sumber modal tersebut. Keranjang aktif menggunakan modal master satuan terkecil terbaru ketika tersedia, termasuk item yang tidak berada pada halaman katalog POS yang sedang terlihat. Mengubah modal Rim saja tidak mengganti sumber modal rumus selama pcs masih menjadi satuan terkecil grup. Harga manual tetap dipertahankan sesuai perilaku existing.

### Produk

Bagian daftar Produk menyediakan pilihan Harga untuk: Umum, Agen, Industri, Pemerintah. Default Umum, dan satu tipe digunakan pada satu waktu untuk preview. Pilihan ini tidak mengubah target pelanggan pada aturan atau data master produk.

Tabel dan grid Produk memakai harga efektif yang sama untuk tipe preview yang dipilih. Bila menampilkan margin bagi pengguna yang berhak, gunakan harga efektif terhadap modal akuntansi satuan target existing. Modal satuan terkecil sebagai basis rumus tidak menggantikan biaya akuntansi Rim/Dus pada laporan margin. Editor harga master tetap menampilkan nilai master existing. Sorting harga pada data yang sedang ditampilkan mengikuti angka efektif yang ditampilkan, sesuai mekanisme sorting halaman existing.

## Arsitektur dan data

### Resolver domain

`apps/web/features/customer-category-pricing/helpers/pricing-rules.ts` tetap menjadi pusat pencocokan dan perhitungan. Input produk ditambah `baseCostPrice` dan `baseCostUnit` untuk sumber modal satuan terkecil; input aturan mendukung daftar pelanggan serta mode rumus baru. Semua pemanggil meneruskan satuan target, merek, kategori, harga normal, harga member, dan modal satuan terkecil yang sesuai. Resolver tidak menyamakan `costPrice` satuan target dengan `baseCostPrice`.

Metadata harga menjaga arti `originalUnitPrice` sebagai harga normal/master existing, dan `appliedUnitPrice` sebagai harga efektif. Mode dan nilai aturan menjelaskan cara hitung. Snapshot biaya transaksi tetap memakai biaya akuntansi satuan target existing, sehingga laporan historis tidak bergantung pada modal master terbaru. Sumber modal satuan terkecil untuk rumus merupakan data terpisah dan tidak ditulis ke field biaya transaksi target.

### Penyimpanan dan kompatibilitas

Tambahkan array enum `customerTypes` ke record aturan dan mode `COST_PLUS_FLAT` serta `COST_PLUS_PERCENT` pada enum pricing existing. Array kosong menyatakan Semua pelanggan. Backfill aturan lama: pelanggan tunggal menjadi array satu elemen; aturan `customerType = null` tetap Semua pelanggan.

Kolom scalar `customerType` dapat dipertahankan untuk kompatibilitas transisi, tetapi seluruh pembaca/pemilih harga baru harus memakai daftar target yang sudah dinormalisasi. Penulis baru menyinkronkan scalar untuk aturan pelanggan tunggal, dan memakai null untuk Semua pelanggan maupun kelompok pelanggan. Untuk record legacy tanpa daftar, normalisasi membaca scalar lama. Setelah backfill, perubahan ke Semua pelanggan wajib membersihkan scalar agar tidak kembali menjadi pelanggan tunggal.

API baru mengirim daftar target pelanggan; Semua pelanggan direpresentasikan dengan sentinel `ALL` pada kontrak UI/domain dan array kosong pada database. Payload legacy `customerType` tetap diterima dan dinormalisasi. Payload yang mengirim kedua bentuk dengan arti berbeda ditolak sebagai validasi. Filter GET menurut satu tipe pelanggan memasukkan aturan kelompok yang mencakup tipe tersebut; pemilihan aturan aktif untuk checkout tetap mencakup Semua pelanggan.

Semua jalur pembaca scalar dan mode enum harus diinventarisasi pada rencana implementasi. Penambahan migrasi dan client Prisma disiapkan sebagai artefak. Tidak menjalankan migrasi terhadap database pengguna/produksi hanya untuk membuat UI bekerja. Deploy versi aplikasi baru dilakukan bersama; versi lama yang menganggap scalar null sebagai Semua pelanggan tidak boleh dipakai berdampingan untuk menghitung aturan kelompok baru.

### Form dan katalog

Pisahkan UI daftar, editor, dan helper preview jika diperlukan agar komponen tetap fokus. Scope options harus berasal dari query lengkap dan dibatasi toko/permission pengguna; contoh preview tidak boleh membocorkan modal lintas toko atau role.

Hook aturan menginvalidasi cache aturan setelah mutasi. Hook produk menginvalidasi cache produk dan varian terkait setelah modal satuan terkecil berubah. Katalog, opsi satuan, dan keranjang membawa `baseCostPrice`/`baseCostUnit` terpisah dari `costPrice` satuan target. Harga efektif berasal dari resolver bersama tanpa menulis ulang harga normal, harga Agen, atau harga Dinas dalam database.

### Server, draft, dan offline

Transaksi online dan draft memakai product master, record sumber modal satuan terkecil yang terkait dengan setiap item, serta aturan aktif dari toko yang benar. Query server tidak cukup hanya mengambil `costPrice` varian target; resolver menerima modal record satuan terkecil yang benar walaupun pcs tidak ikut dibeli. Modal dan harga hasil yang dikirim browser tidak dipercaya sebagai sumber harga otomatis. Snapshot harga final dan metadata pricing disimpan pada item transaksi.

Offline POS menghitung dengan sumber modal satuan terkecil dan aturan terakhir yang tersedia dalam cache katalog. Jika cache lama tidak memiliki sumber modal tersebut, rumus modal mengikuti fallback sampai data diperbarui. Saat sinkronisasi, server mengambil sumber modal satuan terkecil dari master dan menghitung ulang dengan aturan terbaru, lalu mengikuti mekanisme total drift/persetujuan existing jika ada perubahan. Payload antrean lama tetap dapat dibaca. Transaksi selesai tidak dihitung ulang karena aturan atau modal berubah.

## Dokumentasi yang diperbarui saat implementasi

- `apps/web/features/help-documentation/components/HelpContent.tsx`: langkah form sederhana, multi pelanggan, rumus modal satuan terkecil tanpa pengali konversi, preview Produk, dan fallback modal kosong.
- `apps/web/features/ai-assistant/workflows/workflow-catalog.ts`: langkah Harga Khusus dan alias rumus modal/multi pelanggan.
- `apps/web/features/ai-assistant/docs/help/faq.md`, `products.md`, dan `pos.md`: petunjuk yang sesuai dengan UI dan urutan harga saat ini.
- Dokumentasi implementasi bertanggal di `markdown-files`.

Dokumentasi Harga Khusus yang masih menyatakan kasir dapat memilih prioritas Harga Agen/Dinas diperbarui sesuai kode saat ini: harga khusus, kemudian member, kemudian normal. Ini merupakan penyelarasan panduan fitur yang sedang diubah.

## Pengujian dan kriteria penerimaan

TDD wajib: tes yang membuktikan perilaku baru harus ditulis dan dijalankan gagal karena perilaku tersebut belum tersedia sebelum implementasi tiap bagian.

1. Modal satuan terkecil Rp700/pcs + Rp4.000 pada aturan Rim menghasilkan Rp4.700/rim, meskipun isi satu rim 500 pcs dan `costPrice` varian Rim berbeda. Modal satuan terkecil +10% pada aturan Rim menghasilkan Rp770/rim. Jumlah dua rim menghasilkan subtotal Rp9.400 untuk aturan tambahan Rp4.000.
2. Mengubah modal pcs dari Rp700 menjadi Rp800 mengubah preview, harga katalog Rim, keranjang, dan harga server menjadi Rp4.800/rim pada aturan +Rp4.000. Mengubah modal Rim saja tidak mengubah basis rumus jika pcs adalah satuan terkecil. Harga master normal dan transaksi historis tidak ditulis ulang.
3. Aturan Umum + Agen cocok untuk keduanya dan tidak cocok untuk Industri/Pemerintah.
4. Aturan Rim tidak diterapkan pada lembar/dus; pencocokan satuan bersifat case-insensitive dan memakai metadata varian yang dipilih.
5. Minimal satu pelanggan diperlukan; Semua pelanggan eksklusif; kontrak aturan lama tetap berfungsi.
6. Konflik target pelanggan spesifik pada scope sama ditolak tanpa menyimpan sebagian perubahan; aturan Semua pelanggan dan scope lebih spesifik tetap dapat berdampingan.
7. Modal satuan terkecil kosong/tidak valid/ambigu, termasuk grup tanpa record sumber pcs, serta hasil diskon nonpositif menghasilkan fallback yang benar dan pesan UI yang akurat. Sistem tidak mencari modal pcs dari produk lain atau mengganti sumber dengan modal Rim secara diam-diam.
8. Harga manual, Harga Agen/Dinas, dan urutan specificity existing tetap sesuai kontrak sebelumnya.
9. Form dapat tambah, ubah, aktif/nonaktifkan, menampilkan preview, dan menangani error dengan input tetap utuh; daftar dan Modal dapat digunakan dengan keyboard serta di ponsel.
10. Pilihan Harga untuk di Produk mengubah harga tampilan tabel/grid sesuai resolver dan tidak mengubah data master.
11. API online/draft/offline mengabaikan modal otomatis dari browser dan menghitung harga dari record master satuan terkecil terkait, walaupun pcs tidak ada dalam keranjang. Snapshot biaya dan margin existing tetap memakai biaya akuntansi satuan target; total drift offline mengikuti alur existing.
12. Bantuan dan workflow AI menyebut langkah dan perilaku yang sudah diimplementasikan.

Validasi akhir memakai suite Vitest terkait, TypeScript tanpa emit, ESLint langsung pada file yang berubah, pemeriksaan diff, dan pengujian browser pada development server yang sudah dikelola pengguna. Tidak menjalankan `pnpm build` atau task lint yang bergantung pada production build. Tidak memulai atau menghentikan development server.

## Analisis dampak dan catatan eksekusi desain

GitNexus upstream impact pada `priceProductForCustomerType` menunjukkan HIGH: lima pemanggil langsung, tujuh simbol terdampak pada kedalaman dua, termasuk ProductGrid, helper checkout, transaksi online, draft, dan sinkronisasi offline. `findMatchingCategoryPricingRule` juga HIGH melalui resolver tersebut. Risiko telah diberitahukan kepada pengguna sebelum implementasi.

Indeks saat penelusuran tertinggal dari HEAD. Upaya `analyze --index-only` gagal karena worker tidak berhasil startup. Hasil indeks existing dicocokkan dengan snippet sumber. Sebelum perubahan simbol, jalankan impact untuk simbol yang benar dan usahakan indeks terbaru; keluaran indeks stale tidak dianggap bukti cakupan lengkap. Sebelum commit, jalankan detect-changes dan periksa diff yang distage hanya untuk tugas ini.

Headroom stats dipanggil pada awal/akhir sesi. Proxy kompresi tidak terhubung dan compression menghasilkan noop; pembacaan sumber dan output dibatasi. Tidak mengirim kredensial atau file environment.

Workspace memiliki perubahan pengguna pada AGENTS, transaksi DP, inventaris, pengadaan, dan file lain. Perubahan tersebut tidak termasuk desain ini dan tidak boleh dimasukkan ke commit spesifikasi atau implementasi fitur.
