"use client";

import React, { useState, useEffect } from "react";
import { Modal, Button, Input } from "@pos/ui";
import { useUpdateProduct, useCategories, Product } from "@/hooks/useProducts";

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
  const [stock, setStock] = useState("");
  const [unit, setUnit] = useState("pcs");
  const [categoryId, setCategoryId] = useState("");
  const [size, setSize] = useState("");
  const [material, setMaterial] = useState("");

  useEffect(() => {
    if (product && open) {
      setName(product.name);
      setSku(product.sku);
      setPrice(product.price.toString());
      setStock(product.stock.toString());
      setUnit(product.unit);
      setCategoryId(product.category.id);
      setSize(product.size || "");
      setMaterial(product.material || "");
    }
  }, [product, open]);

  const handleConfirm = async () => {
    if (!product) return;
    if (!name || !sku || !price || !stock || !categoryId) {
      alert("Harap isi semua kolom wajib (Nama, SKU, Harga, Stok, Kategori)");
      return;
    }

    try {
      await updateProduct.mutateAsync({
        id: product.id,
        name,
        sku,
        price: Number(price),
        stock: Number(stock),
        unit,
        categoryId,
        size: size || undefined,
        material: material || undefined,
      });
      onClose();
    } catch (error) {
      console.error("Failed to update product:", error);
      alert("Gagal merubah barang. SKU mungkin sudah ada.");
    }
  };

  if (!product) return null;

  return (
    <Modal open={open} onClose={onClose} title="Edit Barang" size="lg">
      <div className="space-y-4">
        <Input
          label="Nama Barang *"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        
        <div className="grid grid-cols-2 gap-4">
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

        <div className="grid grid-cols-3 gap-4">
          <Input
            label="Harga Jual (Rp) *"
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
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

        <div className="grid grid-cols-2 gap-4">
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
