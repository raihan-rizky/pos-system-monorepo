# Pindah nomor faktur ke Cetak Nota Penawaran

## Desain yang disepakati

Kolom No. Faktur dipindahkan dari Pembayaran ke panel biru data penerima di Cetak Nota Penawaran (`DraftReceiptModal`). Nomor custom disimpan ke transaksi sebelum mencetak dan dipakai saat cetak ulang. Nomor otomatis memakai nomor yang sudah dialokasikan; setelah nomor custom tersimpan, kembali otomatis mengalokasikan nomor berdasarkan tanggal nota dalam WIB. Nomor duplikat ditolak. Penyimpanan gagal menghentikan pencetakan dan mempertahankan isian.

Izin mengikuti `transaction.draft.update`; pengguna tanpa izin tetap dapat mencetak nomor tersimpan. Endpoint dibatasi store dan status DRAFT. Perubahan status/nomor serentak ditolak, benturan alokasi otomatis dicoba ulang. Tidak mengubah stok, tanggal, nominal, atau persetujuan transaksi.

## Rencana implementasi

- [x] Tes gagal: nomor tidak ada di Pembayaran, API persistensi belum tersedia.
- [x] Tambahkan GET/PATCH draft-number dengan normalisasi dan validasi nomor.
- [x] Gunakan field bersama di panel cetak dengan preview nomor otomatis dari server.
- [x] Simpan sebelum `window.print`, sinkronkan cache transaksi, tampilkan kegagalan.
- [x] Tes interaksi browser: custom, otomatis, cetak ulang, gagal simpan, izin.
- [x] Perbarui Bantuan dan katalog workflow; jalankan tes, TypeScript, ESLint.

## Verifikasi

- 135 tes lulus dalam 10 file terkait: draft, Pembayaran, Nota Penawaran, endpoint pembuatan dan pembaruan nomor, Bantuan, serta katalog workflow.
- Tambahan 22 kasus API mencakup preview tanpa mutasi, tanggal WIB draft lama, batas 100 karakter, normalisasi tanpa penulisan ulang, semua status non-draft, izin 401/403, isolasi store, kegagalan database, dan batas retry alokasi otomatis.
- Tes interaksi Chrome `draft-receipt-number-browser.test.mjs` lulus: simpan custom, kembali otomatis, cetak ulang meskipun data parent lama, tunggu server sebelum cetak, duplikat dan perbaikan, izin Sales, serta blokir cetak ketika nomor terbaru gagal dimuat.
- Tes browser tambahan memastikan hasil cetak memakai nomor final ketika nomor otomatis dari server berbeda dari preview, serta cetak ulang tidak mengalokasikan nomor lagi.
- Tes browser NotaPenawaranModal lama juga lulus; tanggal/jam WIB dan nomor custom tetap berfungsi.
- `pnpm --filter @pos/web exec tsc --noEmit`: lulus.
- ESLint pada seluruh file TS/JS yang diubah dengan `--max-warnings 0`: lulus.
- `git diff --check`: lulus. GitNexus detect-changes melaporkan risiko rendah pada simbol terindeks; field bersama yang baru dari commit sebelumnya belum ada pada indeks.
- Headroom stats dipanggil di awal/akhir dan compress dicoba; proxy lokal tidak tersedia, sehingga pemeriksaan memakai output terbatas.
- Tidak menjalankan production build atau mengubah lifecycle dev server.
