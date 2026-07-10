import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import HelpContent from '../components/HelpContent';

describe('HelpContent', () => {
  it('explains modal zoom and internal AppShell scrolling', () => {
    const html = renderToStaticMarkup(
      <HelpContent targetRole="OWNER" />
    );

    expect(html).toContain('data-help-preview-tip="true"');
    expect(html).toContain('Tips Melihat Panduan Visual');
    expect(html).toContain('bubble zoom 2×');
    expect(html).toContain('scrollbar internal');
  });

  it('renders informal AI assistant description correctly', () => {
    const html = renderToStaticMarkup(
      <HelpContent targetRole="AI_ASSISTANT" />
    );

    // Verify informal description
    expect(html).toContain('Kenalan dulu yuk sama Pak Teladan!');
    expect(html).toContain('operasional toko biar makin gampang');

    // Verify informal list responsibilities
    expect(html).toContain('Ngasih tau cara pakai menu');
    expect(html).toContain('Ngecek sisa stok barang');
    expect(html).toContain('Nyari kontak supplier');
    expect(html).toContain('Ngerangkum keuangan harian toko');
    expect(html).toContain('minta klarifikasi singkat');
  });

  it('renders informal AI assistant step titles', () => {
    const html = renderToStaticMarkup(
      <HelpContent targetRole="AI_ASSISTANT" />
    );

    // Verify titles of features
    expect(html).toContain('Cek Harga Jual Barang Super Cepat');
    expect(html).toContain('Intip Sisa Stok Barang di Gudang');
    expect(html).toContain('Cari Barang yang Stoknya Mau Habis');
    expect(html).toContain('Pantau Omzet &amp; Cuan Toko');
    expect(html).toContain('Cek Transaksi Pending &amp; Draft');
  });

  it('documents the updated inbound receipt submission and revision flow', () => {
    const html = renderToStaticMarkup(
      <HelpContent targetRole="INVENTORY" searchQuery="Ajukan ke Owner" />
    );

    expect(html).toContain('Ajukan ke Owner');
    expect(html).toContain('Sudah dibuat');
    expect(html).toContain('Perlu Revisi');
    expect(html).toContain('Edit &amp; Ajukan');
  });

  it('documents the Log OUT verification queue and correction-only Stock Log history', () => {
    const html = renderToStaticMarkup(
      <HelpContent targetRole="INVENTORY" searchQuery="Verifikasi Log OUT" />
    );

    expect(html).toContain('Log OUT Belum Diverifikasi');
    expect(html).toContain('Setujui');
    expect(html).toContain('Perlu Koreksi');
    expect(html).toContain('tombol Koreksi');
    expect(html).toContain('Log Stok hanya menampilkan warna dan badge');
  });

  it('documents the individual stock update via the edit product button', () => {
    const html = renderToStaticMarkup(
      <HelpContent targetRole="ADMIN" searchQuery="Mengubah Stok Individual" />
    );

    expect(html).toContain('Mengubah Stok Individual');
    expect(html).toContain('Ubah Stok Saat Ini');
    expect(html).toContain('Simpan Perubahan');
  });

  it('documents product-first mass stock update modes for stock groups', () => {
    const html = renderToStaticMarkup(
      <HelpContent targetRole="INVENTORY" searchQuery="Mengatur Grup Stok" />
    );

    expect(html).toContain('Update Stok');
    expect(html).toContain('Banyak Produk (Bulk)');
    expect(html).toContain('Cari produk');
    expect(html).toContain('Stok Bersama');
    expect(html).toContain('Stok Produk Ini');
    expect(html).toContain('Pilih satu produk saja per grup stok');
  });

  it('documents the bulk product price and HPP mapping safeguard', () => {
    const html = renderToStaticMarkup(
      <HelpContent targetRole="OWNER" searchQuery="Import Massal Produk" />
    );

    expect(html).toContain('Mapping Harga Jual &amp; HPP');
  });

  it('documents the dedicated Update Stok guide for Owner, Admin, and Inventory roles', () => {
    const ownerHtml = renderToStaticMarkup(
      <HelpContent targetRole="OWNER" searchQuery="Update Stok" />
    );
    expect(ownerHtml).toContain('Update Stok');
    expect(ownerHtml).toContain('Satu Produk (Single)');
    expect(ownerHtml).toContain('Banyak Produk (Bulk)');
    expect(ownerHtml).toContain('Update satu produk');
    expect(ownerHtml).toContain('Update Stok Massal');
    expect(ownerHtml).toContain('Atur Aksi &amp; Jumlah');
    expect(ownerHtml).toContain('Thumbnail/foto produk');
    expect(ownerHtml).toContain('foto produk/varian');
    expect(ownerHtml).not.toContain('Buka Update Stok Massal');
    expect(ownerHtml).not.toContain('klik tab &#x27;Transaksi&#x27;');

    const adminHtml = renderToStaticMarkup(
      <HelpContent targetRole="ADMIN" searchQuery="Update Stok" />
    );
    expect(adminHtml).toContain('Update Stok');
    expect(adminHtml).toContain('Satu Produk (Single)');
    expect(adminHtml).toContain('Banyak Produk (Bulk)');
    expect(adminHtml).toContain('Thumbnail/foto produk');
    expect(adminHtml).not.toContain('Buka Update Stok Massal');
    expect(adminHtml).not.toContain('klik tab &#x27;Transaksi&#x27;');

    const invHtml = renderToStaticMarkup(
      <HelpContent targetRole="INVENTORY" searchQuery="Update Stok" />
    );
    expect(invHtml).toContain('Update Stok');
    expect(invHtml).toContain('Satu Produk (Single)');
    expect(invHtml).toContain('Banyak Produk (Bulk)');
    expect(invHtml).toContain('Thumbnail/foto produk');
    expect(invHtml).not.toContain('Buka Update Stok Massal');
    expect(invHtml).not.toContain('klik tab &#x27;Transaksi&#x27;');
  });

  it('shows the custom invoice date guide for Admin users', () => {
    const html = renderToStaticMarkup(
      <HelpContent targetRole="ADMIN" searchQuery="tanggal invoice" />
    );
    const normalizedHtml = html.toLowerCase();

    expect(html).toContain('Mengubah Tanggal Invoice');
    expect(html).toContain('Ubah Tanggal Invoice');
    expect(normalizedHtml).toContain('alasan perubahan');
    expect(normalizedHtml).toContain('cetak ulang invoice final');
  });

  it('documents POS cart quick product and price editing', () => {
    const html = renderToStaticMarkup(
      <HelpContent targetRole="CASHIER" searchQuery="Edit Cepat Produk" />
    );

    expect(html).toContain('Edit Cepat Produk di Keranjang POS');
    expect(html).toContain('Harga Normal, Harga Agen, dan Harga Dinas');
    expect(html).toContain('Hanya berlaku untuk transaksi ini');
    expect(html).toContain('permission edit produk');
  });
});
