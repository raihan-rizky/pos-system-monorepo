"use client";

import React, { useState } from "react";
import { Modal, Button, Input } from "@pos/ui";
import { ImageIcon } from "lucide-react";
import { useCreateProduct, useCategories } from "@/hooks/useProducts";

import { getLogger } from "@/lib/logger";

const log = getLogger("ui:AddProductModal");
interface AddProductModalProps {
  open: boolean;
  onClose: () => void;
}

export function AddProductModal({ open, onClose }: AddProductModalProps) {
  const { data: categories = [] } = useCategories();
  const createProduct = useCreateProduct();

  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [unit, setUnit] = useState("pcs");
  const [categoryId, setCategoryId] = useState("");
  const [size, setSize] = useState("");
  const [material, setMaterial] = useState("");

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const url = URL.createObjectURL(file);
      setImagePreview(url);
    }
  };

  const handleConfirm = async () => {
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
      await createProduct.mutateAsync({
        name,
        sku,
        price: Number(price),
        stock: Number(stock),
        unit,
        categoryId,
        size: size || undefined,
        material: material || undefined,
        imageUrl: finalImageUrl,
      });
      // Reset form
      setName("");
      setSku("");
      setPrice("");
      setStock("");
      setUnit("pcs");
      setCategoryId("");
      setSize("");
      setMaterial("");
      setImageFile(null);
      setImagePreview(null);
      setIsUploading(false);
      onClose();
    } catch (error) {
      log.error("Failed to create product:", error);
      alert("Gagal menambahkan barang. SKU mungkin sudah ada.");
      setIsUploading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Tambah Barang Baru" size="lg">
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
              <p className="text-xs text-surface-400 mt-1">Format: JPG, PNG, GIF (Maks. 5MB)</p>
            </div>
          </div>
        </div>

        <Input
          label="Nama Barang *"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Contoh: Kertas HVS A4"
        />
        
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="SKU / Kode *"
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            placeholder="Contoh: HVS-A4-70"
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

        <div className="grid grid-cols-3 gap-4">
          <Input
            label="Harga Jual (Rp) *"
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="0"
          />
          <Input
            label="Stok Awal *"
            type="number"
            value={stock}
            onChange={(e) => setStock(e.target.value)}
            placeholder="0"
          />
          <Input
            label="Satuan Unit *"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="pcs, rim, meter"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Ukuran (Opsional)"
            value={size}
            onChange={(e) => setSize(e.target.value)}
            placeholder="Contoh: A4, 3x2m"
          />
          <Input
            label="Bahan / Material (Opsional)"
            value={material}
            onChange={(e) => setMaterial(e.target.value)}
            placeholder="Contoh: Flexi 280gr"
          />
        </div>

        <div className="flex gap-3 pt-4">
          <Button variant="secondary" onClick={onClose} className="flex-1">
            Batal
          </Button>
          <Button
            variant="accent"
            onClick={handleConfirm}
            loading={createProduct.isPending}
            className="flex-1"
          >
            Simpan Barang
          </Button>
        </div>
      </div>
    </Modal>
  );
}
