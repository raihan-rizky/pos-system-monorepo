# Pohon persediaan grup produk

Tanggal rilis: 2026-10-22 (Asia/Jakarta). Entri Catatan Perubahan: `product-group-stock-tree`, revisi 1.

## Tujuan dan rancangan

Ringkasan grup di halaman Produk menampilkan satu akar **Stok bersama** yang terhubung ke seluruh satuan lewat garis cabang. Setiap cabang mewakili cara menghitung persediaan fisik yang sama. Angka stok antar cabang tidak dijumlahkan.

Rancangan Pohon Persediaan dipilih pengguna melalui brainstorming. Arahnya adalah diagram operasional dengan ENERGY 2 / RHYTHM 2 / MOTION 1: akar biru menjadi fokus utama, node satuan mudah dipindai, dan gerakan hanya berupa perubahan warna saat hover atau fokus.

Alasan keputusan visual:

- Biru tua pada akar menandai sumber persediaan bersama dan mengikuti warna aksi aplikasi.
- Garis bercabang membuat hubungan satu-ke-banyak terlihat langsung; kontras garis terhadap kanvas melebihi 3:1.
- Desktop menempatkan akar di kiri dan satuan di kanan; lebar komponen kecil mengubahnya menjadi pohon vertikal tanpa menggulir mendatar.
- Tipografi aplikasi dipertahankan agar dialog terasa menyatu; angka memakai tabular numerals untuk memudahkan perbandingan.
- Jarak antarcabang menjaga konektor tetap bersambung meskipun nama, SKU, dan satuan membungkus.
- Ikon persediaan dan kemasan membedakan peran akar dengan satuan; garis dan ikon dekoratif tidak dibacakan pembaca layar.

## Cara menggunakan

1. Buka detail grup dari halaman Produk atau Aktivitas Grup, lalu pilih **Ringkasan**.
2. Mulai dari akar **Stok bersama**, kemudian baca satuan, konversi terhadap satuan acuan, stok setara, nama produk, SKU, dan harga jual pada tiap cabang. Hubungan konversi tersimpan tetap tersedia di bawah pohon.
3. Gunakan **Atur konversi**, **Atur harga**, atau **Tambah satuan** sesuai izin. Pengaturan dibuka di tab yang sudah tersedia; perubahan tetap ditinjau dan disimpan melalui alur tab tersebut.

**Tetapkan stok akhir** tetap tersedia bagi pengguna berizin `inventory.update`. Pengajuan stok melalui Inventori tetap mengikuti alur persetujuan yang sudah ada.

## Perilaku dan aksesibilitas

- Pintasan pengaturan hanya muncul bila navigator tab tersedia dan izin pengguna sesuai: `product.update` untuk konversi/harga dan `product.create` untuk menambah satuan.
- Pintasan tidak dapat diaktifkan saat aksi terkait sedang menyimpan atau menunggu data satuan terbaru.
- Aktivasi pintasan memindahkan fokus ke tab tujuan. Tombol native, fokus terlihat, navigasi tab dengan panah/Home/End, serta Escape pada dialog tetap digunakan.
- Pohon memakai figure dan daftar berlabel, bukan widget seleksi yang mengharuskan pola keyboard baru. Konektor bersifat dekoratif; teks menjelaskan seluruh hubungan.
- Konversi tidak valid tidak ditampilkan sebagai rasio atau stok yang dapat dipakai. Peringatan stok negatif, satuan duplikat, dan konversi yang perlu diperiksa tetap terlihat.
- Grup kosong tetap memperlihatkan stok bersama beserta petunjuk menambahkan satuan.
- Teks panjang membungkus; tata letak diuji pada lebar 320, 390, 768, dan 1280 piksel, termasuk delapan satuan. Reduced motion dan forced colors didukung.

## Berkas utama

- `apps/web/features/product-stock-groups/components/StockGroupTree.tsx`
- `apps/web/features/product-stock-groups/components/StockGroupTree.module.css`
- `apps/web/features/product-stock-groups/components/WorkspacePanels.tsx`
- `apps/web/features/product-stock-groups/components/StockGroupWorkspace.tsx`
- `apps/web/features/product-stock-groups/components/__tests__/StockGroupTree.test.tsx`
- `apps/web/features/product-stock-groups/__tests__/stock-group-tree-browser.test.mjs`

Konten Bantuan untuk Owner, Admin, dan Inventaris, workflow AI Assistant `stock-group`, serta Catatan Perubahan diperbarui bersama. Screenshot Catatan Perubahan memakai dialog asli dengan data contoh yang diberi label: `apps/web/public/images/changelog/pohon-persediaan-produk.png`.

