# Notification Center dan Heads-up Pak Teladan

Tanggal: 22 Juli 2026

## Ringkasan

Sistem sekarang memiliki inbox notifikasi persistent per pengguna. Inbox ini menjadi sumber yang sama untuk ikon bell global dan heads-up Pak Teladan, sehingga unread count tetap konsisten setelah refresh atau pindah halaman.

## Perilaku Pengguna

- Ikon bell global menampilkan badge merah dengan jumlah notifikasi yang belum dibaca.
- Klik satu item akan menandainya sebagai sudah dibaca dan membuka halaman terkait.
- Aksi **Tandai semua dibaca** mengosongkan unread count tanpa menghapus riwayat.
- Tombol Pak Teladan menampilkan badge yang sama. Saat panel dibuka, Pak Teladan memberi heads-up dan shortcut untuk maksimal tiga notifikasi unread terbaru.
- Inbox tetap bekerja tanpa izin browser push. Push notification dan suara tetap menjadi channel tambahan sesuai pengaturan perangkat.

## Event yang Dicakup

- Permintaan approval transaksi untuk Owner/Admin.
- Permintaan stok tunggal untuk Owner/Admin.
- Permintaan stok massal untuk Owner/Admin.
- Permohonan Belanja baru untuk Owner/Admin.

Pembuat request dikecualikan dari penerima event yang dibuatnya sendiri. Setiap kombinasi pengguna, nama event, dan tag hanya disimpan sekali agar retry tidak membuat duplikat.

## Backend dan Keamanan

- Tabel `pos_notifications` menyimpan penerima, toko, event, isi, tujuan, tag deduplikasi, serta `readAt`.
- Endpoint daftar hanya membaca notifikasi milik user yang sedang login.
- Endpoint mark-as-read selalu memfilter `id` dan `userId`, sehingga user tidak dapat membaca atau mengubah notifikasi akun lain.
- Browser push tetap dicoba jika penulisan inbox mengalami gangguan sementara; kegagalan notifikasi tidak membatalkan transaksi bisnis utama.

## Operasional Database

Deploy migration `20260722_notification_inbox` sebelum merilis aplikasi yang memakai fitur ini.
