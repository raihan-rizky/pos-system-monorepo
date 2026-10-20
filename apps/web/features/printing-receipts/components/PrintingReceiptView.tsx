"use client";

import { useMemo, type CSSProperties, type KeyboardEvent } from "react";
import { getPrintingReceiptLayout, getPrintingReceiptWatermark, type PrintingReceiptPayment, type ReceiptSheetField } from "../layout";
import { buildPrintingReceiptPresentation } from "../presentation";
import type { PrintingReceipt } from "../types";
import "./printing-receipts.css";

export interface PrintingReceiptViewProps {
  receipt: PrintingReceipt;
  transaction?: PrintingReceiptPayment | null;
  editable?: boolean;
  onChange?: (receipt: PrintingReceipt) => void;
  zoom?: number;
}

function enterNextField(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== "Enter" || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.target instanceof HTMLTextAreaElement && event.currentTarget.getAttribute("aria-label") === "Keterangan") return;
  const form = event.currentTarget.closest("[data-receipt-page]");
  const inputs = Array.from(form?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea") ?? []);
  const next = inputs[inputs.indexOf(event.currentTarget as HTMLInputElement) + 1];
  if (next) { event.preventDefault(); next.focus(); next.scrollIntoView({ block: "nearest", inline: "nearest" }); }
}

export function PrintingReceiptView({ receipt, transaction, editable = false, onChange, zoom = 1 }: PrintingReceiptViewProps) {
  const layout = getPrintingReceiptLayout(receipt.subcategory);
  const canEdit = editable && !receipt.transactionId && Boolean(onChange);
  const watermark = getPrintingReceiptWatermark(receipt, transaction);
  const presentation = useMemo(() => buildPrintingReceiptPresentation(receipt, transaction), [receipt, transaction]);
  const changeField = (field: ReceiptSheetField, value: string) => {
    if (!canEdit || !onChange) return;
    if (field.receiptField) return onChange({ ...receipt, number: value });
    if (field.documentField) {
      const customerChanged = field.documentField === "customerName";
      return onChange({ ...receipt, document: { ...receipt.document, [field.documentField]: value, ...(customerChanged ? { customerId: null } : {}) } });
    }
    if (field.lineId && field.lineField) {
      const key = field.lineField;
      onChange({ ...receipt, document: { ...receipt.document, lines: receipt.document.lines.map(line => line.id !== field.lineId ? line : {
        ...line, [key]: key === "quantity" || key === "price" ? value === "" ? null : Number(value) : value,
      }) } });
    }
  };

  return <div className="printing-receipt-pages" style={{ "--receipt-zoom": zoom } as CSSProperties}>
    {presentation.pages.map(page => <div className="printing-receipt-page-frame" key={page.pageIndex} style={{ width: `${layout.width * 4 * zoom}px`, height: `${layout.height * 4 * zoom}px` }}>
      <section className="printing-receipt-sheet" data-receipt-page aria-label={`Halaman nota ${page.pageIndex + 1} dari ${page.pageCount}`}
        style={{ width: `${layout.width * 4}px`, height: `${layout.height * 4}px`, transform: `scale(${zoom})` }}>
        {/* The original artwork is decorative; every writable field has its own accessible label. */}
        <img className="printing-receipt-artwork" src={layout.artwork} alt="" aria-hidden="true" draggable={false} />
        {layout.numberMask && <div aria-hidden="true" className="printing-receipt-number-mask" style={{ left: layout.numberMask.x * 4, top: layout.numberMask.y * 4, width: layout.numberMask.width * 4, height: layout.numberMask.height * 4 }} />}
        {page.fields.map(field => {
          const writable = canEdit && Boolean(field.receiptField || field.documentField || field.lineField);
          const style: CSSProperties = { left: field.x * 4, top: field.y * 4, width: field.width * 4, height: field.height * 4,
            fontSize: field.fittedFontSize * 4 / 2.83465, color: field.color, textAlign: field.align ?? "left", ...(field.whiteBackground && field.value ? { backgroundColor: "white" } : {}) };
          const shared = { "aria-label": field.label, title: field.label, style, className: "printing-receipt-field", onKeyDown: enterNextField };
          if (writable && field.multiline) return <textarea {...shared} key={field.key} rows={1} value={field.value} onChange={event => changeField(field, event.target.value)} spellCheck={false} />;
          if (writable) return <input {...shared} key={field.key} type={field.inputType ?? "text"} value={field.value} min={field.inputType === "number" ? 0 : undefined}
            step={field.lineField === "quantity" ? 1 : field.inputType === "number" ? "0.01" : undefined} onChange={event => changeField(field, event.target.value)} autoComplete="off" />;
          return <span {...shared} key={field.key} className="printing-receipt-field printing-receipt-value">{field.displayValue}</span>;
        })}
        {watermark && <span className="printing-receipt-watermark" aria-label={`Status nota: ${watermark}`}>{watermark}</span>}
      </section>
    </div>)}
    {presentation.appendixPages.map((page, index) => <div className="printing-receipt-page-frame" key={`appendix-${index}`} style={{ width: layout.width * 4 * zoom, height: layout.height * 4 * zoom }}>
      <section className="printing-receipt-sheet" aria-label={`Lampiran nota ${index + 1} dari ${presentation.appendixPages.length}`} style={{ width: layout.width * 4, height: layout.height * 4, transform: `scale(${zoom})` }}>
        <h3 className="absolute m-0 whitespace-pre font-bold" style={{ left: 40, top: (12 - presentation.appendixTitleFontSize / 2.83465 * 0.83) * 4, fontSize: presentation.appendixTitleFontSize * 4 / 2.83465, lineHeight: 1.12 }}>{presentation.appendixTitleLines.join("\n")}</h3>
        <p className="absolute m-0" style={{ left: 40, top: (presentation.appendixSubtitleY - 8 / 2.83465 * 0.83) * 4, fontSize: 8 * 4 / 2.83465 }}>Rincian lengkap dan keterangan tambahan</p>
        {page.lines.map((line, lineIndex) => <p key={lineIndex} className="absolute m-0 whitespace-pre" style={{ left: 40, top: (line.y - 2.6) * 4, fontWeight: line.bold ? 700 : 400, fontSize: 9 * 4 / 2.83465, lineHeight: 1.12 }}>{line.text}</p>)}
        <span className="absolute" style={{ right: 40, bottom: 20, fontSize: 8 * 4 / 2.83465 }}>Lampiran {index + 1}/{presentation.appendixPages.length}</span>
        {watermark && <span className="printing-receipt-watermark" aria-label={`Status lampiran nota: ${watermark}`}>{watermark}</span>}
      </section>
    </div>)}
  </div>;
}
