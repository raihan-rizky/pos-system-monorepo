"use client";

import { useLayoutEffect, useMemo, useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { getPrintingReceiptLayout, getPrintingReceiptWatermark, RECEIPT_TEXT_LINE_HEIGHT, RECEIPT_TEXT_PADDING_X, RECEIPT_TEXT_PADDING_Y, type PrintingReceiptPayment, type ReceiptSheetField } from "../layout";
import { buildPrintingReceiptPresentation } from "../presentation";
import type { PrintingReceipt } from "../types";
import { isPrintingReceiptLineBlank } from "../domain";
import { getReceiptColumnConstraints, getReceiptColumnWidths, resizeReceiptColumnBoundary, roundReceiptColumn } from "../column-layout";
import "./printing-receipts.css";

export interface PrintingReceiptViewProps {
  receipt: PrintingReceipt;
  transaction?: PrintingReceiptPayment | null;
  editable?: boolean;
  /** Enabled only inside the confirmed processed-receipt correction dialog. */
  allowProcessedEdit?: boolean;
  onChange?: (receipt: PrintingReceipt) => void;
  zoom?: number;
}

interface ColumnGesture {
  receiptId: string; subcategory: PrintingReceipt["subcategory"]; revision: number;
  pointerId: number; target: HTMLDivElement; boundary: number;
  originX: number; pixelsPerMm: number; widths: number[]; pendingX: number | null; frame: number | null;
}

function enterNextField(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== "Enter" || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.target instanceof HTMLTextAreaElement && event.currentTarget.getAttribute("aria-label") === "Keterangan") return;
  const form = event.currentTarget.closest("[data-receipt-page]");
  const inputs = Array.from(form?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea") ?? []);
  const next = inputs[inputs.indexOf(event.currentTarget as HTMLInputElement) + 1];
  if (next) { event.preventDefault(); next.focus(); next.scrollIntoView({ block: "nearest", inline: "nearest" }); }
}

export function PrintingReceiptView({ receipt, transaction, editable = false, allowProcessedEdit = false, onChange, zoom = 1 }: PrintingReceiptViewProps) {
  const layout = getPrintingReceiptLayout(receipt.subcategory, receipt.document.columnWidths);
  const canEdit = editable && (!receipt.transactionId || allowProcessedEdit) && Boolean(onChange);
  const watermark = getPrintingReceiptWatermark(receipt, transaction);
  const presentation = useMemo(() => buildPrintingReceiptPresentation(receipt, transaction), [receipt, transaction]);
  const visibleLineIds = new Set(presentation.pages.flatMap(page => page.lines.map(row => row.line.id)));
  const nextLineIndex = canEdit ? receipt.document.lines.findIndex(line => !visibleLineIds.has(line.id) && isPrintingReceiptLineBlank(line)) : -1;
  const nextLine = receipt.document.lines[nextLineIndex];
  const rootRef = useRef<HTMLDivElement>(null);
  const latest = useRef({ receipt, canEdit, onChange });
  latest.current = { receipt, canEdit, onChange };
  const gesture = useRef<ColumnGesture | null>(null);
  const pendingSelection = useRef<{ receiptId: string; key: string; start: number | null; end: number | null; direction: "forward" | "backward" | "none" | null; reveal?: boolean } | null>(null);
  const cancelGesture = () => {
    const active = gesture.current;
    gesture.current = null;
    if (!active) return;
    if (active.frame !== null) cancelAnimationFrame(active.frame);
    if (active.target.hasPointerCapture(active.pointerId)) active.target.releasePointerCapture(active.pointerId);
  };
  useLayoutEffect(() => {
    pendingSelection.current = null;
    return cancelGesture;
  }, [receipt.id, receipt.subcategory, receipt.revision, canEdit]);
  const setColumnWidths = (widths?: number[], active?: ColumnGesture) => {
    const current = latest.current;
    if (!current.canEdit || !current.onChange || active && (current.receipt.id !== active.receiptId || current.receipt.subcategory !== active.subcategory || current.receipt.revision !== active.revision)) return;
    pendingSelection.current = null;
    const nextDocument = { ...current.receipt.document };
    if (widths) nextDocument.columnWidths = widths;
    else delete nextDocument.columnWidths;
    const next = { ...current.receipt, document: nextDocument };
    latest.current = { ...current, receipt: next };
    current.onChange(next);
  };
  const flushGesture = (active: ColumnGesture) => {
    if (active.frame !== null) cancelAnimationFrame(active.frame);
    active.frame = null;
    if (active.pendingX === null) return;
    const delta = (active.pendingX - active.originX) / active.pixelsPerMm;
    active.pendingX = null;
    const widths = resizeReceiptColumnBoundary(active.subcategory, active.widths, active.boundary, delta);
    if (widths.every((width, index) => width === latest.current.receipt.document.columnWidths?.[index])) return;
    setColumnWidths(widths, active);
  };
  const startResize = (event: PointerEvent<HTMLDivElement>, boundary: number) => {
    if (!canEdit || event.button !== 0 || event.isPrimary === false) return;
    const sheet = event.currentTarget.closest<HTMLElement>("[data-receipt-page]");
    if (!sheet) return;
    event.preventDefault();
    cancelGesture();
    pendingSelection.current = null;
    event.currentTarget.focus({ preventScroll: true });
    gesture.current = { receiptId: receipt.id, subcategory: receipt.subcategory, revision: receipt.revision, boundary,
      pointerId: event.pointerId, target: event.currentTarget, originX: event.clientX,
      pixelsPerMm: sheet.getBoundingClientRect().width / layout.width,
      widths: getReceiptColumnWidths(receipt.subcategory, receipt.document.columnWidths), pendingX: null, frame: null };
    if (event.nativeEvent.isTrusted) event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveResize = (event: PointerEvent<HTMLDivElement>) => {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    active.pendingX = event.clientX;
    if (active.frame === null) active.frame = requestAnimationFrame(() => {
      if (gesture.current === active) flushGesture(active);
    });
  };
  const endResize = (event: PointerEvent<HTMLDivElement>, finalPosition: boolean) => {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    if (finalPosition) active.pendingX = event.clientX;
    flushGesture(active);
    cancelGesture();
  };
  const keyboardResize = (event: KeyboardEvent<HTMLDivElement>, boundary: number) => {
    if (!canEdit || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    cancelGesture();
    const delta = event.key === "Home" ? -1000 : event.key === "End" ? 1000 : (event.key === "ArrowLeft" ? -1 : 1) * (event.shiftKey ? 5 : 1);
    const current = latest.current.receipt;
    setColumnWidths(resizeReceiptColumnBoundary(current.subcategory, current.document.columnWidths, boundary, delta));
  };
  useLayoutEffect(() => {
    const pending = pendingSelection.current;
    pendingSelection.current = null;
    if (!pending || pending.receiptId !== receipt.id || !canEdit) return;
    const target = Array.from(rootRef.current?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input[data-receipt-field], textarea[data-receipt-field]") ?? [])
      .find(element => element.dataset.receiptField === pending.key);
    if (!target) return;
    target.focus({ preventScroll: true });
    if (pending.start !== null && pending.end !== null) target.setSelectionRange(pending.start, pending.end, pending.direction ?? undefined);
    if (pending.reveal) target.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [presentation, receipt.id, canEdit]);
  const changeField = (field: ReceiptSheetField, value: string, target: HTMLInputElement | HTMLTextAreaElement) => {
    if (!canEdit || !onChange) return;
    if (target === document.activeElement) pendingSelection.current = {
      receiptId: receipt.id, key: field.key, start: target.selectionStart, end: target.selectionEnd, direction: target.selectionDirection,
      reveal: Boolean(target.closest("[data-receipt-next-line]")),
    };
    if (field.receiptField) return onChange({ ...receipt, number: value });
    if (field.documentField) {
      const customerChanged = field.documentField === "customerName" && !receipt.transactionId;
      return onChange({ ...receipt, document: { ...receipt.document, [field.documentField]: value, ...(customerChanged ? { customerId: null } : {}) } });
    }
    if (field.lineId && field.lineField) {
      const key = field.lineField;
      onChange({ ...receipt, document: { ...receipt.document, lines: receipt.document.lines.map(line => line.id !== field.lineId ? line : {
        ...line, [key]: key === "quantity" || key === "price" ? value === "" ? null : Number(value) : value,
      }) } });
    }
  };

  return <div ref={rootRef} className="printing-receipt-pages" style={{ "--receipt-zoom": zoom } as CSSProperties}>
    {canEdit && <div className="printing-receipt-column-controls" style={{ maxWidth: `min(${layout.width * 4 * zoom}px, calc(100vw - 48px))` }}>
      <p>Geser pembatas di judul kolom untuk mengatur lebar. Teks membungkus otomatis dan lebar tersimpan per nota.{receipt.subcategory !== "SPANDUK" && " Bahan mengikuti lebar Nama Barang."}</p>
      <button type="button" onClick={() => { cancelGesture(); setColumnWidths(); }}>Reset lebar kolom</button>
    </div>}
    {presentation.pages.map(page => <div className="printing-receipt-page-frame" key={page.pageIndex} style={{ width: `${layout.width * 4 * zoom}px`, height: `${layout.height * 4 * zoom}px` }}>
      <section className="printing-receipt-sheet" data-receipt-page aria-label={`Halaman nota ${page.pageIndex + 1} dari ${page.pageCount}`}
        style={{ width: `${layout.width * 4}px`, height: `${layout.height * 4}px`, transform: `scale(${zoom})` }}>
        {/* The original artwork is decorative; every writable field has its own accessible label. */}
        <img className="printing-receipt-artwork" src={layout.artwork} alt="" aria-hidden="true" draggable={false} />
        {layout.numberMask && <div aria-hidden="true" className="printing-receipt-number-mask" style={{ left: layout.numberMask.x * 4, top: layout.numberMask.y * 4, width: layout.numberMask.width * 4, height: layout.numberMask.height * 4 }} />}
        <svg data-receipt-table aria-hidden="true" focusable="false" className="printing-receipt-table"
          viewBox={`${page.table.x - .25} ${page.table.y - .25} ${page.table.width + .5} ${page.table.height + .5}`}
          style={{ left: (page.table.x - .25) * 4, top: (page.table.y - .25) * 4, width: (page.table.width + .5) * 4, height: (page.table.height + .5) * 4 }}>
          <rect x={page.table.x - .25} y={page.table.y - .25} width={page.table.width + .5} height={page.table.height + .5} fill="white" />
          {page.table.striped && page.table.rows.map((row, index) => index % 2 === 1 && <rect key={`stripe-${index}`} x={page.table.x} y={row.y} width={page.table.width} height={row.height} fill="#efefef" />)}
          <g stroke="#373396" strokeWidth={page.table.lineWidth}>
            {page.table.columnXs.map(x => <line key={`column-${x}`} x1={x} x2={x} y1={page.table.y} y2={page.table.y + page.table.height} />)}
            {[page.table.y, ...page.table.rows.map(row => row.y + row.height)].map((y, index) => <line key={`row-${index}`} x1={page.table.x} x2={page.table.x + page.table.width} y1={y} y2={y} />)}
          </g>
        </svg>
        {page.header.redraw && <svg data-receipt-header aria-hidden="true" focusable="false" className="printing-receipt-header"
          viewBox={`${page.header.x - .25} ${page.header.y - .25} ${page.header.width + .5} ${page.header.height + .5}`}
          style={{ left: (page.header.x - .25) * 4, top: (page.header.y - .25) * 4, width: (page.header.width + .5) * 4, height: (page.header.height + .5) * 4 }}>
          <rect x={page.header.x - .25} y={page.header.y - .25} width={page.header.width + .5} height={page.header.height + .25} fill="white" />
          <rect x={page.header.x} y={page.header.y} width={page.header.width} height={page.header.height} fill={page.header.fill} />
          {page.header.rules.map((rule, index) => <line key={index} {...rule} stroke={receipt.subcategory === "SPANDUK" && rule.x1 === rule.x2 && index > 0 && index < page.header.columnXs.length - 1 ? "white" : "#373396"} strokeWidth={page.header.lineWidth} />)}
          {page.header.labels.map((label, index) => {
            const fontSize = label.fontSize ?? 9;
            const y = label.y + (label.height - label.textLines.length * fontSize / 2.83465 * RECEIPT_TEXT_LINE_HEIGHT) / 2 + fontSize / 2.83465 * .83;
            return <text key={index} x={label.x + label.width / 2} y={y} textAnchor="middle" fill={page.header.color} fontSize={fontSize / 2.83465} fontWeight={label.bold ? 700 : 400}>
              {label.textLines.map((line, lineIndex) => <tspan key={lineIndex} x={label.x + label.width / 2} dy={lineIndex ? fontSize / 2.83465 * RECEIPT_TEXT_LINE_HEIGHT : 0}>{line}</tspan>)}
            </text>;
          })}
        </svg>}
        {canEdit && page.header.columnXs.slice(1, -1).map((x, boundary) => {
          const { minimums, names } = getReceiptColumnConstraints(receipt.subcategory);
          const widths = getReceiptColumnWidths(receipt.subcategory, receipt.document.columnWidths);
          const lowerHeading = receipt.subcategory !== "SPANDUK" && boundary === 2;
          return <div key={boundary} role="separator" tabIndex={0} aria-orientation="vertical"
            aria-label={`Atur lebar kolom ${names[boundary]} dan ${names[boundary + 1]}`}
            aria-valuemin={minimums[boundary]} aria-valuemax={roundReceiptColumn(widths[boundary] + widths[boundary + 1] - minimums[boundary + 1])}
            aria-valuenow={widths[boundary]} aria-valuetext={`${widths[boundary]} milimeter`}
            title="Geser untuk mengatur lebar; tombol panah 1 mm, Shift 5 mm."
            className="printing-receipt-column-handle" style={{ left: x * 4, top: (page.header.y + (lowerHeading ? page.header.height / 2 : 0)) * 4, width: 24 / zoom, minHeight: 28 / zoom, height: page.header.height * (lowerHeading ? 2 : 4) }}
            onPointerDown={event => startResize(event, boundary)} onPointerMove={moveResize} onPointerUp={event => endResize(event, true)}
            onPointerCancel={event => endResize(event, false)} onLostPointerCapture={event => endResize(event, false)} onKeyDown={event => keyboardResize(event, boundary)} />;
        })}
        {page.fields.map(field => {
          const writable = canEdit && !field.continuation && Boolean((field.receiptField && !receipt.transactionId) || field.documentField || field.lineField);
          const style: CSSProperties = { left: field.x * 4, top: field.y * 4, width: field.width * 4, height: field.height * 4,
            lineHeight: RECEIPT_TEXT_LINE_HEIGHT, ...(field.topAligned ? { padding: `${RECEIPT_TEXT_PADDING_Y * 4}px ${RECEIPT_TEXT_PADDING_X * 4}px` } : {}),
            fontSize: field.fittedFontSize * 4 / 2.83465, fontWeight: field.bold ? 700 : undefined, color: field.color, textAlign: field.align ?? "left", ...(field.whiteBackground && field.value ? { backgroundColor: "white" } : {}) };
          const shared = { "aria-label": field.label, "data-receipt-field": field.key, "data-top-aligned": field.topAligned || undefined, title: field.label, style, className: "printing-receipt-field", onKeyDown: enterNextField };
          if (writable && field.multiline) return <textarea {...shared} key={field.key} rows={1} value={field.value} onChange={event => changeField(field, event.target.value, event.currentTarget)} spellCheck={false} />;
          if (writable) return <input {...shared} key={field.key} type={field.inputType ?? "text"} value={field.value} min={field.inputType === "number" ? 0 : undefined}
            step={field.lineField === "quantity" ? 1 : field.inputType === "number" ? "0.01" : undefined} onChange={event => changeField(field, event.target.value, event.currentTarget)} autoComplete="off" />;
          return <span {...shared} key={field.key} className="printing-receipt-field printing-receipt-value">{field.displayValue}</span>;
        })}
        {watermark && <span className="printing-receipt-watermark" aria-label={`Status nota: ${watermark}`}>{watermark}</span>}
      </section>
    </div>)}
    {canEdit && nextLine && <fieldset data-receipt-next-line="true" className="printing-receipt-next-line">
      <legend>Item berikutnya</legend>
      <p>Isi nama atau bahan untuk melanjutkan ke halaman nota berikutnya.</p>
      <div>
        {(["name", "material"] as const).map(key => {
          const label = `${key === "name" ? "Nama item" : "Bahan"} baris ${nextLineIndex + 1}`;
          const field: ReceiptSheetField = { x: 0, y: 0, width: 0, height: 0, key: `${nextLine.id}-${key}`, label, value: nextLine[key], lineId: nextLine.id, lineField: key };
          return <label key={field.key}>{key === "name" ? "Nama item" : "Bahan"}
            <textarea aria-label={label} data-receipt-field={field.key} rows={2} value={field.value} spellCheck={false}
              onChange={event => changeField(field, event.target.value, event.currentTarget)} />
          </label>;
        })}
      </div>
    </fieldset>}
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
