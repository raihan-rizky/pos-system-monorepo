# Default Harga Agen dan Dinas

Tanggal: 2026-10-26 (Asia/Jakarta)

## Perilaku

- Harga Agen dan Harga Dinas yang belum diisi mengikuti harga jual produk/satuan terbaru, termasuk perubahan melalui Harga grup.
- Nilai kosong tetap disimpan sebagai `null`, bukan salinan angka harga jual. Dengan begitu default tetap mengikuti perubahan berikutnya.
- Pengguna dapat mengisi harga manual untuk menetapkan override per produk/satuan. Nilai manual lama dipertahankan.
- Override tetap merupakan harga tetap ketika harga jual berubah, termasuk jika awalnya sama dengan harga jual.
- Tombol **Ikuti harga jual** mengosongkan hanya override yang dipilih. Pengguna perlu menyimpan form untuk menerapkannya.
- Harga dari aturan maupun override Agen/Dinas ditandai hijau dan badge **Harga Khusus**. Harga default memakai status **Mengikuti harga jual** tanpa badge khusus.
- Nilai member lama yang nol ditampilkan sebagai default, sehingga tidak menghalangi penyimpanan field lain. Saat form disimpan, nilai tersebut dapat dinormalisasi menjadi `null` dengan harga efektif yang sama. Form menerima override positif atau kosong.

Contoh: harga jual Rp10.000 dengan Agen kosong menghasilkan Harga Agen Rp10.000. Ketika harga jual menjadi Rp12.000, Agen menjadi Rp12.000. Jika pengguna mengisi Agen Rp9.000, Agen tetap Rp9.000 sampai direset.

## Alur pengguna

1. Buka **Edit** atau **Ubah Harga** di Produk/POS. Periksa harga jual yang menjadi default Agen/Dinas.
2. Isi harga member manual jika diperlukan; badge **Harga Khusus** muncul. Klik **Ikuti harga jual** untuk kembali otomatis, lalu simpan.
3. Untuk diskon atau tambahan otomatis, Owner memilih **Atur diskon / tambahan** menuju `/products?tab=special-prices`. Akun lain mendapat petunjuk untuk meminta Owner.

Harga Khusus pada editor POS yang bertuliskan **Hanya berlaku untuk transaksi ini** adalah penyesuaian satu transaksi. Aturan Harga Khusus pada tab Produk adalah aturan otomatis berdasarkan cakupan yang dipilih.

## Prioritas dan data

Prioritas resolver tetap: aturan Harga Khusus yang dapat diterapkan, lalu override Agen/Dinas sesuai pelanggan, kemudian harga jual. Snapshot harga keranjang dan transaksi lama mengikuti aturan penyimpanan yang sudah ada.

Tidak ada perubahan skema, migrasi, atau reset massal data. Field `hargaAgen` dan `hargaDinas` yang sudah tersedia tetap dipakai. Perubahan penanda hanya memengaruhi UI; resolver nominal harga tetap sama.

## Implementasi

- Komponen bersama `MemberPriceField` menampilkan default, override, badge, dan reset; dipakai pada form produk serta editor harga katalog/POS.
- `MemberPricingGuidance` menyediakan petunjuk dan tautan aturan untuk Owner sesuai akses tab yang sudah ada.
- Kartu POS menampilkan harga efektif tiap tipe dan satuan. Keranjang menampilkan fallback pada referensi Agen/Dinas yang belum diisi.
- `isSpecialCategoryPricing` mengenali metadata override member sebagai harga khusus sehingga badge konsisten pada Produk, POS, pilihan satuan, keranjang, dan pembayaran.
- Bantuan, FAQ asisten, katalog workflow, dan Catatan Perubahan diperbarui.

## Pemeriksaan

Tes mencakup default mengikuti perubahan harga, override tetap, override dengan nilai sama seperti harga jual, reset hanya satu field, badge, dan harga efektif yang ditampilkan.

