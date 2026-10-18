# Editor visual kategori

Tanggal: 18 Oktober 2026

## Alur pengguna

1. Buka **Produk → Kategori**. Pilih **Tambah kategori**, atau pilih kategori lalu **Ubah kategori**.
2. Isi beberapa kategori melalui tabel ringkas di komputer atau kartu di ponsel. Pencarian nama menyaring tampilan tanpa menghapus perubahan pada baris tersembunyi.
3. Buka pilihan ikon bergambar. Cari dengan kata Indonesia atau Inggris, lalu pilih atau ganti ikon. Hapus ikon untuk kembali ke tampilan bawaan.
4. Pilih warna dari palet, masukkan warna khusus dalam format heksadesimal, atau reset warna ke bawaan.
5. Buka pengaturan tambahan per baris bila perlu mengubah urutan atau kelompok penjualan.
6. Periksa jumlah kategori yang berubah dan simpan lewat area bawah yang tetap terlihat. Perubahan pada baris tersembunyi tetap ikut disimpan.

## Implementasi dan batasan

- Metadata ikon berada di `apps/web/lib/category-icon-catalog.ts`. Katalog ini tidak mengimpor React dan dipakai bersama oleh pemilih visual serta validasi server.
- ID ikon lama tetap tersedia. Ikon tambahan seperti `coffee` dan `shopping-bag` dapat disimpan melalui aksi tambah dan ubah.
- Server memeriksa keanggotaan ID dalam katalog. Nilai asing, termasuk `__proto__`, `constructor`, dan `toString`, ditolak sebelum satu batch disimpan.
- Nilai `null` menghapus ikon atau warna. Field yang tidak dikirim tetap mempertahankan nilai sebelumnya.
- Warna khusus mengikuti validasi heksadesimal tiga atau enam digit. Urutan tetap bilangan bulat nonnegatif, dan kelompok penjualan memakai pilihan yang sudah tersedia.
- Kategori adalah data bersama seluruh toko. Izin tambah `product.create` dan ubah `product.update` tetap berlaku. Aturan pratinjau penghapusan dan pemindahan produk tetap mengikuti panduan yang sudah ada.
- Konten Bantuan dan panduan Pak Teladan untuk tambah/ubah kategori diselaraskan dengan editor ini.

## Verifikasi server dan dokumentasi

