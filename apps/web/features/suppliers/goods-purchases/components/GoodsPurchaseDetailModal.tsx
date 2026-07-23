"use client";

import { Button, Modal } from "@pos/ui";
import { useGoodsPurchase } from "../hooks/useGoodsPurchases";

export function GoodsPurchaseDetailModal({
  purchaseId,
  onClose,
}: {
  purchaseId: string | null;
  onClose: () => void;
}) {
  const detail = useGoodsPurchase(purchaseId);
  const purchase = detail.data?.data;

  return (
    <Modal
      open={purchaseId !== null}
      onClose={onClose}
      title="Detail Pembelian Barang"
      size="4xl"
    >
      {!purchase ? (
        <p className="py-8 text-center text-sm font-semibold text-slate-500">
          {detail.isError
            ? "Gagal memuat detail Pembelian Barang."
            : "Memuat detail..."}
        </p>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-2">
            <Info label="Nomor" value={purchase.number} />
            <Info
              label="Daftar Belanja"
              value={purchase.shoppingRequestNumber}
            />
            <Info label="Supplier" value={purchase.supplierName} />
            <Info label="Status" value={purchase.status} />
          </div>
          <section className="space-y-2">
            {purchase.items.map((item) => (
              <article
                key={item.id}
                className="rounded-xl border border-slate-200 p-3"
              >
                <div className="flex flex-col gap-1 sm:flex-row sm:justify-between">
                  <div>
                    <p className="font-black text-slate-900">
                      {item.productName}
                    </p>
                    <p className="text-xs text-slate-500">
                      {item.sku} · {item.quantity} {item.unit ?? ""}
                    </p>
                  </div>
                  <p className="font-black text-slate-900">
                    {formatCurrency(item.lineTotal)}
                  </p>
                </div>
                <p className="mt-2 text-xs font-semibold text-slate-500">
                  Harga terbaru {formatCurrency(item.latestUnitPrice)}
                  {item.updateMasterHpp
                    ? " · HPP master akan diperbarui"
                    : " · HPP master tetap"}
                </p>
              </article>
            ))}
          </section>
          <div className="rounded-2xl bg-slate-950 p-4 text-white">
            <p className="text-xs font-bold uppercase text-slate-300">
              Total pengeluaran
            </p>
            <p className="text-2xl font-black">
              {formatCurrency(purchase.totalAmount)}
            </p>
          </div>
          {purchase.rejectionReason && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
              <p className="text-xs font-bold uppercase text-rose-600">
                Alasan penolakan
              </p>
              <p className="mt-1 text-sm font-semibold text-rose-900">
                {purchase.rejectionReason}
              </p>
            </div>
          )}
          <div className="flex justify-end">
            <Button type="button" variant="secondary" onClick={onClose}>
              Tutup
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase text-slate-400">{label}</p>
      <p className="font-black text-slate-900">{value}</p>
    </div>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 2,
  }).format(value);
}
