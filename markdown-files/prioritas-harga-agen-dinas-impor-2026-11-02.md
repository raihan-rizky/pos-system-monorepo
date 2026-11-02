# Prioritas Harga Agen dan Dinas pada Impor Produk

Tanggal perubahan: **2026-11-02 (Asia/Jakarta)**.

## Perilaku

- Harga Agen atau Harga Dinas yang lebih dari 0 menjadi pilihan pertama untuk tipe pelanggan dan satuan terkait, termasuk harga yang diimpor dari CSV/XLSX.
- Harga tersebut tetap berlaku ketika **Harga Khusus** nonaktif dan didahulukan dari aturan kategori yang cocok.
- Nilai kosong atau 0 tidak dipakai sebagai harga tetap. Tanpa harga tetap, aturan Harga Khusus yang aktif dan cocok masih dapat digunakan; jika tidak ada, sistem memakai harga jual.
- Agen dan Dinas diperiksa masing-masing. Harga Agen tidak dipakai untuk pelanggan Pemerintah, dan sebaliknya.
- Pada pembaruan produk lama, kolom Agen/Dinas yang tidak ada atau kosong menghapus harga tetap sebelumnya. Nilai 0 juga memicu fallback. Keputusan otomatis tetap menjadwalkan pembaruan ini meskipun harga jual tidak berubah, sehingga hasil simpan sesuai pratinjau.
- Harga asal tetap disimpan. Pembulatan harga transaksi tetap mengikuti pengaturan toko.
- Harga khusus yang diisi untuk satu transaksi mengikuti izin dan pengaturan Harga Khusus yang sudah berlaku.

Contoh tanpa aturan tambahan, dengan harga jual **Rp15.000**:

| Harga Agen di file | Harga Dinas di file | Harga Agen berlaku | Harga Dinas berlaku |
| ---: | ---: | ---: | ---: |
| Rp10.000 | Rp20.000 | Rp10.000 | Rp20.000 |
| Rp10.000 | 0 | Rp10.000 | Rp15.000 |
| 0 | Rp20.000 | Rp15.000 | Rp20.000 |
| Kosong | Kosong | Rp15.000 | Rp15.000 |

## Informasi pada Pratinjau Impor

Panel **Produk > Import > Impor Produk Massal** menampilkan:

- **Harga Agen/Dinas dari file** jika nilainya lebih dari 0.
- **Mengikuti harga jual** beserta keterangan **Harga Agen/Dinas di file tidak tersedia atau bernilai 0** saat memakai nilai cadangan. Kolom yang tidak ada juga dijelaskan oleh catatan di atas tabel.
- Harga Agen 0 kini menampilkan harga jual yang berlaku, bukan Rp0.

Referensi Agen/Dinas pada pratinjau persetujuan transaksi juga tetap terlihat saat Harga Khusus nonaktif; nilai 0 dianggap tidak tersedia.

## Panduan yang Diselaraskan

- Bantuan untuk Owner dan Admin pada panduan harga dan impor.
- Katalog workflow dan panduan Produk, POS, serta FAQ untuk AI Assistant.
- Penjelasan pengaturan Harga Khusus.
- Catatan Perubahan `import-member-prices-first`, tanggal 2026-11-02, revisi 1.
- Screenshot komponen pratinjau sebenarnya memakai data contoh Kertas HVS, tanpa data pelanggan.

## Verifikasi

- TDD: pengujian prioritas harga gagal pada implementasi lama sebelum perbaikan, lalu lulus.
- TDD browser: harga 0 sebelumnya tampil Rp0; setelah perbaikan tampil Rp15.000 dengan alasan fallback.
- Sebanyak 33 pengujian prioritas/fallback lulus. Uji tambahan terlebih dahulu mereproduksi 14 kegagalan pada produk lama, lalu lulus setelah perbaikan perencanaan dan penyimpanan.
- Uji penyimpanan mencakup kolom tidak ada, kosong, 0, hanya Agen, dan hanya Dinas; jalur pembaruan harga cepat, campuran, serta pembaruan penuh; snapshot sebelum/sesudah; dan harga transaksi dengan Harga Khusus aktif maupun nonaktif.
- Sebanyak 413 pengujian harga, POS, persetujuan, API transaksi, draf, dan sinkronisasi offline lulus (1 dilewati).
- Sebanyak 271 pengujian parser, perencanaan, commit, worker, kategori, dan API impor lulus setelah penyesuaian ekspektasi perilaku lama. Total kedua suite terarah adalah 684 lulus dan 1 dilewati; 33 uji prioritas/fallback di atas sudah termasuk di dalamnya.
- Browser memeriksa nilai dari file, harga kosong/0, fallback masing-masing kolom, serta tabel pada layar desktop dan ponsel.
- Pemeriksaan tipe web langsung dengan `tsc --noEmit --incremental false` lulus.

