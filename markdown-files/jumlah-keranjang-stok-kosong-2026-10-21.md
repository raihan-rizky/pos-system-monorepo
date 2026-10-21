# Jumlah keranjang saat stok kosong

Tanggal: 2026-10-21 (Asia/Jakarta)

## Perubahan

- Tombol plus keranjang tetap aktif pada stok kosong, negatif, maupun saat jumlah sudah menyamai stok.
- Kenaikan jumlah yang melebihi stok memunculkan **Jumlah melebihi stok** sebelum diterapkan.
- Popup menampilkan nama produk, stok saat ini, jumlah tujuan, serta risiko stok menjadi negatif saat transaksi diproses.
- **Tetap Tambahkan** menerapkan jumlah; **Batal**, Escape, dan klik latar popup membatalkan.
- Jumlah manual diterapkan setelah Enter atau keluar kolom. Mengetik tidak membuka popup per digit.
- Pengurangan jumlah dan kenaikan sampai batas stok tidak memerlukan konfirmasi.
- Baris jasa tetap memakai aturan jumlah tanpa peringatan stok produk.

## Perilaku UI

- Dialog native tampil pada top layer agar tetap terlihat di atas panel keranjang ponsel.
- Fokus awal berada pada Batal, dan browser membatasi interaksi ke dialog selama terbuka.
- Jika produk dihapus dari keranjang atau stok/jumlah diperbarui sehingga peringatan tidak lagi berlaku, popup ditutup.
- Pembayaran dan tombol jumlah diblokir selama konfirmasi tertunda untuk mencegah tindakan klik setelah blur melewati peringatan.
- Jumlah, subtotal, dan isi keranjang belum berubah sebelum konfirmasi.

## Alasan desain

- Ikon amber dipakai untuk menandai risiko stok tanpa mengubah aksi menjadi pesan kesalahan.
- Nama produk dan jumlah tujuan ditebalkan agar keputusan mudah diperiksa.
- Popup memakai warna, tombol, dan tipografi POS yang ada; aksi ditumpuk pada ponsel agar mudah disentuh.
- Tingkat Energy/Rhythm/Motion: 1/1/1, sesuai antarmuka transaksi yang ringkas.

## File utama

- `apps/web/components/CartSidebar.tsx`
- `apps/web/features/pos-checkout/components/CartQuantityInput.tsx`
- `apps/web/features/pos-checkout/components/CartStockWarningDialog.tsx`
- Bantuan, katalog workflow AI Assistant, serta Catatan Perubahan diselaraskan.
- Screenshot dengan data contoh: `apps/web/public/images/changelog/peringatan-jumlah-keranjang.png`.

## Pengujian

- TDD: tes browser dibuktikan gagal karena tombol plus nonaktif pada stok nol, sebelum implementasi.
- Browser desktop/ponsel: plus, Enter, blur, Batal/Escape, stok nol/negatif/positif, batas stok, pengurangan, serta penghapusan item saat popup terbuka.
- Browser desktop/ponsel: **lulus**, termasuk popup top layer, fokus awal pada Batal, klik latar untuk membatalkan, serta klik Bayar setelah blur yang tidak melewati konfirmasi.
- Regresi POS, Catatan Perubahan, dan workflow AI: **181/181 lulus** (21 file).
- Setelah teks panduan dan release note diperbarui, Catatan Perubahan/workflow divalidasi ulang: **50/50 lulus** (4 file).
- ESLint seluruh file terkait: **lulus tanpa error maupun warning**. `git diff --check` juga lulus.
- TypeScript web (`pnpm --filter @pos/web type-check`): **lulus** setelah seluruh perubahan.
- Screenshot desktop/ponsel diperiksa langsung; isi dan tombol tetap terbaca tanpa terpotong.

## Catatan eksekusi

- Dokumentasi memakai folder repo aktif sesuai persetujuan pengguna sebelumnya.
- Analisis dampak GitNexus untuk CartSidebar dan CartQuantityInput: LOW, satu alur halaman POS dengan hubungan langsung CartQuantityInput → CartSidebar → POSClientPage.
- Tidak menjalankan production build atau mengubah siklus hidup development server.
- Headroom dipanggil; proxy kompresinya tidak dapat dihubungi sehingga keluaran dijaga terbatas.
- Panduan dialog: [MDN showModal](https://developer.mozilla.org/en-US/docs/Web/API/HTMLDialogElement/showModal), menjelaskan modal pada top layer dan halaman latar yang inert.