- RED: `pnpm --filter @pos/web test features/product-categories/server/__tests__/category-management.test.ts` menghasilkan dua kegagalan yang diharapkan saat enum lama menolak ikon katalog baru; 50 pengujian lain lulus.
- GREEN: perintah yang sama setelah validasi memakai katalog menghasilkan **52 pengujian lulus**. Cakupan baru meliputi tambah/ganti ikon, ID asing/prototype, pembatalan seluruh batch tidak valid, reset `null`, serta nilai tampilan yang tidak dikirim.
- Suite terfokus kategori, katalog ikon, Bantuan, dan katalog workflow menghasilkan **105 pengujian lulus dalam 11 berkas**. Asersi penomoran FAQ kategori memeriksa 38 nomor awal dan keunikan nomor agar penambahan FAQ lain tetap diperbolehkan.
- TypeScript web `tsc --noEmit` lulus (exit 0) setelah integrasi final. ESLint komponen/server/katalog ikon lulus dengan `--max-warnings 0`; cleanup ref memakai snapshot trigger dalam effect.
- Browser fixture menguji komponen nyata tanpa data toko: buat/ubah/hapus kategori, pindah produk, kegagalan jaringan, validasi nama/urutan/warna, ID editor saat refetch, pencarian ikon dua bahasa, pilih/ganti/hapus, palet/reset/warna khusus, draft tersembunyi, dan tombol simpan tetap terlihat pada 27 kategori di lebar 1100/375 piksel.
- Regresi tambahan dibuktikan dengan varian bundle sementara: tanpa penahan baris aktif, pengetikan nama pada hasil pencarian menghilangkan baris; tanpa guard Enter warna, formulir utama terkirim. Varian tersebut tidak disimpan dalam sumber aplikasi.
- Browser final lulus dengan pemeriksaan ikon bawaan, palet/warna khusus, dialog bersarang, pencarian dua bahasa, tombol terkunci saat pending, dan overflow galeri lengkap pada desktop/ponsel. Screenshot fixture disimpan di `%TEMP%/category-visual-2026-10-18`.
- Regresi kontras abu-abu sedang `#777` mula-mula gagal (rasio 4.478). Fallback hitam ditambahkan ketika putih/slate belum mencapai 4.5; pengujian menghitung kontras seluruh 256 tingkat abu-abu, palet, dan contoh warna khusus. Lima pengujian warna/pemilih ikon lulus setelah perbaikan.
- Review independen memeriksa state, patch, validasi, keyboard, dan fallback. Label penghapusan ikon diperjelas: `null` memakai paket bawaan, sesuai renderer seluruh aplikasi.
- Satu kegagalan pada suite working tree berasal dari alias FAQ39 `apa yang baru` pada perubahan Catatan Perubahan yang terpisah: kecocokan `yang` + `baru` memberi skor 0.6667 sehingga pertanyaan tambah produk memilih workflow changelog. Verifikasi ulang terhadap katalog persis dari staging kategori menghasilkan **1 lulus, 39 dilewati**. Alias FAQ39 tidak termasuk commit kategori.
- Suite web penuh selesai dalam 778.13 detik: **2.987 lulus, 10 dilewati, 1 gagal**, dari 483 berkas (480 lulus, 2 dilewati, 1 gagal). Satu kegagalan tersebut adalah kasus alias FAQ39 yang sudah diisolasi di atas; tidak ada kegagalan kategori.
- GitNexus `detect_changes --scope staged` memeriksa 19 berkas dan 6 simbol terindeks, 0 proses terdampak, risiko LOW. Indeks belum mencakup komponen kategori baru; impact renderer awal tetap HIGH karena digunakan POS/Produk/Inventori sehingga diuji melalui fallback legacy dan katalog lengkap.
- Pemeriksaan whitespace `git diff --check` untuk berkas server dan panduan lulus.

## Catatan lingkungan

- Folder `D:/main_project/pos-system-monorepo/markdown-files` tidak tersedia; dokumentasi disimpan di folder `markdown-files` pada checkout aktif `C:/Projects/pos-system-monorepo`.
- Headroom MCP dipanggil. Proxy lokal `127.0.0.1:8787` tidak terjangkau; keluaran pemeriksaan dibatasi dan kompresi tetap dicoba sebelum meninjau keluaran besar.
- GitNexus menemukan `FAQ_WORKFLOWS` dengan risiko LOW, tanpa caller/proses terpengaruh pada indeks. Simbol server kategori belum tercakup indeks sehingga hasil impact `executeCategoryAction` dan `categoryFields` adalah UNKNOWN/target tidak ditemukan.
- Tidak menjalankan production build, memulai/menghentikan development server, menambahkan dependensi, atau mengubah skema database.

## Arah visual dan audit antislop

Editor operasional untuk pemilik/admin POS. ENERGY 2 / RHYTHM 1 / MOTION 1. Motif utamanya tile ikon kategori berwarna, nama yang mudah dipindai, serta area aksi yang konsisten. Tabel rapat membantu membandingkan banyak kategori; kartu ponsel menjaga ukuran target sentuh. Aksen biru menandai pilihan/perubahan; warna kategori adalah data pilihan pengguna. Transisi warna dan chevron mengikuti preferensi reduced motion.

### Hard gate

