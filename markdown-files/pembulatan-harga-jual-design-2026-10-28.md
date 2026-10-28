# Pembulatan harga jual: rancangan yang disetujui

Tanggal: 2026-10-28 (Asia/Jakarta). Status: disetujui melalui percakapan.

## Tujuan

Semua harga jual produk memakai kebijakan pembulatan yang sama pada hasil akhir perhitungan. Pengguna dapat melihat arah, harga asal, dan selisih pembulatan. Owner dapat mengubah kebijakan melalui Pengaturan dan mendelegasikan izin melalui RBAC.

## Aturan

- Default aktif, kelipatan Rp500, ambang naik Rp50.
- Hitung kelipatan bawah dan sisa harga terhadap kelipatan itu. Sisa nol tetap; sisa di bawah ambang turun; sisa mulai ambang naik satu kelipatan.
- Rp4.049 menjadi Rp4.000; Rp4.050 menjadi Rp4.500; Rp4.500 tetap; Rp4.549 menjadi Rp4.500; Rp4.550 menjadi Rp5.000.
- Kelipatan bilangan bulat positif, ambang bilangan bulat dari nol sampai kelipatan. Angka harus terbatas dan dalam kapasitas nilai uang aplikasi.
- Hitung dengan presisi sen agar Rp4.049,99 tetap turun. Harga nol tetap nol.
- Pembulatan hanya sekali pada hasil akhir harga normal, member, rumus khusus, harga khusus transaksi, dan setiap varian/satuan. HPP, persentase, faktor konversi, diskon baris/total, pajak, serta jasa percetakan tidak memakai aturan ini.

## Data dan arsitektur

- Harga asal tetap disimpan pada master produk dan impor; kalkulasi satuan otomatis tetap memakai nilai asal agar faktor tidak bergeser.
- Hasil harga efektif membawa metadata `originalPrice`, `roundedPrice`, `direction`, dan `difference` untuk badge.
- Satu fungsi murni dipakai UI dan server. Server membaca konfigurasi tersimpan untuk penjualan baru, draft, approval, dan sinkronisasi offline.
- Transaksi menyimpan harga final saat transaksi dilakukan. Riwayat final tidak dihitung ulang ketika pengaturan berubah.
- Konfigurasi memakai pola StoreSettings yang sudah ada; endpoint baca kebijakan tersedia bagi pengguna aplikasi yang terautentikasi supaya kasir dapat menghitung harga. Hak mengelola tab dan menyimpan konfigurasi memakai resource `settings.price_rounding`, default hanya OWNER, dapat didelegasikan melalui RBAC.
- Perubahan pengaturan memperbarui query harga dan keranjang. Harga asal tetap tersedia saat aturan dinonaktifkan atau diubah.

## Antarmuka

- Pengaturan > Pembulatan Harga: saklar aktif, kelipatan, ambang naik, pratinjau yang langsung berubah, tombol Simpan, status memuat/menyimpan, kesalahan, dan konfirmasi berhasil.
- Badge `Dibulatkan ke atas` atau `Dibulatkan ke bawah` hanya jika harga berubah. Rincian menampilkan harga asal, harga final, dan selisih.
- Badge mendukung sentuhan, klik, keyboard, dan pembaca layar; membuka rincian tidak menambah produk ke keranjang.
- Daftar produk, kartu POS, keranjang, pratinjau formulir, harga satuan, dan impor memakai hasil yang sama. Warna mengikuti tema aplikasi; teks menyampaikan arah tanpa bergantung pada warna.

## Verifikasi

- TDD untuk ambang 49/50, 549/550, pecahan, nol, kelipatan tepat, pengaturan mati, pengaturan alternatif, dan input tidak valid.
- Periksa hasil rumus sebelum pembulatan dan konsistensi katalog, keranjang, serta validasi server.
- Tes izin OWNER default, role lain ditolak, serta izin delegasi.
- Tes interaksi badge dan pengaturan, termasuk keyboard dan lebar layar kecil.
- Jalankan Vitest terkait, pemeriksaan TypeScript, dan lint terarah. Jangan menjalankan production build atau mengelola lifecycle pnpm dev.
- Perbarui Bantuan, workflow AI Assistant, dan catatan perubahan tanggal 2026-10-28.

## Catatan lingkungan

- Checkout berisi perubahan lokal yang sudah ada; perubahan tersebut dipertahankan.
- Drive D yang disebut AGENTS.md tidak tersedia. Dokumen disimpan di `C:/Projects/pos-system-monorepo/markdown-files`.
- Headroom stats dapat dipanggil, tetapi proxy kompresi tidak terhubung. Pemeriksaan memakai keluaran yang dibatasi.
- Refresh GitNexus gagal karena worker native tidak dapat dimulai; impact tetap dicoba pada indeks yang tersedia dan diperkuat dengan penelusuran pemanggil terbatas.
