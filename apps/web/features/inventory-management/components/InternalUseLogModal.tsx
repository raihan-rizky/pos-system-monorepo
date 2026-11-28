"use client";

import { useId, useState, type FormEvent } from "react";
import { Button, Modal } from "@pos/ui";
import { useProducts } from "@/hooks/useProducts";
import {
  type InternalUseLogChange,
  type InventoryLog,
  useUpdateInternalUseLog,
} from "@/hooks/useInventoryLogs";

const titles = {
  editPending: "Edit pemakaian internal",
  correct: "Koreksi pemakaian internal",
  cancel: "Batalkan pemakaian internal",
};

type ProductChoice = Pick<InventoryLog["product"], "id" | "name" | "unit">;

function ProductResults({ search, onSelect }: { search: string; onSelect: (product: ProductChoice) => void }) {
  const products = useProducts(search, undefined, { limit: 8 });
  return (
    <div className="max-h-36 overflow-y-auto rounded-lg border border-slate-200">
      {(products.data ?? []).map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onSelect(item)}
          className="block min-h-10 w-full px-3 py-2 text-left text-sm hover:bg-slate-50 focus-visible:bg-slate-50"
        >
          {item.name} <span className="text-slate-500">{item.sku}</span>
        </button>
      ))}
      {!products.data?.length && (
        <p className="px-3 py-2 text-sm text-slate-500">
          {products.isFetching ? "Mencari produk…" : products.isError ? "Pencarian produk gagal." : "Produk belum ditemukan."}
        </p>
      )}
    </div>
  );
}

export default function InternalUseLogModal({
  log,
  action,
  onClose,
}: {
  log: InventoryLog;
  action: InternalUseLogChange["action"];
  onClose: () => void;
}) {
  const current = log.effectiveInternalUse ?? log;
  const isCancel = action === "cancel";
  const fieldsId = useId();
  const [product, setProduct] = useState<ProductChoice>(current.product);
  const [search, setSearch] = useState("");
  const [quantity, setQuantity] = useState(String(current.quantity));
  const [note, setNote] = useState(action === "editPending" ? current.note ?? "" : "");
  const [error, setError] = useState<string | null>(null);
  const mutation = useUpdateInternalUseLog();
  const showResults = !isCancel && search.trim().length >= 2;

  const title = titles[action];
  const expectedCorrectionId = log.effectiveInternalUse?.correctionId ?? null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.isPending) return;
    setError(null);

    const trimmedNote = note.trim();
    const amount = Number(quantity);
    if (!trimmedNote || (!isCancel && (!Number.isFinite(amount) || amount <= 0))) {
      setError(isCancel ? "Isi alasan pembatalan." : "Isi alasan dan masukkan jumlah lebih dari nol.");
      return;
    }

    const fields = { productId: product.id, quantity: amount, note: trimmedNote };
    const input: InternalUseLogChange = action === "cancel"
      ? { action, expectedCorrectionId, note: trimmedNote }
      : action === "correct"
        ? { action, expectedCorrectionId, ...fields }
        : { action, ...fields };

    try {
      await mutation.mutateAsync({ id: log.id, input });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gagal menyimpan perubahan.");
    }
  }

  return (
    <Modal
      open
      onClose={() => { if (!mutation.isPending) onClose(); }}
      title={title}
      size="lg"
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
          <p className="font-semibold">{current.product.name} · {current.quantity} {current.product.unit}</p>
          {isCancel && <p className="mt-1">Jumlah ini akan dikembalikan ke stok.</p>}
          {!isCancel && action === "correct" && current.note && <p className="mt-1">{current.note}</p>}
        </div>

        {!isCancel && (
          <>
            <div className="space-y-2">
              <label htmlFor={`${fieldsId}-product`} className="block text-sm font-semibold text-slate-800">
                Cari produk pengganti
              </label>
              <input
                id={`${fieldsId}-product`}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cari nama atau SKU"
                className="min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
              />
              <p className="text-sm text-slate-600">Produk dipilih <strong>{product.name}</strong></p>
              {showResults && (
                <ProductResults
                  search={search.trim()}
                  onSelect={(item) => { setProduct(item); setSearch(""); }}
                />
              )}
            </div>
            <label className="block text-sm font-semibold text-slate-800">
              Jumlah ({product.unit})
              <input
                type="number"
                required
                min="0"
                step="any"
                inputMode="decimal"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                className="mt-1 block min-h-10 w-full rounded-lg border border-slate-200 px-3"
              />
            </label>
          </>
        )}

        <label className="block text-sm font-semibold text-slate-800">
          {isCancel ? "Alasan pembatalan" : action === "correct" ? "Alasan koreksi" : "Alasan pemakaian"}
          <textarea
            required
            maxLength={500}
            rows={3}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" disabled={mutation.isPending} onClick={onClose}>Tutup</Button>
          <Button type="submit" variant={isCancel ? "danger" : "primary"} disabled={mutation.isPending}>
            {mutation.isPending ? "Menyimpan…" : isCancel ? "Batalkan pemakaian" : "Simpan perubahan"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
