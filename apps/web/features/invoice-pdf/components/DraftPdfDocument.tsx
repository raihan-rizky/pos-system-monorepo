/* eslint-disable jsx-a11y/alt-text */
/**
 * @react-pdf/renderer Document component for Draft/Quotation PDF.
 *
 * Produces an A4-portrait "Nota Penawaran" / "Surat Penawaran"
 * matching the company's official letterhead format.
 */

import React from "react";
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";
import type { DraftPdfData } from "../helpers/draft-pdf-data";

/* ── mm → pt helper ─────────────────────────────────────────────── */

function mm(v: number): number {
  return v * 2.835;
}

/* ── Styles ─────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  page: {
    fontFamily: "Times-Roman",
    fontSize: 11,
    color: "#000000",
    paddingTop: mm(12),
    paddingBottom: mm(12),
    paddingHorizontal: mm(16),
    display: "flex",
    flexDirection: "column",
  },

  /* ── Header image ───────────────────────────────────────────── */
  headerImage: {
    width: "100%",
    marginBottom: mm(4),
  },

  /* ── Document info ──────────────────────────────────────────── */
  docInfoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: mm(3),
    fontSize: 11,
  },
  docInfoLeft: {},
  docInfoRight: {
    textAlign: "right",
  },
  bold: {
    fontFamily: "Times-Bold",
  },
  infoLine: {
    marginBottom: mm(1),
  },

  /* ── Greeting ───────────────────────────────────────────────── */
  greeting: {
    fontSize: 11,
    marginBottom: mm(2),
  },

  /* ── Table ──────────────────────────────────────────────────── */
  table: {
    marginBottom: 0,
  },
  tableRow: {
    flexDirection: "row",
  },
  tableHeaderCell: {
    fontFamily: "Times-Bold",
    fontSize: 10,
    textAlign: "center",
    borderWidth: 0.5,
    borderColor: "#000000",
    paddingVertical: mm(1.5),
    paddingHorizontal: mm(2),
  },
  tableCell: {
    fontSize: 10,
    borderWidth: 0.5,
    borderColor: "#000000",
    paddingVertical: mm(1.5),
    paddingHorizontal: mm(2),
  },

  /* Column widths */
  colNo: { width: mm(10) },
  colItem: { flex: 1 },
  colQty: { width: mm(20) },
  colUnit: { width: mm(18) },
  colPrice: { width: mm(28) },
  colTotal: { width: mm(30) },

  /* ── Total row ──────────────────────────────────────────────── */
  totalRow: {
    flexDirection: "row",
  },
  totalLabelCell: {
    flex: 1,
    fontFamily: "Times-Bold",
    fontSize: 11,
    textAlign: "center",
    borderWidth: 0.5,
    borderColor: "#000000",
    paddingVertical: mm(1.5),
    paddingHorizontal: mm(2),
  },
  totalValueCell: {
    width: mm(30),
    fontFamily: "Times-Bold",
    fontSize: 11,
    textAlign: "right",
    borderWidth: 0.5,
    borderColor: "#000000",
    paddingVertical: mm(1.5),
    paddingHorizontal: mm(2),
  },

  /* ── Terbilang ──────────────────────────────────────────────── */
  terbilangBox: {
    marginTop: mm(2),
    padding: mm(2),
    borderWidth: 0.5,
    borderColor: "#000000",
    fontSize: 10,
  },

  /* ── Notes ──────────────────────────────────────────────────── */
  noteText: {
    fontSize: 10,
    marginTop: mm(2),
    fontStyle: "italic",
  },

  /* ── Signature ──────────────────────────────────────────────── */
  signatureContainer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: mm(8),
  },
  signatureBlock: {
    width: mm(60),
    textAlign: "center",
    fontSize: 11,
  },
  stampArea: {
    height: mm(25),
    marginVertical: mm(2),
  },
  signerName: {
    fontFamily: "Times-Bold",
    textDecoration: "underline",
  },
  signerPhone: {
    fontSize: 9,
    color: "#555555",
    marginTop: mm(0.5),
  },
});

/* ── Component ──────────────────────────────────────────────────── */

interface DraftPdfDocumentProps {
  data: DraftPdfData;
  /** Optional: absolute URL to the kop surat header image */
  headerImageSrc?: string;
}

