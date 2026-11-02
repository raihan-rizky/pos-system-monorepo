# Nilai inventaris: deduplikasi nama otomatis

Tanggal: 2026-11-02 (Asia/Jakarta).

## Perilaku

Nilai inventaris menghitung satu saldo untuk satu keluarga produk duplikat dalam toko yang sama. Nama disamakan kapitalisasinya, spasinya dirapikan, dan akhiran `-new` yang berulang di ujung nama diabaikan. Angka, ukuran, merek, model, dan tanda baca lain tetap dipertahankan. Nama yang kosong setelah normalisasi tidak menghubungkan produk.

Produk satu grup stok tetap memakai satu saldo bersama. Kesamaan nama menghubungkan grup atau produk mandiri yang berbeda; hubungan tersebut ditelusuri sampai seluruh keluarga ditemukan. Pencarian salah satu SKU dan filter kategori tetap mengambil sumber saldo keluarga yang sama.

SKU berakhiran `-NEW` saja tidak menjadi bukti duplikat. Pemeriksaan produksi melalui Supabase MCP menemukan nama pasangan SKU yang berbeda ukuran maupun model. Banyak produk bernama sama adalah varian satuan dalam satu grup, sehingga satuan dan konversinya tetap diperlukan.

## Pemilihan sumber saldo

Saat penerapan, saldo positif mendapat prioritas dibanding saldo nol. Jika beberapa saldo positif tersedia, waktu pembaruan grup/produk dipakai untuk inisialisasi; ID memberi urutan konsisten jika waktunya sama.

Setelah penerapan, hanya perubahan saldo stok nyata yang memperbarui `stockChangedAt`. Saldo dari perubahan stok terakhir menjadi sumber, termasuk jika perubahan tersebut menghabiskan stok. Perubahan HPP, harga jual, nama, atau replikasi stok anggota grup tidak menghidupkan saldo duplikat yang lama. Produk/grup yang tidak aktif atau dihapus otomatis keluar dari kandidat.

HPP dihitung dari satuan dalam sumber saldo yang terpilih: stok diurai dari satuan terbesar ke terkecil, lalu memakai HPP tiap satuan. HPP kosong dihitung melalui rasio konversi dari satuan terkecil yang memiliki HPP. HPP nol valid; seluruh HPP kosong ditandai sekali sebagai belum lengkap.

Semua proses tersebut otomatis. Tidak ada pemilihan produk utama, pengaturan sumber harga, pembersihan duplikat, atau perbaikan satuan yang diwajibkan untuk membaca nilai inventaris.

## Database dan riwayat

Migration baru: `20261102120000_inventory_name_deduplication`.

Migration menambahkan indeks nama aktif dan waktu perubahan saldo pada cache per entitas, lalu menyelaraskan cache dan jurnal HPP dengan satu koreksi saat ini per toko jika nilainya berubah. Baseline dan snapshot bulan lama tetap menggunakan riwayat yang telah tercatat. Migration HPP sebelumnya tidak diubah.

Trigger memperluas produk/grup yang terdampak ke keluarga lama maupun baru, termasuk saat nama berubah, produk dihapus, dinonaktifkan, atau pindah toko. Trigger perubahan hanya mencatat antrean privat milik transaksi. Constraint trigger deferred menyelaraskan seluruh keluarga yang terdampak, cache, dan jurnal secara otomatis sebelum commit, lalu mengosongkan antrean. Penguncian per toko pada tahap akhir ini menghindari urutan kunci yang bertentangan ketika beberapa keluarga ditulis dalam satu transaksi. Pembacaan dalam transaksi ikut mempertimbangkan perubahan sumber yang masih menunggu commit; rollback membatalkan antrean dan seluruh perubahan. Tidak ada worker atau pekerjaan pemeliharaan yang perlu dijalankan pengguna. Pembacaan ulang dibatasi pada indeks ID dan nama keluarga yang terdampak. Fungsi internal tetap memakai security invoker; izin PUBLIC dan role API dicabut. RLS pada cache tetap aktif.

## Verifikasi

Pengujian PostgreSQL dalam memori menjalankan migration dan trigger asli serta route statistik dan pembaca laporan. RED awal: 9 tes gagal dan 32 lolos; contoh nilai Rp43.000 seharusnya Rp33.000 setelah duplikat dihitung sekali.

Cakupan meliputi duplikat beda ID, akhiran nama berulang, filter kategori/pencarian, perubahan stok ke nol, edit harga/HPP, perubahan nama, deaktivasi/penghapusan, beda ukuran/SKU, isolasi toko, grup duplikat dengan konversi, HPP kosong, dan penerapan pada data lama. Kasus kinerja memakai 2.000 nama unik agar mengukur pembacaan satu keluarga yang terisolasi.

Hasil verifikasi akhir:

- 82 tes inti lulus: penilaian inventaris, pembaca laporan bulanan, route statistik, dan katalog workflow.
- 73 tes Bantuan, panduan visual, dan Catatan Perubahan lulus.
- 1 regresi konkurensi lulus pada PostgreSQL 18 asli. Dua transaksi menulis keluarga yang sama dalam urutan berlawanan melalui baris produk berbeda; keduanya commit dan hasil langsung, cache, serta jurnal sama, dengan antrean kosong. Tes ini juga telah dibuktikan gagal ketika flush sengaja dijalankan sebelum commit, lalu kembali lulus setelah constraint trigger deferred dipulihkan.
- Pemeriksaan TypeScript web dan database, validasi schema Prisma, serta pemeriksaan whitespace diff lulus.
- Review independen menguji insert duplikat bersamaan, hubungan keluarga transitif, stok nol, pembacaan dalam transaksi, rollback penuh/savepoint, serta izin API; tidak ada temuan penghalang yang tersisa.

## Penerapan

Migration telah diterapkan ke dev dan produksi. Pemeriksaan baca saja pada kedua environment memastikan hasil langsung sama dengan cache dan jurnal HPP, satu keluarga dihitung sekali, antrean selesai otomatis saat commit, trigger tetap deferred, indeks valid, RLS aktif, fungsi memakai security invoker, dan objek internal tidak dapat diakses role API. Jurnal lama tetap tersedia. Publikasi aplikasi diteruskan melalui CI/CD GitHub dan Vercel, dengan hasil pemantauan pada commit rilis dicatat dalam laporan penyelesaian.

## Catatan eksekusi

Drive `D:` tidak tersedia, sehingga dokumentasi disimpan di `markdown-files` pada checkout aktif. Headroom MCP dipanggil; proxy kompresinya tidak terhubung sehingga pembacaan dibatasi. GitNexus dijalankan sebelum perubahan; simbol SQL baru tidak tercakup indeks dan ditelusuri langsung melalui pemanggil statistik, laporan, serta trigger.

Pengujian memakai Vitest yang sudah terpasang karena pemeriksaan registry pnpm tidak dapat terselesaikan pada lingkungan ini. Vite memerlukan child process di luar sandbox; akses tersebut digunakan untuk pengujian lokal dalam memori dan PostgreSQL sintetis. Server PostgreSQL sementara telah dihentikan setelah pengujian. Development server tidak dijalankan atau dihentikan, dan production build lokal tidak digunakan.

Pemeriksaan advisor Supabase MCP pada tahap penerapan tidak dapat berjalan karena refresh token OAuth gagal. Verifikasi database diteruskan melalui koneksi Prisma yang sudah tersedia, memakai pemeriksaan baca saja atas data dan izin. Gangguan koneksi tunggal pada pemeriksaan dev berhasil setelah pengulangan; pengguna tidak perlu melakukan penyiapan atau pemeliharaan tambahan.
