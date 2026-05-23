"use client";

import { useEffect, useState } from "react";
import { Button, Input, Modal } from "@pos/ui";
import type { PrintingService, PrintingServiceInput } from "../types";

interface PrintingServiceFormModalProps {
  open: boolean;
  service: PrintingService | null;
  isSaving: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (input: PrintingServiceInput) => void;
}

export function PrintingServiceFormModal({
  open,
  service,
  isSaving,
  error,
  onClose,
  onSubmit,
}: PrintingServiceFormModalProps) {
  const [name, setName] = useState("");
  const [basePrice, setBasePrice] = useState<number | "">("");
  const [unit, setUnit] = useState("pcs");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(service?.name ?? "");
    setBasePrice(service ? Number(service.basePrice) : "");
    setUnit(service?.unit ?? "pcs");
    setDescription(service?.description ?? "");
  }, [open, service]);

  const canSubmit = name.trim() && Number(basePrice) >= 0 && unit.trim();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={service ? "Ubah Layanan Cetak" : "Tambah Layanan Cetak"}
      size="md"
    >
      <div className="space-y-4">
        <Input
          label="Nama layanan"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Contoh: X Banner"
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            type="number"
            label="Harga dasar"
            value={basePrice}
            onChange={(event) => setBasePrice(Number(event.target.value) || "")}
            placeholder="0"
          />
          <Input
            label="Satuan"
            value={unit}
            onChange={(event) => setUnit(event.target.value)}
            placeholder="pcs"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-surface-700 mb-2 block">
            Deskripsi
          </label>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            className="w-full rounded-xl border border-surface-200 bg-surface-50 px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="Opsional"
          />
        </div>
        {error && (
          <p className="rounded-xl border border-danger-200 bg-danger-50 px-3 py-2 text-sm font-medium text-danger-700">
            {error}
          </p>
        )}
        <div className="flex gap-3 pt-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Batal
          </Button>
          <Button
            variant="accent"
            className="flex-1"
            disabled={!canSubmit}
            loading={isSaving}
            onClick={() =>
              onSubmit({
                name: name.trim(),
                basePrice: Number(basePrice),
                unit: unit.trim(),
                description: description.trim() || null,
              })
            }
          >
            Simpan
          </Button>
        </div>
      </div>
    </Modal>
  );
}