## Verifikasi

- TDD komponen: tes awal menunjukkan lima kegagalan yang sesuai karena pohon, pintasan, penanganan konversi tidak valid, dan keadaan kosong belum tersedia. Setelah implementasi, tujuh tes baru dan dua tes workspace lulus.
- Regresi keyboard: tes browser lebih dahulu membuktikan fokus hilang setelah aktivasi pintasan; pengelola tab kemudian memindahkan fokus ke tab tujuan.
- Regresi satu satuan: review menemukan konektor desktop berbeda tinggi sekitar 25 piksel. Tes geometri membuktikan kegagalan terlebih dahulu; daftar cabang kemudian dipusatkan pada grid agar konektor akar dan cabang bertemu, termasuk saat hanya ada satu satuan.
- Jalankan regresi fitur terkait dengan `pnpm --filter @pos/web test features/product-stock-groups features/changelog/__tests__/changelog.test.tsx features/ai-assistant/workflows/__tests__/workflow-catalog.test.ts features/help-documentation/__tests__/HelpContent.test.tsx`.
- Jalankan browser dengan `node apps/web/features/product-stock-groups/__tests__/stock-group-tree-browser.test.mjs`.
- Jalankan pemeriksaan tipe langsung dengan `pnpm --filter @pos/web exec tsc --noEmit --incremental false` dan ESLint pada berkas yang diubah.

Hasil sesi: 16 berkas tes dengan 147 tes regresi lulus, diikuti pengulangan sembilan tes komponen/workspace setelah penyempurnaan fokus. Pemeriksaan TypeScript langsung dan ESLint berkas perubahan lulus. Browser memverifikasi dialog asli, tiga pintasan, perpindahan fokus, navigasi tab, konektor grup satu satuan, empat ukuran layar, reduced motion, forced colors, izin baca, teks panjang, keadaan kosong, serta penutupan dengan Escape tanpa error JavaScript.

Pemeriksaan kualitas visual:

| Area | Hasil dan bukti |
| --- | --- |
| Hierarki dan identitas | PASS: akar biru serta konektor bersama membedakan persediaan dari satuan; screenshot dialog asli tersedia. |
| Perilaku kontrol | PASS: tiga pintasan membuka tab yang benar dan memindahkan fokus; pengguna tanpa izin tidak mendapat pintasan edit. |
| Ketahanan tampilan | PASS: tidak ada overflow panel/pohon pada 320, 390, dan 768 piksel; delapan nama satuan serta SKU panjang membungkus. |
| Aksesibilitas | PASS: daftar dan akar berlabel, fokus terlihat, tombol minimum 44 piksel, reduced motion dan forced colors; kontras konektor terhadap kanvas 3,56:1. |
| Isi dan keadaan | PASS: informasi berasal dari detail grup; kosong, konversi tidak valid, stok negatif, duplikat, loading, serta error tetap ditangani. Screenshot memakai data contoh berlabel. |
| Integrasi | PASS: tidak ada dependency baru; Bantuan, workflow AI Assistant, dan Catatan Perubahan diperbarui; riwayat rilis dipertahankan. |

## Catatan lingkungan pelaksanaan

- Lokasi dokumentasi `D:\main_project\pos-system-monorepo\markdown-files` tidak tersedia pada lingkungan ini. Dokumentasi disimpan di folder `markdown-files` checkout aktif: `C:\Projects\pos-system-monorepo`.
- Folder `markdown-files/` memang diabaikan oleh `.gitignore` repository; dokumen tetap dibuat pada disk tanpa mengubah aturan Git tersebut.
- Headroom dipanggil saat mulai sesi dan untuk kompresi materi besar. Endpoint kompresi merespons, tetapi melaporkan proxy lokal tidak terjangkau; pembacaan lanjutan dibatasi sesuai kebutuhan.
- GitNexus `query` dan `impact` sudah dicoba. Analisis tidak dapat berjalan karena Windows Application Control memblokir modul native `tree-sitter-cpp.node`. Pemeriksaan referensi langsung menemukan panel Ringkasan dipakai oleh workspace grup pada halaman Produk; tidak ada perubahan API, database, atau perhitungan stok.
- Serena initial instructions juga dicoba, tetapi tool tidak tersedia pada sesi ini.
- Perintah `pnpm type-check` di root memicu tugas build melalui `type-check.dependsOn: ["^build"]` di Turbo. Proses validasi itu segera dihentikan; pemeriksaan berikutnya menjalankan TypeScript langsung. Tidak ada server development yang dimulai atau dihentikan.