export function DraftPdfDocument({
  data,
  headerImageSrc,
}: DraftPdfDocumentProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* ── Kop Surat Header ─────────────────────────────────── */}
        {headerImageSrc && (
          <Image src={headerImageSrc} style={styles.headerImage} />
        )}

        {/* ── Document Info ────────────────────────────────────── */}
        <View style={styles.docInfoRow}>
          <View style={styles.docInfoLeft}>
            <Text style={styles.infoLine}>
              <Text style={styles.bold}>No.</Text> {data.docNumber}
            </Text>
            <Text>
              <Text style={styles.bold}>Hal</Text> : Penawaran
            </Text>
          </View>
          <View style={styles.docInfoRight}>
            <Text style={[styles.infoLine, styles.bold]}>Kepada Yth :</Text>
            {data.divisiPurchasing && (
              <Text style={styles.bold}>{data.divisiPurchasing}</Text>
            )}
            <Text style={styles.bold}>
              {data.kepadaYth || "Pelanggan Umum"}
            </Text>
          </View>
        </View>

        {/* ── Greeting ─────────────────────────────────────────── */}
        <View style={styles.greeting}>
          <Text style={styles.infoLine}>Dengan Hormat,</Text>
          <Text style={styles.bold}>
            Bersama ini kami menawarkan harga barang - barang sebagai berikut :
          </Text>
        </View>

        {/* ── Items Table ──────────────────────────────────────── */}
        <View style={styles.table}>
          {/* Header */}
          <View style={styles.tableRow}>
            <Text style={[styles.tableHeaderCell, styles.colNo]}>NO</Text>
            <Text style={[styles.tableHeaderCell, styles.colItem]}>ITEM</Text>
            <Text style={[styles.tableHeaderCell, styles.colQty]}>
              QUANTITAS
            </Text>
            <Text style={[styles.tableHeaderCell, styles.colUnit]}>SATUAN</Text>
            <Text style={[styles.tableHeaderCell, styles.colPrice]}>
              HARGA SATUAN
            </Text>
            <Text style={[styles.tableHeaderCell, styles.colTotal]}>
              TOTAL HARGA
            </Text>
          </View>

          {/* Data rows */}
          {data.items.map((item) => (
            <View key={`item-${item.no}`} style={styles.tableRow}>
              <Text
                style={[
                  styles.tableCell,
                  styles.colNo,
                  { textAlign: "center" },
                ]}
              >
                {item.no}
              </Text>
              <Text style={[styles.tableCell, styles.colItem]}>
                {item.productName}
              </Text>
              <Text
                style={[
                  styles.tableCell,
                  styles.colQty,
                  { textAlign: "center" },
                ]}
              >
                {item.quantity}
              </Text>
              <Text
                style={[
                  styles.tableCell,
                  styles.colUnit,
                  { textAlign: "center" },
                ]}
              >
                {item.unit}
              </Text>
              <Text
                style={[
                  styles.tableCell,
                  styles.colPrice,
                  { textAlign: "right" },
                ]}
              >
                {item.unitPriceFormatted}
              </Text>
              <Text
                style={[
                  styles.tableCell,
                  styles.colTotal,
                  { textAlign: "right" },
                ]}
              >
                {item.subtotalFormatted}
              </Text>
            </View>
          ))}
        </View>

        {/* ── Total Row ────────────────────────────────────────── */}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabelCell}>J U M L A H</Text>
          <Text style={styles.totalValueCell}>
            Rp {data.grandTotalFormatted}
          </Text>
        </View>

        {/* ── Terbilang ────────────────────────────────────────── */}
        <View style={styles.terbilangBox}>
          <Text>
            Terbilang :{" "}
            <Text style={styles.bold}>{data.terbilangText}</Text>
          </Text>
        </View>

        {/* ── Notes ────────────────────────────────────────────── */}
        {data.note && (
          <Text style={styles.noteText}>
            <Text style={styles.bold}>Catatan: </Text>
            {data.note}
          </Text>
        )}

        {/* ── Signature ────────────────────────────────────────── */}
        <View style={styles.signatureContainer}>
          <View style={styles.signatureBlock}>
            <Text>
              {data.cityName}, {data.date}
            </Text>
            <Text style={[styles.bold, styles.infoLine]}>
              {data.companyName}
            </Text>
            <View style={styles.stampArea} />
            <Text style={styles.signerName}>{data.signerName}</Text>
            <Text style={styles.signerPhone}>Hp. {data.signerPhone}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
