"use client";

import React, { useId, useRef, useState } from "react";
import { Link2, X } from "lucide-react";
import { useProducts } from "@/hooks/useProducts";
import { MAX_QUOTATION_AMOUNT, roundQuotationAmount, type QuotationItemInput } from "../helpers/quotation-items";

export type QuotationRowFields = {
  id: string;
  name: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  product: { id: string; name: string; unit: string; price: number } | null;
};

export function isBlankQuotationRow(row: QuotationRowFields) {
  return !row.product && [row.name, row.quantity, row.unit, row.unitPrice].every(value => !value.trim());
}

export function parseQuotationRow(row: QuotationRowFields): QuotationItemInput | null {
  const name = row.name.trim();
  const quantityText = row.quantity.trim();
  const priceText = row.unitPrice.trim();
  const quantity = Number(quantityText);
  const unitPrice = Number(priceText.replace(",", "."));
  if (!name || name.length > 300 || !/^\d+$/.test(quantityText) || quantity < 1 || quantity > 2_147_483_647 ||
    !/^\d+(?:[.,]\d{1,2})?$/.test(priceText) || unitPrice > MAX_QUOTATION_AMOUNT ||
    quantity * unitPrice > MAX_QUOTATION_AMOUNT) return null;
  return { id: row.id, name, quantity, unit: row.product?.unit ?? row.unit.trim(), unitPrice, productId: row.product?.id ?? null };
}

const money = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });

function ProductResults({ onPick }: { onPick: (product: NonNullable<QuotationRowFields["product"]>) => void }) {
  const [search, setSearch] = useState("");
  const { data = [], isLoading, isError, isPlaceholderData } = useProducts(search, undefined, { limit: 6 });
  return (
    <>
      <input className="quotation-field" aria-label="Cari produk" placeholder="Cari nama atau kode produk" value={search}
        autoFocus onChange={event => setSearch(event.target.value)} />
      {isLoading || isPlaceholderData ? <p role="status">Mencari produk…</p> : isError ? <p role="alert">Produk belum bisa dimuat. Coba cari lagi.</p> : (
        data.length > 0 ? <ul className="quotation-product-results">
          {data.map(product => <li key={product.id}>
            <button type="button" onClick={() => onPick({ id: product.id, name: product.name, unit: product.unit, price: Number(product.price) })}>
              <span>{product.name}</span><span>{product.unit} · Rp {money.format(Number(product.price))}</span>
            </button>
          </li>)}
        </ul> : <p role="status">Produk tidak ditemukan.</p>
      )}
    </>
  );
}

export function QuotationItemRow({ row, number, index, canLink, disabled, onChange }: {
  row: QuotationRowFields;
  number: number;
  index: number;
  canLink: boolean;
  disabled: boolean;
  onChange: (patch: Partial<QuotationRowFields>) => void;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const searchId = useId();
  const nameField = useRef<HTMLInputElement>(null);
  const showSearch = searchOpen && Boolean(row.name.trim()) && canLink && !disabled;
  const blank = isBlankQuotationRow(row);
  const parsed = parseQuotationRow(row);
  const subtotal = parsed ? money.format(roundQuotationAmount(parsed.quantity * parsed.unitPrice)) : "";
  const itemLabel = `barang tambahan ${index}`;
  const finishSearch = () => {
    setSearchOpen(false);
    nameField.current?.focus();
  };

  return (
    <>
      <tr className={`quotation-entry${blank ? " print-item-blank-row" : ""}`}>
        <td className="quotation-number">{blank ? "" : number}</td>
        <td>
          <div className="quotation-screen">
            <input ref={nameField} autoFocus className="quotation-field" aria-label={`Nama ${itemLabel}`} placeholder="Nama barang"
              maxLength={300} value={row.name} disabled={disabled} onChange={event => onChange({ name: event.target.value })} />
            {row.name.trim() && canLink && <button className="quotation-link" type="button" aria-expanded={showSearch}
              aria-controls={showSearch ? searchId : undefined} disabled={disabled} onClick={() => setSearchOpen(open => !open)}>
              <Link2 size={13} aria-hidden="true" />{row.product ? "Ganti produk" : "Kaitkan dengan produk"}
            </button>}
            {row.product && <div className="quotation-link-summary">
              <span>{row.product.name}</span>
              <button className="quotation-unlink" type="button" aria-label={`Lepas kaitan ${itemLabel}`} title="Lepas kaitan produk"
                disabled={disabled} onClick={() => onChange({ unit: row.product?.unit ?? row.unit, product: null })}><X size={13} aria-hidden="true" /></button>
            </div>}
          </div>
          <span className="quotation-print">{row.name.trim()}</span>
        </td>
        <td>
          <input className="quotation-field quotation-screen" aria-label={`Jumlah ${itemLabel}`} inputMode="numeric" maxLength={10}
            value={row.quantity} disabled={disabled} onChange={event => onChange({ quantity: event.target.value })} />
          <span className="quotation-print">{row.quantity.trim()}</span>
        </td>
        <td>
          <input className="quotation-field quotation-screen" aria-label={`Satuan ${itemLabel}`} maxLength={40} value={row.product?.unit ?? row.unit}
            disabled={disabled} readOnly={Boolean(row.product)} onChange={event => onChange({ unit: event.target.value })} />
          <span className="quotation-print">{row.product?.unit ?? row.unit.trim()}</span>
        </td>
        <td>
          <input className="quotation-field quotation-screen" aria-label={`Harga satuan ${itemLabel}`} inputMode="decimal" maxLength={13}
            value={row.unitPrice} disabled={disabled} onChange={event => onChange({ unitPrice: event.target.value })} />
          <span className="quotation-print">{parsed ? money.format(parsed.unitPrice) : row.unitPrice.trim()}</span>
        </td>
        <td className="quotation-amount">{subtotal}</td>
      </tr>
      {showSearch && <tr className="quotation-screen quotation-search-row"><td colSpan={6}>
        <section id={searchId} aria-label={`Katalog untuk ${row.name.trim()}`} onKeyDown={event => {
          if (event.key === "Escape") { event.stopPropagation(); finishSearch(); }
        }}>
          <div className="quotation-search-heading">
            <strong>Kaitkan dengan produk</strong>
            <button className="quotation-unlink" type="button" aria-label="Tutup pencarian produk" onClick={finishSearch}><X size={15} aria-hidden="true" /></button>
          </div>
          <ProductResults onPick={product => {
            onChange({ product, unitPrice: row.unitPrice.trim() ? row.unitPrice : String(product.price) });
            finishSearch();
          }} />
        </section>
      </td></tr>}
    </>
  );
}
