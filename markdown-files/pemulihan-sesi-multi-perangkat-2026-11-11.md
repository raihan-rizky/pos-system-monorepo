# Pemulihan sesi multi perangkat

Dokumen ini menyertai kandidat rilis pada branch `codex/multi-device-session-recovery`, berbasis `origin/main` pada `27987af3`. Catatan perubahan memakai tanggal sementara 11 November 2026. Sesuaikan dengan tanggal publikasi pertama dalam WIB saat rilis.

Satu akun dapat masuk pada beberapa browser atau perangkat tanpa batas jumlah dari aplikasi. Tombol Keluar mengakhiri sesi browser tersebut. Tab yang berbagi cookie pada browser yang sama mengikuti logout lokal. Perangkat lain dengan sesi sendiri tetap dapat bekerja.

Saat verifikasi sesi gagal sementara, halaman yang sudah terverifikasi tetap terbuka dan aplikasi mencoba kembali. Pemeriksaan izin mengikuti jeda `Retry-After` yang diterima dari server. Saat status pemulihan muncul, penyimpanan transaksi, draf, nota penawaran, perubahan shift, dan tindakan pada antrean offline menunggu verifikasi. Server tetap memeriksa akun dan izin pada setiap tindakan.

Jika sesi berakhir, pilih **Masuk lagi**. Item keranjang yang tersimpan dapat dipulihkan pada tab yang sama setelah masuk kembali ke akun dan toko yang sama. Isian lain pada formulir hanya dipertahankan selama tab masih berada di halaman yang sama. Keranjang lama tanpa penanda pemilik tetap tersimpan di browser. Fitur Duplikat Tab pada browser dapat menyalin penyimpanan awal keranjang. Aplikasi memeriksa pemilik dan toko sebelum memulihkan keranjang pada salinan tersebut.

Antrean POS offline tetap memakai pemilik dan toko asalnya. Sinkronisasi berjalan setelah sesi online terverifikasi. POS memakai jalur idempotensi yang sudah ada untuk transaksi yang telah dikirim. Batas percobaan pemeriksaan izin berlaku untuk satu siklus pemulihan. Sesi yang masih sah dapat dicoba kembali pada siklus berikutnya.

## Pengujian

- Validasi terfokus lulus 373 test pada 38 berkas. Setelah perbaikan lint terakhir, 45 test pada pemeriksaan provider diulang dan lulus. ESLint pada 45 berkas JavaScript/TypeScript yang berubah lulus tanpa peringatan. Type-check dan lint repository lulus.
- Suite penuh mencakup 815 berkas dan 6.528 test. Hasil awal adalah 6.276 lulus, 251 dilewati, dan satu test ekspor PDF melewati batas waktu lima detik. Keenam test pada berkas PDF lulus saat diulang sendiri dengan batas waktu yang sama. Suite penuh menghasilkan exit code 1 karena timeout awal tersebut.
- Probe GoTrue lokal `v2.197.0` memakai helper logout dari kandidat. Tiga sesi akun uji aktif. Logout sesi B mengembalikan 204, refresh B ditolak, dan sesi A serta C tetap sah serta dapat memperbarui token. Login ulang B menghasilkan sesi baru.
- Test Chromium memuat RoleProvider, halaman Login, dan hook keranjang dengan respons izin terkontrol. Isian dan keranjang bertahan pada 503, respons lama tidak memulihkan sesi yang telah keluar, dan penolakan akses menutup halaman terlindungi. Keranjang diperiksa berdasarkan pemilik dan toko. Login membersihkan artefak lama sebelum meminta sesi baru.
- Test middleware memakai SDK Supabase yang terpasang dengan transport sintetis. Status 429 dan 500 saat refresh menghasilkan 503 sebelum browser mencapai batas tunggu, serta mempertahankan cookie sesi. Respons 401 dari permintaan API lama tidak menulis penghapusan cookie.
- Test Playwright untuk tiga sesi terdaftar. Pelaksanaan lengkap memerlukan kandidat yang sedang berjalan pada host development atau loopback dan akun uji khusus. Atur `PLAYWRIGHT_BASE_URL`, `POS_MULTI_DEVICE_USERNAME`, dan `POS_MULTI_DEVICE_PASSWORD` lewat konfigurasi lokal yang aman. Jalankan `pnpm --filter @pos/web exec playwright test --config=playwright.multi-device.config.ts` dengan autentikasi Supabase aktif.

## Persiapan rilis

Validasi kandidat di development dan jalankan test multi perangkat dengan akun uji khusus. Pastikan browser A menerima 401 setelah logout dan browser B serta C tetap menerima 200 pada endpoint izin. Ulangi pemulihan saat koneksi terputus dan pemeriksaan antrean offline. Periksa Catatan Perubahan, Bantuan, dan panduan AI Assistant pada rute yang diizinkan.

Amati status 401 pada `/api/auth/permissions`, status 503 sementara, dan konflik refresh auth pada jam operasional. Catat durasi dan kategori kegagalan tanpa merekam isi transaksi atau token. Perubahan ini tidak memerlukan migrasi database. Bila kandidat mengganggu login atau sinkronisasi, kembalikan artefak web ke rilis sebelumnya melalui prosedur deployment yang berlaku. Rilis produksi terakhir yang diperiksa melalui SSH adalah `prod-17be9ee9cf4e806e-42787032119`. Periksa ulang rilis aktif sebelum menggunakan rujukan rollback.

Drive `D:` tidak tersedia pada host ini. Dokumen berada di `markdown-files` pada worktree implementasi.