- R-02 PASS: teks UI baru memakai kalimat langsung, tanpa em dash.
- R-03 PASS: browser memeriksa overflow halaman/dialog pada 1100/375 piksel; screenshot diperiksa.
- R-17 PASS: jumlah kategori/perubahan/hasil ikon berasal dari state nyata.
- R-18 PASS: tidak ada testimonial.
- R-23 PASS: ikon dan warna sesuai permintaan pengguna; tidak menambahkan aset identitas.
- R-24 PASS: tidak menambahkan navigasi baru.
- R-25 PASS: helper memilih kontras ikon terang/gelap; pengujian menghitung rasio minimal 4.5 pada palet dan warna khusus. Teks memakai warna slate/sky/red pada latar terang.
- R-26 PASS: tombol tambah, pilih, cari, hapus/reset, detail, batal, dan simpan memiliki aksi nyata; browser menjalankan alur.
- R-27 PASS: hasil pencarian kosong, loading, error jaringan/validasi, dan pending tersedia.
- R-28 PASS: Bantuan memuat langkah kategori yang sesuai implementasi.
- R-32 PASS: dialog native, label/fokus terlihat, Escape/fokus kembali dan Enter diuji.
- R-33 PASS: perubahan sumber ditulis melalui patch; varian pengujian hanya untuk membuktikan regresi.
- R-34 PASS: tidak menambahkan toggle tema.
- R-35 PASS: browser menjalankan komponen nyata dalam fixture; tidak memakai production build.
- R-36 PASS: tidak ada klaim keamanan/performa tanpa bukti.
- R-37 PASS: arah mengikuti opsi A dan permintaan ikon/warna pengguna; dials dinyatakan.
- R-38 PASS: data screenshot dilabel sebagai fixture pengujian, bukan data pelanggan.

### Purpose gate

- R-01 PASS: latar solid; warna membantu mengenali kategori.
- R-04 PASS: ikon aksi sesuai tindakan, galeri sesuai kategori ritel.
- R-06 PASS: tipografi aplikasi dipertahankan agar alur konsisten.
- R-07 PASS: tidak ada grid dekoratif.
- R-08 PASS: chevron hanya menunjukkan detail/pemilih yang dapat dibuka.
- R-09 PASS: status Diubah menunjukkan perubahan tersimpan di draft.
- R-10 PASS: tidak memakai glassmorphism.
- R-12 PASS: bayangan hanya menandai elevasi dialog.
- R-13 PASS: tidak memakai glow.
- R-14 PASS: tabel konsisten untuk perbandingan; kartu hanya adaptasi ponsel.
- R-19 PASS: transisi ringan hanya memberi umpan balik pilihan/detail, dibatasi motion-safe.
- R-22 PASS: tidak menambahkan ilustrasi dekoratif.

### Liveliness dan craftsmanship

- Dials PASS: ENERGY 2, RHYTHM 1, MOTION 1 sesuai editor katalog operasional.
- Fokus PASS: nama kategori dan tombol simpan menjadi fokus utama; detail sekunder dapat dibuka.
- Spasi PASS: baris membentuk ritme pemindaian; pemilih modal memisahkan kegiatan mencari ikon/warna.
- Aksen PASS: biru untuk state pilihan/perubahan; warna kategori dapat dipilih pengguna.
- Motif PASS: tile ikon berwarna di editor, preview, dan daftar kategori memakai helper kontras yang sama.
- Design read PASS: opsi A disetujui sebelum implementasi, arah katalog ringkas dinyatakan saat pengerjaan.
- C-1 PASS: keputusan layout/warna/ikon dijelaskan di atas.
- C-2 PASS: kontrol tersambung ke state atau mutasi, pending mengunci penyimpanan.
- C-3 PASS: setiap bagian melayani pengelolaan kategori massal.
- C-4 PASS: keyboard, error, pending, filter, dan ukuran layar diuji di browser.
- C-5 PASS: tidak ada statistik/claim pemasaran.
- R-05 PASS: tabel/kartu berasal dari tugas membandingkan kategori.
- R-11 PASS: input dan tile berbeda radius/ukuran sesuai fungsi.
- R-15 PASS: CTA menyebut Simpan Perubahan, Tambah Baris, Terapkan warna.
- R-16 PASS: teks UI menjelaskan aksi secara konkret.
- R-20 PASS: ikon, warna, urutan, kelompok penjualan, dan dampak produk khusus alur POS.
- R-21 PASS: mengikuti tema terang alur kategori yang sudah ada.
- R-29 PASS: chrome netral dengan aksen biru; palet kategori merupakan data pengguna.
- R-30 PASS: mempertahankan bahasa visual aplikasi, tanpa meniru layout produk lain.
- R-31 PASS: alasan keputusan utama tercatat dalam arah visual.
