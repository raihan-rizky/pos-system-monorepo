import React, { useState, useEffect } from "react";
import { Modal, Button, Input } from "@pos/ui";
import { Upload, X, RefreshCw } from "lucide-react";
import { useCreateProduct, useUpdateProduct, Product } from "@/hooks/useProducts";
import { buildProductFormPayload } from "@/lib/product-form/product-form-payload";

interface ProductFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  productId: string | null;
  categories: { id: string; name: string }[];
  initialData?: Product | null;
}

export default function ProductFormModal({ isOpen, onClose, productId, categories, initialData }: ProductFormModalProps) {
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();

  const [formData, setFormData] = useState({
    name: "",
    sku: "",
    categoryId: "",
    price: "",
    costPrice: "",
    minStock: "5",
    unit: "pcs",
    unitMultiplierToBase: "1",
    smallestUnit: "pcs",
    smallestSku: "",
    smallestBarcode: "",
    smallestPrice: "",
    smallestCostPrice: "",
    includeSmallestUnitVariant: false,
    stock: "0",
    size: "",
    material: "",
    imageUrl: "",
  });

  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Upload gagal");
      }

      const { url } = await res.json();
      setFormData(prev => ({ ...prev, imageUrl: url }));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Gagal upload gambar");
    } finally {
      setIsUploading(false);
    }
  };

  useEffect(() => {
    if (isOpen && initialData) {
      setFormData({
        name: initialData.name,
        sku: initialData.sku,
        categoryId: initialData.category?.id || "",
        price: initialData.price.toString(),
        costPrice: initialData.costPrice?.toString() || "",
        minStock: initialData.minStock.toString(),
        unit: initialData.unit,
        unitMultiplierToBase: String(initialData.unitMultiplierToBase ?? 1),
        smallestUnit: "pcs",
        smallestSku: "",
        smallestBarcode: "",
        smallestPrice: "",
        smallestCostPrice: "",
        includeSmallestUnitVariant: false,
        stock: initialData.stock.toString(),
        size: initialData.size || "",
        material: initialData.material || "",
        imageUrl: initialData.imageUrl || "",
      });
    } else if (isOpen) {
      setFormData({
        name: "",
        sku: "",
        categoryId: categories[0]?.id || "",
        price: "",
        costPrice: "",
        minStock: "5",
        unit: "pcs",
        unitMultiplierToBase: "1",
        smallestUnit: "pcs",
        smallestSku: "",
        smallestBarcode: "",
        smallestPrice: "",
        smallestCostPrice: "",
        includeSmallestUnitVariant: false,
        stock: "0",
        size: "",
        material: "",
        imageUrl: "",
      });
    }
  }, [isOpen, initialData, categories]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      if (productId) {
        const payload = buildProductFormPayload(formData, "edit");
        await updateProduct.mutateAsync({ id: productId, ...payload });
      } else {
        const payload = buildProductFormPayload(formData, "create");
        await createProduct.mutateAsync(payload);
      }
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan");
    }
  };

  const isProcessing = createProduct.isPending || updateProduct.isPending;
  const unitMultiplier = Number(formData.unitMultiplierToBase || "1");
  const canAddSmallestUnitVariant = !productId && Number.isFinite(unitMultiplier) && unitMultiplier > 1;
  const showSmallestUnitVariant =
    canAddSmallestUnitVariant && formData.includeSmallestUnitVariant;
  const derivedBaseStock = showSmallestUnitVariant
    ? Number(formData.stock || "0") * unitMultiplier
    : 0;

  const suggestSmallestSku = (sku: string, unit: string) => {
    const trimmedSku = sku.trim();
    const suffix = unit.trim().replace(/\s+/g, "-").toUpperCase();
    if (!trimmedSku || !suffix) return "";
    const family = trimmedSku.includes("-")
      ? trimmedSku.slice(0, trimmedSku.lastIndexOf("-"))
      : trimmedSku;
    return `${family}-${suffix}`;
  };

  return (
    <Modal open={isOpen} onClose={onClose} title={productId ? "Ubah Produk" : "Tambah Produk"}>
      <form onSubmit={handleSubmit} className="space-y-4 mt-4">
        {error && (
          <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm font-medium border border-red-100">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Nama Produk"
            placeholder="Contoh: Banner Flexi 280gsm"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
          />
          <Input
            label="SKU / Kode Barang"
            placeholder="Contoh: BNR-FLX-280"
            value={formData.sku}
            onChange={(e) => {
              const nextSku = e.target.value;
              setFormData((current) => ({
                ...current,
                sku: nextSku,
                smallestSku: current.smallestSku
                  ? current.smallestSku
                  : suggestSmallestSku(nextSku, current.smallestUnit),
              }));
            }}
            required
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">Kategori</label>
            <select
              value={formData.categoryId}
              onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
              className="w-full px-3 py-2 bg-white border border-surface-200 rounded-xl focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all outline-none"
              required
            >
              <option value="" disabled>Pilih Kategori</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          {!productId && (
            <Input
              label="Harga Jual (IDR)"
              type="number"
              min="0"
              value={formData.price}
              onChange={(e) => setFormData({ ...formData, price: e.target.value })}
              required
            />
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          {!productId && (
            <Input
              label="Harga Modal (HPP)"
              type="number"
              min="0"
              placeholder="Opsional"
              value={formData.costPrice}
              onChange={(e) => setFormData({ ...formData, costPrice: e.target.value })}
            />
          )}
          <Input
            label="Unit"
            placeholder="pcs, rim, meter, dus"
            value={formData.unit}
            onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
            required
          />
          {!productId && (
            <Input
              label="Isi per Unit Terkecil"
              type="number"
              min="1"
              step="any"
              value={formData.unitMultiplierToBase}
              onChange={(e) =>
                setFormData({ ...formData, unitMultiplierToBase: e.target.value })
              }
              required
            />
          )}
          <Input
            label="Stok Saat Ini"
            type="number"
            min="0"
            value={formData.stock}
            onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
            required
          />
        </div>

        {canAddSmallestUnitVariant && !showSmallestUnitVariant && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-black text-slate-900">
                  Varian Unit Terkecil
                </p>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  Tambahkan jika produk ini juga dijual dalam unit terkecil.
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  setFormData((current) => ({
                    ...current,
                    includeSmallestUnitVariant: true,
                    smallestSku:
                      current.smallestSku ||
                      suggestSmallestSku(current.sku, current.smallestUnit),
                  }))
                }
              >
                Tambah Varian Unit Terkecil
              </Button>
            </div>
          </div>
        )}

        {showSmallestUnitVariant && (
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="mb-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-slate-900">
                    Varian Unit Terkecil
                  </p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    Produk unit terkecil akan dibuat sebagai produk yang bisa dijual.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setFormData({
                      ...formData,
                      includeSmallestUnitVariant: false,
                    })
                  }
                  className="rounded-lg px-2 py-1 text-xs font-black text-slate-500 hover:bg-slate-200"
                >
                  Hapus
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Unit Terkecil"
                placeholder="pcs, lbr, bh"
                value={formData.smallestUnit}
                onChange={(e) => {
                  const nextUnit = e.target.value;
                  setFormData((current) => ({
                    ...current,
                    smallestUnit: nextUnit,
                    smallestSku: suggestSmallestSku(current.sku, nextUnit),
                  }));
                }}
                required
              />
              <Input
                label="SKU Unit Terkecil"
                placeholder="Contoh: JOYKO-PCS"
                value={formData.smallestSku}
                onChange={(e) =>
                  setFormData({ ...formData, smallestSku: e.target.value })
                }
                required
              />
              <Input
                label="Barcode Unit Terkecil"
                placeholder="Opsional"
                value={formData.smallestBarcode}
                onChange={(e) =>
                  setFormData({ ...formData, smallestBarcode: e.target.value })
                }
              />
              <Input
                label="Harga Jual Unit Terkecil"
                type="number"
                min="0"
                value={formData.smallestPrice}
                onChange={(e) =>
                  setFormData({ ...formData, smallestPrice: e.target.value })
                }
                required
              />
              <Input
                label="HPP Unit Terkecil"
                type="number"
                min="0"
                placeholder="Opsional"
                value={formData.smallestCostPrice}
                onChange={(e) =>
                  setFormData({ ...formData, smallestCostPrice: e.target.value })
                }
              />
            </div>
            <div className="mt-4 rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-xs font-bold text-sky-700">
              <p>Base unit: {formData.smallestUnit || "-"}</p>
              <p>
                Shared stock: {Number.isFinite(derivedBaseStock) ? derivedBaseStock : 0}{" "}
                {formData.smallestUnit || "unit"}
              </p>
              <p>
                Tampilan: {formData.stock || "0"} {formData.unit || "unit"} ={" "}
                {Number.isFinite(derivedBaseStock) ? derivedBaseStock : 0}{" "}
                {formData.smallestUnit || "unit"}
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Peringatan Stok Minimum"
            type="number"
            min="0"
            value={formData.minStock}
            onChange={(e) => setFormData({ ...formData, minStock: e.target.value })}
            required
          />
          <Input
            label="Ukuran / Dimensi"
            placeholder="Opsional"
            value={formData.size}
            onChange={(e) => setFormData({ ...formData, size: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-1 gap-4">
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-2">Gambar Produk</label>
            <div className="flex items-center gap-4">
              {formData.imageUrl ? (
                <div className="relative w-20 h-20 rounded-xl overflow-hidden border border-surface-200 shrink-0 shadow-sm">
                  <img src={formData.imageUrl} alt="Preview" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, imageUrl: "" })}
                    className="absolute top-1 right-1 bg-white/90 rounded-full p-1 text-surface-600 hover:text-red-600 shadow-sm transition-colors cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="relative w-20 h-20 rounded-xl bg-surface-50 border border-dashed border-surface-300 flex flex-col items-center justify-center hover:bg-surface-100 transition-colors shrink-0 overflow-hidden">
                  {isUploading ? (
                    <RefreshCw className="w-5 h-5 text-brand-500 animate-spin" />
                  ) : (
                    <Upload className="w-5 h-5 text-surface-400 mb-1" />
                  )}
                  {!isUploading && <span className="text-[9px] font-semibold text-surface-400 uppercase tracking-widest">Upload</span>}
                  <input
                    type="file"
                    accept="image/jpeg, image/png, image/webp, image/gif, image/avif"
                    onChange={handleUpload}
                    disabled={isUploading}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    title="Upload Gambar"
                  />
                </div>
              )}
              <div className="flex-1 text-xs text-surface-500 space-y-0.5">
                <p className="font-semibold text-surface-700 text-sm">Upload Gambar Produk</p>
                <p>Upload gambar kotak (JPG, PNG, WebP) maksimal 5 MB.</p>
                <p className="opacity-75">Jika dilewati, ikon kategori akan digunakan.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-6 border-t border-surface-200">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isProcessing}>
            Batal
          </Button>
          <Button type="submit" disabled={isProcessing}>
            {isProcessing ? "Menyimpan..." : "Simpan Produk"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
