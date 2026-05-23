"use client";

import React, { useState, useMemo, useCallback } from "react";
import { Modal, Button, Input } from "@pos/ui";
import { useProductsPage } from "@/hooks/useProducts";
import { formatRupiah } from "@/lib/utils";

interface ServiceMaterialModalProps {
  open: boolean;
  onClose: () => void;
  serviceProduct: {
    id: string;
    name: string;
    price: number;
    unit: string;
    stock: number;
    imageUrl?: string | null;
  } | null;
  onConfirm: (data: {
    serviceProduct: {
      id: string;
      name: string;
      price: number;
      unit: string;
      stock: number;
      imageUrl?: string | null;
    };
    materialName: string;
    size: string;
    overridePrice?: number;
  }) => void;
}

export function ServiceMaterialModal({
  open,
  onClose,
  serviceProduct,
  onConfirm,
}: ServiceMaterialModalProps) {
  const [search, setSearch] = useState("");
  const [selectedMaterial, setSelectedMaterial] = useState<{
    id: string;
    name: string;
    price: number;
    stock: number;
    unit: string;
  } | null>(null);

  const [length, setLength] = useState<number | "">("");
  const [width, setWidth] = useState<number | "">("");
  const [customSize, setCustomSize] = useState("");
  const [overridePrice, setOverridePrice] = useState<number | "">("");

  const productsQuery = useProductsPage(search, "", {
    page: 1,
    limit: 10,
    inStockOnly: true,
  });

  // Filter out service/printing categories — only show raw materials
  const materials = useMemo(() => {
    const all = productsQuery.data?.data || [];
    return all.filter(
      (p) =>
        !p.category?.name?.toLowerCase().includes("cetak") &&
        !p.category?.name?.toLowerCase().includes("jasa"),
    );
  }, [productsQuery.data?.data]);

  const calculatedArea =
    typeof length === "number" && typeof width === "number"
      ? length * width
      : 0;

  // Compute estimated price: override > area-based > base price
  const estimatedPrice = useMemo(() => {
    if (!serviceProduct) return 0;
    if (overridePrice !== "" && overridePrice > 0) {
      return Number(overridePrice);
    }
    if (calculatedArea > 0) {
      return Math.round(serviceProduct.price * calculatedArea);
    }
    return serviceProduct.price;
  }, [serviceProduct, overridePrice, calculatedArea]);

  const handleConfirm = useCallback(() => {
    if (!serviceProduct) return;

    let finalSize = customSize;
    if (!finalSize && length && width) {
      finalSize = `${length}x${width}m`;
    }

    onConfirm({
      serviceProduct,
      materialName: selectedMaterial?.name || "",
      size: finalSize,
      overridePrice:
        overridePrice !== "" && overridePrice > 0
          ? Number(overridePrice)
          : estimatedPrice !== serviceProduct.price
            ? estimatedPrice
            : undefined,
    });

    setSearch("");
    setSelectedMaterial(null);
    setLength("");
    setWidth("");
    setCustomSize("");
    setOverridePrice("");
  }, [serviceProduct, customSize, length, width, selectedMaterial, overridePrice, estimatedPrice, onConfirm]);

  return (
    <Modal open={open} onClose={onClose} title="Detail Layanan Cetak" size="lg">
      <div className="space-y-6">
        {serviceProduct && (
          <div className="bg-brand-50 border border-brand-200 rounded-xl p-4 flex items-center gap-4">
            {serviceProduct.imageUrl ? (
              <img
                src={serviceProduct.imageUrl}
                alt={serviceProduct.name}
                className="w-12 h-12 rounded-lg object-cover"
              />
            ) : (
              <div className="w-12 h-12 bg-brand-100 text-brand-500 rounded-lg flex items-center justify-center">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="21 8 21 21 3 21 3 8" />
                  <rect x="1" y="3" width="22" height="5" />
                  <line x1="10" y1="12" x2="14" y2="12" />
                </svg>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h4 className="font-bold text-brand-900">
                {serviceProduct.name}
              </h4>
              <p className="text-sm text-brand-700">
                Tarif Dasar: {formatRupiah(serviceProduct.price)}
                {serviceProduct.unit !== "pcs" &&
                  ` / ${serviceProduct.unit}`}
              </p>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <label className="text-sm font-semibold text-surface-700 block">
            1. Pilih Bahan Baku (Opsional)
          </label>
          <Input
            placeholder="Cari nama bahan baku (cth: Flexi 280gr)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          {search && (
            <div className="max-h-40 overflow-y-auto border border-surface-200 rounded-xl divide-y divide-surface-100">
              {productsQuery.isLoading ? (
                <div className="p-3 text-center text-sm text-surface-500">
                  Mencari...
                </div>
              ) : materials.length === 0 ? (
                <div className="p-3 text-center text-sm text-surface-500">
                  Bahan tidak ditemukan
                </div>
              ) : (
                materials.map((m) => (
                  <button
                    key={m.id}
                    onClick={() =>
                      setSelectedMaterial({
                        id: m.id,
                        name: m.name,
                        price: Number(m.price),
                        stock: m.stock,
                        unit: m.unit,
                      })
                    }
                    className={`w-full text-left px-4 py-2 hover:bg-surface-50 text-sm transition-colors ${
                      selectedMaterial?.id === m.id
                        ? "bg-brand-50 border-l-4 border-brand-500"
                        : ""
                    }`}
                  >
                    <div className="font-medium text-surface-900">{m.name}</div>
                    <div className="text-xs text-surface-500">
                      Stok: {m.stock} {m.unit} • Harga/unit:{" "}
                      {formatRupiah(Number(m.price))}
                    </div>
                  </button>
                ))
              )}
            </div>
          )}

          {selectedMaterial && (
            <div className="flex items-center justify-between bg-surface-100 p-3 rounded-xl border border-surface-200">
              <span className="text-sm font-medium text-surface-900">
                {selectedMaterial.name}
              </span>
              <button
                onClick={() => setSelectedMaterial(null)}
                className="text-xs text-red-500 hover:text-red-700 font-semibold"
              >
                Hapus
              </button>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <label className="text-sm font-semibold text-surface-700 block">
            2. Ukuran / Dimensi
          </label>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-surface-500 mb-1 block">
                Panjang (m)
              </label>
              <Input
                type="number"
                placeholder="0"
                value={length}
                onChange={(e) => setLength(Number(e.target.value) || "")}
              />
            </div>
            <div>
              <label className="text-xs text-surface-500 mb-1 block">
                Lebar (m)
              </label>
              <Input
                type="number"
                placeholder="0"
                value={width}
                onChange={(e) => setWidth(Number(e.target.value) || "")}
              />
            </div>
          </div>

          {calculatedArea > 0 && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-sm text-emerald-800">
              Luas:{" "}
              <span className="font-bold">
                {calculatedArea.toLocaleString("id-ID")} m²
              </span>{" "}
              ({length} × {width} m)
            </div>
          )}

          <div className="flex items-center gap-3 my-2">
            <div className="h-px bg-surface-200 flex-1"></div>
            <span className="text-xs text-surface-400 font-medium">ATAU</span>
            <div className="h-px bg-surface-200 flex-1"></div>
          </div>
          <Input
            label="Input Manual (cth: A4, F4, Custom)"
            placeholder="Ketik ukuran jika bukan meteran"
            value={customSize}
            onChange={(e) => setCustomSize(e.target.value)}
          />
        </div>

        <div className="space-y-3 pt-4 border-t border-surface-200">
          <label className="text-sm font-semibold text-surface-700 block">
            3. Penyesuaian Harga
          </label>

          {calculatedArea > 0 && overridePrice === "" && (
            <div className="bg-brand-50 border border-brand-200 rounded-lg px-3 py-2 text-sm text-brand-800">
              Estimasi harga:{" "}
              <span className="font-bold">
                {formatRupiah(estimatedPrice)}
              </span>{" "}
              ({formatRupiah(serviceProduct?.price || 0)} ×{" "}
              {calculatedArea.toLocaleString("id-ID")} m²)
            </div>
          )}
          {!calculatedArea && overridePrice === "" && (
            <p className="text-xs text-surface-500 leading-relaxed">
              Isi ukuran di atas untuk kalkulasi otomatis, atau masukkan harga
              final per item (jasa + bahan) di bawah.
            </p>
          )}

          <Input
            type="number"
            label={
              calculatedArea > 0
                ? "Harga kustom (abaikan estimasi)"
                : "Harga kustom per pcs/layanan"
            }
            placeholder="Harga final per item"
            value={overridePrice}
            onChange={(e) => setOverridePrice(Number(e.target.value) || "")}
          />
        </div>

        <div className="bg-surface-50 border border-surface-200 rounded-xl p-4 flex items-center justify-between">
          <span className="text-sm font-medium text-surface-700">
            Harga per item
          </span>
          <span className="text-lg font-extrabold text-brand-600">
            {formatRupiah(estimatedPrice)}
          </span>
        </div>

        <div className="flex gap-3 pt-2">
          <Button variant="secondary" onClick={onClose} className="flex-1">
            Batal
          </Button>
          <Button variant="accent" onClick={handleConfirm} className="flex-1">
            Tambah ke Keranjang
          </Button>
        </div>
      </div>
    </Modal>
  );
}
