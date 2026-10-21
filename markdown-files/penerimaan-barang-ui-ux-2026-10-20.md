# Perbaikan tampilan riwayat Penerimaan Barang

Tanggal: 2026-10-20 (Asia/Jakarta)

## Tujuan

Memudahkan staf gudang dan pemilik toko membaca riwayat, menemukan penerimaan, dan membandingkan barang yang dipesan dengan barang yang datang.

## Perubahan

- Judul, penjelasan singkat, dan tombol Catat Penerimaan memiliki urutan visual yang jelas.
- Filter status menunjukkan pilihan aktif dan tetap memakai filter server. Pencarian lokal pada hasil filter mencakup supplier, produk, SKU, dan nomor PB, tanpa membedakan huruf besar/kecil.
- Supplier dan nomor PB terlihat langsung dalam satu kolom. Tanggal memakai WIB dan nama bulan Indonesia.
- Status memakai label, ikon, dan warna. Penerimaan yang diajukan juga menunjukkan jumlah produk yang disetujui.
- Lihat Detail membuka rincian berlabel Produk, Dipesan, Diterima, Kondisi, dan Persetujuan, beserta catatan dan alasan penolakan jika tersedia. Kondisi kosong ditulis Belum diperiksa.
- Setiap produk dalam detail dilengkapi thumbnail 48px dari foto produk saat ini. Produk tanpa foto atau foto yang gagal dimuat memakai ikon paket. Gambar dimuat secara lazy dengan ukuran tetap agar tata letak stabil. URL foto dimuat bersama query riwayat, tanpa permintaan API tambahan per produk dan tanpa migrasi database.
- Container query mengubah tabel menjadi kartu saat ruang komponen sempit, termasuk ketika tab digunakan dalam panel Inventaris.
- Kontrol mendukung keyboard, fokus terlihat, status filter diumumkan melalui aria-pressed, dan detail memakai aria-expanded serta aria-controls.
- Judul dan kontrol tetap tersedia saat memuat atau gagal. Pesan gagal berbahasa Indonesia menyediakan Coba lagi.
- Respons permintaan lama diabaikan ketika pengguna berpindah filter atau cakupan dengan cepat. Uji keterlambatan respons gagal sebelum penjagaan urutan permintaan ditambahkan.

## Cakupan

Komponen bersama `InboundReceiptTab` digunakan oleh Supplier dan Inventaris. Endpoint, otorisasi, payload mutasi, persetujuan, dan perhitungan stok menggunakan alur yang sudah ada. Pencarian menyaring hasil status dan cakupan supplier/PB yang sedang dibuka.

## Arah visual

Antarmuka operasional yang tenang: tipografi aplikasi dipertahankan, aksen indigo menandai tindakan utama, garis dan ruang memisahkan informasi, warna status membantu pemeriksaan. ENERGY 1 / RHYTHM 1 / MOTION 1. Tidak ada aset dekoratif atau angka ringkasan buatan. DFII: 15 (impact 3, fit 5, feasibility 5, performance 4, consistency risk 2).

## Verifikasi

- Uji browser menggunakan komponen React, CSS Tailwind, dan API client asli dengan respons API serta izin berbasis data contoh. Uji pertama gagal karena kotak pencarian belum tersedia.
- Skenario: pencarian supplier/produk/SKU/PB, reset, buka detail lewat keyboard, tanggal WIB, catatan, filter status, callback pembuatan, pesan gagal dan coba lagi, loading, cakupan permintaan PB/supplier, serta pembatasan izin.
- Tampilan diperiksa pada desktop, 390px, dan 320px, termasuk pemeriksaan overflow horizontal.
- Hasil akhir: 21 tes pada 5 berkas regresi lulus; uji browser lulus termasuk filter cepat dengan respons terlambat. TypeScript dan ESLint keluar dengan kode 0 tanpa diagnostik. Bukti eksekusi berada di `output/inbound-receipt-ui-*`.
- Tambahan thumbnail: 27 tes pada 7 berkas lulus. Uji proyeksi repository memastikan URL foto diteruskan dan query tetap dibatasi toko/filter; uji browser memeriksa gambar asli termuat, placeholder foto kosong, fallback gambar rusak, dan layout HP. TypeScript seluruh aplikasi dan ESLint lulus tanpa diagnostik. Bukti berada di `output/inbound-thumbnail-*`.
- Screenshot Catatan Perubahan berasal dari komponen asli dengan nama supplier dan barang contoh, tanpa data pelanggan, kredensial, atau ringkasan keuangan.
- Peninjauan kode terpisah tidak menemukan masalah yang menghalangi. Verifikasi browser menggunakan fixture, sehingga integrasi autentikasi Next.js dan koneksi backend langsung belum diuji.

## Pemeriksaan desain selama pengerjaan

| Pemeriksaan | Hasil dan bukti |
| --- | --- |
| Tujuan dan hirarki | PASS: satu tombol Catat Penerimaan sebagai aksi utama; screenshot desktop memperlihatkan filter dan pencarian terpisah dari baris data. |
| Ketepatan konten | PASS: jumlah berasal dari respons API; screenshot memakai supplier berlabel Contoh; tidak ada klaim, statistik, atau navigasi buatan. |
| Responsif | PASS: uji browser 390px dan 320px memastikan tidak ada overflow horizontal; screenshot HP diperiksa secara visual. |
| Kontrol dan akses keyboard | PASS: pencarian, reset, filter, tombol pembuatan, detail melalui Enter, serta coba lagi dijalankan pada komponen asli. Fokus terlihat pada screenshot desktop. |
| Status antarmuka | PASS: uji mencakup loading, pencarian kosong, kegagalan API, retry, status ditolak, dan kondisi barang yang belum diperiksa. |
| Konsistensi dan pembatasan | PASS: font aplikasi dan aksen indigo dipertahankan, tanpa animasi dekoratif; izin create/approve/reject diuji pada role terbatas. |

## Catatan lingkungan

GitNexus menilai dampak `InboundReceiptTab` LOW: satu pemakai langsung yang terindeks (`InventoryWorkspace`) dan satu pemakai tidak langsung (`InventoryPage`), tanpa proses terindeks yang terdampak. Pemakaian dinamis di `SupplierPageShell` juga diperiksa melalui kode. Pencarian GitNexus terdegradasi karena indeks FTS tidak tersedia.

Headroom stats dan compression dicoba di awal sesi; proxy kompresi tidak dapat terhubung. Pembacaan lanjutan memakai keluaran terbatas. Drive `D:` dari panduan tidak tersedia di lingkungan ini, sehingga dokumentasi disimpan pada folder `markdown-files` checkout aktif `C:\Projects\pos-system-monorepo`.
