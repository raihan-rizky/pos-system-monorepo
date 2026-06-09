/**
 * @react-pdf/renderer Document component for invoice PDF.
 *
 * Layout is a 1:1 replica of the HTML receipt in ReceiptModal.tsx.
 * Every measurement is taken from the original Tailwind classes.
 */

import React from "react";
import {
  Document,
  Image,
  Page,
  View,
  Text,
  StyleSheet,
} from "@react-pdf/renderer";
import type { InvoicePdfData } from "../helpers/invoice-pdf-data";

/* ── Paper size type ────────────────────────────────────────────── */

export interface PaperSize {
  /** Width in mm */
  w: number;
  /** Height in mm */
  h: number;
}

/* ── mm → pt (1mm = 2.835pt) ────────────────────────────────────── */

function mm(v: number): number {
  return v * 2.835;
}

/* ── pt shorthand for pixel-like values (1px ≈ 0.75pt) ──────────── */

function px(v: number): number {
  return v * 0.75;
}

/* ══════════════════════════════════════════════════════════════════
   Styles — mirrors ReceiptModal.tsx Tailwind classes
   ══════════════════════════════════════════════════════════════════ */

const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: px(12), // text-[12px] base
    color: "#000000",
    padding: mm(4),   // p-4 (~16px → ~4mm)
    display: "flex",
    flexDirection: "column",
  },

  /* ── Status Banner ──────────────────────────────────────────── */
  banner: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: mm(2),
    marginTop: mm(-4),  // -mt-4
    marginHorizontal: mm(-4), // -mx-4
    paddingHorizontal: mm(4), // px-4
    paddingVertical: px(6),   // py-1.5
  },
  bannerLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: px(11),
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  bannerSubtitle: {
    fontSize: px(11),
    fontFamily: "Helvetica",
  },

  /* ── Header ─────────────────────────────────────────────────── */
  headerWrap: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: mm(2),
  },
  headerLogo: {
    width: px(80),
    height: px(80),
    marginRight: px(12),
  },
  headerRight: {
    flex: 1,
    flexDirection: "column",
  },
  headerTitle: {
    fontSize: px(22),
    fontFamily: "Helvetica-Bold",
    color: "#000000",
    marginBottom: px(4),
  },
  storeNameText: {
    fontSize: px(14),
    fontFamily: "Helvetica-Bold",
    color: "#003366",
    marginBottom: px(2),
  },
  storeInfo: {
    fontSize: px(11),
    color: "#000000",
    marginBottom: px(1),
  },

  /* ── Separator ──────────────────────────────────────────────── */
  separator: {
    borderBottomWidth: 2.5,
    borderBottomColor: "#cc0000",
    borderBottomStyle: "solid",
    marginBottom: mm(3),
  },
  separatorVoided: {
    borderBottomWidth: 2.5,
    borderBottomColor: "#94a3b8",
    borderBottomStyle: "dashed",
    marginBottom: mm(3),
  },
  separatorRefunded: {
    borderBottomWidth: 2.5,
    borderBottomColor: "#dc2626",
    borderBottomStyle: "dashed",
    marginBottom: mm(3),
  },

  /* ── Info Grid ──────────────────────────────────────────────── */
  infoGrid: {
    flexDirection: "row",
    marginBottom: mm(3),
    fontSize: px(12),
  },
  infoCol: {
    flex: 1,
  },
  infoRow: {
    flexDirection: "row",
    marginBottom: px(8), // space-y-2
  },
  infoLabelLeft: {
    width: px(128), // w-32 = 8rem = 128px
  },
  infoLabelRight: {
    width: px(96),  // w-24 = 6rem = 96px
  },
  infoColon: {
    width: px(16),
    marginRight: px(16), // mr-4
  },
  infoBold: {
    fontFamily: "Helvetica-Bold",
  },
  infoInvoice: {
    fontFamily: "Helvetica-Bold",
    color: "#cc0000",
  },

  /* ── Table ──────────────────────────────────────────────────── */
  table: {
    marginBottom: mm(2),
    flexGrow: 0,
  },
  tableRow: {
    flexDirection: "row",
  },
  // Normal cell (11px, py-2 px-3)
  th: {
    fontFamily: "Helvetica-Bold",
    fontSize: px(11),
    textAlign: "center",
    borderWidth: 0.5,
    borderColor: "#000000",
    paddingVertical: px(8), // py-2
    paddingHorizontal: px(12), // px-3
  },
  td: {
    fontSize: px(11),
    borderWidth: 0.5,
    borderColor: "#000000",
    paddingVertical: px(8),
    paddingHorizontal: px(12),
  },
  // Compact cell (9px, py-1 px-2) — for >5 items
  thCompact: {
    fontFamily: "Helvetica-Bold",
    fontSize: px(9),
    textAlign: "center",
    borderWidth: 0.5,
    borderColor: "#000000",
    paddingVertical: px(4), // py-1
    paddingHorizontal: px(8), // px-2
  },
  tdCompact: {
    fontSize: px(9),
    borderWidth: 0.5,
    borderColor: "#000000",
    paddingVertical: px(4),
    paddingHorizontal: px(8),
  },

  /* Column widths — matching Tailwind w-* classes */
  colNo: { width: px(40) },  // w-10
  colName: { flex: 1 },        // implicit flex
  colSize: { width: px(80) },  // w-20
  colQty: { width: px(64) },  // w-16
  colPrice: { width: px(112) }, // w-28
  colTotal: { width: px(128) }, // w-32

  /* ── Cancelled overrides ────────────────────────────────────── */
  lineThrough: {
    textDecoration: "line-through",
    opacity: 0.5,
  },
  tableCancelled: {
    textDecoration: "line-through",
    opacity: 0.6,
  },

  /* ── Notes ──────────────────────────────────────────────────── */
  noteWrap: {
    flex: 1,
    fontSize: px(12),
  },
  noteBold: {
    fontFamily: "Helvetica-Bold",
  },

  /* ── Totals ─────────────────────────────────────────────────── */
  totalsWrap: {
    alignItems: "flex-end",
    marginTop: "auto",
    marginBottom: mm(4),
    fontSize: px(12),
  },
  totalRow: {
    flexDirection: "row",
    width: px(350), // w-[350px]
  },
  totalLabel: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    fontFamily: "Helvetica-Bold",
    paddingRight: px(16), // pr-4
    paddingVertical: px(8), // py-2
  },
  totalValueBox: {
    width: px(180), // w-[180px]
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    paddingVertical: px(8),
    paddingHorizontal: px(16),
    borderWidth: 0.5,
    borderColor: "#000000",
  },
  grandTotalBox: {
    width: px(180),
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    paddingVertical: px(8),
    paddingHorizontal: px(16),
    borderWidth: 0.5,
    borderColor: "#000000",
    backgroundColor: "#e5e7eb", // bg-[#e5e7eb]
  },
  paymentBox: {
    width: px(180),
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    paddingVertical: px(8),
    paddingHorizontal: px(16),
    borderLeftWidth: 0.5,
    borderRightWidth: 0.5,
    borderBottomWidth: 0.5,
    borderColor: "#000000",
  },
});

