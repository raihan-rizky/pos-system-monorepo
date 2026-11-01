# Desain: Pembayaran dan Harga Satuan pada Penerimaan Barang

Tanggal: 2026-10-31 (WIB)

Status: Diimplementasikan dan diverifikasi; migrasi telah diterapkan pada basis data pengembangan dan produksi.

## Tujuan

Pindahkan pemilihan metode pembayaran dari persetujuan Daftar Belanja ke Penerimaan Barang. Tampilkan seluruh satuan yang terkait dengan suatu produk beserta harganya secara bersamaan agar pengguna dapat memeriksa dan mengubahnya tanpa memilih satuan satu per satu.

## Keputusan yang disepakati

- Persetujuan Daftar Belanja membuat dan menyetujui pembelian, tetapi belum mencatat pengeluaran baru.
- Metode pembayaran dipilih pada Penerimaan Barang. Pilihan tetap Transfer atau Giro; Giro memerlukan tanggal jatuh tempo yang valid.
- Ketika penerimaan pertama untuk pembelian disetujui, catat satu pengeluaran sebesar total pembelian penuh, termasuk saat barang datang sebagian. Tanggal pengeluaran mengikuti waktu persetujuan penerimaan tersebut.
- Satu metode pembayaran berlaku untuk seluruh pembelian. Penerimaan berikutnya menggunakan metode dan tanggal jatuh tempo yang telah ditetapkan.
- Opsi Perbarui HPP pada persetujuan Daftar Belanja tercentang secara default dan dapat dinonaktifkan. Jika dipilih, harga beli disarankan pada penerimaan; HPP master baru diperbarui setelah penerimaan barang yang sesuai disetujui.
- Pada barang yang belum pernah diterima sesuai, saran HPP mengikuti harga beli yang disetujui. Jika beberapa saran dalam satu grup berbeda atau konversinya tidak dapat diwakili tepat dalam dua desimal, pengguna memeriksa dan mengisi HPP satuan acuan.
- Setiap satuan produk ditampilkan bersama HPP unit, harga jual, harga jual agen, dan harga jual dinas. Harga awal diisi dari data produk yang tersedia.
- Persetujuan penerimaan tetap menjadi saat perubahan harga dan stok diterapkan. Aturan harga otomatis dan konversi satuan yang telah dikonfigurasi tetap berlaku.

## Alur pembayaran dan pengeluaran

1. Pada dialog persetujuan Daftar Belanja, pengguna memeriksa jumlah dan harga beli tanpa memilih metode pembayaran. Pembelian disetujui dan masuk antrean penerimaan tanpa membuat pengeluaran baru.
2. Pada formulir Penerimaan Barang pertama, pengguna memilih metode pembayaran. Tanggal jatuh tempo ditampilkan dan wajib diisi untuk Giro. Isian disimpan sebagai bagian dari penerimaan yang diajukan agar dapat diperiksa pemilik sebelum disetujui.
3. Saat seluruh pemeriksaan penerimaan selesai dan penerimaan disetujui, sistem menetapkan metode pembayaran pada pembelian dan membuat pengeluaran sebesar total pembelian dalam transaksi basis data yang sama dengan finalisasi penerimaan.
4. Pada penerimaan berikutnya, metode dan tanggal jatuh tempo yang sudah ditetapkan ditampilkan sebagai informasi pembelian dan digunakan kembali. Penolakan atau pembatalan penerimaan tidak mencatat pengeluaran atau menetapkan metode baru.

Penerimaan yang sudah diajukan tetapi belum disetujui tidak boleh mengubah informasi pembayaran pembelian secara permanen. Jika beberapa penerimaan diajukan bersamaan, penerimaan pertama yang berhasil disetujui menetapkan metode. Penerimaan lain yang menyimpan metode berbeda harus menampilkan konflik yang dapat diperbaiki, bukan menimpa metode tersebut atau mencatat pengeluaran kedua.

Gunakan penguncian pembelian dan batasan keunikan pengeluaran yang sudah ada untuk menjaga satu pengeluaran per pembelian. Apabila pembelian lama sudah memiliki pengeluaran, finalisasi penerimaan tidak boleh membuat ulang, menghapus, atau mengubah tanggal pengeluaran tersebut. Metode pembayaran lama yang telah tersimpan harus tetap tersedia.

## Harga seluruh satuan

### Tampilan dan interaksi

- Ganti pemilih satuan tunggal dengan daftar seluruh satuan produk pada dialog pembuatan penerimaan dan pada pemeriksaan pemilik.
- Tampilkan nilai yang ada untuk setiap satuan. Perubahan dapat dilakukan pada baris satuan terkait tanpa menyembunyikan satuan lain.
- HPP satuan yang memakai aturan otomatis mengikuti acuan dan konversi yang dikonfigurasi. Satuan dengan harga manual tetap mengikuti aturan manual yang berlaku.
- Satuan nonaktif atau satuan dengan konversi yang belum valid tetap diidentifikasi dengan jelas dan tidak diterapkan secara tidak aman. Pesan validasi menjelaskan tindakan yang diperlukan.
- Jika beberapa baris pembelian mengacu pada kelompok produk yang sama, gunakan satu sumber isian harga untuk setiap satuan agar perubahan yang sama tidak saling bertentangan.
- Pertahankan nilai kosong yang memang diperbolehkan; jangan mengubahnya menjadi nol tanpa tindakan pengguna. Periksa nilai wajib serta rentang dan ketelitian harga sesuai aturan yang berlaku.
- Harga untuk barang yang tidak sesuai tidak diterapkan sebagai perubahan harga produk. Harga yang disetujui dicatat dalam riwayat harga sesuai mekanisme yang sudah ada.
- Baris dengan jumlah diterima nol tidak menerapkan perubahan harga. Satuan otomatis yang tidak aktif tidak dapat diubah langsung, tetapi dapat mengikuti perubahan sumber sesuai aturan harga grup.

