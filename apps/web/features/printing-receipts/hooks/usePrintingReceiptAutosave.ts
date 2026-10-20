"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPrintingReceiptSaveQueue } from "../autosave";
import { readPrintingReceiptResponse } from "../receipt-api";
import type { PrintingReceipt } from "../types";

type SaveQueue = ReturnType<typeof createPrintingReceiptSaveQueue>;
export type ReceiptSaveStatus = "saved" | "pending" | "saving" | "error";

export function usePrintingReceiptAutosave(onSaved: (receipt: PrintingReceipt) => void, isCurrentScope: () => boolean = () => true) {
  const [receipt, setReceipt] = useState<PrintingReceipt | null>(null);
  const [status, setStatus] = useState<ReceiptSaveStatus>("saved");
  const [error, setError] = useState<string | null>(null);
  const queue = useRef<SaveQueue | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSavedRef = useRef(onSaved);
  const isCurrentScopeRef = useRef(isCurrentScope);
  const abortSave = useRef<AbortController | null>(null);
  onSavedRef.current = onSaved;
  isCurrentScopeRef.current = isCurrentScope;

  const flush = useCallback(async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (!isCurrentScopeRef.current()) return null;
    const active = queue.current;
    if (!active) return null;
    if (!active.hasPending()) return active.current();
    setStatus("saving"); setError(null);
    try {
      const saved = await active.flush();
      if (queue.current === active) { setReceipt(saved); setStatus("saved"); }
      if (isCurrentScopeRef.current()) onSavedRef.current(saved);
      return saved;
    } catch (failure) {
      if (queue.current === active) {
        setStatus("error");
        setError(failure instanceof Error ? failure.message : "Nota belum tersimpan. Periksa koneksi lalu coba lagi.");
      }
      throw failure;
    }
  }, []);

  const load = useCallback((next: PrintingReceipt | null) => {
    if (!isCurrentScopeRef.current()) return;
    if (timer.current) clearTimeout(timer.current);
    abortSave.current?.abort();
    queue.current?.dispose();
    const controller = new AbortController();
    abortSave.current = controller;
    queue.current = next ? createPrintingReceiptSaveQueue(next, async record => {
      if (!isCurrentScopeRef.current()) throw new Error("Sesi pengguna sudah berubah. Buka kembali nota yang ingin diisi.");
      const response = await fetch(`/api/printing-receipts/${encodeURIComponent(record.id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ revision: record.revision, number: record.number, document: record.document }),
      });
      return readPrintingReceiptResponse<PrintingReceipt>(response);
    }) : null;
    setReceipt(next); setStatus("saved"); setError(null);
  }, []);

  const update = useCallback((next: PrintingReceipt) => {
    if (!isCurrentScopeRef.current() || !queue.current || next.transactionId) return;
    queue.current.update(next);
    setReceipt(queue.current.current()); setStatus("pending"); setError(null);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void flush().catch(() => {}); }, 650);
  }, [flush]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (queue.current?.hasPending()) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      if (timer.current) clearTimeout(timer.current);
      if (isCurrentScopeRef.current()) void queue.current?.flush().catch(() => {});
      else { queue.current?.dispose(); abortSave.current?.abort(); }
    };
  }, []);

  return { receipt, status, error, update, flush, load };
}
