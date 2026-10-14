# Penghapusan Check In Inventaris

Tanggal: 2026-10-14
Status: Pilihan rancangan 1 disetujui; spesifikasi tertulis menunggu tinjauan pengguna sebelum implementasi.

## Tujuan dan cakupan

Hapus fitur Check In dari halaman Inventaris. Pengguna dengan izin inventaris dapat langsung mengakses Tugas Harian dan Tugas Mingguan. Check Out tetap menjadi alur penutupan hari, dengan pemeriksaan tugas wajib dan alasan pengecualian yang sudah tersedia.

## Perilaku halaman

- Hapus tombol Check In, Lihat Morning Check, modal Morning Check, informasi pelaksana check-in, serta instruksi untuk melakukan check-in.
- Hapus penguncian, efek buram, dan lapisan Check In Diperlukan pada tab Tugas maupun panel Pusat Kerja Hari Ini.
- Akses tugas mengikuti izin pengguna yang sudah berlaku dan tidak bergantung pada pemuatan sesi harian. Pengecualian OWNER untuk aturan lain, termasuk waktu matching stok, tetap berlaku.
- Panel sesi harian menjadi panel Check Out. Saat belum ditutup, tampilkan status hari belum ditutup tanpa meminta check-in. Setelah berhasil, tampilkan status sudah ditutup dan nonaktifkan tombol penutupan sesuai status tersebut.
- Kegagalan memuat atau menyimpan check-out menampilkan pesan yang ramah dalam bahasa Indonesia; kegagalan tersebut tidak menghalangi akses tugas.
- Riwayat Tugas Harian menampilkan riwayat Check Out dan ringkasan dari snapshot tersimpan. Hapus subtab Check In dari halaman.

## Sesi harian dan data

- Endpoint check-out tidak lagi menolak hari karena sesi belum ada atau berstatus NOT_CHECKED_IN.
- Setelah izin, input, tugas wajib, dan alasan pengecualian berhasil divalidasi, buat atau perbarui sesi untuk kombinasi toko dan tanggal bisnis Asia/Jakarta yang sama. Simpan status CHECKED_OUT, pelaksana, waktu, catatan, dan snapshot penutupan.
- Jangan membuat sesi atau mengubah data saat validasi gagal. Gunakan constraint unik toko dan periode untuk mencegah duplikasi sesi.
- Snapshot check-out dapat dibentuk tanpa morningCheckSnapshot. Jangan membuat identitas, waktu, ataupun snapshot check-in palsu sebagai pengganti.
- Pertahankan kolom dan data check-in lama. Sesi lama yang masih CHECKED_IN maupun NOT_CHECKED_IN tetap dapat ditutup menggunakan alur baru.
- Pertahankan isolasi toko serta pemeriksaan izin API. Tidak ada perubahan stok otomatis, penghapusan riwayat, atau migrasi database.
- Hapus koneksi check-in dari UI dan client halaman Inventaris. Endpoint check-in lama tetap tersedia untuk kompatibilitas; penghapusan endpoint dan kolom historis berada di luar cakupan perubahan halaman ini.

## Area yang perlu diperiksa dan diubah

- InventoryWorkspace: akses tab Tugas dan panel pusat kerja, serta state/callback sesi yang hanya dipakai untuk check-in.
- InventoryDaySessionPanel: hapus alur Morning Check dan pertahankan dialog serta validasi check-out.
- InventoryDaySessionHistory: tampilkan riwayat penutupan tanpa subtab check-in.
- API check-out, layanan sesi harian, tipe API, dan pemuatan awal halaman: dukung check-out saat sesi belum ada, serta hilangkan dependensi check-in yang tidak lagi diperlukan.
- HelpContent.tsx, workflow-catalog.ts, dokumentasi bantuan AI Assistant dan FAQ yang terkait: sinkronkan instruksi akses tugas, penutupan hari, dan riwayat.
- Dokumentasi fitur check-in/check-out: jelaskan alur check-out terbaru dan penyimpanan data historis.

## Pengujian dan kriteria penerimaan

1. Tulis pengujian regresi dan verifikasi gagal sebelum implementasi.
2. Pengguna selain OWNER dengan izin yang sesuai langsung melihat tugas tanpa check-in, termasuk saat preview sesi belum tersedia.
3. Halaman tidak menampilkan tombol, modal, tab riwayat, atau penghalang check-in.
4. Check-out tanpa sesi sebelumnya berhasil ketika tugas wajib selesai atau alasan pengecualian valid; menghasilkan tepat satu sesi penutupan dengan data check-in kosong.
5. Check-out dengan tugas wajib belum selesai dan alasan tidak lengkap ditolak tanpa perubahan database.
6. Check-out dari sesi lama tetap berfungsi; snapshot dan riwayat lama tetap dapat dibaca, termasuk snapshot tanpa Morning Check.
7. Izin, isolasi toko, tanggal Jakarta, dan status sudah ditutup tetap ditangani dengan benar.
8. Jalankan tes terkait, lint, dan type-check. Verifikasi UI pada server yang dikelola pengguna bila tersedia. Jangan menjalankan pnpm build atau memulai/menghentikan server.
9. Jalankan GitNexus impact sebelum mengubah setiap simbol, laporkan cakupan dan risiko, serta jalankan detect_changes sebelum commit.

## Catatan lingkungan

- Lokasi dokumentasi yang diminta, D:\main_project\pos-system-monorepo\markdown-files, tidak dapat digunakan karena drive D: tidak tersedia. Spesifikasi sementara disimpan di C:\Projects\pos-system-monorepo\markdown-files.
- GitNexus MCP tidak tersedia. CLI lokal berfungsi setelah repository ditentukan secara eksplisit. Pencarian InventoryWorkspace menghasilkan dua kandidat; impact pada fungsi yang tepat dan seluruh simbol lain harus diselesaikan sebelum pengeditan kode.
- Serena initial_instructions mengembalikan tool tidak tersedia.
- Headroom stats telah dipanggil. Proxy kompresi tidak terhubung; gunakan keluaran terbatas dan jangan kirim rahasia.

## Tinjauan spesifikasi

Rancangan mengikuti pilihan 1 yang disetujui: check-in dihapus dari alur halaman, tugas langsung tersedia, check-out dipertahankan, dan data historis disimpan. Tidak ada penambahan fitur atau perubahan stok. Implementasi belum dimulai dan belum ada pengujian yang dijalankan.

Pemeriksaan antislop diusulkan selama implementasi, mengikuti tampilan komponen yang sudah ada tanpa perancangan ulang halaman.
