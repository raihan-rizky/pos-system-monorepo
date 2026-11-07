"use client";

import React from "react";
import { AlertCircle, CheckCircle2, Pencil, Trash2 } from "lucide-react";
import { Button, Modal } from "@pos/ui";
import {
  approveInboundReceiptItem,
  deleteInboundReceiptItem,
  editInboundReceiptItem,
  fetchInboundReceiptComparison,
  fetchInboundReceipts,
  rejectInboundReceipt,
  type InboundReceiptListItem,
  type InboundReceiptListLine,
} from "../api/inventory-management-api";
import type {
  GoodsPurchaseReceivingComparison,
  InboundPricingUnit,
  InboundReceiptMutationResult,
} from "../types/inventory-management";
import type { InboundReceiptMatchStatus } from "../helpers/inbound-receipt-rules";
import { requiresInboundQuantityNote } from "../helpers/inbound-receipt-rules";
import {
  InboundPricingFields,
  inboundPricingInputFromDraft,
  inboundPricingInputFromDrafts,
  isInboundPricingDraftValid,
  isInboundPricingDraftsValid,
  pricingDraftForUnit,
  type InboundPricingDraft,
} from "./InboundPricingFields";
import { InboundPaymentSummary } from "./InboundPaymentFields";

interface LineConflictInput {
  line: Pick<
    InboundReceiptListLine,
    "goodsPurchaseItemId" | "receivedQuantity"
  >;
  comparison: GoodsPurchaseReceivingComparison | null;
}

export function getInboundReceiptLineConflict({
  line,
  comparison,
}: LineConflictInput) {
  const comparisonItem = comparison?.items.find(
    (item) => item.goodsPurchaseItemId === line.goodsPurchaseItemId,
  );
  if (!comparisonItem) {
    return {
      conflict: false,
      otherPendingQuantity: 0,
      availableForCurrentReceipt: Number.POSITIVE_INFINITY,
    };
  }

  const otherPendingQuantity = Math.max(
    0,
    comparisonItem.pendingReservedQuantity - line.receivedQuantity,
  );
  const availableForCurrentReceipt = Math.max(
    0,
    comparisonItem.orderedQuantity -
      comparisonItem.approvedReceivedQuantity -
      otherPendingQuantity,
  );
  return {
    conflict: line.receivedQuantity > availableForCurrentReceipt,
    otherPendingQuantity,
    availableForCurrentReceipt,
  };
}

export function hasActiveSharedPricing(input: {
  line: InboundReceiptListLine;
  lines: InboundReceiptListLine[];
  matchStatus: InboundReceiptMatchStatus;
  receivedQuantity: number;
}) {
  const { line, lines, matchStatus, receivedQuantity } = input;
  if (line.pricingSnapshot?.version !== 2 || matchStatus !== "MATCHED" || receivedQuantity <= 0) return false;
  return lines.some((sibling) =>
    sibling.id !== line.id && sibling.matchStatus === "MATCHED" && sibling.receivedQuantity > 0 &&
    sibling.pricingSnapshot?.version === 2 &&
    (sibling.productId === line.productId || line.pricingUnits?.some((unit) => unit.productId === sibling.productId)),
  );
}

export function receiptPricingUnitsForEdit(line: InboundReceiptListLine) {
  const units = line.pricingUnits ?? [];
  if (line.pricingSnapshot?.version !== 1) return units;
  const selectedId = line.pricingSnapshot.productId ?? line.productId;
  return units.filter((unit) => unit.productId === selectedId);
}

export function receiptPricingInputForEdit(line: InboundReceiptListLine, drafts: InboundPricingDraft[]) {
  const units = receiptPricingUnitsForEdit(line);
  if (line.pricingSnapshot?.version === 1) {
    const selected = drafts.find((draft) => draft.productId === units[0]?.productId);
    return inboundPricingInputFromDraft(selected ?? pricingDraftForUnit());
  }
  return inboundPricingInputFromDrafts(units, drafts);
}

