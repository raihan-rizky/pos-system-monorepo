# Panduan Fitur Shift Kasir (Shift History)

Fitur Shift Kasir (Riwayat Shift) dirancang untuk membantu Anda memantau dan mengelola pergerakan uang tunai fisik yang ada di laci (cash drawer) kasir selama periode kerja tertentu (shift). 

## Konsep Utama
- **Shift Kasir:** Sesi waktu kerja seorang kasir. Untuk dapat memproses transaksi penjualan, sistem mewajibkan adanya satu shift yang sedang aktif.
- **Modal Laci (Opening Balance):** Saldo atau jumlah uang tunai fisik awal yang dimasukkan ke dalam laci saat shift pertama kali dibuka.
- **Ekspetasi Tutup Laci (Expected Balance):** Jumlah uang yang *seharusnya* ada di laci saat shift ditutup, dihitung secara otomatis oleh sistem (Modal Laci + Semua Pemasukan Transaksi Tunai).
- **Tutup Laci (Closing Balance):** Jumlah uang tunai fisik aktual yang dihitung secara manual oleh kasir di akhir shift.
- **Selisih (Discrepancy):** Perbedaan antara Uang Tutup Laci Fisik dengan Ekspetasi Sistem. 
  - **Sempurna (0):** Uang fisik sesuai dengan catatan sistem.
  - **Kurang (-):** Uang fisik lebih sedikit dari catatan sistem.
  - **Lebih (+):** Uang fisik lebih banyak dari catatan sistem.

## Fungsionalitas & Operasional
- **Buka & Tutup Shift:** Langkah praktis memulai shift kasir dengan uang modal awal dan mengakhiri shift dengan uang tutup laci dibahas di [FAQ](file:///d:/main_project/pos-system-monorepo/apps/web/features/ai-assistant/docs/help/faq.md#q10-bagaimana-cara-memulai-buka-dan-mengakhiri-tutup-shift-kerja-kasir).
- **Koreksi Data Shift:** Panduan mengedit saldo shift yang salah input dibahas di [FAQ](file:///d:/main_project/pos-system-monorepo/apps/web/features/ai-assistant/docs/help/faq.md#q11-bagaimana-cara-mengoreksi-atau-mengubah-data-laporan-shift-kasir-yang-sudah-ditutup).
- **Panel Shift Aktif:** Memantau durasi, transaksi tunai, estimasi saldo laci real-time, dan tombol tutup shift.
- **Riwayat Shift:** Rekapitulasi shift kasir (Modal, Uang Fisik Akhir, Selisih, Kasir, Catatan) yang dapat diurutkan.

## Hak Akses (Role-Based Access Control)
- Umumnya kasir dapat membuka dan menutup shift untuk diri mereka sendiri.
- **Ubah (Update):** Hanya pengguna dengan tingkat hak akses memadai (contoh: Manajer atau Admin) yang dapat mengklik tombol "Ubah Shift" untuk mengoreksi nilai saldo, menambahkan catatan, atau melakukan penyesuaian pada shift yang sudah berlalu.
