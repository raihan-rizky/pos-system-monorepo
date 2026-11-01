# Rencana implementasi ketahanan transaksi offline

**Tujuan:** Memenuhi desain `ketahanan-transaksi-offline-design-2026-11-01.md` dengan siklus uji gagal lalu lulus pada setiap bagian.

1. **Checkout dan izin:** Tambahkan uji izin auto-approval dan uji pengiriman ulang dengan ID yang sama. Terapkan ID stabil serta deduplikasi yang mencakup jalur online dan offline; pastikan pemeriksaan berlaku per toko dan kasir.
2. **Ketahanan antrean:** Uji validasi per entri, kegagalan sementara, crash sebelum dan sesudah respons, serta pemrosesan dua tab. Terapkan klaim yang dapat dipulihkan, retry saat startup dan koneksi kembali, dan pembersihan khusus transaksi yang benar-benar sudah tersimpan.
3. **Pembayaran:** Uji tunai dengan kembalian, pembayaran gabungan, DP, Tempo, dan approval. Simpan semua rincian yang dibutuhkan dan buat catatan server yang sesuai dengan checkout normal.
4. **Identitas dan shift:** Uji pergantian pengguna/toko, antrean lama, pembukaan dan penutupan shift lokal, urutan replay, dan konflik. Pertahankan data yang belum bisa diputuskan untuk pemeriksaan.
5. **Persiapan dan pembukaan offline:** Uji katalog lengkap, snapshot yang gagal, shell saat jaringan terputus, penguncian PIN dan pembukaan ulang, serta perubahan versi service worker. Jangan cache SSR yang berisi data autentikasi.
6. **Antarmuka dan dokumentasi:** Tampilkan kesiapan perangkat, status setiap transaksi, alasan kegagalan dan tindakan yang tersedia. Perbarui Bantuan, workflow assistant, catatan perubahan, dan dokumentasi sesuai hasil implementasi.
7. **Verifikasi:** Jalankan uji fokus dan regresi yang relevan, lint dan pemeriksaan tipe; verifikasi skenario browser yang dapat dijalankan tanpa mengubah siklus hidup server pengguna. Jangan menjalankan `pnpm build`.
