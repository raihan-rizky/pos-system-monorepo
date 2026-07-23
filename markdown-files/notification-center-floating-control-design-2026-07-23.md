# Notification Center Floating Control Design

Tanggal: 2026-07-23

## Tujuan

Mengubah tombol Notification Center menjadi floating control yang bisa disembunyikan dan dipindahkan agar tidak menutupi konten halaman. Control harus nyaman dipakai dengan mouse maupun touch, tetap dapat ditemukan saat tersembunyi, dan mempertahankan preferensi user setelah reload.

## UX yang Disetujui

- User baru melihat Notification Center dalam kondisi tersembunyi.
- Kondisi tersembunyi tetap menampilkan tab kecil berikon `>` pada tepi layar.
- Tab memiliki hover animation berupa sedikit slide ke arah dalam layar, scale-up halus, dan peningkatan shadow.
- Klik tab menampilkan kembali tombol bell.
- Tombol bell menyediakan aksi hide yang terlihat saat area control di-hover atau mendapat fokus keyboard.
- Bell dan tab dapat di-drag.
- Saat drag selesai, control snap ke sisi kiri atau kanan yang paling dekat.
- Posisi vertikal mengikuti posisi terakhir drag dan di-clamp agar control tidak keluar viewport.
- Posisi vertikal, sisi, dan status hidden/visible disimpan di `localStorage`.
- Preference tersimpan dipakai setelah reload. Default hidden hanya berlaku ketika preference belum pernah dibuat.
- Drag yang melewati threshold tidak boleh ikut memicu aksi click untuk membuka panel atau restore.

## Pendekatan Teknis

Implementasi menggunakan Pointer Events tanpa dependency baru. Pointer Events dipilih karena satu jalur event dapat menangani mouse, stylus, dan touch.

State floating control:

```ts
type NotificationFloatingPreference = {
  edge: "left" | "right";
  y: number;
  hidden: boolean;
};
```

Preference disimpan dengan versioned local-storage key agar perubahan format di masa depan tidak merusak state lama. Pembacaan storage harus aman ketika SSR, storage tidak tersedia, atau JSON rusak.

Perhitungan posisi dipisahkan menjadi pure helpers:

- clamp posisi vertikal berdasarkan tinggi viewport dan tinggi control;
- menentukan sisi kiri/kanan terdekat ketika pointer dilepas;
- menghasilkan preference default;
- memvalidasi dan menormalisasi preference yang dibaca dari storage.

## Interaksi

### Drag

1. Pointer down menyimpan posisi awal pointer dan control.
2. Pointer move baru dianggap drag setelah melewati threshold kecil.
3. Selama drag, posisi control mengikuti pointer dan tetap berada dalam viewport.
4. Pointer up memilih sisi kiri atau kanan terdekat, lalu menyimpan preference.
5. Click setelah drag diabaikan agar panel tidak terbuka tanpa sengaja.

### Hide dan Restore

- Bell visible: tombol hide mengubah `hidden` menjadi `true`, menutup panel, lalu menyimpan preference.
- Hidden tab: klik `>` mengubah `hidden` menjadi `false`, lalu menyimpan preference.
- Hidden tab tetap draggable sehingga user bisa memindahkan affordance restore.

### Panel

- Pada sisi kanan, panel diratakan ke kanan dan membuka ke arah dalam layar.
- Pada sisi kiri, panel diratakan ke kiri dan membuka ke arah dalam layar.
- Posisi panel tetap dibatasi oleh viewport.
- Outside click tetap menutup panel tanpa mengubah status hidden.

## Accessibility

- Bell mempertahankan label jumlah notifikasi belum dibaca.
- Tab restore memiliki `aria-label="Tampilkan notifikasi"`.
- Tombol hide memiliki `aria-label="Sembunyikan notifikasi"`.
- Aksi hide dan restore dapat digunakan dengan keyboard.
- Hover animation juga aktif melalui `focus-visible`.
- Animasi menghormati reduced-motion melalui utility atau media preference yang tersedia.

## Error Handling

- JSON storage rusak atau shape tidak valid diabaikan dan diganti preference default.
- Kegagalan menulis storage tidak memblokir interaksi pada sesi berjalan.
- Resize viewport melakukan clamp ulang terhadap posisi vertikal.
- Pointer cancel mengakhiri drag tanpa membuka panel.

## Testing

TDD dilakukan dalam beberapa siklus:

1. Pure helper tests untuk default hidden, clamp vertikal, snap kiri/kanan, dan normalisasi preference.
2. Component rendering tests untuk tab restore, bell visible, tombol hide, ARIA label, dan edge-aware panel.
3. Regression tests memastikan unread badge, daftar notifikasi, mark-all-read, dan navigation tetap berfungsi.
4. Validasi akhir menjalankan targeted Vitest, ESLint, dan TypeScript check.

## Non-goals

- Tidak mengubah API, database, atau isi notifikasi.
- Tidak menambahkan sinkronisasi posisi antar-device.
- Tidak membuat snap ke sisi atas atau bawah.
- Tidak mengubah permission push notification atau notification sound.