- 276 tes pada 18 file terkait harga, kartu POS, keranjang, payload, panduan, serta Catatan Perubahan: lulus, termasuk validasi data rilis dan screenshot.
- 41 tes resolver/payload meliputi data lama kosong/nol, override positif, harga manual yang sama dengan harga jual, seluruh tipe pelanggan, satuan terpisah, prioritas/cakupan aturan, reset tiap field, dan pemisahan harga transaksi POS. Sebelum fitur diterapkan pada checkout publikasi, 20 pemeriksaan penanda gagal sesuai harapan; setelah diterapkan semuanya lulus.
- 28 skenario browser dengan komponen React asli dan API simulasi: lulus. Mencakup empat editor pada lebar 375/1280 piksel, default, override, reset, refresh, payload, data lama bernilai nol, override lama, stok pecahan, petunjuk kasir, validasi angka, reset dengan keyboard, dan pembatalan tanpa penyimpanan.
- Regresi browser menemukan editor produk lama belum memakai elemen form sehingga angka nol/negatif bisa tersimpan. Submit kini memakai form dengan validasi browser; tombol Batal tidak mengirim form. Tes terlebih dahulu gagal lalu lulus setelah perbaikan.
- Pengujian stok pecahan membuktikan nilai awal `0.5` tetap dapat disimpan. Perubahan terfokus ke `0.75` lalu Enter sempat ditolak oleh langkah angka bawaan browser; `step="any"` mempertahankan dukungan pecahan seperti form utama. Regresi ini juga diverifikasi gagal sebelum diperbaiki.
- `pnpm --filter @pos/web exec tsc --noEmit --incremental false`: lulus tanpa diagnostik.
- `git diff --check` pada file terkait: lulus.
- Review kode independen selesai. Temuan nilai lama nol diperbaiki dengan regresi browser yang terlebih dahulu diverifikasi gagal.
- Pemeriksaan suite lengkap menemukan pemuatan awal modul API percetakan melampaui batas tes request 5 detik dan mengganggu mock tes berikutnya. Pemuatan modul kini dilakukan pada setup setelah reset, dengan batas setup 30 detik; batas request tetap 5 detik. Kesembilan tes API tersebut lulus dengan perintah standar setelah perbaikan setup.
- Screenshot aktual komponen dengan data contoh: `apps/web/public/images/changelog/harga-agen-dinas-default-2026-10-26.png`.

Log pemeriksaan tersedia di `output/member-pricing-2026-10-26/`. Peringatan Browserslist tentang data browser lama muncul pada sebagian tes, tanpa kegagalan. Snapshot dibuat melalui harness browser tanpa menjalankan atau menghentikan dev server.

## Catatan eksekusi

- Pengembangan memakai checkout aktif `C:\Projects\pos-system-monorepo`; perubahan pengguna sebelumnya dipertahankan. Baseline tugas disimpan di `output/member-pricing-2026-10-26/baseline.json`.
- Path dokumentasi lama di drive D tidak tersedia pada lingkungan ini; dokumentasi disimpan di `markdown-files` checkout aktif.
- GitNexus impact dijalankan sebelum perubahan. Helper penanda memiliki risiko HIGH: enam pemakai UI langsung dan alur Produk/POS; form dan keranjang berisiko LOW. Indeks GitNexus tidak lengkap untuk pencarian FTS; pemakai juga diperiksa langsung di source.
- Headroom dipanggil di awal dan akhir; kompresi panduan dijalankan. Proxy Headroom `127.0.0.1:8787` tidak terjangkau, sehingga keluaran dijaga terbatas.
- Tidak menjalankan production build atau mengubah lifecycle dev server.
- Publikasi memakai checkout `main` terpisah di `.worktrees/inbound-receiving-main` dengan delta dari baseline tugas; perubahan lain pada checkout aktif tidak disertakan.
- GitNexus `detect-changes` dijalankan terhadap checkout publikasi dengan indeks bersama: 18 file teks dan 18 simbol terdeteksi sesuai cakupan. Enam konsumen helper badge tetap diverifikasi melalui pemeriksaan caller dan tes terkait karena indeks tidak lengkap.
