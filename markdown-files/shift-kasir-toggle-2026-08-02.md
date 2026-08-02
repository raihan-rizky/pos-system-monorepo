# Design: Toggle Shift Kasir di Settings

Tanggal: 2026-08-02

## Ringkasan

Tambahkan setting owner-only untuk mematikan kewajiban shift kasir. Saat setting OFF, kasir dapat melakukan transaksi tanpa membuka shift dan popup/banner shift tidak ditampilkan. Data shift lama tidak dihapus atau ditutup otomatis.

Shift yang masih `OPEN` saat fitur dimatikan masuk mode pause: status tetap `OPEN`, tetapi durasinya berhenti. Saat fitur dinyalakan kembali, shift otomatis resume dari durasi efektif terakhir.

Default setting adalah ON agar behavior existing tetap sama untuk data lama.

## Scope dan keputusan

- Setting berlaku store-wide mengikuti scope `StoreSettings` yang saat ini dipakai aplikasi.
- Hanya role `OWNER` yang boleh mengubah setting. Non-owner tidak melihat tab dan mendapat `403` jika mencoba memanggil mutation API.
- Role yang dapat masuk POS boleh membaca status setting agar UI kasir dapat menyesuaikan behavior.
- Shift `OPEN` tetap `OPEN` selama pause. `openedAt`, `closedAt`, saldo, dan history tidak diubah.
- Jika sebuah shift dibuka ketika fitur sedang OFF melalui halaman shift/API, shift tersebut langsung dibuat dalam keadaan paused agar timer tidak berjalan.
- Shift yang sudah `CLOSED` tidak ikut dipause atau di-resume.
- Menutup shift yang sedang paused tetap diperbolehkan; proses close tetap menghitung summary transaksi seperti biasa.

## Arsitektur data

Tambahkan field berikut:

### `StoreSettings`

- `shiftEnabled Boolean @default(true)`

### `CashierShift`

- `pausedAt DateTime?`
- `pausedDurationSeconds Int @default(0)`

Durasi efektif dihitung dengan formula:

```text
elapsed = endTime - openedAt - pausedDurationSeconds - currentPauseDuration
```

Untuk shift yang masih terbuka, `endTime` adalah waktu sekarang. Untuk shift yang sudah ditutup, `endTime` adalah `closedAt`. `currentPauseDuration` hanya dihitung jika `pausedAt` masih terisi.

Dengan model ini, pause berulang tetap akurat dan tidak mengubah timestamp historis asli.

## Data flow dan API

Buat endpoint `/api/settings/shift`:

- `GET`: membaca `{ enabled: boolean }` untuk role yang memiliki akses POS.
- `PATCH`: menerima `{ enabled: boolean }` dan hanya mengizinkan `OWNER`.

Perubahan setting dan update shift dilakukan dalam satu database transaction:

### OFF

1. Update `StoreSettings.shiftEnabled = false`.
2. Cari shift `OPEN` yang belum pause di store tersebut.
3. Set `pausedAt = now`.

### ON

1. Update `StoreSettings.shiftEnabled = true`.
2. Cari shift `OPEN` yang memiliki `pausedAt`.
3. Tambahkan `now - pausedAt` ke `pausedDurationSeconds`.
4. Set `pausedAt = null`.

Operasi harus idempotent: OFF berulang tidak membuat pause baru, dan ON berulang tidak menghitung durasi dua kali.

Endpoint `POST /api/shifts` juga membaca setting. Jika shift feature sedang OFF, shift baru dibuat dengan `pausedAt` terisi sejak waktu pembukaan.

## Frontend behavior

### Settings

Tambahkan tab owner-only **Shift Kasir** dengan card:

- Title: **Gunakan Shift Kasir**
- Toggle ON/OFF.
- ON: “Kasir wajib membuka shift sebelum transaksi.”
- OFF: “Kasir bisa bertransaksi tanpa membuka shift.”
- Penjelasan bahwa shift terbuka akan dipause, bukan ditutup.

Saat toggle OFF, tampilkan confirmation karena perubahan memengaruhi alur checkout. Saat toggle ON, perubahan langsung dilakukan tanpa confirmation tambahan.

### POS

Tambahkan query status shift setting yang refresh saat window focus dan secara berkala agar tab POS milik kasir menerima perubahan owner.

Jika `shiftEnabled === true`:

- behavior existing dipertahankan;
- popup buka shift muncul jika tidak ada active shift;
- checkout tanpa active shift diblok;
- banner active shift ditampilkan.

Jika `shiftEnabled === false`:

- popup buka shift tidak dirender;
- banner shift tidak dirender;
- checkout tidak diblok walaupun tidak ada active shift.

Jika setting masih loading atau gagal dibaca, frontend memakai safe default ON. Dengan begitu kegagalan membaca setting tidak accidentally membuka transaksi tanpa kontrol shift.

### Shift history

History tetap menampilkan shift paused dengan status `OPEN`. Tampilan durasi menggunakan helper durasi efektif sehingga waktu selama pause tidak ikut dihitung.

## Error handling

- Mutation gagal: status toggle dikembalikan ke nilai sebelumnya dan error ditampilkan kepada owner.
- Unauthorized/non-owner: response `401`/`403` mengikuti guard existing.
- Tidak ada active shift saat toggle: perubahan setting tetap berhasil.
- Shift yang sudah closed tidak dimodifikasi.
- Transaction database gagal: seluruh perubahan di-rollback, sehingga setting dan pause state tidak split-brain.

## Testing strategy

### Unit/API

- Default setting adalah ON.
- Owner dapat mengubah setting.
- Non-owner ditolak dengan `403`.
- OFF mempause active shift.
- ON me-resume shift dan menambah durasi pause.
- Toggle berulang tidak menggandakan pause atau durasi.
- Shift `CLOSED` dan data history tetap tidak berubah.
- Shift baru yang dibuat saat OFF langsung paused.
- Toggle tetap berhasil bila tidak ada active shift.
- Database transaction rollback bila salah satu update gagal.

### Component/E2E

- Tab Shift Kasir hanya terlihat untuk owner.
- Confirmation muncul ketika mematikan shift.
- POS OFF tidak menampilkan popup/banner dan checkout tanpa shift dapat lanjut.
- POS ON mempertahankan gate checkout existing.
- Perubahan owner terbaca oleh POS setelah refetch/focus.
- Error mutation ditampilkan tanpa meninggalkan optimistic state yang salah.

## Out of scope

- Menghapus atau mengubah history shift lama.
- Mengubah role permission matrix global.
- Membuat audit log khusus untuk toggle.
- Mengubah format laporan finansial selain memakai durasi efektif untuk shift.
