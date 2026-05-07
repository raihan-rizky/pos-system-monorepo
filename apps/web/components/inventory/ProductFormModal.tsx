import React, { useState, useEffect } from "react";
import { Modal, Button, Input } from "@pos/ui";
import { Upload, X, RefreshCw } from "lucide-react";
import { useCreateProduct, useUpdateProduct, Product } from "@/hooks/useProducts";
import { z } from "zod";

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
        throw new Error(data.message || "Upload failed");
      }

      const { url } = await res.json();
      setFormData(prev => ({ ...prev, imageUrl: url }));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to upload image");
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
      const payload = {
        ...formData,
        price: Number(formData.price),
        costPrice: formData.costPrice ? Number(formData.costPrice) : undefined,
        minStock: Number(formData.minStock),
        stock: Number(formData.stock),
      };

      if (productId) {
        await updateProduct.mutateAsync({ id: productId, ...payload });
      } else {
        await createProduct.mutateAsync(payload);
      }
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  };

  const isProcessing = createProduct.isPending || updateProduct.isPending;

  return (
    <Modal open={isOpen} onClose={onClose} title={productId ? "Edit Product" : "Add New Product"}>
      <form onSubmit={handleSubmit} className="space-y-4 mt-4">
        {error && (
          <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm font-medium border border-red-100">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Product Name"
            placeholder="e.g. Banner Flexi 280gsm"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
          />
          <Input
            label="SKU / Item Code"
            placeholder="e.g. BNR-FLX-280"
            value={formData.sku}
            onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">Category</label>
            <select
              value={formData.categoryId}
              onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
              className="w-full px-3 py-2 bg-white border border-surface-200 rounded-xl focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all outline-none"
              required
            >
              <option value="" disabled>Select Category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <Input
            label="Selling Price (IDR)"
            type="number"
            min="0"
            value={formData.price}
            onChange={(e) => setFormData({ ...formData, price: e.target.value })}
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Cost Price (HPP)"
            type="number"
            min="0"
            placeholder="Optional"
            value={formData.costPrice}
            onChange={(e) => setFormData({ ...formData, costPrice: e.target.value })}
          />
          <Input
            label="Unit"
            placeholder="pcs, rim, meter, box"
            value={formData.unit}
            onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
            required
          />
          <Input
            label="Current Stock"
            type="number"
            min="0"
            value={formData.stock}
            onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Min Stock Alert"
            type="number"
            min="0"
            value={formData.minStock}
            onChange={(e) => setFormData({ ...formData, minStock: e.target.value })}
            required
          />
          <Input
            label="Size / Dimensions"
            placeholder="Optional"
            value={formData.size}
            onChange={(e) => setFormData({ ...formData, size: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-1 gap-4">
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-2">Product Image</label>
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
                    title="Upload Image"
                  />
                </div>
              )}
              <div className="flex-1 text-xs text-surface-500 space-y-0.5">
                <p className="font-semibold text-surface-700 text-sm">Upload Product Image</p>
                <p>Upload a square image (JPG, PNG, WebP) up to 5MB.</p>
                <p className="opacity-75">If skipped, the category icon will be used.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-6 border-t border-surface-200">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isProcessing}>
            Cancel
          </Button>
          <Button type="submit" disabled={isProcessing}>
            {isProcessing ? "Saving..." : "Save Product"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
