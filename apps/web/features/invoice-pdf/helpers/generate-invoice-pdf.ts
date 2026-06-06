/**
 * Orchestrator: transforms transaction data → PDF bytes.
 *
 * 1. Calls buildInvoicePdfData() to produce a flat data object
 * 2. Renders <InvoicePdfDocument> to a PDF buffer using @react-pdf/renderer
 * 3. Returns a Uint8Array (works in both Node.js and browser)
 */

import React from "react";
import { pdf } from "@react-pdf/renderer";
import {
  buildInvoicePdfData,
  type StoreSettings,
} from "./invoice-pdf-data";
import {
  InvoicePdfDocument,
  type PaperSize,
} from "../components/InvoicePdfDocument";
import type { Transaction } from "@/hooks/useTransactions";

/**
 * Generate a PDF invoice as a Uint8Array.
 *
 * @param transaction - The transaction data
 * @param storeSettings - Store name, address, phone
 * @param paperSize - Paper dimensions in mm { w, h }
 * @returns Uint8Array of the rendered PDF
 */
export async function generateInvoicePdf(
  transaction: Transaction,
  storeSettings: StoreSettings,
  paperSize: PaperSize
): Promise<Uint8Array> {
  const data = buildInvoicePdfData(transaction, storeSettings);

  const doc = React.createElement(InvoicePdfDocument, {
    data,
    paperSize,
  });

  const instance = pdf(doc as any);
  const blob = await instance.toBlob();

  // Convert Blob → Uint8Array for universal compatibility
  const arrayBuffer = await blob.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

/**
 * Generate a PDF and open it in a new browser tab.
 *
 * @param transaction - The transaction data
 * @param storeSettings - Store name, address, phone
 * @param paperSize - Paper dimensions in mm { w, h }
 */
export async function openInvoicePdf(
  transaction: Transaction,
  storeSettings: StoreSettings,
  paperSize: PaperSize
): Promise<void> {
  const data = buildInvoicePdfData(transaction, storeSettings);
  const doc = React.createElement(InvoicePdfDocument, { data, paperSize });
  const instance = pdf(doc as any);
  const blob = await instance.toBlob();
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
}
