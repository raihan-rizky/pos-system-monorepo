import type { ChangeEntry } from "../types";

/** Manually curated release notes. Keep historical entries; the popup filters the last seven WIB days. */
export const CHANGELOG: ChangeEntry[] = [
  {
    id: "receipt-tax-checkout", date: "2026-10-18", revision: 1,
    highlight: { title: "Pajak saat pembayaran", summary: "Isi pajak sebelum bayar; persentasenya tampil di bagian atas nota." },
    title: "Isi pajak langsung saat pembayaran.",
    summary: "Pajak nota biasa kini bisa diisi di modal Pembayaran dan langsung memperbarui total serta sisa tagihan. Persentase pajak tampil di bagian atas nota dan PDF.",
    kind: "improvement", area: "Kasir & Nota", href: "/pos", visual: "tax",
    screenshot: { src: "/images/changelog/pajak-pembayaran.png", alt: "Field Pajak persen pada modal Pembayaran dengan contoh tarif 12,5 persen dan penjelasan pajak setelah diskon" },
    steps: [
      { title: "Buka Pembayaran", detail: "Pilih barang di Kasir, lalu klik Bayar." },
      { title: "Isi Pajak (%)", detail: "Masukkan tarif 0–100 dengan maksimal dua desimal dan periksa total." },
      { title: "Bayar dan cetak", detail: "Konfirmasi pembayaran; tarif tersimpan dan tampil di bagian atas nota." },
    ],
  },
  {
    id: "visual-changelog", date: "2026-10-18", revision: 1,
    highlight: { title: "Catatan Perubahan", summary: "Pembaruan dan panduan fitur." },
    title: "Kenali perubahan, sekali lihat.",
    summary: "Pembaruan aplikasi kini punya tempat sendiri. Lihat sorotan minggu ini, gambar fitur, dan alur penggunaannya.",
    kind: "feature", area: "Aplikasi", href: "/changelog", visual: "changelog",
    steps: [
      { title: "Buka Lainnya", detail: "Pilih Catatan Perubahan" },
      { title: "Lihat sorotan", detail: "Perbesar gambar fitur" },
      { title: "Ikuti alurnya", detail: "Coba dari tautan fitur" },
    ],
  },
  {
    id: "receipt-tax", date: "2026-10-18", revision: 1,
    highlight: { title: "Pajak nota tersimpan", summary: "Pajak tetap sama saat cetak ulang." },
    title: "Pajak nota ikut tersimpan.",
    summary: "Pengaturan pajak tersimpan bersama transaksi, sehingga hasil cetak ulang tetap konsisten.",
    kind: "feature", area: "Transaksi", href: "/history", visual: "tax",
    steps: [
      { title: "Buka nota", detail: "Pilih transaksi" },
      { title: "Atur pajak", detail: "Periksa ringkasan total" },
      { title: "Cetak kembali", detail: "Pengaturan tetap tersimpan" },
    ],
  },
  {
    id: "batch-categories", date: "2026-10-18", revision: 1,
    highlight: { title: "Pindah kategori sekaligus", summary: "Ubah beberapa produk sekaligus." },
    title: "Rapikan kategori sekaligus.",
    summary: "Pindahkan produk terpilih ke kategori tujuan. Tinjau dampaknya sebelum menghapus kategori lama.",
    kind: "feature", area: "Produk", href: "/products", visual: "categories",
    steps: [
      { title: "Pilih produk", detail: "Tandai beberapa produk" },
      { title: "Tentukan kategori", detail: "Pilih kategori tujuan" },
      { title: "Tinjau & simpan", detail: "Periksa dampak perubahan" },
    ],
  },
  {
    id: "unit-stock-conversion", date: "2026-10-18", revision: 1,
    highlight: { title: "Stok per satuan", summary: "Cek stok dan konversi satuan." },
    title: "Stok lebih jelas di setiap satuan.",
    summary: "Lihat stok dan konversi satuan langsung di kartu produk Kasir serta daftar Produk.",
    kind: "improvement", area: "Kasir & Produk", href: "/pos", visual: "units",
    screenshot: { src: "/images/changelog/pos-unit-stock.webp", alt: "Halaman Kasir dengan stok dan konversi satuan pada kartu produk" },
    steps: [
      { title: "Cari produk", detail: "Buka kartu di Kasir" },
      { title: "Pilih satuan", detail: "Stok mengikuti pilihan" },
      { title: "Cek konversi", detail: "Lanjutkan ke keranjang" },
    ],
  },
  {
    id: "quotation-number-date", date: "2026-10-16", revision: 1,
    highlight: { title: "Nomor & tanggal penawaran", summary: "Atur nomor dan tanggal cetak." },
    title: "Nomor penawaran bisa Anda atur.",
    summary: "Tentukan nomor saat mencetak penawaran. Tanggal awal terisi mengikuti WIB dan bisa disesuaikan.",
    kind: "improvement", area: "Penawaran", href: "/pos", visual: "quotation",
    steps: [
      { title: "Siapkan penawaran", detail: "Pilih produk di Kasir" },
      { title: "Atur nomor", detail: "Sesuaikan tanggal WIB" },
      { title: "Cetak penawaran", detail: "Periksa pratinjau" },
    ],
  },
  {
    id: "stock-group-workspace", date: "2026-10-14", revision: 1,
    highlight: { title: "Pengelolaan grup stok", summary: "Cek pratinjau sebelum disimpan." },
    title: "Stok bersama, alur lebih terarah.",
    summary: "Buat atau gabungkan grup stok dengan panduan dan pratinjau. Draft pekerjaan tetap terpisah agar mudah dilanjutkan.",
    kind: "improvement", area: "Grup Stok", href: "/products", visual: "stock-groups",
    steps: [
      { title: "Pilih grup", detail: "Buat baru atau gabungkan" },
      { title: "Cek pratinjau", detail: "Tinjau stok dan konversi" },
      { title: "Simpan grup", detail: "Lanjutkan draft lainnya" },
    ],
  },
];
