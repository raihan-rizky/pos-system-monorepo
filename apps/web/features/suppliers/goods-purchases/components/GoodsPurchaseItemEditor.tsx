"use client";

import { useState } from "react";
import { Button, Modal } from "@pos/ui";
import { hasMasterHppDifference } from "../helpers/goods-purchase-core";
import { useLargeUnitProducts } from "../hooks/useGoodsPurchases";
import type {
  AddGoodsPurchaseItemInput,
  GoodsPurchaseItemRecord,
  LargeUnitProductOption,
} from "../types/goods-purchase";

export function GoodsPurchaseItemEditor({
  item,
  onClose,
  onSave,
  saving,
}: {
  item: GoodsPurchaseItemRecord | null;
  onClose: () => void;
  onSave: (input: AddGoodsPurchaseItemInput) => Promise<void>;
  saving: boolean;
}) {
  const [search, setSearch] = useState("");
  const largeProducts = useLargeUnitProducts(search);
  const [productId, setProductId] = useState(item?.productId ?? "");
  const [quantity, setQuantity] = useState(item?.quantity ?? 1);
  const [latestUnitPrice, setLatestUnitPrice] = useState(
    item?.latestUnitPrice ?? 0,
  );
  const [updateMasterHpp, setUpdateMasterHpp] = useState(
    item?.updateMasterHpp ?? false,
  );

  const availableProducts = (largeProducts.data?.data ?? []).filter(
    (product) =>
      item === null ||
      (item.stockGroupId !== null &&
        product.stockGroupId === item.stockGroupId),
  );
  const currentProduct: LargeUnitProductOption | null = item
    ? {
        id: item.productId,
        name: item.productName,
        sku: item.sku,
        unit: item.unit,
        unitMultiplierToBase: item.unitMultiplierToBase,
        costPrice: item.masterCostPriceSnapshot,
        stockGroupId: item.stockGroupId,
        stockGroupName: null,
      }
    : null;
  const productOptions =
    currentProduct &&
    !availableProducts.some((product) => product.id === currentProduct.id)
      ? [currentProduct, ...availableProducts]
      : availableProducts;
  const productGroups = groupProductOptions(productOptions);
  const selectedOption = productOptions.find(
    (product) => product.id === productId,
  );
  const masterHpp =
    selectedOption?.costPrice ?? item?.masterCostPriceSnapshot ?? null;
  const hppDiffers = hasMasterHppDifference(masterHpp, latestUnitPrice);
  const canSave =
    Boolean(productId) &&
    quantity > 0 &&
    Number.isFinite(quantity) &&
    latestUnitPrice >= 0 &&
    Number.isFinite(latestUnitPrice);

  const selectProduct = (nextProductId: string) => {
    const product = productOptions.find(
      (option) => option.id === nextProductId,
    );
    setProductId(nextProductId);
    setLatestUnitPrice(product?.costPrice ?? 0);
    setUpdateMasterHpp(false);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={item ? "Edit Produk" : "Tambah Produk"}
      size="lg"
    >
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-bold text-slate-700">
            {item ? "Produk dan unit" : "Produk satuan besar"}
          </span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cari produk atau SKU"
            className="mb-2 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"
          />
          <select
            value={productId}
            onChange={(event) => selectProduct(event.target.value)}
            className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"
          >
            <option value="">Pilih produk</option>
            {productGroups.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name} - {product.unit ?? "-"}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">
            {item
              ? "Pergantian unit hanya bisa ke satuan besar dalam grup stok yang sama."
              : "Hanya dus, box, pak, karton, atau varian dengan multiplier lebih dari 1."}
          </p>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <NumberField
            label="Jumlah Produk"
            value={quantity}
            min={0.01}
            onChange={setQuantity}
          />
          <NumberField
            label="Harga Produk Terbaru"
            value={latestUnitPrice}
            min={0}
            onChange={(value) => {
              setLatestUnitPrice(value);
              if (!hasMasterHppDifference(masterHpp, value)) {
                setUpdateMasterHpp(false);
              }
            }}
          />
        </div>
        {hppDiffers && (
          <label className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-900">
            <input
              type="checkbox"
              checked={updateMasterHpp}
              onChange={(event) =>
                setUpdateMasterHpp(event.target.checked)
              }
            />
            Update HPP master ke harga ini saat pembelian disetujui
          </label>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            className="w-full sm:w-auto"
          >
            Tutup
          </Button>
          <Button
            type="button"
            disabled={!canSave}
            loading={saving}
            onClick={() =>
              onSave({
                productId,
                quantity,
                latestUnitPrice,
                updateMasterHpp: hppDiffers && updateMasterHpp,
              })
            }
            className="w-full sm:w-auto"
          >
            Simpan Produk
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function groupProductOptions(products: LargeUnitProductOption[]) {
  const groups = new Map<string, LargeUnitProductOption[]>();
  for (const product of products) {
    const label =
      product.stockGroupName ??
      (product.stockGroupId ? "Varian unit produk" : product.name);
    groups.set(label, [...(groups.get(label) ?? []), product]);
  }
  return [...groups.entries()].map(([label, groupedProducts]) => ({
    label,
    products: groupedProducts,
  }));
}

function NumberField({
  label,
  value,
  min,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  onChange: (value: number) => void;
}) {
  return (
    <label>
      <span className="mb-1 block text-xs font-bold text-slate-600">
        {label}
      </span>
      <input
        type="number"
        min={min}
        step="0.01"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-right font-bold"
      />
    </label>
  );
}
