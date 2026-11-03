# Pengaturan dan RBAC

## Pengaturan

Buka sidebar **Lainnya > Pengaturan** (`/settings`). Tab yang tersedia:

- **Info Toko**: logo, nama, alamat, dan nomor telepon yang tampil pada struk/invoice. Penyimpanan memerlukan permission `settings.update`.
- **WhatsApp**: status session WAHA serta koneksi melalui QR atau pairing code. Fitur memerlukan konfigurasi `WAHA_BASE_URL`; perubahan memerlukan permission WhatsApp yang sesuai.
- **RBAC**: hanya terlihat untuk OWNER.
- **Notifikasi**: push notification dan suara untuk browser/perangkat yang sedang digunakan.
- **Offline Sync**: status transaksi offline lokal, sync manual, dan pembersihan riwayat yang sudah tersinkron.

Tab Notifikasi dan Offline Sync menyimpan atau mengelola state perangkat/browser, bukan pengaturan global semua pengguna.

## Pusat Notifikasi

Setiap pengguna yang login memiliki inbox notifikasi sendiri. Ikon bell di kanan atas menampilkan badge merah berisi jumlah update yang belum dibaca. Klik satu item untuk menandainya sebagai sudah dibaca sekaligus membuka halaman terkait, atau klik **Tandai semua dibaca**. Badge hilang ketika unread mencapai nol, sementara riwayat yang sudah dibaca tetap tersedia.

Notifikasi operasional saat ini mencakup permintaan approval transaksi, permintaan stok tunggal atau massal, Daftar Belanja baru, serta Pembelian Barang yang diajukan, disetujui, atau ditolak. Pembuat request tidak menerima notifikasi untuk aksinya sendiri. Browser push tetap mengikuti izin dan pengaturan perangkat, sedangkan inbox tersimpan di server.

Pak Teladan memakai inbox yang sama: tombol robot ikut menampilkan badge merah, lalu panel chat memberi heads-up dan shortcut menuju maksimal tiga notifikasi terbaru yang belum dibaca.

## RBAC

OWNER selalu memiliki akses penuh dan permission OWNER tidak dapat diedit. Pada tab **RBAC**, OWNER dapat mengatur role ADMIN, CASHIER, SALES, dan INVENTORY dalam dua lapisan:

1. **Akses Halaman** menentukan apakah role boleh membuka route seperti `/products`, `/customers`, atau `/inventory`.
2. **Aksi Resource** menentukan izin `create`, `read`, `update`, dan `delete` untuk resource seperti transaction, product, customer, supplier, inventory, expense, settings, dan lainnya.

Akses halaman saja tidak otomatis memberi izin menjalankan aksi backend, dan izin resource saja tidak otomatis menampilkan halaman. Keduanya harus konsisten. Permission `inventory.approve` dikunci untuk OWNER dan tidak dapat didelegasikan kepada role lain.

### Mencari modul dan memeriksa izin

Susunan Ringkasan Role, Matrix Modul, pemilih modul, dan editor tetap sama. Gunakan pencarian modul pada pemilih; semua modul tersedia lewat navigasi komputer maupun ponsel. Editor hanya menampilkan tindakan yang dipakai fitur. Pratinjau akses menjelaskan prasyarat yang belum terpenuhi tanpa menambahkan izin secara otomatis. Pengelolaan RBAC (`rbac`) dan approval inventory umum (`inventory.approve`) bertanda **Khusus Owner**; keduanya tidak dapat didelegasikan.

### Izin fitur di modul yang sudah ada

Katalog memuat 43 resource dalam 25 modul dengan susunan halaman yang sama. Cari modul lalu pilih tindakan sesuai tugas role:

| Kontrol | Resource | Tindakan |
| --- | --- | --- |
| Harga khusus di nota | `transaction.custom_price` | `update`: Ubah harga di nota, terpisah dari edit harga master produk. |
| Pemasukan manual | `income.manual` | `create`, `read`, `update`, `delete`: buat, lihat, ubah, dan hapus pemasukan manual. |
| Pengeluaran dan transfer manual | `expense.manual_transfer` | `create`, `update`, `delete`: buat, ubah, dan hapus pengeluaran atau transfer kas manual. |
| Pembayaran utang supplier | `expense.payable` | `create`: Bayar utang; `read`: Lihat utang; `update`: Ubah pembayaran. |
| Pencairan giro | `expense.giro` | `read`: Lihat giro; `update`: Cairkan giro. |
| Ekspor laporan keuangan | `financial-report.export` | `read`: Ekspor laporan, termasuk laporan bulanan dan jurnal. |
| Impor produk | `product.import` | `create`: Mulai impor produk, termasuk pratinjau dan ekstraksi gambar; `read`: Lihat progres impor; `update`: Perbarui impor untuk kode supplier. |
| Perubahan stok massal | `inventory.bulk` | `read`: Lihat progres stok massal; `update`: Mulai perubahan stok massal, termasuk perubahan manual, impor stok, dan grup stok. |

Harga khusus di nota tetap mengikuti akses Kasir dan izin transaksi sesuai alur. Izin pemasukan manual, pembayaran utang, dan pencairan giro dapat diberikan terpisah dari izin ubah keuangan umum. Daftar dan ringkasan Keuangan Harian tetap memerlukan `expense.read`; melihat dashboard laporan tetap memakai `financial-report.read`. Mengunduh laporan memerlukan `financial-report.export.read` beserta akses halaman dan baca laporan yang sesuai.

