# Penggabungan tab Kategori produk

## Desain yang disetujui

**Produk → Kategori** langsung membuka daftar produk untuk penataan per satuan. Cari produk, centang satuan, pilih kategori utama dan subkategori, lalu tinjau dan konfirmasi pemindahan. Tombol **Kelola kategori lama** di dekat judul membuka pengelola lama di tab yang sama. Tombol **Kembali ke daftar produk** mengembalikan pencarian, filter, dan pilihan satuan yang sedang dikerjakan.

Daftar langsung dipilih supaya pengguna dapat mulai mencari setelah membuka tab. Alternatif dengan dua tombol pada halaman pembuka menampilkan kedua tugas sama menonjol, dengan tambahan satu klik sebelum daftar terlihat.

## Langkah implementasi

- [x] Perluas pengujian halaman Produk untuk satu tab **Kategori**, tautan lama `?tab=classification`, izin aksi, dan pencarian serta pilihan yang tetap tersimpan setelah membuka pengelola lama. Jalankan pengujian sebelum mengubah UI.
- [x] Arahkan tab dan tautan lama ke tampilan daftar yang sama. Pertahankan komponen daftar saat pengelola lama dibuka, gunakan kembali kedua alur yang ada, dan pindahkan fokus ke tombol tampilan yang baru aktif.
- [x] Perbarui Bantuan, FAQ dan katalog alur Asisten AI, petunjuk formulir produk, serta langkah pada Catatan Perubahan yang merujuk ke tab lama.
- [x] Jalankan pengujian halaman, pemindahan satuan, Bantuan dan Asisten AI, lalu periksa lint, TypeScript, dan diff.

Izin yang sudah berlaku tetap digunakan. Pemindahan kategori lama seluruh grup stok tetap tersedia melalui **Pindahkan Kategori** pada daftar Produk.
