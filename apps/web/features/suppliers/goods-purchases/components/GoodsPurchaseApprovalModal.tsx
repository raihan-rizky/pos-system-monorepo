"use client";

import { useState } from "react";
import { Button, Modal } from "@pos/ui";
import { CheckCircle2, Pencil, Plus, Trash2 } from "lucide-react";
import {
  useAddGoodsPurchaseItem,
  useApproveGoodsPurchaseItem,
  useEditGoodsPurchaseItem,
  useGoodsPurchase,
  useRemoveGoodsPurchaseItem,
} from "../hooks/useGoodsPurchases";
import type {
  AddGoodsPurchaseItemInput,
  GoodsPurchaseItemRecord,
  GoodsPurchaseMutationResult,
} from "../types/goods-purchase";
import { GoodsPurchaseItemEditor } from "./GoodsPurchaseItemEditor";

const APPROVED_EDIT_CONFIRMATION =
  "Barang ini sudah disetujui. Apakah ingin mengedit kembali?";
const APPROVED_EDIT_EFFECT =
  "Status akan kembali menjadi Belum Ada Aksi.";
const APPROVED_REMOVE_CONFIRMATION =
  "Produk yang sudah disetujui akan dihapus dari Pembelian Barang. Lanjutkan?";

export function GoodsPurchaseApprovalModal({
  purchaseId,
  onClose,
  onFinalized,
}: {
  purchaseId: string | null;
  onClose: () => void;
  onFinalized: () => void;
}) {
  const detail = useGoodsPurchase(purchaseId);
  const purchase = detail.data?.data;
  const approveItem = useApproveGoodsPurchaseItem();
  const editItem = useEditGoodsPurchaseItem();
  const removeItem = useRemoveGoodsPurchaseItem();
  const addItem = useAddGoodsPurchaseItem();
  const [editor, setEditor] = useState<
    { mode: "add"; item: null } | { mode: "edit"; item: GoodsPurchaseItemRecord }
  >();

  const handleResult = (result: GoodsPurchaseMutationResult) => {
    if (result.finalized) {
      setEditor(undefined);
      onClose();
      onFinalized();
    }
  };
  const startEdit = (item: GoodsPurchaseItemRecord) => {
    if (
      item.reviewStatus === "APPROVED" &&
      !window.confirm(
        `${APPROVED_EDIT_CONFIRMATION}\n${APPROVED_EDIT_EFFECT}`,
      )
    ) {
      return;
    }
    setEditor({ mode: "edit", item });
  };
  const remove = async (item: GoodsPurchaseItemRecord) => {
    const message =
      item.reviewStatus === "APPROVED"
        ? APPROVED_REMOVE_CONFIRMATION
        : "Produk akan dihapus dari Pembelian Barang. Lanjutkan?";
    if (!window.confirm(message) || !purchaseId) return;
    const result = await removeItem.mutateAsync({
      id: purchaseId,
      itemId: item.id,
    });
    handleResult(result);
  };
  const saveEditor = async (input: AddGoodsPurchaseItemInput) => {
    if (!purchaseId || !editor) return;
    const result =
      editor.mode === "add"
        ? await addItem.mutateAsync({ id: purchaseId, input })
        : await editItem.mutateAsync({
            id: purchaseId,
            itemId: editor.item.id,
            input,
          });
    setEditor(undefined);
    handleResult(result);
  };
  const error =
    approveItem.error ??
    editItem.error ??
    removeItem.error ??
    addItem.error;

  return (
    <>
      <Modal
        open={purchaseId !== null}
        onClose={onClose}
        title="Setujui Pembelian Barang"
        size="6xl"
      >
        {!purchase ? (
          <p className="py-10 text-center text-sm font-semibold text-slate-500">
            {detail.isError
              ? "Gagal memuat Pembelian Barang."
              : "Memuat produk..."}
          </p>
        ) : (
          <div className="space-y-4">
            <header className="flex flex-col gap-2 rounded-2xl bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-black text-slate-900">
                  {purchase.number} · {purchase.supplierName}
                </p>
                <p className="text-xs text-slate-500">
                  Daftar Belanja {purchase.shoppingRequestNumber}
                </p>
              </div>
              <p className="text-sm font-black text-amber-700">
                {purchase.pendingItemCount} Produk Belum Ada Aksi
              </p>
            </header>

            <section className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
              {purchase.items.map((item) => (
                <article
                  key={item.id}
                  className="rounded-2xl border border-slate-200 p-3 shadow-sm"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-black text-slate-900">
                          {item.productName}
                        </p>
                        <span
                          className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${
                            item.reviewStatus === "APPROVED"
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          {item.reviewStatus === "APPROVED"
                            ? "Disetujui"
                            : "Belum Ada Aksi"}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {item.sku} · {item.quantity} {item.unit ?? ""} ·{" "}
                        {formatCurrency(item.latestUnitPrice)} / unit
                      </p>
                      {item.updateMasterHpp && (
                        <p className="mt-1 text-xs font-bold text-cyan-700">
                          Update HPP master saat final approval
                        </p>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {item.reviewStatus === "PENDING" && (
                        <Button
                          type="button"
                          size="sm"
                          onClick={async () => {
                            if (!purchaseId) return;
                            const result = await approveItem.mutateAsync({
                              id: purchaseId,
                              itemId: item.id,
                            });
                            handleResult(result);
                          }}
                          loading={approveItem.isPending}
                          icon={<CheckCircle2 className="h-4 w-4" />}
                        >
                          Setujui
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => startEdit(item)}
                        icon={<Pencil className="h-4 w-4" />}
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => remove(item)}
                        loading={removeItem.isPending}
                        icon={<Trash2 className="h-4 w-4" />}
                      >
                        Hapus
                      </Button>
                    </div>
                  </div>
                </article>
              ))}
            </section>

            {error && (
              <p className="rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700">
                {error.message}
              </p>
            )}
            <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-between">
              <Button
                type="button"
                variant="secondary"
                onClick={onClose}
                className="w-full sm:w-auto"
              >
                Tutup
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setEditor({ mode: "add", item: null })}
                icon={<Plus className="h-4 w-4" />}
                className="w-full sm:w-auto"
              >
                Tambah Produk
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {editor && (
        <GoodsPurchaseItemEditor
          key={
            editor.mode === "edit"
              ? `edit-${editor.item.id}`
              : "add-product"
          }
          item={editor.item}
          onClose={() => setEditor(undefined)}
          onSave={saveEditor}
          saving={addItem.isPending || editItem.isPending}
        />
      )}
    </>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 2,
  }).format(value);
}
