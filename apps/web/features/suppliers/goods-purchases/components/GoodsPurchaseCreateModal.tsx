"use client";

import { useState } from "react";
import { Button, Modal } from "@pos/ui";
import { ShoppingCart } from "lucide-react";
import {
  calculateGoodsPurchaseTotal,
  hasMasterHppDifference,
} from "../helpers/goods-purchase-core";
import {
  useCreateGoodsPurchase,
  useEligibleShoppingRequests,
} from "../hooks/useGoodsPurchases";
import type {
  CreateGoodsPurchaseInput,
  EligibleShoppingRequest,
} from "../types/goods-purchase";

type DraftItem = CreateGoodsPurchaseInput["items"][number] & {
  productName: string;
  unit: string | null;
  approvedQty: number;
  currentCostPrice: number | null;
};

const HPP_UPDATE_COPY =
  "Update HPP master ke harga ini saat pembelian disetujui";

export function GoodsPurchaseCreateModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const eligible = useEligibleShoppingRequests();
  const createPurchase = useCreateGoodsPurchase();
  const [selectedRequest, setSelectedRequest] =
    useState<EligibleShoppingRequest | null>(null);
  const [items, setItems] = useState<DraftItem[]>([]);

  const reset = () => {
    setSelectedRequest(null);
    setItems([]);
  };
  const close = () => {
    reset();
    onClose();
  };
  const selectRequest = (requestId: string) => {
    const request =
      eligible.data?.data.find((row) => row.id === requestId) ?? null;
    setSelectedRequest(request);
    setItems(
      request?.items.map((item) => ({
        shoppingRequestItemId: item.shoppingRequestItemId,
        productId: item.productId,
        productName: item.productName,
        unit: item.unit,
        approvedQty: item.approvedQty,
        currentCostPrice: item.currentCostPrice,
        quantity: item.approvedQty,
        latestUnitPrice: item.currentCostPrice ?? 0,
        updateMasterHpp: false,
      })) ?? [],
    );
  };
  const updateItem = (
    productId: string,
    patch: Partial<
      Pick<
        DraftItem,
        "quantity" | "latestUnitPrice" | "updateMasterHpp"
      >
    >,
  ) => {
    setItems((current) =>
      current.map((item) => {
        if (item.productId !== productId) return item;
        const next = { ...item, ...patch };
        if (
          !hasMasterHppDifference(
            next.currentCostPrice,
            next.latestUnitPrice,
          )
        ) {
          next.updateMasterHpp = false;
        }
        return next;
      }),
    );
  };
  const total = calculateGoodsPurchaseTotal(items);
  const canSubmit =
    Boolean(selectedRequest) &&
    items.length > 0 &&
    items.every(
      (item) =>
        Number.isFinite(item.quantity) &&
        item.quantity > 0 &&
        Number.isFinite(item.latestUnitPrice) &&
        item.latestUnitPrice >= 0,
    );

  const submit = async () => {
    if (!selectedRequest || !canSubmit) return;
    await createPurchase.mutateAsync({
      shoppingRequestId: selectedRequest.id,
      items: items.map(
        ({
          shoppingRequestItemId,
          productId,
          quantity,
          latestUnitPrice,
          updateMasterHpp,
        }) => ({
          shoppingRequestItemId,
          productId,
          quantity,
          latestUnitPrice,
          updateMasterHpp,
        }),
      ),
    });
    close();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Buat Pembelian Barang"
      size="6xl"
    >
      <div className="space-y-5">
        <label className="block">
          <span className="mb-1.5 block text-sm font-bold text-slate-700">
            Pilih Daftar Belanja yang sudah disetujui
          </span>
          <select
            value={selectedRequest?.id ?? ""}
            onChange={(event) => selectRequest(event.target.value)}
            className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"
          >
            <option value="">Pilih Daftar Belanja</option>
            {(eligible.data?.data ?? []).map((request) => (
              <option key={request.id} value={request.id}>
                {request.number} - {request.supplierName}
              </option>
            ))}
          </select>
        </label>

        {!selectedRequest ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm font-semibold text-slate-500">
            Pilih Daftar Belanja terlebih dahulu untuk menampilkan produk.
          </div>
        ) : (
          <>
            <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-3 text-sm">
              <p className="font-black text-cyan-900">
                Supplier: {selectedRequest.supplierName}
              </p>
              <p className="text-cyan-700">
                Daftar Belanja {selectedRequest.number}
              </p>
            </div>
            <section className="space-y-3">
              {items.map((item) => {
                const hppDiffers = hasMasterHppDifference(
                  item.currentCostPrice,
                  item.latestUnitPrice,
                );
                return (
                  <article
                    key={item.shoppingRequestItemId}
                    className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
                  >
                    <div className="flex items-start gap-2">
                      <ShoppingCart className="mt-0.5 h-5 w-5 text-cyan-600" />
                      <div>
                        <p className="font-black text-slate-900">
                          {item.productName}
                        </p>
                        <p className="text-xs text-slate-500">
                          Jumlah di-ACC: {item.approvedQty} {item.unit ?? ""}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <NumberField
                        label="Jumlah Produk"
                        value={item.quantity}
                        min={0.01}
                        onChange={(quantity) =>
                          updateItem(item.productId, { quantity })
                        }
                      />
                      <NumberField
                        label="Harga Produk Terbaru"
                        value={item.latestUnitPrice}
                        min={0}
                        onChange={(latestUnitPrice) =>
                          updateItem(item.productId, {
                            latestUnitPrice,
                          })
                        }
                      />
                    </div>
                    {hppDiffers && (
                      <label className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-900">
                        <input
                          type="checkbox"
                          checked={item.updateMasterHpp}
                          onChange={(event) =>
                            updateItem(item.productId, {
                              updateMasterHpp: event.target.checked,
                            })
                          }
                        />
                        {HPP_UPDATE_COPY}
                      </label>
                    )}
                  </article>
                );
              })}
            </section>
          </>
        )}

        <div className="rounded-2xl bg-slate-950 p-4 text-white">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-300">
            Total pengeluaran
          </p>
          <p className="mt-1 text-2xl font-black">{formatCurrency(total)}</p>
        </div>
        {createPurchase.error && (
          <p className="rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700">
            {createPurchase.error.message}
          </p>
        )}
        <footer className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="secondary"
            onClick={close}
            className="w-full sm:w-auto"
          >
            Tutup
          </Button>
          <Button
            type="button"
            disabled={!canSubmit}
            loading={createPurchase.isPending}
            onClick={submit}
            className="w-full sm:w-auto"
          >
            Ajukan Pembelian Barang
          </Button>
        </footer>
      </div>
    </Modal>
  );
}

function NumberField({
  label,
  value,
  min,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  onChange: (value: number) => void;
}) {
  return (
    <label>
      <span className="mb-1 block text-xs font-bold text-slate-600">
        {label}
      </span>
      <input
        type="number"
        min={min}
        step="0.01"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-right font-bold"
      />
    </label>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 2,
  }).format(value);
}
