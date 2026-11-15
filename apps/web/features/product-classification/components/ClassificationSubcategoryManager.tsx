"use client";

import { useEffect, useRef, useState } from "react";
import type { ClassificationSubcategory } from "./ProductClassificationPanel";
import styles from "./ClassificationSubcategoryManager.module.css";

export type ClassificationManagementAction =
  | { action: "create"; name: string }
  | { action: "update"; id: string; name: string }
  | { action: "delete"; id: string };

export function ClassificationSubcategoryManager({ subcategories, canCreate, canUpdate, canDelete, disabled, onManage }: {
  subcategories: ClassificationSubcategory[];
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  disabled: boolean;
  onManage: (action: ClassificationManagementAction) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deleting, setDeleting] = useState<ClassificationSubcategory | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const items = subcategories.filter(item => item.group === "ATK");
  useEffect(() => { if (deleting && dialog.current && !dialog.current.open) dialog.current.showModal(); }, [deleting]);

  async function submit(action: ClassificationManagementAction) {
    if (busy || disabled) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await onManage(action);
      if (action.action === "create") { setName(""); setMessage("Subkategori berhasil ditambahkan."); }
      if (action.action === "update") { setEditingId(null); setMessage("Subkategori berhasil diubah."); }
      if (action.action === "delete") { dialog.current?.close(); setMessage("Subkategori berhasil dihapus."); }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Subkategori belum berhasil disimpan. Silakan coba lagi.");
    } finally { setBusy(false); }
  }

  return <section className={styles.manager} aria-label="Kelola subkategori ATK">
    <div className={styles.heading}><div><h2>Kelola subkategori ATK</h2><p>Tambahkan atau rapikan pilihan ATK. Pilihan percetakan tetap PRINT, STEMPEL, dan PLAT.</p></div></div>
    {message && <p role="status" className={styles.success}>{message}</p>}
    {error && !deleting && <p role="alert" className={styles.error}>{error}</p>}
    {canCreate && <form className={styles.create} onSubmit={event => { event.preventDefault(); if (name.trim()) void submit({ action: "create", name: name.trim() }); }}>
      <label>Nama subkategori ATK<input value={name} maxLength={150} required disabled={busy || disabled} onChange={event => setName(event.target.value)} /></label>
      <button type="submit" disabled={busy || disabled || !name.trim()}>Tambah subkategori</button>
    </form>}
    {items.length === 0 ? <p className={styles.empty}>Belum ada subkategori ATK.</p> : <ul className={styles.list}>
      {items.map(item => <li key={item.id}>
        {editingId === item.id && canUpdate ? <form className={styles.edit} onSubmit={event => { event.preventDefault(); if (editName.trim()) void submit({ action: "update", id: item.id, name: editName.trim() }); }}>
          <label>Nama subkategori yang diubah<input value={editName} maxLength={150} required disabled={busy || disabled} onChange={event => setEditName(event.target.value)} /></label>
          <div className={styles.actions}><button type="submit" disabled={busy || disabled || !editName.trim()}>Simpan perubahan</button><button type="button" disabled={busy || disabled} onClick={() => { setEditingId(null); setError(null); }}>Batal</button></div>
        </form> : <><strong>{item.name}</strong><div className={styles.actions}>
          {canUpdate && <button type="button" aria-label={`Ubah ${item.name}`} disabled={busy || disabled} onClick={() => { setEditingId(item.id); setEditName(item.name); setError(null); setMessage(null); }}>Ubah</button>}
          {canDelete && <button type="button" aria-label={`Hapus ${item.name}`} disabled={busy || disabled} onClick={() => { setDeleting(item); setError(null); setMessage(null); }}>Hapus</button>}
        </div></>}
      </li>)}
    </ul>}
    {deleting && <dialog ref={dialog} className={styles.dialog} aria-labelledby="classification-delete-title"
      onClose={() => { setDeleting(null); setError(null); }} onCancel={event => { if (busy) event.preventDefault(); }}>
      <h2 id="classification-delete-title">Hapus subkategori ATK</h2>
      <p>Hapus <strong>{deleting.name}</strong>? Subkategori yang masih digunakan produk tidak dapat dihapus.</p>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <div className={styles.dialogActions}><button type="button" disabled={busy} onClick={() => dialog.current?.close()}>Batal</button><button type="button" disabled={busy || disabled} onClick={() => void submit({ action: "delete", id: deleting.id })}>{busy ? "Menghapus..." : "Hapus subkategori"}</button></div>
    </dialog>}
  </section>;
}