/* ── Banner config ──────────────────────────────────────────────── */

const BANNER_MAP: Record<string, {
  label: string;
  subtitle: string;
  bg: string;
  color: string;
  borderColor: string;
}> = {
  DRAFT: {
    label: "FAKTUR SEMENTARA",
    subtitle: "Bukan bukti pembayaran",
    bg: "#fef3c7",
    color: "#78350f",
    borderColor: "#fcd34d",
  },
  PENDING_APPROVAL: {
    label: "MENUNGGU PERSETUJUAN",
    subtitle: "Bukan bukti pembayaran",
    bg: "#dbeafe",
    color: "#1e3a5f",
    borderColor: "#93c5fd",
  },
  VOIDED: {
    label: "DIBATALKAN",
    subtitle: "Invoice ini tidak sah",
    bg: "#f1f5f9",
    color: "#475569",
    borderColor: "#cbd5e1",
  },
  REFUNDED: {
    label: "DIREFUND",
    subtitle: "Dana telah dikembalikan",
    bg: "#fee2e2",
    color: "#991b1b",
    borderColor: "#fca5a5",
  },
};

/* ══════════════════════════════════════════════════════════════════
   Component
   ══════════════════════════════════════════════════════════════════ */

interface InvoicePdfDocumentProps {
  data: InvoicePdfData;
  paperSize: PaperSize;
}

