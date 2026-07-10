"use client";

import React, { useState, useEffect } from "react";
import { Modal, Button, Input } from "@pos/ui";
import { ImageIcon } from "lucide-react";
import { useUpdateProduct, useCategories, Product } from "@/hooks/useProducts";
import type { ProductCartItem } from "@/hooks/useCart";

import { getLogger } from "@/lib/logger";

const log = getLogger("ui:EditProductModal");
interface EditProductModalProps {
  open: boolean;
  onClose: () => void;
  product: Product | null;
}

export function EditProductModal({ open, onClose, product }: EditProductModalProps) {
  const { data: categories = [] } = useCategories();
  const updateProduct = useUpdateProduct();

  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [price, setPrice] = useState("");
  const [hargaDinas, setHargaDinas] = useState("");
  const [hargaAgen, setHargaAgen] = useState("");
  const [stock, setStock] = useState("");
  const [unit, setUnit] = useState("pcs");
  const [categoryId, setCategoryId] = useState("");
  const [size, setSize] = useState("");
  const [material, setMaterial] = useState("");

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (product && open) {
      setName(product.name);
      setSku(product.sku);
      setPrice(product.price.toString());
      setHargaDinas(product.hargaDinas == null ? "" : product.hargaDinas.toString());
      setHargaAgen(product.hargaAgen == null ? "" : product.hargaAgen.toString());
      setStock(product.stock.toString());
      setUnit(product.unit);
      setCategoryId(product.category.id);
      setSize(product.size || "");
      setMaterial(product.material || "");
      setImagePreview(product.imageUrl || null);
      setImageFile(null);
    }
  }, [product, open]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const url = URL.createObjectURL(file);
      setImagePreview(url);
    }
  };

  const handleConfirm = async () => {
    if (!product) return;
    if (!name || !sku || !price || !stock || !categoryId) {
      alert("Harap isi semua kolom wajib (Nama, SKU, Harga, Stok, Kategori)");
      return;
    }

    setIsUploading(true);
    let finalImageUrl = undefined;

    if (imageFile) {
      try {
        const formData = new FormData();
        formData.append("file", imageFile);
        const uploadRes = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        if (uploadRes.ok) {
          const data = await uploadRes.json();
          finalImageUrl = data.url;
        } else {
          alert("Gagal mengupload gambar.");
          setIsUploading(false);
          return;
        }
      } catch (err) {
        log.error("Upload failed", err);
        alert("Terjadi kesalahan saat mengupload gambar.");
        setIsUploading(false);
        return;
      }
    }

    try {
      const parsedHargaDinas = hargaDinas.trim() ? Number(hargaDinas) : null;
      const parsedHargaAgen = hargaAgen.trim() ? Number(hargaAgen) : null;
      await updateProduct.mutateAsync({
        id: product.id,
        name,
        sku,
        price: Number(price),
        hargaDinas: parsedHargaDinas,
        hargaAgen: parsedHargaAgen,
        stock: Number(stock),
        unit,
        categoryId,
        size: size || undefined,
        material: material || undefined,
        imageUrl: finalImageUrl, // Will be undefined if no new image was uploaded, so Prisma ignores it
      });
      setIsUploading(false);
      onClose();
    } catch (error) {
      log.error("Failed to update product:", error);
      alert("Gagal merubah barang. SKU mungkin sudah ada.");
      setIsUploading(false);
    }
  };

  if (!product) return null;

  return (
    <Modal open={open} onClose={onClose} title="Ubah Barang" size="lg">
      <div className="space-y-4">
        {/* Image Upload */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-surface-700">Gambar Produk</label>
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 bg-surface-100 rounded-xl overflow-hidden flex items-center justify-center border border-surface-200 shrink-0">
              {imagePreview ? (
                <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
              ) : (
                <ImageIcon className="h-6 w-6 text-surface-400" strokeWidth={1.5} aria-hidden="true" />
              )}
            </div>
            <div className="flex-1">
              <input
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="w-full text-sm text-surface-600 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-brand-50 file:text-brand-600 hover:file:bg-brand-100 transition-colors"
              />
              <p className="text-xs text-surface-400 mt-1">Format: JPG, PNG, GIF (Maks. 5MB). Biarkan kosong jika tidak ingin mengubah gambar.</p>
            </div>
          </div>
        </div>

        <Input
          label="Nama Barang *"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="SKU / Kode *"
            value={sku}
            onChange={(e) => setSku(e.target.value)}
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-surface-700">
              Kategori *
            </label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-white border border-surface-200 text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400 hover:border-surface-300"
            >
              <option value="">Pilih Kategori</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Harga Jual (Rp) *"
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
          <div className="space-y-1">
            <Input
              label="Harga Dinas (Opsional)"
              type="number"
              value={hargaDinas}
              onChange={(e) => setHargaDinas(e.target.value)}
            />
            {hargaDinas.trim() && Number(hargaDinas) < Number(price || 0) && (
              <p className="text-xs font-medium text-amber-700">
                Harga Dinas lebih rendah dari harga jual.
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Input
              label="Harga Agen (Opsional)"
              type="number"
              value={hargaAgen}
              onChange={(e) => setHargaAgen(e.target.value)}
            />
            {hargaAgen.trim() && Number(hargaAgen) < Number(price || 0) && (
              <p className="text-xs font-medium text-amber-700">
                Harga Agen lebih rendah dari harga jual.
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Stok *"
            type="number"
            value={stock}
            onChange={(e) => setStock(e.target.value)}
          />
          <Input
            label="Satuan Unit *"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Ukuran (Opsional)"
            value={size}
            onChange={(e) => setSize(e.target.value)}
          />
          <Input
            label="Bahan / Material (Opsional)"
            value={material}
            onChange={(e) => setMaterial(e.target.value)}
          />
        </div>

        <div className="flex gap-3 pt-4">
          <Button variant="secondary" onClick={onClose} className="flex-1">
            Batal
          </Button>
          <Button
            variant="accent"
            onClick={handleConfirm}
            loading={updateProduct.isPending}
            className="flex-1"
          >
            Simpan Perubahan
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export type PosProductGroupUpdate = {
  name: string;
  categoryId: string;
  brandId: string | null;
};

interface PosProductQuickEditModalProps {
  open: boolean;
  item: ProductCartItem | null;
  categories: Array<{ id: string; name: string }>;
  brands: Array<{ id: string; name: string }>;
  onClose: () => void;
  onSave: (input: PosProductGroupUpdate) => void | Promise<void>;
}

export function PosProductQuickEditModal({
  open,
  item,
  categories,
  brands,
  onClose,
  onSave,
}: PosProductQuickEditModalProps) {
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open || !item) return;
    setName(item.name);
    setCategoryId(item.categoryId);
    setBrandId(item.brandId ?? "");
    setError(null);
  }, [item, open]);

  const handleSave = async () => {
    if (!item) return;
    if (!name.trim()) {
      setError("Nama Produk wajib diisi.");
      return;
    }
    if (!categoryId) {
      setError("Kategori wajib dipilih.");
      return;
    }

    setError(null);
    setIsSaving(true);
    try {
      await onSave({
        name: name.trim(),
        categoryId,
        brandId: brandId || null,
      });
      onClose();
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Gagal mengubah produk.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (!item) return null;

  return (
    <Modal open={open} onClose={onClose} title="Ubah Produk">
      <div className="mt-4 space-y-4">
        <div className="rounded-xl border border-brand-100 bg-brand-50 px-4 py-3 text-xs font-medium text-brand-800">
          Perubahan Nama, Kategori, dan Merek berlaku untuk seluruh varian produk ini.
        </div>

        {error && (
          <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm font-medium text-red-600" role="alert">
            {error}
          </div>
        )}

        <Input
          label="Nama Produk"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-surface-700">Kategori</label>
          <select
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            className="w-full rounded-xl border border-surface-200 bg-white px-4 py-2.5 text-surface-900 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-400"
          >
            <option value="">Pilih Kategori</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-surface-700">Merek</label>
          <select
            value={brandId}
            onChange={(event) => setBrandId(event.target.value)}
            className="w-full rounded-xl border border-surface-200 bg-white px-4 py-2.5 text-surface-900 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-400"
          >
            <option value="">Tanpa merek</option>
            {brands.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex justify-end gap-3 border-t border-surface-200 pt-5">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSaving}>
            Batal
          </Button>
          <Button type="button" onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Menyimpan..." : "Simpan Perubahan"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
