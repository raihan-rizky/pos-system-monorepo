# Judul internal nota Percetakan

Tanggal: 2026-10-20 (WIB).

## Penggunaan

1. Buka Kasir > Percetakan dan pilih jenis nota.
2. Buat atau buka draft. Isian **Judul nota** berada di atas lembar nota dan awalnya berisi nomor nota.
3. Ganti judul, misalnya **Banner Promosi Oktober**, lalu tunggu **Tersimpan**.
4. Judul tampil di kartu daftar bersama nomor nota sebagai acuan. Cari melalui judul, nomor, atau pelanggan.

## Perilaku

- Judul maksimal 100 karakter dalam satu baris, tersimpan otomatis bersama nota.
- Nota lama memakai nomor nota sebagai judul awal tanpa migrasi database.
- Saat nomor berubah, judul awal mengikuti nomor baru. Judul khusus tetap dipertahankan.
- Mengosongkan judul mengembalikan judul ke nomor nota saat penyimpanan berhasil.
- Judul hanya penanda internal. Lembar nota, cetakan, PDF, dan lampiran tetap memakai nomor nota.
- Setelah nota diproses, judul dapat dibaca dan dicari, tetapi tidak dapat diedit, mengikuti penguncian isi nota.
- Izin akses toko, subkategori, dan pemeriksaan revision tetap berlaku. Klien lama yang belum mengirim judul tidak menghapus judul khusus yang tersimpan.

## Implementasi

Judul disimpan pada properti opsional `document.title` di JSON nota. Validasi ada di `domain.ts`, nilai awal dan penyimpanan di `server/receipt-store.ts`, dan isian serta kartu daftar di `PrintingReceiptWorkspace.tsx`. Pencarian memakai filter JSON judul dengan pencocokan tanpa membedakan huruf besar/kecil. Penomoran dan proses pembayaran memakai jalur yang sudah ada.

## Verifikasi

- Tes validasi, nilai awal, judul lama, penyimpanan judul, sinkronisasi nomor, kompatibilitas klien lama, batas toko/subkategori, konflik revision, dan penguncian setelah diproses.
- Pengujian PDF memastikan judul internal tidak tercetak pada nota Spanduk maupun A5.
- Browser harness memeriksa edit, autosave, pencarian judul, buka ulang, dan status baca saja pada viewport 1280 px dan 390 px.
- Bantuan, FAQ, workflow AI Assistant, dan Catatan Perubahan diperbarui bersama fitur ini.
