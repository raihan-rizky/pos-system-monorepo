# Global Page Loop Animation

Tanggal: 22 Juli 2026

## Ringkasan

Semua halaman pada app shell utama sekarang memiliki ambient loop animation berupa dua dot kecil yang bergerak pelan di pojok area konten.

## Prinsip UX

- Animasi memakai opacity rendah agar tidak mengalihkan perhatian dari transaksi dan form.
- Layer menggunakan `pointer-events: none`, sehingga tidak menutup tombol atau mengganggu scroll.
- Implementasi berada di shared main layout agar konsisten dan tidak diduplikasi pada setiap halaman.
- Media query `prefers-reduced-motion: reduce` menghentikan animasi untuk aksesibilitas.

## Verifikasi

Test layout memastikan elemen global tersedia, bersifat dekoratif dengan `aria-hidden`, dan tidak menerima pointer interaction.
