# RBAC Auto Approve Transaksi

Tanggal: 22 Juli 2026

## Ringkasan

RBAC sekarang memiliki resource `transaction.auto_approve`. Owner dapat mengaktifkan aksi **Buat** per role melalui modul **Auto Approve Transaksi**.

## Perilaku

- Aktif: transaksi langsung final sebagai `COMPLETED` atau `DP`, stok langsung diproses, dan tidak ada notifikasi permintaan approval.
- Tidak aktif: transaksi menjadi `PENDING_APPROVAL`, stok dan revenue belum diproses, lalu Owner/Admin menerima notifikasi approval.
- Permission ini tidak memberikan kemampuan approve atau reject transaksi lain; kemampuan tersebut tetap memakai `transaction.approve`.

## Default

- OWNER: selalu aktif karena memiliki full access.
- ADMIN dan CASHIER: aktif untuk menjaga behavior checkout existing.
- SALES dan INVENTORY: tidak aktif.

Perubahan permission dikategorikan critical dan membutuhkan konfirmasi saat disimpan.