Izin `product.import.read` dan `inventory.bulk.read` hanya memberi pemantauan progres. Role dengan izin baca saja tidak mendapat tombol batal atau coba ulang; tindakan tersebut memerlukan izin mutasi sesuai jenis job. Untuk memulai impor latar belakang, berikan izin tindakan dan **Lihat progres** yang sesuai. Tombol menjelaskan prasyarat yang belum diberikan. Membatalkan hasil impor mengikuti jenis batch tersimpan: impor produk memakai `product.import.create`, stok massal memakai `inventory.bulk.update`; jenis stok lain tetap mengikuti `inventory.update`. Approval stok umum tetap **Khusus Owner**.

Unggah bukti pengeluaran atau transfer manual mengikuti izin buat atau ubah terkait dan lingkup toko yang dipilih.

Konfigurasi lama mewarisi aksi izin umum yang sesuai saat baris izin fitur belum tersimpan: `product.update` untuk harga nota, `income` untuk pemasukan manual, `expense` untuk pengeluaran/utang/giro, `financial-report.read` untuk ekspor, `product` untuk impor, dan `inventory` untuk stok massal. **Penolakan eksplisit** pada izin fitur selalu berlaku. Pada **simpan pertama**, sistem menetapkan nilai efektif sebelum perubahan diterapkan dalam satu transaksi; perubahan izin umum berikutnya tidak mengubah izin fitur yang sudah ditetapkan secara diam-diam.

### Sales belum dapat mengubah Riwayat

- **Buka Riwayat** memerlukan akses halaman `/history`.
- **Lihat transaksi** juga memerlukan `transaction.read`.
- **Ubah transaksi** juga memerlukan `transaction.update`. Izin History dan approval saja belum memberikan hak edit.
- Setujui/Tolak transaksi memakai `transaction.approve.update` / `transaction.approve.delete` secara terpisah.
- Ubah nota reguler tersedia pada PENDING_APPROVAL, DRAFT, COMPLETED, dan DP. VOIDED/REFUNDED tetap terkunci. Perubahan status dan tanggal invoice tetap mengikuti aturan Owner/Admin. Nota percetakan yang diproses memerlukan izin khusus; invoice gabungan mengikuti aturan dokumennya.
- Sales dengan izin persetujuan draft tetap tidak dapat menyetujui draft yang berasal dari permintaan (`requestedById`). Cakupan transaksi toko tidak berubah.

### Simpan, konflik, dan catatan perubahan

Tinjau perubahan lewat **Review & Simpan** dan konfirmasi izin sensitif. Sistem menyimpan hanya perubahan dengan versi yang Anda muat. Bila Owner lain lebih dulu menyimpan, edit lokal tetap tersedia dan penyimpanan ditahan agar perubahan tidak tertimpa. Periksa **Catatan perubahan hak akses**, lalu pilih **Muat versi terbaru dan ganti edit lokal** jika siap mengganti edit yang belum tersimpan dan menyusun ulang perubahan. Catatan memuat 20 penyimpanan terbaru, nama Owner, waktu WIB, dan izin yang berubah.

Izin API diperiksa dari konfigurasi terbaru. Browser memeriksa ulang saat tab aktif, koneksi pulih, setelah penyimpanan, dan setiap 30 detik saat terlihat. Perubahan izin efektif memuat ulang halaman agar data lama tidak tertinggal; perubahan pada role lain tidak mengganggu halaman Anda. Jika verifikasi gagal, halaman ditahan dengan tombol **Coba lagi** dan **Keluar**, sambil mempertahankan formulir yang sedang terbuka. Bila seluruh halaman dicabut, tersedia petunjuk untuk menghubungi Owner dan keluar.

Untuk Pembelian Barang, keputusan approve dan reject memakai resource terpisah: `supplier.goods_purchase.approve:update` serta `supplier.goods_purchase.reject:update`. Default kedua izin hanya OWNER, tetapi Owner dapat mendelegasikannya per role lewat RBAC.

### Auto Approve Transaksi

Pada modul **Auto Approve Transaksi**, aktifkan aksi **Buat** (`transaction.auto_approve.create`) untuk role yang boleh memfinalisasi checkout tanpa antrean approval. Jika dimatikan, transaksi dari role tersebut berstatus `PENDING_APPROVAL`; stok dan revenue baru diproses setelah disetujui. Jika aktif, status langsung `COMPLETED` atau `DP` sesuai pembayaran, stok langsung diproses, dan user tidak otomatis mendapat hak menyetujui transaksi orang lain. Default: ADMIN dan CASHIER aktif, SALES dan INVENTORY tidak aktif; OWNER selalu memiliki akses penuh.

### Fitur Pengaturan RBAC Baru
Sistem menyediakan antarmuka modern bagi Owner untuk mengelola hak akses:
- **Ringkasan Role:** Kartu statistik di bagian atas yang menampilkan jumlah halaman aktif, aksi aktif, custom permission, dan total peringatan sensitif untuk masing-masing role.
- **Matrix Modul:** Tabel ringkasan yang membandingkan hak akses (halaman dan aksi) di seluruh role untuk semua modul sistem. Membantu meninjau izin secara cepat dan terpusat.
- **Review & Simpan:** Ketika ada perubahan izin lokal, sistem akan menampilkan status "Belum disimpan". Mengklik "Review & Simpan" membuka modal log ringkasan perubahan.
- **Konfirmasi Perubahan Sensitif:** Jika perubahan melibatkan permission sensitif (seperti data keuangan, RBAC, nomor WhatsApp, HPP, atau approval), Owner wajib memberikan konfirmasi persetujuan tambahan sebelum data disimpan secara permanen ke database backend.

Pak Teladan mengikuti role pengguna dan hanya menerima tool yang diizinkan untuk role tersebut. Pak Teladan tidak memiliki tool untuk membaca konfigurasi RBAC saat ini atau mengubah Info Toko, WhatsApp, notifikasi, Offline Sync, maupun permission.