export interface InboundReceiptReviewModalProps {
  open: boolean;
  receipt: InboundReceiptListItem;
  comparison?: GoodsPurchaseReceivingComparison | null;
  canApprove: boolean;
  canEdit: boolean;
  canReject: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
  onChanged?: () => void | Promise<void>;
}

type EditInput = {
  productId: string;
  expectedUpdatedAt?: string;
  matchStatus: InboundReceiptMatchStatus;
  receivedQuantity: string;
  supplierCostPrice: string;
  pricing: InboundPricingDraft[];
  targetPricingUnits?: InboundPricingUnit[];
  note: string;
};

function formatCostPrice(value: number | null): string {
  if (value === null) return "Belum dicatat";
  return `Rp ${value.toLocaleString("id-ID", { maximumFractionDigits: 2 })}`;
}

export function InboundReceiptReviewModal({
  open,
  receipt,
  comparison: initialComparison,
  canApprove,
  canEdit,
  canReject,
  onClose,
  onSuccess,
  onChanged,
}: InboundReceiptReviewModalProps) {
  const [lines, setLines] = React.useState(receipt.lines);
  const [comparison, setComparison] =
    React.useState<GoodsPurchaseReceivingComparison | null>(
      initialComparison ?? null,
    );
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editInput, setEditInput] = React.useState<EditInput | null>(null);
  const [rejectionReason, setRejectionReason] = React.useState("");
  const [pendingAction, setPendingAction] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setLines(receipt.lines);
  }, [receipt]);

  React.useEffect(() => {
    setComparison(initialComparison ?? null);
  }, [initialComparison]);

  React.useEffect(() => {
    if (!open || initialComparison || !receipt.goodsPurchaseId) return;
    let active = true;
    void fetchInboundReceiptComparison(receipt.id)
      .then((data) => {
        if (active) setComparison(data);
      })
      .catch((cause) => {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Gagal memuat informasi qty Pembelian Barang.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [initialComparison, open, receipt.goodsPurchaseId, receipt.id]);

  const finishMutation = async (
    result: InboundReceiptMutationResult,
    message: string,
  ) => {
    if (result.finalized) {
      onClose();
      onSuccess("Penerimaan Barang Telah Disetujui");
      return;
    }
    try {
      const refreshed = await fetchInboundReceipts({ goodsPurchaseId: receipt.goodsPurchaseId ?? undefined });
      const current = refreshed.find((candidate) => candidate.id === receipt.id);
      if (!current) throw new Error("Penerimaan tidak ditemukan.");
      setLines(current.lines);
      if (receipt.goodsPurchaseId) setComparison(await fetchInboundReceiptComparison(receipt.id));
    } catch {
      throw new Error("Perubahan tersimpan, tetapi data terbaru belum dapat dimuat. Muat ulang halaman untuk melanjutkan.");
    }
    if (onChanged) await onChanged();
    onSuccess(message);
  };

  const run = async (
    actionId: string,
    task: () => Promise<InboundReceiptMutationResult>,
    onCompleted: (result: InboundReceiptMutationResult) => void | Promise<void>,
  ) => {
    setPendingAction(actionId);
    setError(null);
    try {
      await onCompleted(await task());
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Aksi Penerimaan Barang gagal diproses.",
      );
    } finally {
      setPendingAction(null);
    }
  };

  const handleApprove = (line: InboundReceiptListLine) =>
    run(
      `${line.id}:approve`,
      () => approveInboundReceiptItem(receipt.id, line.id, line.updatedAt),
      async (result) => {
        await finishMutation(result, "Produk berhasil disetujui.");
      },
    );

  const openEdit = (line: InboundReceiptListLine) => {
    if (
      line.reviewStatus === "APPROVED" &&
      !window.confirm(
        "Produk ini sudah disetujui. Edit akan mengembalikan status menjadi Belum Ada Aksi. Lanjutkan?",
      )
    ) {
      return;
    }
    setEditingId(line.id);
    setEditInput({
      productId: line.productId,
      expectedUpdatedAt: line.updatedAt,
      matchStatus: line.matchStatus ?? "MATCHED",
      receivedQuantity: String(line.receivedQuantity),
      supplierCostPrice: String(
        line.supplierCostPrice ?? line.costPriceSnapshot ?? "",
      ),
      pricing: (line.pricingUnits ?? []).map((unit) => {
        const snapshot = line.pricingSnapshot;
        const saved = snapshot?.version === 2 ? snapshot.units.find((candidate) => candidate.productId === unit.productId)
          : snapshot?.productId === unit.productId ? snapshot : undefined;
        if (!saved) return pricingDraftForUnit(unit);
        return {
          productId: unit.productId,
          costPrice: saved.costPrice == null ? "" : String(saved.costPrice),
          price: saved.price == null ? "" : String(saved.price),
          hargaAgen: saved.hargaAgen == null ? "" : String(saved.hargaAgen),
          hargaDinas: saved.hargaDinas == null ? "" : String(saved.hargaDinas),
          priceEdited: "priceEdited" in saved ? saved.priceEdited : true,
        };
      }),
      note: line.note ?? "",
    });
  };

  const handleSaveEdit = (line: InboundReceiptListLine) => {
    if (!editInput) return;
    const replacement = editInput.productId !== line.productId
      ? comparison?.items.find(item => item.productId === editInput.productId) : null;
    const pricingUnits = editInput.targetPricingUnits ?? replacement?.pricingUnits ?? line.pricingUnits ?? [];
    if (!editInput.receivedQuantity.trim()) {
      setError("Jumlah diterima wajib diisi.");
      return;
    }
    const receivedQuantity = Number(editInput.receivedQuantity);
    if (!Number.isFinite(receivedQuantity) || receivedQuantity < 0) {
      setError("Jumlah diterima wajib berupa angka valid.");
      return;
    }
    const supplierCostPrice = Number(editInput.supplierCostPrice);
    if (!line.pricingSnapshot && (
      !editInput.supplierCostPrice.trim() ||
      !Number.isFinite(supplierCostPrice) ||
      supplierCostPrice < 0 ||
      supplierCostPrice > 9_999_999_999.99
    )) {
      setError("HPP unit wajib berupa angka valid.");
      return;
    }
    const requiredPricing = editInput.matchStatus === "MATCHED" && receivedQuantity > 0;
    const editUnits = replacement ? pricingUnits : receiptPricingUnitsForEdit(line);
    const pricingValid = !replacement && line.pricingSnapshot?.version === 1
      ? isInboundPricingDraftValid(editInput.pricing.find((draft) => draft.productId === editUnits[0]?.productId) ?? pricingDraftForUnit(), requiredPricing, line.pricingUnits)
      : isInboundPricingDraftsValid(editUnits, editInput.pricing, requiredPricing);
    if (line.pricingSnapshot && !pricingValid) {
      setError("Lengkapi harga jual setiap satuan aktif dan periksa nilai harga lainnya.");
      return;
    }
    if (
      requiresInboundQuantityNote(replacement?.remainingQuantity ?? line.expectedQuantity, receivedQuantity) &&
      !editInput.note.trim()
    ) {
      setError("Catatan wajib diisi saat jumlah diterima berbeda.");
      return;
    }

    if (hasActiveSharedPricing({ line, lines, matchStatus: editInput.matchStatus, receivedQuantity }) &&
      !window.confirm("Harga satuan pada produk lain dalam grup yang sama dapat disamakan dengan harga yang Anda simpan. Persetujuan produk tersebut dapat diulang. Lanjutkan?")) {
      return;
    }

    const replacementPricing = replacement ? inboundPricingInputFromDrafts(pricingUnits, editInput.pricing) : null;
    if (replacementPricing) {
      replacementPricing.units = replacementPricing.units.map((proposal) => {
        const unit = pricingUnits.find((candidate) => candidate.productId === proposal.productId)!;
        return { ...proposal, baseline: {
          unit: unit.unit, unitMultiplierToBase: unit.unitMultiplierToBase,
          costPrice: unit.costPrice, price: unit.price, hargaAgen: unit.hargaAgen, hargaDinas: unit.hargaDinas,
          pricingMode: unit.pricingMode ?? "MANUAL", pricingSourceProductId: unit.pricingSourceProductId ?? null,
          pricingConfigRevision: unit.pricingConfigRevision ?? null,
        } };
      });
    }

    void run(
      `${line.id}:edit`,
      () =>
        editInboundReceiptItem(receipt.id, line.id, {
          productId: editInput.productId,
          matchStatus: editInput.matchStatus,
          receivedQuantity,
          expectedUpdatedAt: editInput.expectedUpdatedAt,
          ...(line.pricingSnapshot
            ? { pricing: replacementPricing ?? receiptPricingInputForEdit(line, editInput.pricing) }
            : { supplierCostPrice, ...(replacementPricing ? { pricing: replacementPricing } : {}) }),
          note: editInput.note.trim() || null,
        }),
      async (result) => {
        setEditingId(null);
        setEditInput(null);
        if (result.conflict) {
          setError(
            "Konflik Qty: jumlah ini melewati sisa pesanan setelah penerimaan lain.",
          );
        }
        await finishMutation(result, "Produk berhasil diedit.");
      },
    );
  };

  const handleRemove = (line: InboundReceiptListLine) => {
    const message =
      line.reviewStatus === "APPROVED"
        ? "Produk ini sudah disetujui. Hapus produk ini dari Penerimaan Barang?"
        : "Hapus produk ini dari Penerimaan Barang?";
    if (!window.confirm(message)) return;
    void run(
      `${line.id}:delete`,
      () => deleteInboundReceiptItem(receipt.id, line.id, line.updatedAt),
      async (result) => {
        await finishMutation(result, "Produk berhasil dihapus.");
      },
    );
  };

  const handleReject = () => {
    const reason = rejectionReason.trim();
    if (!reason) {
      setError("Alasan penolakan wajib diisi.");
      return;
    }
    void run(
      `${receipt.id}:reject`,
      () => rejectInboundReceipt(receipt.id, reason),
      async () => {
        onClose();
        onSuccess("Penerimaan Barang berhasil ditolak.");
        if (onChanged) await onChanged();
      },
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Proses Penerimaan Barang"
      size="3xl"
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-sm font-black text-slate-900">
            {receipt.supplier?.name ?? "Supplier"}
          </p>
          {receipt.goodsPurchaseNumber && (
            <p className="text-xs text-slate-500">
              {receipt.goodsPurchaseNumber}
            </p>
          )}
          {receipt.payments?.length ? <div className="mt-3"><InboundPaymentSummary payments={receipt.payments} /></div> : receipt.paymentMethod && <p className="mt-1 text-xs text-slate-600">
            Metode pembayaran: {receipt.paymentMethod === "GIRO" ? "Giro" : "Transfer"}
            {receipt.paymentMethod === "GIRO" && receipt.paymentDueDate ? ` · Jatuh tempo ${receipt.paymentDueDate.slice(0, 10)}` : ""}
          </p>}
        </div>

        {error && (
          <div
            role="alert"
            className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {pendingAction && <div role="status" className="rounded-xl bg-slate-100 p-3 text-sm text-slate-700">Memproses dan memuat data terbaru...</div>}

        <fieldset disabled={Boolean(pendingAction)} className="space-y-3">
          {lines.map((line) => {
            const conflict = getInboundReceiptLineConflict({
              line,
              comparison,
            });
            const isEditing = editingId === line.id && editInput;
            return (
              <div
                key={line.id}
                className="rounded-xl border border-slate-200 bg-white p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-black text-slate-900">
                      {line.productNameSnapshot ?? "Produk"}
                    </p>
                    <p className="text-xs text-slate-500">
                      {line.receivedQuantity} / {line.expectedQuantity}{" "}
                      {line.unitSnapshot ?? ""}
                    </p>
                    {line.pricingSnapshot ? (
                      <div className="mt-1 space-y-0.5 text-xs font-semibold text-slate-600">
                        {(line.pricingSnapshot.version === 2 ? line.pricingSnapshot.units : [line.pricingSnapshot]).map((pricing, index) => <div key={pricing.productId ?? index} className="mt-2">
                          <p>Satuan harga: {pricing.unit ?? "Belum dipilih"}</p>
                          <p>HPP Unit: {formatCostPrice(pricing.costPrice)}</p>
                          <p>Harga Jual: {formatCostPrice(pricing.price)}</p>
                          <p>Harga Jual Agen: {formatCostPrice(pricing.hargaAgen)}</p>
                          <p>Harga Jual Dinas: {formatCostPrice(pricing.hargaDinas)}</p>
                        </div>)}
                        {line.pricingSnapshot.version === 2 && (line.pricingUnits ?? []).filter((unit) =>
                          line.pricingSnapshot?.version === 2 && !line.pricingSnapshot.units.some((saved) => saved.productId === unit.productId),
                        ).map((unit) => <p key={unit.productId} className="mt-2 text-amber-800">
                          Satuan {unit.unit}: {unit.isActive === false ? "tidak aktif" : "perlu diperiksa kembali"}; harga tidak diterapkan.
                        </p>)}
                      </div>
                    ) : (
                      <p className="mt-1 text-xs font-semibold text-slate-600">HPP Unit: {formatCostPrice(line.supplierCostPrice)}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-black ${
                        line.matchStatus === "MATCHED"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {line.matchStatus === "MATCHED"
                        ? "Sesuai"
                        : "Tidak Sesuai"}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-black ${
                        line.reviewStatus === "APPROVED"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {line.reviewStatus === "APPROVED"
                        ? "Disetujui"
                        : "Belum Ada Aksi"}
                    </span>
                    {conflict.conflict && (
                      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-black text-rose-800">
                        Konflik Qty
                      </span>
                    )}
                  </div>
                </div>

                {conflict.otherPendingQuantity > 0 && (
                  <p className="mt-2 text-xs font-semibold text-amber-700">
                    Penerimaan pending lain:{" "}
                    {conflict.otherPendingQuantity.toLocaleString("id-ID")}{" "}
                    {line.unitSnapshot ?? ""}. Sisa aman untuk dokumen ini:{" "}
                    {conflict.availableForCurrentReceipt.toLocaleString("id-ID")}.
                  </p>
                )}

                {line.note && (
                  <p className="mt-2 text-xs text-slate-600">{line.note}</p>
                )}

                {isEditing ? (
                  <div className="mt-3 grid gap-3 rounded-lg bg-slate-50 p-3 md:grid-cols-2 xl:grid-cols-4">
                    <label className="text-xs font-bold text-slate-600 md:col-span-2">Barang Diterima
                      <select name={`reviewLines.${line.id}.productId`} value={editInput.productId}
                        onChange={event => {
                          const selected = comparison?.items.find(item => item.productId === event.target.value);
                          setEditInput({ ...editInput, productId: event.target.value,
                            targetPricingUnits: selected?.pricingUnits ?? line.pricingUnits ?? [],
                            pricing: (selected?.pricingUnits ?? line.pricingUnits ?? []).map(pricingDraftForUnit),
                            supplierCostPrice: String(selected?.pricingUnits?.find(unit => unit.productId === selected.productId)?.costPrice ?? ""),
                          });
                        }} className="mt-1 min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-700">
                        <option value={line.productId}>{line.productNameSnapshot ?? "Produk"} ({line.unitSnapshot ?? "unit"})</option>
                        {comparison?.items.filter(item => item.productId && item.productId !== line.productId && item.isAvailableProduct !== false &&
                          item.remainingQuantity > 1e-9 && !lines.some(other => other.id !== line.id && other.goodsPurchaseItemId === item.goodsPurchaseItemId))
                          .map(item => <option key={item.goodsPurchaseItemId} value={item.productId}>{item.productName} ({item.unit ?? "unit"})</option>)}
                      </select>
                      <span className="mt-1 block font-normal text-slate-600">Pilih produk dari pembelian yang sama dan belum tercatat pada baris lain.</span>
                    </label>
                    <label className="text-xs font-bold text-slate-600">
                      Status
                      <select
                        value={editInput.matchStatus}
                        onChange={(event) =>
                          setEditInput({
                            ...editInput,
                            matchStatus: event.target
                              .value as InboundReceiptMatchStatus,
                          })
                        }
                        className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3"
                      >
                        <option value="MATCHED">Sesuai</option>
                        <option value="MISMATCHED">Tidak Sesuai</option>
                      </select>
                    </label>
                    <label className="text-xs font-bold text-slate-600">
                      Jumlah Diterima
                      <input
                        type="number"
                        min={0}
                        value={editInput.receivedQuantity}
                        onChange={(event) =>
                          setEditInput({
                            ...editInput,
                            receivedQuantity: event.target.value,
                          })
                        }
                        className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3"
                      />
                    </label>
                    {!line.pricingSnapshot && <label className="text-xs font-bold text-slate-600">
                      HPP Unit
                      <input
                        type="number"
                        min={0}
                        max={9_999_999_999.99}
                        step="0.01"
                        value={editInput.supplierCostPrice}
                        onChange={(event) =>
                          setEditInput({
                            ...editInput,
                            supplierCostPrice: event.target.value,
                          })
                        }
                        className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3"
                      />
                    </label>}
                    <label className="text-xs font-bold text-slate-600">
                      Catatan
                      <input
                        value={editInput.note}
                        onChange={(event) =>
                          setEditInput({
                            ...editInput,
                            note: event.target.value,
                          })
                        }
                        className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3"
                      />
                    </label>
                    {line.pricingSnapshot && (
                      <div className="md:col-span-2 xl:col-span-4">
                        {line.pricingSnapshot.version === 1 && <p className="text-xs text-slate-600">Penerimaan lama menyimpan harga untuk satu satuan.</p>}
                        <InboundPricingFields
                          units={editInput.productId !== line.productId
                            ? editInput.targetPricingUnits ?? []
                            : receiptPricingUnitsForEdit(line)}
                          value={editInput.pricing}
                          onChange={(pricing) => setEditInput({ ...editInput, pricing })}
                          required={editInput.matchStatus === "MATCHED" && Number(editInput.receivedQuantity) > 0}
                          namePrefix={`reviewLines.${line.id}.pricing`}
                        />
                      </div>
                    )}
                    <div className="flex gap-2 md:col-span-3">
                      <Button
                        type="button"
                        onClick={() => handleSaveEdit(line)}
                        disabled={pendingAction === `${line.id}:edit`}
                      >
                        Simpan Perubahan
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setEditingId(null)}
                      >
                        Batal
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {canApprove && line.reviewStatus !== "APPROVED" && (
                      <Button
                        type="button"
                        disabled={
                          conflict.conflict ||
                          pendingAction === `${line.id}:approve`
                        }
                        onClick={() => void handleApprove(line)}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Setujui Item
                      </Button>
                    )}
                    {canEdit && (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => openEdit(line)}
                      >
                        <Pencil className="h-4 w-4" />
                        Edit
                      </Button>
                    )}
                    {canEdit && lines.length > 1 && (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => handleRemove(line)}
                        disabled={pendingAction === `${line.id}:delete`}
                      >
                        <Trash2 className="h-4 w-4" />
                        Hapus
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </fieldset>

        {canReject && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
            <label className="text-xs font-black text-rose-800">
              Alasan penolakan
              <textarea
                rows={2}
                value={rejectionReason}
                onChange={(event) => setRejectionReason(event.target.value)}
                className="mt-1 w-full rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm text-slate-800"
                placeholder="Wajib diisi untuk menolak seluruh dokumen"
              />
            </label>
            <Button
              type="button"
              variant="secondary"
              className="mt-2 border-rose-200 text-rose-700"
              onClick={handleReject}
              disabled={pendingAction === `${receipt.id}:reject`}
            >
              Tolak Seluruh Dokumen
            </Button>
          </div>
        )}

        <div className="flex justify-end border-t border-slate-100 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            Tutup
          </Button>
        </div>
      </div>
    </Modal>
  );
}