## Catatan Eksekusi

- Lokasi dokumentasi aktif adalah `C:\Projects\pos-system-monorepo\markdown-files`; drive `D:` yang disebut dalam panduan repositori tidak tersedia pada mesin ini.
- Headroom stats telah dipanggil. Proxy kompresi tidak dapat dihubungi, sehingga pembacaan lanjutan menggunakan keluaran yang dibatasi.
- GitNexus menandai pemilih harga bersama berisiko CRITICAL: 8 pemanggil langsung dan 6 alur transaksi terdampak. Pratinjau impor dan referensi persetujuan memiliki dampak LOW.
- Aturan pembanding harga impor memiliki 1 pemanggil langsung, menjangkau pratinjau impor, dan berisiko HIGH/CRITICAL. Penulis harga SQL memiliki 2 pemanggil langsung dengan risiko HIGH; pemroses commit cepat/penuh masing-masing memiliki 1 pemanggil langsung dengan risiko LOW. Tipe internal pembaruan harga berisiko MEDIUM; fixture database pengujian belum masuk indeks GitNexus dan diperiksa lewat pemanggilnya di suite impor.
- Perintah root `pnpm type-check` ternyata memulai production build melalui dependensi Turbo `^build`. Proses tersebut dihentikan; pemeriksaan tipe selanjutnya dijalankan langsung tanpa Turbo.
- Suite regresi yang lebih luas belum bersih. Perbandingan dengan pemilih harga sebelum perubahan juga menghasilkan kegagalan; kegagalan baru yang berkaitan dengan urutan harga telah diselaraskan dan suite terkait lulus.
- Suite impor menyeluruh menemukan 18 kegagalan terkait harga satuan/HPP yang nama pengujiannya juga gagal pada baseline. Empat kegagalan dokumentasi juga terkonfirmasi ada pada baseline; perubahan ini tidak memperbaiki area tersebut.
- Review independen menyatakan ketidaksesuaian pratinjau dengan commit telah terselesaikan dan tidak menemukan masalah konkret lain.

## Verifikasi Gabungan dengan Main

- Perubahan fitur mula-mula diuji secara terpisah di atas `main` pada `c5f2fd55`, lalu digabungkan dengan pembaruan `main` pada `7f37a42d` sebelum publikasi. Pembaruan inventaris dan kedua entri Catatan Perubahan dipertahankan; perubahan lain dari workspace awal tidak disertakan.
- Sebanyak **937 pengujian lulus dan 1 dilewati**, mencakup seluruh suite impor produk, harga kategori/pelanggan, POS, persetujuan, API transaksi/draf/offline, Bantuan, workflow AI Assistant, dan Catatan Perubahan. Kegagalan baseline yang dicatat di atas berasal dari workspace awal; suite gabungan pada versi main ini bersih.
- Suite tersebut diulang setelah integrasi `7f37a42d` dan kembali lulus. Pemeriksaan tipe aplikasi juga diulang setelah client Prisma lokal dibuat sesuai skema main terbaru, dengan opsi deklarasi dinonaktifkan sebagaimana catatan di bawah.
- Pengujian browser desktop dan ponsel lulus pada checkout publikasi, dan screenshot Catatan Perubahan diperbarui dari komponen sebenarnya.
- GitNexus `detect_changes --scope all` selesai: 24 file terlacak, 18 simbol, risiko hasil deteksi LOW. Lima file baru mencakup pengujian, screenshot, dan dokumentasi. Analisis dampak pemilih harga bersama yang lebih luas tetap CRITICAL sebagaimana catatan sebelumnya.
- Pembuatan ulang indeks GitNexus gagal saat startup worker lokal. Pemeriksaan cakupan menggunakan salinan indeks baseline yang tersedia, terdaftar khusus untuk checkout publikasi; keterbatasan kesegaran indeks tetap berlaku.
- Client Prisma validasi dibuat terpisah mengikuti skema main terbaru, karena client pada workspace awal belum memuat relasi pembelian yang sudah ada di main.
- Pemeriksaan tipe aplikasi lulus dengan `tsc --noEmit --declaration false --declarationMap false`. Opsi deklarasi bawaan masih menghasilkan 11 error TS2742 pada ekspor API/inventaris yang tidak diubah, terkait penamaan tipe runtime Prisma pada susunan dependensi lokal checkout validasi; keluaran deklarasi tidak termasuk verifikasi yang lulus ini.
