"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { prepareOfflineCatalog } from "@/lib/offline/offline-catalog-preparation";

type Identity = { cashierId: string; storeId: string };

export function OfflineAccessPreparation({ identity, isOnline, onCatalogPrepared }: {
  identity: Identity | null;
  isOnline: boolean;
  onCatalogPrepared: (time: string) => void;
}) {
  const id = useId();
  const [pin, setPin] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [preparedAt, setPreparedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const cashierId = identity?.cashierId;
  const storeId = identity?.storeId;

  useEffect(() => {
    let active = true;
    setPreparedAt(null);
    if (cashierId && storeId) {
      const path = "/offline-vault.mjs";
      void import(/* webpackIgnore: true */ path).then(({ listOfflinePages }) => listOfflinePages())
        .then((pages: Array<{ cashierId: string; storeId: string; preparedAt: string }>) => {
          if (active) setPreparedAt(pages.find((page) => page.cashierId === cashierId && page.storeId === storeId)?.preparedAt || null);
        }).catch(() => undefined);
    }
    return () => { active = false; };
  }, [cashierId, storeId]);

  async function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    if (!identity || !isOnline) return;
    if (!/^\d{6,12}$/.test(pin)) { setError("PIN harus terdiri dari 6–12 angka."); return; }
    if (pin !== confirmation) { setError("Konfirmasi PIN belum sama."); return; }
    setBusy(true);
    try {
      const catalog = await prepareOfflineCatalog(identity);
      onCatalogPrepared(catalog.generatedAt);
      const path = "/offline-prepare.mjs";
      const { prepareOfflineAccess } = await import(/* webpackIgnore: true */ path);
      const result = await prepareOfflineAccess({ ...identity, pin });
      setPreparedAt(result.preparedAt);
      setPin("");
      setConfirmation("");
      setMessage("POS offline disiapkan untuk akun ini di perangkat ini.");
      if (navigator.storage?.persist) void navigator.storage.persist().catch(() => false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "POS offline belum dapat disiapkan.");
    } finally { setBusy(false); }
  }

  return (
    <section aria-labelledby={`${id}-heading`} className="space-y-3 rounded-lg border border-surface-200 bg-white p-4">
      <h3 id={`${id}-heading`} className="font-bold text-surface-900">Buka kembali POS saat offline</h3>
      <p className="text-sm text-surface-600">
        {preparedAt ? `Terakhir disiapkan ${new Date(preparedAt).toLocaleString("id-ID")}. ` : "Belum disiapkan untuk akun ini. "}
        Siapkan ulang saat online setidaknya setiap tujuh hari dan setelah pembaruan aplikasi.
      </p>
      <p className="text-sm text-surface-600">PIN mengenkripsi salinan halaman POS; katalog dan antrean transaksi belum terenkripsi. Amankan perangkat dan jangan hapus data situs sebelum semua transaksi tersimpan di server.</p>
      <form onSubmit={(event) => void prepare(event)} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={`${id}-pin`} className="block text-sm font-semibold text-surface-700">PIN offline</label>
            <input id={`${id}-pin`} type="password" inputMode="numeric" autoComplete="new-password" pattern="[0-9]{6,12}" minLength={6} maxLength={12} required value={pin} onChange={(event) => setPin(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-surface-300 px-3" />
          </div>
          <div>
            <label htmlFor={`${id}-confirm`} className="block text-sm font-semibold text-surface-700">Ulangi PIN</label>
            <input id={`${id}-confirm`} type="password" inputMode="numeric" autoComplete="new-password" pattern="[0-9]{6,12}" minLength={6} maxLength={12} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-surface-300 px-3" />
          </div>
        </div>
        {error && <p role="alert" className="text-sm text-danger-600">{error}</p>}
        {message && <p role="status" className="text-sm text-brand-700">{message}</p>}
        <button type="submit" disabled={!isOnline || !identity || busy} className="min-h-10 rounded-lg bg-brand-600 px-3 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? "Menyiapkan POS offline..." : "Siapkan POS offline"}
        </button>
      </form>
    </section>
  );
}
