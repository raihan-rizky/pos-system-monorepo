# Desain: Default Tipe Pesanan POS ke Beli Langsung

## Intent

Pengguna ingin transaksi baru di POS dibuka sebagai **Beli Langsung** untuk semua isi keranjang, termasuk layanan percetakan dan item yang memiliki bahan atau atribut produksi. Tujuannya agar transaksi tidak masuk ke Papan Produksi hanya karena jenis itemnya.

## Goals

- `PaymentModal` memilih **Beli Langsung** saat pertama dibuka.
- Pilihan **Job Order** tetap tersedia dan tetap mengirim `isJobOrder: true` jika dipilih manual.
- Tambahkan regresi test untuk item percetakan dan item dengan bahan/ukuran.

## Non-goals

- Tidak mengubah route, middleware, halaman Papan Produksi, atau aturan backend untuk transaksi yang memang dikirim sebagai Job Order.
- Tidak menghapus status produksi atau alur bahan; hanya mengubah pilihan awal di modal pembayaran.

## Approaches

1. **Default Beli Langsung, Job Order manual (dipilih).** Ubah nilai awal `isJobOrder` menjadi `false` dan verifikasi render/test. Dampaknya paling kecil serta mempertahankan alur produksi.
2. **Paksa semua layanan percetakan menjadi Beli Langsung.** Mengabaikan pilihan Job Order untuk item tertentu. Ini memutus kemampuan pengguna membuat job order dari POS.
3. **Ubah redirect/landing page.** Tidak menyentuh penyebab transaksi masuk Papan Produksi, sehingga tidak memenuhi kebutuhan.

## Implementation notes

- Perubahan berada di `apps/web/components/PaymentModal.tsx` pada initial state `isJobOrder`.
- Test komponen akan merender modal dengan layanan percetakan dan item berbahan, lalu memastikan tombol **Beli Langsung** aktif sementara **Job Order** tidak aktif.
- Setelah test merah terlihat, implementasi minimal dilakukan dan test terkait dijalankan bersama lint/type-check yang relevan.

## Constraints

- Ikuti TDD: test harus gagal sebelum perubahan produksi.
- Teks UI tetap berbahasa Indonesia.
- Jangan mengubah pekerjaan pengguna/agent yang sudah ada di working tree.