### Penyimpanan dan kompatibilitas

Gunakan daftar harga satuan berversi pada snapshot harga penerimaan yang sudah ada. Snapshot versi lama yang hanya memiliki satu satuan dan penerimaan lama tanpa snapshot harus tetap dapat dibaca dan ditinjau. Data metode pembayaran yang diajukan disimpan pada penerimaan sebelum ditetapkan pada pembelian; perubahan skema dan migrasi diperlukan untuk menyimpan data tersebut dengan aman.

Validasi server harus memastikan setiap satuan milik produk dan toko yang benar, masih dapat digunakan, serta memiliki konversi dan konfigurasi harga yang sesuai ketika penerimaan disetujui. Bila data berubah selama penerimaan menunggu persetujuan, tampilkan konflik yang meminta pemeriksaan ulang. Kegagalan validasi, pembaruan harga, stok, metode pembayaran, atau pencatatan pengeluaran membatalkan finalisasi dalam satu transaksi.

## Area yang terdampak

- Dialog persetujuan Daftar Belanja dan proses pembuatan serta persetujuan pembelian.
- Formulir, API, penyimpanan, pemeriksaan, dan finalisasi Penerimaan Barang.
- Penghitungan harga kelompok satuan dan riwayat perubahan harga.
- Tampilan metode pembayaran pada pembelian serta laporan pengeluaran setelah penerimaan pertama disetujui.
- Bantuan, katalog alur kerja Asisten AI, catatan perubahan, dan dokumentasi fitur.

Alur, izin, dan data historis yang sudah ada tetap perlu didukung. Analisis dampak GitNexus harus dijalankan sebelum mengubah simbol; indeks saat penyusunan desain ini terdeteksi tidak mutakhir sehingga hasilnya perlu ditinjau bersama kode terbaru.

## Verifikasi yang direncanakan

- Tulis pengujian yang gagal terlebih dahulu untuk lokasi metode pembayaran, validasi Giro, dan penundaan pengeluaran hingga persetujuan penerimaan pertama.
- Periksa penerimaan sebagian, penerimaan berikutnya, persetujuan bersamaan, penolakan, kegagalan transaksi, dan pembelian lama yang sudah memiliki pengeluaran.
- Periksa tampilan dan penyimpanan beberapa satuan, nilai kosong, harga manual dan otomatis, konflik konfigurasi, kelompok produk yang berulang, serta snapshot historis.
- Periksa pembuatan dan pemeriksaan penerimaan melalui keyboard dan pada ukuran layar kecil, serta pembaruan Bantuan, katalog alur kerja, dan catatan perubahan.
- Jalankan pemeriksaan terarah yang relevan, lint, dan pemeriksaan tipe sesuai kebutuhan. Jangan menjalankan `pnpm build`, serta jangan memulai atau menghentikan server pengembangan.

## Catatan implementasi (2026-11-01 WIB)

- Persetujuan akhir Penerimaan Barang mengharuskan penyelesaian pembayaran tersedia sebelum stok dan status penerimaan diperbarui. Pembelian yang sudah memiliki pengeluaran tetap memakai catatan sebelumnya.
- Pemrosesan Pembelian Barang lama tetap mengikuti alur lama, termasuk pencatatan atau penggantian pengeluaran saat pembelian disetujui. Aturan penundaan pengeluaran berlaku untuk Daftar Belanja baru.
- Migrasi `20261031010000_inbound_receipt_payment` menambahkan metode pembayaran dan tanggal jatuh tempo pada penerimaan serta penanda penundaan HPP pada pembelian. Migrasi telah diterapkan pada basis data pengembangan dan produksi; riwayat, checksum dengan normalisasi akhir baris, dan tipe kolom diperiksa setelahnya.
- Pemeriksaan meliputi pengujian Vitest untuk alur pembelian dan penerimaan, harga satuan, kompatibilitas data lama, Bantuan, katalog alur kerja, dan catatan perubahan; pemeriksaan TypeScript web, ESLint terarah, validasi skema Prisma, dan whitespace juga dijalankan.
- Interaksi browser diperiksa untuk seluruh satuan, perubahan harga bersama, konfirmasi pemeriksaan, penerimaan lama, navigasi keyboard, dan tampilan layar kecil. Pengujian penguncian dan konflik memakai repository tiruan; transaksi bersamaan pada basis data produksi tidak dijalankan.
- Proxy Headroom tidak terjangkau; peninjauan dilakukan dengan keluaran lokal yang dibatasi. Analisis GitNexus melalui CLI menandai finalisasi penerimaan sebagai risiko kritis dan menunjukkan jalur pemanggil melalui persetujuan item penerimaan; indeksnya tidak mutakhir dan pembaruan indeks gagal saat worker parser dimulai.
