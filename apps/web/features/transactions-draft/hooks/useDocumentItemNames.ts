"use client";

import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { QueryClientContext } from "@tanstack/react-query";
import { useRole } from "@/components/providers/RoleProvider";
import type { Transaction } from "@/hooks/useTransactions";

type DocumentItem = { id: string; productName: string; documentName: string | null };
type DocumentNames = { items: DocumentItem[] };

export function useDocumentItemNames(transaction: Transaction, open: boolean) {
  const queryClient = useContext(QueryClientContext);
  const { canPerform } = useRole();
  const canEdit = transaction.status === "DRAFT" && canPerform("transaction.draft", "update");
  const [saved, setSaved] = useState<(DocumentNames & { transactionId: string }) | null>(null);
  const [inputs, setInputs] = useState<Record<string, string | null>>({});
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const lifecycle = useRef(0);
  const visibleIdsKey = JSON.stringify(transaction.items.map(item => item.id).sort());
  const visibleIds = useMemo(() => new Set<string>(JSON.parse(visibleIdsKey)), [visibleIdsKey]);

  useEffect(() => {
    lifecycle.current += 1;
    if (!open) return;
    const controller = new AbortController();
    busy.current = false; setSaving(false);
    setReady(false); setError(null); setInputs({}); setSaved(null);
    void fetch("/api/transactions/" + transaction.id + "/document-item-names", { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Nama barang belum dapat dimuat.");
        if (controller.signal.aborted) return;
        if (data.items.length !== visibleIds.size || data.items.some((item: DocumentItem) => !visibleIds.has(item.id))) {
          for (const key of ["transactions", "transaction-history", "transaction"]) void queryClient?.invalidateQueries({ queryKey: [key] });
          throw new Error("Daftar item sudah berubah. Tutup nota, muat ulang transaksi, lalu buka kembali.");
        }
        if (!controller.signal.aborted) {
          setSaved({ ...data, transactionId: transaction.id }); setReady(true);
        }
      })
      .catch(cause => { if (!controller.signal.aborted) setError((cause as Error).message); });
    return () => { controller.abort(); lifecycle.current += 1; };
  }, [open, transaction.id, visibleIds, queryClient]);

  const identitiesMatch = saved?.transactionId === transaction.id
    && saved.items.length === visibleIds.size
    && saved.items.every(item => visibleIds.has(item.id));
  const namesReady = ready && identitiesMatch;
  const sourceItems: DocumentItem[] = saved?.transactionId === transaction.id
    ? saved.items
    : transaction.items.map(item => ({ id: item.id, productName: item.productName, documentName: (item as typeof item & { documentName?: string | null }).documentName ?? null }));
  const itemsById = new Map(sourceItems.map(item => [item.id, item]));
  const validationError = useMemo(() => Object.values(inputs).some(value => value !== null && (!value.trim() || value.trim().length > 300))
    ? "Isi nama pada nota dengan 1–300 karakter, atau pilih Kembalikan nama POS." : null, [inputs]);
  const nameFor = (id: string, originalName: string) => {
    const item = itemsById.get(id);
    return inputs[id] !== undefined ? inputs[id] ?? originalName : item?.documentName ?? originalName;
  };
  const normalized = (item: DocumentItem) => {
    const value = inputs[item.id];
    if (value === undefined) return item.documentName;
    if (value === null || value.trim() === item.productName) return null;
    return value.trim();
  };
  const dirty = sourceItems.some(item => normalized(item) !== item.documentName);

  async function ensureSaved() {
    if (!namesReady || !saved || saved.transactionId !== transaction.id) throw new Error("Nama barang belum selesai dimuat. Tutup dan buka kembali nota bila perlu.");
    if (validationError) throw new Error(validationError);
    if (!dirty) return;
    if (!canEdit) throw new Error("Anda tidak memiliki izin mengubah nama pada nota.");
    if (busy.current) throw new Error("Nama pada nota sedang disimpan. Mohon tunggu sebentar.");
    const savingSession = lifecycle.current;
    busy.current = true; setSaving(true); setError(null);
    try {
      const response = await fetch("/api/transactions/" + transaction.id + "/document-item-names", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: sourceItems.map(item => ({ id: item.id, documentName: normalized(item), expectedDocumentName: item.documentName })) }),
      });
      const data: DocumentNames & { message?: string } = await response.json();
      if (savingSession !== lifecycle.current) return;
      if (!response.ok) throw new Error(data.message || "Nama pada nota gagal disimpan.");
      flushSync(() => { setSaved({ ...data, transactionId: transaction.id }); setInputs({}); });
      for (const key of ["transactions", "transaction-history", "transaction"]) void queryClient?.invalidateQueries({ queryKey: [key] });
    } catch (cause) {
      if (savingSession !== lifecycle.current) return;
      setError((cause as Error).message); throw cause;
    } finally {
      if (savingSession === lifecycle.current) { busy.current = false; setSaving(false); }
    }
  }

  return {
    canEdit, ready: namesReady, saving, invalid: Boolean(validationError),
    error: error ?? validationError ?? (ready && !identitiesMatch ? "Daftar item sudah berubah. Tutup nota, muat ulang transaksi, lalu buka kembali." : null),
    nameFor, originalNameFor: (id: string, fallback: string) => itemsById.get(id)?.productName ?? fallback,
    setName: (id: string, value: string | null) => { setInputs(current => ({ ...current, [id]: value })); setError(null); },
    cancelEdit: (id: string) => { setInputs(current => { const next = { ...current }; delete next[id]; return next; }); setError(null); },
    ensureSaved,
  };
}
