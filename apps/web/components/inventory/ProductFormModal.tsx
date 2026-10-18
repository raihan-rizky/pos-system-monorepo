import React, { useState, useEffect, useRef } from "react";
import { Modal, Button, Input } from "@pos/ui";
import { Plus, Upload, X, RefreshCw } from "lucide-react";
import { useCreateProduct, useUpdateProduct, Product } from "@/hooks/useProducts";
import { useBrands, useCreateBrand } from "@/hooks/useBrands";
import { buildProductFormPayload } from "@/lib/product-form/product-form-payload";
import { getProductUnitBadges, validateUnitDrafts, type UnitVariantDraft } from "@/lib/product-form/product-unit-variants";
import { ProductUnitFields, UnitSizeBadge } from "./ProductUnitFields";

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
  const { data: brands = [] } = useBrands();
  const createBrand = useCreateBrand();

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    sku: "",
    categoryId: "",
    brandId: "",
    price: "",
    costPrice: "",
    hargaDinas: "",
    hargaAgen: "",
    minStock: "5",
    unit: "pcs",
    unitMultiplierToBase: "1",
    smallestUnit: "pcs",
    smallestSku: "",
    smallestBarcode: "",
    smallestPrice: "",
    smallestCostPrice: "",
    includeSmallestUnitVariant: false,
    additionalUnits: [] as UnitVariantDraft[],
    stock: "0",
    size: "",
    material: "",
    imageUrl: "",
  });

  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [newBrandName, setNewBrandName] = useState("");
  const [unitErrors, setUnitErrors] = useState<Record<string, string>>({});
  const submitting = useRef(false);

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
        description: initialData.description ?? "",
        sku: initialData.sku,
        categoryId: initialData.category?.id || "",
        brandId: initialData.brandId || initialData.brand?.id || "",
        price: initialData.price.toString(),
        costPrice: initialData.costPrice?.toString() || "",
        hargaDinas: initialData.hargaDinas?.toString() || "",
        hargaAgen: initialData.hargaAgen?.toString() || "",
        minStock: initialData.minStock.toString(),
        unit: initialData.unit,
        unitMultiplierToBase: String(initialData.unitMultiplierToBase ?? 1),
        smallestUnit: "pcs",
        smallestSku: "",
        smallestBarcode: "",
        smallestPrice: "",
        smallestCostPrice: "",
        includeSmallestUnitVariant: false,
        additionalUnits: [],
        stock: initialData.stock.toString(),
        size: initialData.size || "",
        material: initialData.material || "",
        imageUrl: initialData.imageUrl || "",
      });
    } else if (isOpen) {
      setFormData({
        name: "",
        description: "",
        sku: "",
        categoryId: categories[0]?.id || "",
        brandId: "",
        price: "",
        costPrice: "",
        hargaDinas: "",
        hargaAgen: "",
        minStock: "5",
        unit: "pcs",
        unitMultiplierToBase: "1",
        smallestUnit: "pcs",
        smallestSku: "",
        smallestBarcode: "",
        smallestPrice: "",
        smallestCostPrice: "",
        includeSmallestUnitVariant: false,
        additionalUnits: [],
        stock: "0",
        size: "",
        material: "",
        imageUrl: "",
      });
    }
    if (isOpen) {
      setNewBrandName("");
      setError(null);
      setUnitErrors({});
    }
  }, [isOpen, initialData, categories]);

  const handleCreateBrand = async () => {
    const name = newBrandName.trim();
    if (!name) {
      setError("Nama merek wajib diisi");
      return;
    }

    try {
      setError(null);
      const brand = await createBrand.mutateAsync({ name });
      setFormData((current) => ({ ...current, brandId: brand.id }));
      setNewBrandName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menambah merek");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting.current || isUploading) return;
    setError(null);
    const errors = productId ? {} : validateUnitDrafts(formData, formData.additionalUnits);
    setUnitErrors(errors);
    const firstInvalid = Object.keys(errors)[0];
    if (firstInvalid) {
      const row = document.getElementById(firstInvalid);
      if (/SKU|harga jual/.test(errors[firstInvalid])) {
        const details = row?.querySelector("details");
        if (details) details.open = true;
      }
      const field = /SKU/.test(errors[firstInvalid]) ? "sku" : /modal/.test(errors[firstInvalid]) ? "cost" : /konversi/.test(errors[firstInvalid]) ? "quantity" : /harga/.test(errors[firstInvalid]) ? "price" : "unit";
      document.getElementById(`${firstInvalid}-${field}`)?.focus();
      return;
    }
    submitting.current = true;

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
    } finally {
      submitting.current = false;
    }
  };

  const isProcessing = createProduct.isPending || updateProduct.isPending || createBrand.isPending || isUploading;
  const regularPrice = productId && initialData ? Number(initialData.price) : Number(formData.price || "0");
  const showHargaDinasWarning =
    formData.hargaDinas.trim() !== "" &&
    Number(formData.hargaDinas) < regularPrice;
  const showHargaAgenWarning =
    formData.hargaAgen.trim() !== "" &&
    Number(formData.hargaAgen) < regularPrice;

  return (
    <Modal open={isOpen} onClose={onClose} title={productId ? "Ubah Produk" : "Tambah Produk"}>
      <form onSubmit={handleSubmit} className="space-y-4 mt-4">
        {error && (
          <div role="alert" className="p-3 rounded-lg bg-red-50 text-red-700 text-sm font-medium border border-red-100">
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
            onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
            required
          />
        </div>

        <div>
          <label htmlFor="inventory-product-description" className="mb-1 block text-sm font-medium text-surface-700">Deskripsi produk <span className="font-normal text-surface-500">(opsional)</span></label>
          <textarea
            id="inventory-product-description"
            rows={3}
            value={formData.description}
            onChange={(event) => setFormData({ ...formData, description: event.target.value })}
            placeholder="Contoh: Kertas A4 80 gsm, isi 500 lembar."
            className="w-full resize-y rounded-xl border border-surface-200 bg-white px-3 py-2 text-sm text-surface-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
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
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">Merek</label>
            <select
              value={formData.brandId}
              onChange={(e) => setFormData({ ...formData, brandId: e.target.value })}
              className="w-full px-3 py-2 bg-white border border-surface-200 rounded-xl focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all outline-none"
            >
              <option value="">Tanpa merek</option>
              {brands.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </select>
            <div className="mt-2 flex gap-2">
              <Input
                placeholder="Tambah merek baru"
                value={newBrandName}
                onChange={(e) => setNewBrandName(e.target.value)}
              />
              <Button
                type="button"
                variant="secondary"
                onClick={handleCreateBrand}
                disabled={createBrand.isPending}
              >
                <Plus className="h-4 w-4" />
                Tambah
              </Button>
            </div>
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
          <div className="space-y-1">
            <Input
              label="Harga Dinas"
              type="number"
              min="0"
              placeholder="Opsional"
              value={formData.hargaDinas}
              onChange={(e) => setFormData({ ...formData, hargaDinas: e.target.value })}
            />
            {showHargaDinasWarning && (
              <p className="text-xs font-medium text-amber-700">
                Harga Dinas lebih rendah dari harga jual.
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Input
              label="Harga Agen"
              type="number"
              min="0"
              placeholder="Opsional"
              value={formData.hargaAgen}
              onChange={(e) => setFormData({ ...formData, hargaAgen: e.target.value })}
            />
            {showHargaAgenWarning && (
              <p className="text-xs font-medium text-amber-700">
                Harga Agen lebih rendah dari harga jual.
              </p>
            )}
          </div>
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
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="product-primary-unit" className="text-sm font-medium text-surface-700">Unit</label>
              {!productId && <UnitSizeBadge role={getProductUnitBadges(formData.additionalUnits)[0]} />}
            </div>
          <Input
            id="product-primary-unit"
            placeholder="pcs, rim, meter, dus"
            value={formData.unit}
            onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
            required
          />
          </div>
          <Input
            label="Stok Saat Ini"
            type="number"
            min="0"
            step="any"
            value={formData.stock}
            onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
            required
          />
        </div>

        {!productId && <ProductUnitFields
          primary={formData} rows={formData.additionalUnits} errors={unitErrors} disabled={isProcessing}
          onChange={(additionalUnits) => setFormData((current) => ({ ...current, additionalUnits }))}
        />}

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
