import React, { useState } from "react";
import { Modal, Button, Input } from "@pos/ui";
import { useUpdateStock, Product } from "@/hooks/useProducts";
import { getDefaultProductImage } from "@/lib/utils";
import { PackagePlus, PackageMinus, Settings2 } from "lucide-react";

interface StockUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product;
}

export default function StockUpdateModal({ isOpen, onClose, product }: StockUpdateModalProps) {
  const updateStock = useUpdateStock();
  const [type, setType] = useState<"IN" | "OUT" | "ADJUSTMENT">("IN");
  const [quantity, setQuantity] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const numQty = Number(quantity);
    if (!numQty || numQty === 0) {
      setError("Quantity must be greater than zero.");
      return;
    }

    if (type === "OUT" && numQty > product.stock) {
      setError(`Cannot remove ${numQty}. Current stock is only ${product.stock}.`);
      return;
    }

    // For adjustments, calculate the delta
    let finalQty = numQty;
    if (type === "ADJUSTMENT") {
      finalQty = numQty - product.stock;
      if (finalQty === 0) {
        setError("New stock is the same as current stock.");
        return;
      }
    }

    try {
      await updateStock.mutateAsync({
        productId: product.id,
        type,
        quantity: type === "ADJUSTMENT" ? finalQty : Math.abs(numQty),
        note,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to update stock");
    }
  };

  const isProcessing = updateStock.isPending;

  return (
    <Modal open={isOpen} onClose={onClose} title="Update Inventory">
      <form onSubmit={handleSubmit} className="mt-4">
        {/* Product Summary */}
        <div className="flex items-center gap-4 p-4 rounded-xl bg-surface-50 border border-surface-200 mb-6">
          <div className="w-12 h-12 rounded-lg bg-white border border-surface-200 flex items-center justify-center text-2xl shrink-0 overflow-hidden">
             <img src={product.imageUrl || getDefaultProductImage(product.category?.name)} alt="" className="w-full h-full object-cover rounded-lg"/>
          </div>
          <div>
            <h4 className="font-semibold text-surface-900">{product.name}</h4>
            <p className="text-sm text-surface-500">
              Current Stock: <strong className="text-surface-900">{product.stock} {product.unit}</strong>
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-600 text-sm font-medium border border-red-100">
            {error}
          </div>
        )}

        {/* Action Type Selection */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <button
            type="button"
            onClick={() => setType("IN")}
            className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${
              type === "IN" 
                ? "border-emerald-500 bg-emerald-50 text-emerald-700" 
                : "border-surface-200 bg-white text-surface-500 hover:border-surface-300"
            }`}
          >
            <PackagePlus className="w-5 h-5 mb-1" />
            <span className="text-xs font-semibold uppercase tracking-wider">Stock In</span>
          </button>
          
          <button
            type="button"
            onClick={() => setType("OUT")}
            className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${
              type === "OUT" 
                ? "border-amber-500 bg-amber-50 text-amber-700" 
                : "border-surface-200 bg-white text-surface-500 hover:border-surface-300"
            }`}
          >
            <PackageMinus className="w-5 h-5 mb-1" />
            <span className="text-xs font-semibold uppercase tracking-wider">Stock Out</span>
          </button>

          <button
            type="button"
            onClick={() => setType("ADJUSTMENT")}
            className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${
              type === "ADJUSTMENT" 
                ? "border-brand-500 bg-brand-50 text-brand-700" 
                : "border-surface-200 bg-white text-surface-500 hover:border-surface-300"
            }`}
          >
            <Settings2 className="w-5 h-5 mb-1" />
            <span className="text-xs font-semibold uppercase tracking-wider">Set Exact</span>
          </button>
        </div>

        <div className="space-y-4">
          <Input
            label={type === "ADJUSTMENT" ? `New Stock Level (${product.unit})` : `Quantity to ${type === "IN" ? "Add" : "Remove"} (${product.unit})`}
            type="number"
            min="1"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            required
            autoFocus
          />

          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">Note (Optional)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={type === "IN" ? "e.g., Supplier delivery" : type === "OUT" ? "e.g., Damaged item" : "Reason for adjustment"}
              rows={2}
              className="w-full px-3 py-2 bg-white border border-surface-200 rounded-xl focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all outline-none resize-none"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-6 mt-6 border-t border-surface-200">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isProcessing}>
            Cancel
          </Button>
          <Button type="submit" disabled={isProcessing}>
            {isProcessing ? "Saving..." : "Confirm Update"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
