"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Input, Modal } from "@pos/ui";
import { Calculator, Layers3, Minus, PencilLine, Plus } from "lucide-react";
import { useProductsPage } from "@/hooks/useProducts";
import { formatRupiah } from "@/lib/utils";
import type { PrintingService } from "../types";

export interface PrintingServiceOrderData {
  service: PrintingService;
  quantity: number;
  price: number;
  needsMaterial: boolean;
  rawMaterialProductId?: string | null;
  rawMaterialQuantity?: number | null;
  rawMaterialUnit?: string | null;
  materialName?: string;
  size?: string;
  serviceNote?: string;
}

interface PrintingServiceOrderModalProps {
  open: boolean;
  service: PrintingService | null;
  onClose: () => void;
  onConfirm: (data: PrintingServiceOrderData) => void;
}

type DimensionUnit = "cm" | "m";

export function PrintingServiceOrderModal({
  open,
  service,
  onClose,
  onConfirm,
}: PrintingServiceOrderModalProps) {
  const [quantity, setQuantity] = useState(1);
  const [priceOverride, setPriceOverride] = useState<number | "">("");
  const [isEditingFinalPrice, setIsEditingFinalPrice] = useState(false);
  const [needsMaterial, setNeedsMaterial] = useState(false);
  const [materialSearch, setMaterialSearch] = useState("");
  const [selectedMaterial, setSelectedMaterial] = useState<{
    id: string;
    name: string;
    price: number;
    stock: number;
    unit: string;
  } | null>(null);
  const [rawMaterialQuantity, setRawMaterialQuantity] = useState<number | "">(1);
  const [isEditingRawMaterialQuantity, setIsEditingRawMaterialQuantity] = useState(false);
  const [width, setWidth] = useState<number | "">("");
  const [length, setLength] = useState<number | "">("");
  const [dimensionUnit, setDimensionUnit] = useState<DimensionUnit>("cm");
  const [note, setNote] = useState("");

  const serviceBasePrice = Number(service?.basePrice ?? 0);
  const productsQuery = useProductsPage(materialSearch, "", {
    page: 1,
    limit: 20,
    inStockOnly: false,
  });
  const materials = productsQuery.data?.data ?? [];
  const dimensionArea =
    typeof width === "number" && typeof length === "number" && width > 0 && length > 0
      ? width * length
      : 0;
  const rawMaterialQuantityValue = Number(rawMaterialQuantity) || 0;
  const materialPrice = selectedMaterial ? selectedMaterial.price * rawMaterialQuantityValue * dimensionArea : 0;
  const serviceCost = Math.round(serviceBasePrice * dimensionArea);
  const computedFinalPrice = needsMaterial
    ? Math.round(serviceCost + materialPrice)
    : serviceBasePrice;
  const finalPrice = priceOverride === "" ? computedFinalPrice : Number(priceOverride);
  const selectedMaterialStock = selectedMaterial?.stock ?? 0;
  const generatedSize =
    dimensionArea > 0
      ? `${width} ${dimensionUnit} x ${length} ${dimensionUnit} = ${dimensionArea.toLocaleString("id-ID")} ${dimensionUnit}\u00B2`
      : undefined;
  const canConfirm =
    Boolean(service) &&
    quantity > 0 &&
    finalPrice >= 0 &&
    (!needsMaterial ||
      (dimensionArea > 0 &&
        Boolean(selectedMaterial) &&
        rawMaterialQuantityValue > 0 &&
        selectedMaterialStock > 0));

  const total = useMemo(() => finalPrice * quantity, [finalPrice, quantity]);

  useEffect(() => {
    if (!open) return;

    setQuantity(1);
    setPriceOverride("");
    setIsEditingFinalPrice(false);
    setNeedsMaterial(false);
    setMaterialSearch("");
    setSelectedMaterial(null);
    setRawMaterialQuantity(1);
    setIsEditingRawMaterialQuantity(false);
    setWidth("");
    setLength("");
    setDimensionUnit("cm");
    setNote("");
  }, [open, service?.id]);

  return (
    <Modal open={open} onClose={onClose} title="Tambah Layanan Cetak" size="xl">
      <div className="space-y-5">
        {service && (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-slate-50 px-4 py-4">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
                  <Layers3 size={18} />
                </div>
                <div className="min-w-0">
                  <h3 className="truncate text-base font-bold text-slate-900">
                    {service.name}
                  </h3>
                  <p className="text-sm text-slate-600">
                    Harga dasar {formatRupiah(Number(service.basePrice))} /{service.unit}
                  </p>
                </div>
              </div>
              <div className="rounded-xl border border-brand-200 bg-white px-3 py-2 text-right">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-brand-600">
                  Estimasi total
                </div>
                <div className="mt-0.5 text-lg font-extrabold text-brand-700">
                  {formatRupiah(total)}
                </div>
              </div>
            </div>
          </div>
        )}

        <label className="flex items-center justify-between rounded-xl border border-surface-200 bg-surface-50 px-4 py-3">
          <span className="text-sm font-semibold text-surface-800">
            Apakah layanan ini butuh bahan?
          </span>
          <input
            type="checkbox"
            checked={needsMaterial}
            onChange={(event) => {
              const nextValue = event.target.checked;
              setNeedsMaterial(nextValue);
              if (!nextValue) {
                setSelectedMaterial(null);
                setMaterialSearch("");
                setRawMaterialQuantity(1);
                setIsEditingRawMaterialQuantity(false);
              }
            }}
            className="h-5 w-5 rounded border-surface-300 text-brand-600 focus:ring-brand-500"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="mb-2 text-sm font-medium text-surface-700">
              Jumlah layanan
            </div>
            <div className="flex min-h-11 items-center gap-2 rounded-xl border border-surface-200 bg-surface-50 px-3 py-2">
              <button
                type="button"
                aria-label="Kurangi jumlah layanan"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-surface-200 bg-white text-surface-600 hover:bg-surface-100 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={quantity <= 1}
                onClick={() => setQuantity((current) => Math.max(1, current - 1))}
              >
                <Minus size={15} strokeWidth={2.25} />
              </button>
              <span className="min-w-0 flex-1 text-center font-extrabold text-brand-700">
                {quantity}
              </span>
              <button
                type="button"
                aria-label="Tambah jumlah layanan"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-surface-200 bg-white text-surface-600 hover:bg-surface-100"
                onClick={() => setQuantity((current) => current + 1)}
              >
                <Plus size={15} strokeWidth={2.25} />
              </button>
            </div>
          </div>
          <div>
            <div className="mb-2 text-sm font-medium text-surface-700">
              Harga final per layanan
            </div>
            {isEditingFinalPrice ? (
              <Input
                value={priceOverride === "" ? finalPrice : priceOverride}
                onChange={(event) =>
                  setPriceOverride(Number(event.target.value) || "")
                }
                onBlur={() => setIsEditingFinalPrice(false)}
              />
            ) : (
              <div className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-surface-200 bg-surface-50 px-3 py-2">
                <span className="font-extrabold text-brand-700">
                  {formatRupiah(finalPrice)}
                </span>
                <button
                  type="button"
                  aria-label="Edit harga final"
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-surface-200 bg-white text-surface-600 hover:bg-surface-100"
                  onClick={() => {
                    setPriceOverride(finalPrice);
                    setIsEditingFinalPrice(true);
                  }}
                >
                  <PencilLine size={15} strokeWidth={2.25} />
                </button>
              </div>
            )}
          </div>
        </div>

        {needsMaterial && (
          <div className="space-y-3">
            <div className="rounded-xl border border-surface-200 p-4">
              {!selectedMaterial ? (
                <>
                  <Input
                    label="Cari bahan baku"
                    value={materialSearch}
                    onChange={(event) => setMaterialSearch(event.target.value)}
                    placeholder="Contoh: Flexi 280"
                  />
                  <div className="mt-3 max-h-44 overflow-y-auto rounded-xl border border-surface-200 divide-y divide-surface-100">
                    {productsQuery.isLoading ? (
                      <div className="p-3 text-center text-sm text-surface-500">
                        Memuat bahan...
                      </div>
                    ) : materials.length === 0 ? (
                      <div className="p-3 text-center text-sm text-surface-500">
                        Bahan tidak ditemukan
                      </div>
                    ) : (
                      materials.map((material) => {
                        const disabled = material.stock <= 0;
                        return (
                          <button
                            type="button"
                            key={material.id}
                            disabled={disabled}
                            onClick={() => {
                              const selected = {
                                id: material.id,
                                name: material.name,
                                price: Number(material.price),
                                stock: material.stock,
                                unit: material.unit,
                              };
                              setSelectedMaterial(selected);
                              setRawMaterialQuantity(1);
                              setIsEditingRawMaterialQuantity(false);
                            }}
                            className={`w-full px-4 py-2 text-left text-sm transition-colors ${disabled
                              ? "bg-surface-100 text-surface-400 cursor-not-allowed"
                              : "hover:bg-surface-50 text-surface-900"
                              }`}
                          >
                            <div className="font-semibold">{material.name}</div>
                            <div className={disabled ? "text-danger-600 font-semibold" : "text-surface-500"}>
                              Stok: {material.stock} {material.unit}
                              {" \u2022 "}
                              Satuan: {material.unit}
                              {" \u2022 "}
                              Harga: {formatRupiah(Number(material.price))}
                              {disabled ? " - tidak bisa dipilih" : ""}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </>
              ) : (
                <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{selectedMaterial.name}</div>
                    <div className="text-xs">
                      Satuan: {selectedMaterial.unit} {" \u2022 "} Harga: {formatRupiah(selectedMaterial.price)}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 rounded-lg border border-brand-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100"
                    onClick={() => {
                      setSelectedMaterial(null);
                      setMaterialSearch("");
                      setRawMaterialQuantity(1);
                      setIsEditingRawMaterialQuantity(false);
                    }}
                  >
                    Ganti bahan
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-3 rounded-xl border border-surface-200 p-4">
              <div className="grid grid-cols-3 gap-3">
                <Input
                  type="number"
                  label="Lebar"
                  value={width}
                  onChange={(event) => setWidth(Number(event.target.value) || "")}
                  placeholder="0"
                />
                <Input
                  type="number"
                  label="Panjang"
                  value={length}
                  onChange={(event) => setLength(Number(event.target.value) || "")}
                  placeholder="0"
                />
                <div>
                  <label className="mb-2 block text-sm font-medium text-surface-700">
                    Satuan
                  </label>
                  <select
                    value={dimensionUnit}
                    onChange={(event) =>
                      setDimensionUnit(event.target.value as DimensionUnit)
                    }
                    className="h-11 w-full rounded-xl border border-surface-200 bg-surface-50 px-3 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="cm">cm</option>
                    <option value="m">m</option>
                  </select>
                </div>
              </div>
              <div className="rounded-xl border border-surface-200 bg-surface-50 px-4 py-3 text-sm text-surface-700">
                <div>
                  Luas:{" "}
                  <span className="font-semibold text-surface-900">
                    {dimensionArea > 0
                      ? (
                        <>
                          {dimensionArea.toLocaleString("id-ID")} {dimensionUnit}
                          <sup>2</sup>
                        </>
                      )
                      : "-"}
                  </span>
                </div>
              </div>
            </div>

            {selectedMaterial && (
              <div>
                <div className="mb-2 text-sm font-medium text-surface-700">
                  Jumlah bahan dipakai
                </div>
                {isEditingRawMaterialQuantity ? (
                  <Input
                    type="number"
                    value={rawMaterialQuantity}
                    onChange={(event) =>
                      setRawMaterialQuantity(Number(event.target.value) || "")
                    }
                    onBlur={() => {
                      if (!rawMaterialQuantityValue) setRawMaterialQuantity(1);
                      setIsEditingRawMaterialQuantity(false);
                    }}
                    placeholder="1"
                  />
                ) : (
                  <div className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-surface-200 bg-surface-50 px-3 py-2">
                    <span className="font-semibold text-surface-900">
                      {rawMaterialQuantityValue} {selectedMaterial.unit}
                    </span>
                    <button
                      type="button"
                      aria-label="Edit jumlah bahan"
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-surface-200 bg-white text-surface-600 hover:bg-surface-100"
                      onClick={() => {
                        setRawMaterialQuantity(rawMaterialQuantityValue || 1);
                        setIsEditingRawMaterialQuantity(true);
                      }}
                    >
                      <svg
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            )}
            <Input
              label="Catatan layanan"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Opsional"
            />


            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-100 text-brand-700">
                  <Calculator size={16} />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-900">Rincian harga</div>
                  <div className="text-xs text-slate-500">Formulanya tampil saat bahan dipakai</div>
                </div>
              </div>
              <div className="space-y-0 px-4 py-3 text-sm">
                <div className="flex items-start justify-between gap-3 py-2">
                  <span className="text-slate-600">Biaya jasa</span>
                  <span className="text-right font-semibold text-slate-900">
                    {formatRupiah(serviceBasePrice)} x {dimensionArea.toLocaleString("id-ID")}
                    {dimensionUnit}
                    <sup>2</sup>
                    <span className="ml-2 text-slate-500">= {formatRupiah(serviceCost)}</span>
                  </span>
                </div>
                <div className="flex items-start justify-between gap-3 border-t border-slate-100 py-2">
                  <span className="text-slate-600">Biaya bahan</span>
                  <span className="text-right font-semibold text-slate-900">
                    {selectedMaterial ? (
                      <>
                        {formatRupiah(selectedMaterial.price)} x {rawMaterialQuantityValue} {selectedMaterial.unit}  x {dimensionArea.toLocaleString("id-ID")}
                        {dimensionUnit}
                        <sup>2</sup> = {" "}
                        {formatRupiah(materialPrice)}
                      </>
                    ) : (
                      formatRupiah(0)
                    )}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-3 border-t border-slate-100 py-2">
                  <span className="text-slate-600">Jumlah layanan</span>
                  <span className="text-right font-semibold text-slate-900">
                    {quantity}
                  </span>
                </div>
                <div className="mt-1 rounded-xl bg-brand-50 px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <span className="font-semibold text-brand-700">Total</span>
                    <span className="text-lg font-extrabold text-brand-800">
                      {formatRupiah(total)}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-brand-700">
                    {"("}{formatRupiah(serviceBasePrice)} x {dimensionArea.toLocaleString("id-ID")} {" "}
                    {dimensionUnit}
                    <sup>2</sup>
                    {selectedMaterial ? (
                      <>
                        {" + "}{formatRupiah(selectedMaterial.price)} x {rawMaterialQuantityValue} {selectedMaterial.unit}  x {dimensionArea.toLocaleString("id-ID")}
                        {dimensionUnit}
                        <sup>2</sup>{')'} x {quantity}
                      </>
                    ) : null}
                    {priceOverride !== "" ? " (manual override)" : ""}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}



        <div className="flex gap-3 pt-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Batal
          </Button>
          <Button
            variant="accent"
            className="flex-1"
            disabled={!canConfirm}
            onClick={() => {
              if (!service) return;
              onConfirm({
                service,
                quantity,
                price: finalPrice,
                needsMaterial,
                rawMaterialProductId: needsMaterial ? selectedMaterial?.id : null,
                rawMaterialQuantity: needsMaterial ? Number(rawMaterialQuantity) : null,
                rawMaterialUnit: needsMaterial ? selectedMaterial?.unit : null,
                materialName: needsMaterial ? selectedMaterial?.name : undefined,
                size: generatedSize,
                serviceNote: note.trim() || undefined,
              });
            }}
          >
            Tambah
          </Button>
        </div>
      </div>
    </Modal>
  );
}
