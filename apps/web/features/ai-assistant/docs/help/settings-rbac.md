# Pengaturan dan RBAC

## Pengaturan

Buka sidebar **Lainnya > Pengaturan** (`/settings`). Tab yang tersedia:

- **Info Toko**: logo, nama, alamat, dan nomor telepon yang tampil pada struk/invoice. Penyimpanan memerlukan permission `settings.update`.
- **WhatsApp**: status session WAHA serta koneksi melalui QR atau pairing code. Fitur memerlukan konfigurasi `WAHA_BASE_URL`; perubahan memerlukan permission WhatsApp yang sesuai.
- **RBAC**: hanya terlihat untuk OWNER.
- **Notifikasi**: push notification dan suara untuk browser/perangkat yang sedang digunakan.
- **Offline Sync**: status transaksi offline lokal, sync manual, dan pembersihan riwayat yang sudah tersinkron.

Tab Notifikasi dan Offline Sync menyimpan atau mengelola state perangkat/browser, bukan pengaturan global semua pengguna.

## RBAC

OWNER selalu memiliki akses penuh dan permission OWNER tidak dapat diedit. Pada tab **RBAC**, OWNER dapat mengatur role ADMIN, CASHIER, SALES, dan INVENTORY dalam dua lapisan:

1. **Akses Halaman** menentukan apakah role boleh membuka route seperti `/products`, `/customers`, atau `/inventory`.
2. **Aksi Resource** menentukan izin `create`, `read`, `update`, dan `delete` untuk resource seperti transaction, product, customer, supplier, inventory, expense, settings, dan lainnya.

Akses halaman saja tidak otomatis memberi izin menjalankan aksi backend, dan izin resource saja tidak otomatis menampilkan halaman. Keduanya harus konsisten. Permission `inventory.approve` dikunci untuk OWNER dan tidak dapat didelegasikan kepada role lain.

### Auto Approve Transaksi

Pada modul **Auto Approve Transaksi**, aktifkan aksi **Buat** (`transaction.auto_approve.create`) untuk role yang boleh memfinalisasi checkout tanpa antrean approval. Jika dimatikan, transaksi dari role tersebut berstatus `PENDING_APPROVAL`; stok dan revenue baru diproses setelah disetujui. Jika aktif, status langsung `COMPLETED` atau `DP` sesuai pembayaran, stok langsung diproses, dan user tidak otomatis mendapat hak menyetujui transaksi orang lain. Default: ADMIN dan CASHIER aktif, SALES dan INVENTORY tidak aktif; OWNER selalu memiliki akses penuh.

### Fitur Pengaturan RBAC Baru
Sistem menyediakan antarmuka modern bagi Owner untuk mengelola hak akses:
- **Ringkasan Role:** Kartu statistik di bagian atas yang menampilkan jumlah halaman aktif, aksi aktif, custom permission, dan total peringatan sensitif untuk masing-masing role.
- **Matrix Modul:** Tabel ringkasan yang membandingkan hak akses (halaman dan aksi) di seluruh role untuk semua modul sistem. Membantu meninjau izin secara cepat dan terpusat.
- **Review & Simpan:** Ketika ada perubahan izin lokal, sistem akan menampilkan status "Belum disimpan". Mengklik "Review & Simpan" membuka modal log ringkasan perubahan.
- **Konfirmasi Perubahan Sensitif:** Jika perubahan melibatkan permission sensitif (seperti data keuangan, RBAC, nomor WhatsApp, HPP, atau approval), Owner wajib memberikan konfirmasi persetujuan tambahan sebelum data disimpan secara permanen ke database backend.

Pak Teladan mengikuti role pengguna dan hanya menerima tool yang diizinkan untuk role tersebut. Pak Teladan tidak memiliki tool untuk membaca konfigurasi RBAC saat ini atau mengubah Info Toko, WhatsApp, notifikasi, Offline Sync, maupun permission.
