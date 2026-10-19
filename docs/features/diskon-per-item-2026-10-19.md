# Diskon per item saat pembayaran

Tanggal rilis: 2026-10-19 (Asia/Jakarta).

## Penggunaan

1. Buka Kasir dan klik Bayar. Pada Ringkasan item, klik Diskon di sebelah baris yang ingin diberi potongan.
2. Pilih Rp atau %, isi nilai, lalu klik Terapkan diskon. Untuk beberapa item, centang baris yang diinginkan pada Ringkasan item, lalu klik Diskon N item terpilih.
3. Periksa ringkasan pembayaran, lalu konfirmasi pembayaran atau simpan draft melalui Faktur Sementara. Klik Diskon untuk mengedit, atau Hapus diskon untuk menghapus potongan pada suatu baris.

Diskon baru mengganti diskon manual sebelumnya pada baris terpilih. Baris yang tidak dipilih tetap memakai diskonnya sendiri. Batalkan atau terapkan editor diskon sebelum melanjutkan pembayaran.

## Aturan perhitungan

- Harga mengikuti aturan pelanggan dan harga khusus transaksi yang sudah berlaku.
- Diskon Rp memotong total satu baris, bukan setiap unit. Contoh: 3 x Rp10.000 dengan diskon Rp5.000 menghasilkan subtotal baris Rp25.000.
- Diskon persen dihitung dari harga satuan dikali jumlah pada setiap baris. Nilai yang sama diterapkan secara terpisah ke semua baris terpilih.
- Diskon item diterapkan sebelum diskon transaksi; pajak dihitung setelah keduanya.
- Input mendukung maksimal dua angka desimal. Persen 0 sampai 100; nominal Rp tidak boleh melebihi nilai baris terpilih. Nilai kosong, negatif, atau tidak valid ditolak.
- Potongan yang tersimpan dibulatkan ke dua desimal; pajak mengikuti aturan pembulatan rupiah yang sudah digunakan aplikasi.
- Diskon 100% pada semua item menghasilkan pembayaran lunas Rp0. Transaksi Tempo dan DP tetap memerlukan sisa tagihan.
- Saat harga atau jumlah berubah, diskon persen di modal dihitung ulang; nominal diskon dibatasi sampai nilai baris. Diskon yang sudah disimpan di draft dipertahankan sebagai nominal saat persetujuan dan dibatasi jika nilai baris menyusut.

## Penyimpanan dan nota

Kolom TransactionItem.discount yang sudah tersedia menyimpan nominal potongan total baris. unitPrice tetap menyimpan harga satuan sebelum potongan manual, sedangkan subtotal item menyimpan nilai bersih. Transaction.subtotal merupakan jumlah subtotal item bersih; Transaction.discount menyimpan potongan transaksi saja. Tidak diperlukan migrasi database untuk fitur ini.

API transaksi dan draft memvalidasi diskon terhadap harga yang berlaku di server. Persetujuan draft dan transaksi tertunda mempertahankan diskon berdasarkan identitas baris sumber, menolak sumber ganda atau ambigu, dan menyimpan nilai penawaran yang disetujui. Keterangan diskon item tampil pada nota HTML dan PDF biasa maupun faktur sementara, tanpa dikurangkan dua kali.

Antrean offline menyimpan subtotal bersih dan diskon setiap baris. Sinkronisasi menghitung ulang harga server, membatasi potongan saat stok/jumlah menyusut, dan membagi stok produk yang sama secara berurutan.

Edit transaksi dari Riwayat mempertahankan diskon berdasarkan identitas item tersimpan, membatasi potongan saat nilai baris turun, dan menghitung ulang pajak setelah diskon item dan transaksi. Item baru tidak dapat menyuntikkan diskon melalui endpoint edit.

Bantuan Kasir, katalog workflow AI Assistant, dan Catatan Perubahan diperbarui. Gambar Catatan Perubahan memakai data contoh pada modal Pembayaran.