export function InvoicePdfDocument({
  data,
  paperSize,
}: InvoicePdfDocumentProps) {
  const isVoided = data.totals.cancelLabel === "DIBATALKAN";
  const isRefunded = data.totals.cancelLabel === "DIREFUND";
  const isCompact = data.items.length > 5;

  // Determine which banner to show (if any)
  const bannerKey = isVoided
    ? "VOIDED"
    : isRefunded
      ? "REFUNDED"
      : data.status.label === "BELUM LUNAS"
        ? "DRAFT"
        : data.status.label === "MENUNGGU PERSETUJUAN"
          ? "PENDING_APPROVAL"
          : null;
  const banner = bannerKey ? BANNER_MAP[bannerKey] : null;

  // Separator style
  const sepStyle = isVoided
    ? s.separatorVoided
    : isRefunded
      ? s.separatorRefunded
      : s.separator;

  // Cell styles
  const thStyle = isCompact ? s.thCompact : s.th;
  const tdStyle = isCompact ? s.tdCompact : s.td;

  return (
    <Document>
      <Page
        size={{ width: mm(paperSize.w), height: mm(paperSize.h) }}
        style={s.page}
      >
        {/* ── Status Banner ───────────────────────────────────── */}
        {banner && (
          <View
            style={[
              s.banner,
              {
                backgroundColor: banner.bg,
                borderBottomWidth: 2,
                borderBottomColor: banner.borderColor,
                borderBottomStyle: "solid",
              },
            ]}
          >
            <Text style={[s.bannerLabel, { color: banner.color }]}>
              {banner.label}
            </Text>
            <Text style={[s.bannerSubtitle, { color: banner.color }]}>
              {banner.subtitle}
            </Text>
          </View>
        )}

        {/* ── Header (logo + FAKTUR PENJUALAN + store info) ──── */}
        <View style={s.headerWrap}>
          <Image style={s.headerLogo} src="/images/logo_teladan.png" />
          <View style={s.headerRight}>
            <Text style={s.headerTitle}>FAKTUR PENJUALAN</Text>
            <Text style={s.storeNameText}>{data.storeName}</Text>
            <Text style={s.storeInfo}>{data.storeAddress}</Text>
            <Text style={s.storeInfo}>Telp: {data.storePhone}</Text>
          </View>
        </View>

        {/* ── Red separator ───────────────────────────────────── */}
        <View style={sepStyle} />

        {/* ── Info grid (2 columns) ───────────────────────────── */}
        <View style={s.infoGrid}>
          {/* Left column */}
          <View style={s.infoCol}>
            <View style={s.infoRow}>
              <Text style={s.infoLabelLeft}>ID Transaksi</Text>
              <Text style={s.infoColon}>:</Text>
              <Text style={s.infoInvoice}>{data.invoiceNumber}</Text>
            </View>
            <View style={s.infoRow}>
              <Text style={s.infoLabelLeft}>Pelanggan</Text>
              <Text style={s.infoColon}>:</Text>
              <Text style={s.infoBold}>{data.customerName}</Text>
            </View>
            <View style={s.infoRow}>
              <Text style={s.infoLabelLeft}>Sales</Text>
              <Text style={s.infoColon}>:</Text>
              <Text style={s.infoBold}>{data.salesName}</Text>
            </View>
          </View>

          {/* Right column */}
          <View style={s.infoCol}>
            <View style={s.infoRow}>
              <Text style={s.infoLabelRight}>Tanggal</Text>
              <Text style={s.infoColon}>:</Text>
              <Text>{data.date}</Text>
            </View>
            <View style={s.infoRow}>
              <Text style={s.infoLabelRight}>Pembayaran</Text>
              <Text style={s.infoColon}>:</Text>
              <Text>{data.paymentMethod}</Text>
            </View>
            <View style={s.infoRow}>
              <Text style={s.infoLabelRight}>Status</Text>
              <Text style={s.infoColon}>:</Text>
              <Text style={[s.infoBold, { color: data.status.color }]}>
                {data.status.label}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Items table ─────────────────────────────────────── */}
        <View
          style={[s.table, data.isCancelled ? s.tableCancelled : {}]}
        >
          {/* Header row */}
          <View style={s.tableRow}>
            <Text style={[thStyle, s.colNo]}>No</Text>
            <Text style={[thStyle, s.colName]}>Nama Barang</Text>
            {data.hasSize && (
              <Text style={[thStyle, s.colSize]}>Ukuran</Text>
            )}
            <Text style={[thStyle, s.colQty]}>Qty</Text>
            <Text style={[thStyle, s.colPrice]}>Harga Satuan</Text>
            <Text style={[thStyle, s.colTotal]}>Total</Text>
          </View>

          {/* Data rows */}
          {data.items.map((item) => (
            <View key={`row-${item.no}`} style={s.tableRow}>
              <Text style={[tdStyle, s.colNo, { textAlign: "center" }]}>
                {item.no}
              </Text>
              <Text style={[tdStyle, s.colName]}>{item.productName}</Text>
              {data.hasSize && (
                <Text style={[tdStyle, s.colSize, { textAlign: "center" }]}>
                  {item.size}
                </Text>
              )}
              <Text style={[tdStyle, s.colQty, { textAlign: "center" }]}>
                {item.quantity}
              </Text>
              <Text style={[tdStyle, s.colPrice, { textAlign: "right" }]}>
                {item.unitPriceFormatted}
              </Text>
              <Text style={[tdStyle, s.colTotal, { textAlign: "right" }]}>
                {item.subtotalFormatted}
              </Text>
            </View>
          ))}

          {/* Empty filler rows */}
          {Array.from({ length: data.emptyRowCount }).map((_, i) => (
            <View key={`empty-${i}`} style={s.tableRow}>
              <Text style={[tdStyle, s.colNo]}> </Text>
              <Text style={[tdStyle, s.colName]}> </Text>
              {data.hasSize && (
                <Text style={[tdStyle, s.colSize]}> </Text>
              )}
              <Text style={[tdStyle, s.colQty]}> </Text>
              <Text style={[tdStyle, s.colPrice]}> </Text>
              <Text style={[tdStyle, s.colTotal]}> </Text>
            </View>
          ))}
        </View>

        {/* ── Notes area (flex-1 pushes totals down) ──────────── */}
        <View style={s.noteWrap}>
          {data.isCancelled && (
            <Text>
              <Text style={s.noteBold}>
                {isVoided ? "Dibatalkan" : "Direfund"}:{" "}
              </Text>
              <Text>Invoice ini tidak sah sebagai bukti pembayaran.</Text>
            </Text>
          )}
          {!data.isCancelled && data.note && (
            <Text>
              <Text style={s.noteBold}>Catatan: </Text>
              <Text>{data.note}</Text>
            </Text>
          )}
        </View>

        {/* ── Totals (mt-auto, right-aligned) ─────────────────── */}
        <View style={s.totalsWrap}>
          {/* GRAND TOTAL */}
          <View style={s.totalRow}>
            <View style={[
              s.totalLabel,
              data.isCancelled ? s.lineThrough : {},
            ]}>
              <Text>GRAND TOTAL</Text>
            </View>
            <Text style={[
              s.grandTotalBox,
              data.isCancelled ? s.lineThrough : {},
            ]}>
              Rp {data.totals.grandTotalFormatted}
            </Text>
          </View>

          {/* Payment & Balance rows (only when not cancelled) */}
          {!data.isCancelled && (
            <>
              <View style={s.totalRow}>
                <View style={s.totalLabel}>
                  <Text>{data.totals.paymentLabel}</Text>
                </View>
                <Text style={s.paymentBox}>
                  Rp {data.totals.amountPaidFormatted}
                </Text>
              </View>
              <View style={s.totalRow}>
                <View style={s.totalLabel}>
                  <Text>{data.totals.balanceLabel}</Text>
                </View>
                <Text style={[
                  s.paymentBox,
                  data.isDP ? { color: "#b45309" } : {},
                ]}>
                  Rp{" "}
                  {data.isDP
                    ? data.totals.remainingFormatted
                    : data.totals.changeFormatted}
                </Text>
              </View>
            </>
          )}

          {/* Cancelled row */}
          {data.isCancelled && (
            <View style={s.totalRow}>
              <View style={s.totalLabel}>
                <Text>{data.totals.cancelLabel}</Text>
              </View>
              <Text style={[
                s.paymentBox,
                { color: isVoided ? "#64748b" : "#dc2626" },
              ]}>
                Rp 0
              </Text>
            </View>
          )}
        </View>
      </Page>
    </Document>
  );
}
