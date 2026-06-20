"use client";

import React, { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button, Modal } from "@pos/ui";

import { useShoppingRequest, useApproveShoppingRequest } from "../hooks/useShoppingRequests";
import type { ShoppingRequestDetail } from "../types/shopping-request";

interface ApprovalRow {
  id: string;
  productName: string;
  requestedQty: number;
  approvedQty: number;
}

export function ShoppingRequestApproveModal({
  detail,
  open,
  onClose,
}: {
  detail: ShoppingRequestDetail | null;
  open: boolean;
  onClose: () => void;
}) {
  const fullDetail = useShoppingRequest(open ? detail?.id ?? null : null);
  const approve = useApproveShoppingRequest();
  const [rows, setRows] = useState<ApprovalRow[]>([]);

  useEffect(() => {
    if (fullDetail.data) {
      setRows(
        fullDetail.data.items.map((item) => ({
          id: item.id,
          productName: item.productName,
          requestedQty: item.requestedQty,
          approvedQty: item.approvedQty ?? item.requestedQty,
        })),
      );
    }
  }, [fullDetail.data]);

  const updateRow = (id: string, value: number) => {
    setRows((current) =>
      current.map((row) =>
        row.id === id ? { ...row, approvedQty: value } : row,
      ),
    );
  };

  const handleApprove = async () => {
    if (!detail) return;
    await approve.mutateAsync({
      id: detail.id,
      input: {
        items: rows.map((row) => ({
          id: row.id,
          approvedQty: row.approvedQty,
        })),
      },
    });
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Approve Daftar Belanja" size="4xl">
      {fullDetail.isPending ? (
        <div className="flex items-center justify-center p-8 text-sm text-slate-500">
          Memuat detail...
        </div>
      ) : rows.length === 0 ? (
        <div className="p-8 text-center text-sm text-slate-500">Belum ada item</div>
      ) : (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <div className="grid grid-cols-[1.4fr_0.8fr_0.8fr] gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black uppercase tracking-wider text-slate-500">
              <span>Nama Barang</span>
              <span>Kebutuhan Belanja</span>
              <span>Jumlah yang Di Acc</span>
            </div>
            {rows.map((row) => (
              <div
                key={row.id}
                className="grid grid-cols-[1.4fr_0.8fr_0.8fr] gap-2 border-b border-slate-100 px-3 py-3 last:border-b-0"
              >
                <span className="flex min-h-10 items-center text-sm font-semibold text-slate-900">
                  {row.productName}
                </span>
                <span className="flex min-h-10 items-center text-sm text-slate-600">
                  {row.requestedQty}
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={row.approvedQty}
                  onChange={(e) => updateRow(row.id, Number(e.target.value))}
                  className="min-h-10 rounded-xl border border-slate-200 px-3 text-sm"
                />
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Tutup
            </Button>
            <Button
              type="button"
              loading={approve.isPending}
              onClick={handleApprove}
              icon={<CheckCircle2 className="h-4 w-4" />}
            >
              Approve
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
