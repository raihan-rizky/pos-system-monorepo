/**
 * Orchestrator for generating draft/quotation PDFs.
 *
 * 1. Calls buildDraftPdfData() to produce a flat data object
 * 2. Renders <DraftPdfDocument> to a PDF buffer
 * 3. Returns a Uint8Array (works in both Node.js and browser)
 */

import React from "react";
import { pdf } from "@react-pdf/renderer";
import {
  buildDraftPdfData,
  type DraftPdfStoreSettings,
} from "./draft-pdf-data";
import { DraftPdfDocument } from "../components/DraftPdfDocument";
import type { Transaction } from "@/hooks/useTransactions";

/**
 * Generate a draft/quotation PDF as a Uint8Array.
 */
export async function generateDraftPdf(
  transaction: Transaction,
  storeSettings: DraftPdfStoreSettings,
  overrides?: {
    kepadaYth?: string;
    divisiPurchasing?: string;
    headerImageSrc?: string;
  }
): Promise<Uint8Array> {
  const data = buildDraftPdfData(transaction, storeSettings, overrides);

  const doc = React.createElement(DraftPdfDocument, {
    data,
    headerImageSrc: overrides?.headerImageSrc,
  });

  const instance = pdf(doc as any);
  const blob = await instance.toBlob();
  const arrayBuffer = await blob.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

/**
 * Generate a draft/quotation PDF and open it in a new browser tab.
 */
export async function openDraftPdf(
  transaction: Transaction,
  storeSettings: DraftPdfStoreSettings,
  overrides?: {
    kepadaYth?: string;
    divisiPurchasing?: string;
    headerImageSrc?: string;
  }
): Promise<void> {
  const data = buildDraftPdfData(transaction, storeSettings, overrides);
  const doc = React.createElement(DraftPdfDocument, {
    data,
    headerImageSrc: overrides?.headerImageSrc,
  });
  const instance = pdf(doc as any);
  const blob = await instance.toBlob();
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
}
