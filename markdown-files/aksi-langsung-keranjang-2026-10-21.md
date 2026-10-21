# Aksi langsung pada kartu keranjang

Tanggal: 2026-10-21 (Asia/Jakarta)

## Perubahan

- Tombol pensil pengaktif Edit Cepat di header keranjang dihapus.
- Tombol **Edit** dan **Harga** langsung tampil bagi akun dengan izin `product:update`.
- Nama produk, harga satuan, dan referensi Normal/Agen/Dinas memakai lebar kartu.
- Total baris tetap menjadi angka utama. Aksi Edit/Harga ditempatkan di kiri baris pengatur jumlah, dengan tombol hapus di pojok kanan atas.
- Di ruang sempit, baris aksi dapat membungkus agar tidak terjadi overflow. Area sentuh tetap minimal 44 px pada perangkat sentuh.
- Bantuan beserta ilustrasi POS, katalog workflow AI Assistant, dan Catatan Perubahan diperbarui sesuai alur baru.

## Alur penggunaan

1. Tambahkan produk ke keranjang di Kasir.
2. Klik **Edit** untuk nama/kategori/merek atau **Harga** untuk harga master/harga khusus transaksi.
3. Simpan melalui modal yang sama seperti sebelumnya.

## Alasan tata letak

- Biru merek tetap digunakan pada total agar nilai baris mudah ditemukan.
- Aksi tanpa kotak besar mengurangi kepadatan visual dan tetap memiliki label yang jelas.
- Referensi harga memakai tiga kolom penuh agar tidak terjepit oleh kontrol.
- Ukuran teks mengikuti komponen POS yang ada agar konsisten.
- Garis tipis memisahkan informasi dari aksi tanpa menambah panel baru.

## Verifikasi

- Tes regresi dibuat terlebih dahulu dan terbukti gagal karena Edit/Harga masih tersembunyi sebelum implementasi.
- Cakupan tes: aksi langsung terlihat, izin edit, callback produk/harga, keyboard, jumlah, hapus item, baris jasa, nama panjang, dan lebar 320/360/390 px.
- Tes kartu: **10/10 lulus**.
- Tes browser desktop/ponsel: **lulus**, termasuk aksi langsung, hak akses, keyboard, jumlah, hapus, baris jasa, dan layout 320/360/390 px.
- Regresi gabungan: **236 lulus, 1 gagal** dari 237 tes. Kegagalan berada pada `HelpContent.test.tsx:146`, panduan penerimaan barang yang mengharapkan teks `Pilih Pembelian Barang`.
- Baseline yang mengembalikan hanya teks Bantuan sesi ini di memori tetap menghasilkan kegagalan yang sama; kegagalan tersebut berasal dari kondisi yang sudah ada sebelum perubahan ini.
- ESLint pada seluruh file yang diubah: **lulus tanpa error maupun warning**. `git diff --check` juga lulus.
- TypeScript web (`pnpm --filter @pos/web type-check`): **lulus** setelah seluruh perubahan komponen dan ilustrasi.
- Ilustrasi Bantuan: 27 dari 28 tes lulus pada run lengkap; satu tes multi-preview lama melewati timeout 5 detik. Run ulang tes tersebut bersama tes aksi baru dengan batas 20 detik lulus **2/2** (durasi tes 1,39 detik), sehingga seluruh 28 tes telah lulus di antara dua run.
- Screenshot terpotong dari komponen asli dengan data contoh tersedia di `apps/web/public/images/changelog/aksi-langsung-keranjang.png`.

### Pemeriksaan desain

- Arah: kartu transaksi ringkas untuk kasir, mengikuti warna dan tipografi POS. Energy/Rhythm/Motion: 1/1/1.
- Fungsi: pengujian browser membuktikan callback edit/harga, keyboard, jumlah, dan hapus bekerja.
- Tata letak: screenshot desktop/ponsel diperiksa dan tidak ada overflow pada lebar 320/360/390 px.
- Hierarki: total baris memakai aksen merek; garis tipis dan jarak memisahkan informasi dari aksi.

## Catatan eksekusi

- Lokasi dokumentasi memakai folder repo aktif sesuai persetujuan pengguna karena lokasi drive D tidak tersedia.
- Tidak menjalankan production build atau mengubah siklus hidup development server.
- Headroom dipanggil pada awal/akhir sesi dan sebelum keluaran besar; proxy kompresi melaporkan tidak dapat dihubungi sehingga keluaran dijaga terbatas.
- Pengambilan paket modern-web-guidance ditolak automatic approval review karena mengunduh dan menjalankan paket eksternal. Panduan ukuran target diperiksa dari dokumentasi resmi W3C.