## Verifikasi

- Tes helper: penerapan sekaligus, penggantian/penghapusan, persen, pembulatan, batas nominal, dan perubahan harga.
- Tes API: produk, jasa, draft, beberapa baris produk yang sama, input tidak valid, pajak setelah kedua diskon, dan pembayaran Rp0.
- Tes persetujuan: pelestarian potongan, penyesuaian nilai, identitas sumber, fingerprint, dan penyimpanan hasil persetujuan.
- Tes persistensi: payload draft, antrean/sinkronisasi offline, stok berkurang, produk ganda, serta edit Riwayat dan pajaknya.
- Tes nota: anotasi HTML/PDF, subtotal bersih, serta kompatibilitas nota tanpa diskon.
- Uji browser: modal asli dengan data contoh, satu/beberapa item, keyboard, validasi, draft, reset, dan layar ponsel.
- TypeScript dan ESLint pada kode yang berubah.

### Cakupan tambahan sebelum commit

Ditambahkan 58 kasus tes unit, kontrak inti, API, dan offline, serta skenario browser baru.

| Lapisan | Risiko yang diperiksa |
| --- | --- |
| Unit perhitungan | Rp per baris, jumlah pecahan, pembulatan sen, harga nol, diskon penuh, input non-finite/negatif, overflow, identitas baris dan data sumber tidak berubah |
| Kontrak inti checkout | Harga pelanggan/harga khusus sebelum diskon, subtotal dan pajak konsisten dari checkout ke draft dan sinkronisasi offline, izin harga manual tetap berlaku |
| API transaksi/draft | Presisi dua desimal, batas satu sen, harga klien palsu, diskon produk ganda, diskon penuh tetap memotong stok, draft Rp0 |
| Offline | Tidak ada stok tetap ditolak meski pembayaran Rp0, batas tujuh hari, potongan tidak berpindah saat baris dihapus, stok sumber tidak berubah |
| Browser komponen asli | Satu/beberapa item, Rp/%, batal edit, draft diblokir saat editor belum diterapkan, penghitungan ulang harga, baris produk sama, keyboard, reset, dan layar ponsel |

Perintah verifikasi tanpa build:

```powershell
pnpm test
pnpm --filter @pos/web type-check
node apps/web/features/pos-checkout/__tests__/payment-item-discount-browser.test.mjs
```

Suite lengkap: 488 berkas lulus dan 2 dilewati; 3.241 tes lulus dan 10 dilewati. Kelompok tes tambahan: 6 berkas, 147 tes lulus. Mutasi yang mengabaikan pengurangan diskon pada subtotal terdeteksi oleh 17 kegagalan; konfigurasi normal kembali lulus 46 tes unit/kontrak. Mutasi dilakukan hanya di memori transformasi Vitest. Browser, TypeScript aplikasi web, ESLint pada berkas fitur yang berubah, dan git diff --check lulus. GitNexus detect-changes mencatat 43 simbol dan 32 alur dengan risiko agregat critical; pemeriksaan kode ulang tidak menemukan masalah tersisa pada batas persistensi diskon.

## Catatan lingkungan

Drive D: yang disebut AGENTS.md tidak tersedia; salinan lokal dokumentasi disimpan di markdown-files dan versi yang ikut commit disimpan di docs/features pada repositori aktif. Headroom stats dipanggil; proxy kompresi tidak terhubung dan pengiriman metadata lokal ditolak peninjau persetujuan otomatis, sehingga pemeriksaan menggunakan keluaran lokal yang dibatasi. Perintah type-check root ternyata memicu build produksi melalui dependsOn Turbo; proses dihentikan setelah diketahui. Pemeriksaan TypeScript selanjutnya memakai perintah langsung pada aplikasi web. Folder .next mungkin tersentuh; server pengembangan tidak dimulai ulang atau dihentikan.
