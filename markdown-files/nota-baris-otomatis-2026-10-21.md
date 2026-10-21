# Baris otomatis dan lebar kolom nota

Tanggal perubahan: 2026-10-21 (Asia/Jakarta).

## Cara memakai

1. Buka **Kasir > Percetakan**, pilih SPANDUK, PERCETAKAN, PLAT, STEMPEL, atau PRINT, lalu buat atau buka draft.
2. Ketik nama dan bahan lengkap. Baris meninggi otomatis dengan ukuran huruf semula. Geser pembatas header untuk menyesuaikan kolom; lebar tabel dan kertas tetap, dengan batas minimum agar kolom tetap terbaca. Fokuskan pembatas lewat Tab lalu gunakan ArrowLeft/ArrowRight, atau Shift untuk langkah lebih besar. **Reset lebar kolom** mengembalikan ukuran bawaan.
3. Tunggu **Tersimpan**. Lebar disimpan khusus nota itu, tetap sama saat dibuka kembali, dan tidak mengubah nota lain. Klik **Cetak / PDF**, periksa hasil, lalu **Cetak** atau **Unduh PDF**.

Kontrol lebar hanya tampil ketika nota dapat diedit. Koreksi nota yang sudah diproses tetap mengikuti alur tinjau dan simpan koreksi yang berlaku.

Jika tabel penuh atau teks panjang memakai ruang baris kosong, isi nama atau bahan pada panel **Item berikutnya** di bawah nota. Panel membuka baris kosong berikutnya yang tersimpan; setelah mulai diisi, item masuk ke halaman nota dengan posisi kursor tetap terjaga. Untuk menambah baris baru, gunakan **Baris dan hubungan stok > Tambah baris**. Panel pengisian tidak ikut dicetak.

## Perilaku tampilan dan cetak

- Kelima template memakai pembungkusan nama dan bahan yang sama pada preview dan PDF. Pada A5, bahan berada di bawah seluruh nama dan mengikuti lebar kolom Nama Barang, tanpa pembatas bahan terpisah.
- Satu item memakai satu kotak lebih tinggi tanpa garis horizontal di tengah teks. Kolom lain sejajar atas dan nilainya dicetak sekali. Posisi kursor tetap terjaga ketika pengetikan mengubah jumlah halaman.
- Baris draft yang seluruhnya kosong di akhir menyediakan ruang sebelum halaman tambahan diperlukan; data tersimpan tetap ada. Baris dengan jumlah, harga, atau hubungan stok tetap dihitung sebagai isi.
- Tabel berlanjut pada halaman nota biasa dengan nomor item dipertahankan dan total hanya pada halaman terakhir. Teks satu item yang luar biasa panjang juga dapat berlanjut tanpa kehilangan teks. Tidak semua nota harus muat satu halaman. Kolom tambahan di luar baris item masih dapat memakai lampiran.

## Implementasi dan bukti pengujian

`columnWidths` opsional menyimpan lebar dalam dokumen nota melalui penyimpanan yang sudah ada. Pengaturan lama atau tidak valid memakai ukuran bawaan. Layout terukur dipakai bersama oleh presentation, preview, dan PDF untuk pembungkusan, header, serta batas baris; kontrol editor tidak dicetak.

Laporan implementasi mencatat 91 tes unit terfokus lulus pada enam file untuk ekstensi kolom. Pemeriksaan Chrome SPANDUK/PRINT pada viewport 1280 dan 390 piksel mencakup mouse, sentuh, keyboard, reset, simpan/buka ulang, pembungkusan bahan, serta kesamaan header dan PDF. Bukti rinci tersedia pada `output/automatic-receipt-rows-sdd/task-4-report.md` dan log yang dirujuknya; pengujian baris awal dicatat dalam laporan task 1 dan 2. Verifikasi integrasi dokumentasi dicatat terpisah pada `output/automatic-receipt-rows-sdd/task-3-report.md`.

Dokumentasi disimpan di `C:/Projects/pos-system-monorepo/markdown-files` karena lokasi D: pada instruksi repositori tidak tersedia di host ini.
