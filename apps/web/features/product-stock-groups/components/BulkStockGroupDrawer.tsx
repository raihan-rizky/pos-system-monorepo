"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import {
  fetchStockGroupDetail,
  type StockGroupDetail,
  type StockGroupOption,
} from "../api/stock-group-api";
import {
  buildGroupCreationPreview,
  creationMembers,
  initialCreationQuantities,
  rebaseCreationQuantities,
  targetBaseProduct,
} from "../group-creation-preview";

export interface BulkStockGroupProduct {
  id: string;
  name: string;
  sku: string;
  unit: string;
  stock: number;
  unitMultiplierToBase?: number | null;
  stockGroupId?: string | null;
  stockGroup?: {
    id?: string;
    displayName?: string;
    baseUnit?: string | null;
  } | null;
}

interface BulkStockGroupDrawerProps {
  open: boolean;
  products: BulkStockGroupProduct[];
  onClose: () => void;
  onSaved: () => void;
}

const stages = ["Tujuan grup", "Satuan dan stok", "Tinjau dan simpan"];
const fieldClass =
  "mt-1 min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600";
const buttonClass =
  "min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-50";
const number = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    ...(value !== 0 && Math.abs(value) < 0.0001
      ? { maximumSignificantDigits: 4 }
      : { maximumFractionDigits: 4 }),
  }).format(value);

function CreationDialog({
  products: selectedProducts,
  onClose,
  onSaved,
}: Omit<BulkStockGroupDrawerProps, "open">) {
  const [products, setProducts] = useState(selectedProducts);
  const [step, setStep] = useState(0);
  const [targetMode, setTargetMode] = useState<"new" | "existing">("new");
  const [displayName, setDisplayName] = useState(products[0]?.name ?? "");
  const [targetGroupId, setTargetGroupId] = useState("");
  const [sourceProductId, setSourceProductId] = useState(products[0]?.id ?? "");
  const [quantities, setQuantities] = useState(() =>
    initialCreationQuantities(products, products[0]?.id ?? ""),
  );
  const [note, setNote] = useState("");
  const [groups, setGroups] = useState<StockGroupOption[]>([]);
  const [target, setTarget] = useState<StockGroupDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [reloadMessage, setReloadMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  const savingRef = useRef(false);
  const refreshController = useRef<AbortController | null>(null);
  const closeFocus = useRef<HTMLElement | null>(null);
  const initialQuantities = useRef(
    initialCreationQuantities(products, products[0]?.id ?? ""),
  );
  const dirty =
    displayName !== (products[0]?.name ?? "") ||
    note !== "" ||
    (targetMode === "new"
      ? sourceProductId !== (products[0]?.id ?? "") ||
        JSON.stringify(quantities) !== JSON.stringify(initialQuantities.current)
      : products.some(
          (product) =>
            quantities[product.id] !== undefined &&
            quantities[product.id] !==
              (target?.variants
                .find((member) => member.id === product.id)
                ?.unitMultiplierToBase.toString() ?? ""),
        ));
  const members = useMemo(
    () => creationMembers(products, targetMode === "existing" ? target : null),
    [products, target, targetMode],
  );
  const source = members.find((product) => product.id === sourceProductId);
  const preview = useMemo(
    () =>
      buildGroupCreationPreview({
        products,
        target: targetMode === "existing" ? target : null,
        sourceProductId,
        quantities,
      }),
    [products, quantities, sourceProductId, target, targetMode],
  );

  useEffect(() => {
    const trigger =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => {
      refreshController.current?.abort();
      dialog?.close();
      trigger?.focus();
    };
  }, []);

  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);
  useEffect(() => {
    if (confirmClose) continueRef.current?.focus();
  }, [confirmClose]);

  useEffect(() => {
    if (targetMode !== "existing") return;
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    setTarget(null);
    const load = targetGroupId
      ? fetchStockGroupDetail(targetGroupId, controller.signal)
      : fetch("/api/product-stock-groups?limit=100", {
          signal: controller.signal,
        }).then(async (response) => {
          if (!response.ok) throw new Error("Gagal memuat grup stok");
          const body = await response.json();
          return (body.data ?? []) as StockGroupOption[];
        });
    load
      .then((body) => {
        if (controller.signal.aborted) return;
        if (targetGroupId) {
          const detail = body as StockGroupDetail;
          setTarget(detail);
          const base = targetBaseProduct(detail);
          setSourceProductId(base?.id ?? "");
          setQuantities((current) =>
            Object.fromEntries(
              selectedProducts
                .filter((product) => product.id !== base?.id)
                .map((product) => [
                  product.id,
                  detail.variants
                    .find((member) => member.id === product.id)
                    ?.unitMultiplierToBase.toString() ??
                    current[product.id] ??
                    "",
                ]),
            ),
          );
        } else setGroups(body as StockGroupOption[]);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setLoadError(
            targetGroupId
              ? "Gagal memuat detail grup tujuan"
              : "Gagal memuat grup stok",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [targetGroupId, targetMode, retry, selectedProducts]);

  function changeMode(mode: "new" | "existing") {
    if (mode === targetMode) return;
    setTargetMode(mode);
    setErrors({});
    if (!conflict) setError(null);
    setLoadError(null);
    setLoading(false);
    if (mode === "new") {
      setSourceProductId(products[0]?.id ?? "");
      setQuantities(initialCreationQuantities(products, products[0]?.id ?? ""));
    } else setQuantities({});
  }

  function changeTarget(id: string) {
    setTargetGroupId(id);
    setTarget(null);
    setQuantities({});
    setErrors({});
    if (!conflict) setError(null);
  }

  function focusError(nextErrors: Record<string, string>) {
    setErrors(nextErrors);
    requestAnimationFrame(() => {
      const first = Object.keys(nextErrors)[0];
      const field = dialogRef.current?.querySelector<HTMLElement>(
        `[data-error-key="${CSS.escape(first)}"]`,
      );
      (field ?? headingRef.current)?.focus();
    });
  }

  function next() {
    if (step === 0) {
      if (products.length < 2)
        return focusError({
          group: "Pilih minimal dua produk dengan satuan berbeda.",
        });
      if (targetMode === "new" && !displayName.trim())
        return focusError({ name: "Isi nama grup agar mudah ditemukan." });
      if (targetMode === "existing") {
        if (!targetGroupId)
          return focusError({
            destination: "Pilih grup tujuan terlebih dahulu.",
          });
        if (loading || loadError || !target)
          return focusError({
            destination: "Tunggu detail grup selesai dimuat atau coba lagi.",
          });
        if (!targetBaseProduct(target))
          return focusError({
            destination:
              "Satuan acuan grup tujuan belum sesuai. Tinjau Satuan di grup tersebut sebelum menggabungkan.",
          });
      }
    } else if (Object.keys(preview.errors).length)
      return focusError(preview.errors);
    setErrors({});
    setStep(step + 1);
  }

  function requestClose() {
    if (savingRef.current) return;
    if (!dirty) return onClose();
    closeFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setConfirmClose(true);
  }

  async function refreshData() {
    if (refreshController.current) return;
    const controller = new AbortController();
    refreshController.current = controller;
    setIsRefreshing(true);
    setReloadMessage(null);
    try {
      const [currentProducts, currentTarget] = await Promise.all([
        Promise.all(
          products.map(async (product) => {
            const response = await fetch(
              `/api/products/${encodeURIComponent(product.id)}`,
              { signal: controller.signal },
            );
            if (!response.ok)
              throw new Error(
                "Gagal memuat ulang produk. Draft Anda tetap tersimpan.",
              );
            const body = await response.json();
            const current = body.data as BulkStockGroupProduct | undefined;
            if (
              !current ||
              current.id !== product.id ||
              !Number.isFinite(current.stock) ||
              typeof current.unit !== "string"
            ) {
              throw new Error(
                "Gagal memuat ulang produk. Draft Anda tetap tersimpan.",
              );
            }
            return current;
          }),
        ),
        targetMode === "existing"
          ? fetchStockGroupDetail(targetGroupId, controller.signal)
          : Promise.resolve(null),
      ]);
      if (controller.signal.aborted) return;
      const sourceUnit = source?.unit;
      const nextSource = currentTarget
        ? targetBaseProduct(currentTarget)
        : currentProducts.find((product) => product.id === sourceProductId);
      const sourceUnitChanged = sourceUnit !== nextSource?.unit;
      const changedIds = new Set(
        currentProducts
          .filter(
            (product) =>
              products.find((old) => old.id === product.id)?.unit !==
              product.unit,
          )
          .map((product) => product.id),
      );
      setQuantities((current) =>
        Object.fromEntries(
          currentProducts
            .filter((product) => product.id !== nextSource?.id)
            .map((product) => [
              product.id,
              currentTarget?.variants
                .find((member) => member.id === product.id)
                ?.unitMultiplierToBase.toString() ??
                (sourceUnitChanged || changedIds.has(product.id)
                  ? ""
                  : (current[product.id] ?? "")),
            ]),
        ),
      );
      setProducts(currentProducts);
      if (currentTarget) setTarget(currentTarget);
      setSourceProductId(nextSource?.id ?? "");
      setErrors({});
      setError(null);
      setConflict(false);
      setStep(1);
      setReloadMessage(
        sourceUnitChanged || changedIds.size
          ? "Data terbaru dimuat. Satuan berubah; isi ulang konversi yang dikosongkan sebelum melanjutkan."
          : "Data terbaru dimuat. Periksa kembali stok dan konversi sebelum menyimpan.",
      );
      requestAnimationFrame(() => headingRef.current?.focus());
    } catch (reason) {
      if (!controller.signal.aborted)
        setReloadMessage(
          reason instanceof Error
            ? reason.message
            : "Gagal memuat ulang data. Draft Anda tetap tersimpan.",
        );
    } finally {
      if (refreshController.current === controller)
        refreshController.current = null;
      if (!controller.signal.aborted) setIsRefreshing(false);
    }
  }

  function keepEditing() {
    setConfirmClose(false);
    requestAnimationFrame(() => {
      if (closeFocus.current?.isConnected) closeFocus.current.focus();
      else headingRef.current?.focus();
    });
  }

  async function submit() {
    if (
      savingRef.current ||
      conflict ||
      isRefreshing ||
      Object.keys(preview.errors).length ||
      (targetMode === "existing" && (!target || loading || loadError))
    )
      return;
    savingRef.current = true;
    setIsSaving(true);
    setError(null);
    setConflict(false);
    try {
      const response = await fetch(
        targetMode === "new"
          ? "/api/product-stock-groups"
          : `/api/product-stock-groups/${targetGroupId}/products`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(targetMode === "new"
              ? {
                  displayName: displayName.trim(),
                  baseUnit: source?.unit ?? "pcs",
                }
              : {}),
            sourceProductId,
            sharedStock: source?.stock ?? 0,
            stockInput: { mode: "VARIANT", variantProductId: sourceProductId },
            conversionPairs: preview.conversionPairs,
            products: products.map((product) => ({ productId: product.id })),
            note: note.trim() || undefined,
          }),
        },
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setConflict(response.status === 409);
        throw new Error(
          payload.message || "Gagal menyimpan grup stok. Coba simpan lagi.",
        );
      }
      onSaved();
      onClose();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Gagal menyimpan grup stok. Coba simpan lagi.",
      );
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="creation-title"
      onCancel={(event) => {
        event.preventDefault();
        if (confirmClose) keepEditing();
        else requestClose();
      }}
      className="m-0 ml-auto h-dvh max-h-dvh w-full max-w-xl overflow-hidden border-0 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-950/40"
    >
      <div className="flex h-full min-h-0 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
          <div className="min-w-0">
            <h2 id="creation-title" className="text-lg font-bold">
              Buat atau gabungkan grup stok
            </h2>
            <p className="text-sm text-slate-600">
              {products.length} produk dipilih
            </p>
          </div>
          <button
            type="button"
            aria-label="Tutup"
            disabled={isSaving}
            onClick={requestClose}
            className={`${buttonClass} flex min-w-11 items-center justify-center`}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>
        <ol
          aria-label="Tahapan grup stok"
          className="grid grid-cols-3 gap-2 border-b border-slate-200 px-5 py-3 text-xs"
        >
          {stages.map((label, index) => (
            <li
              key={label}
              aria-current={step === index ? "step" : undefined}
              className={
                step === index ? "font-bold text-blue-700" : "text-slate-600"
              }
            >
              {index + 1}. {label}
            </li>
          ))}
        </ol>
        {confirmClose ? (
          <div
            className="flex-1 overflow-y-auto p-5"
            role="alertdialog"
            aria-labelledby="discard-title"
            aria-describedby="discard-description"
          >
            <h3 id="discard-title" className="font-bold">
              Buang perubahan?
            </h3>
            <p id="discard-description" className="mt-2 text-sm text-slate-600">
              Input Anda belum disimpan. Anda bisa melanjutkan mengedit atau
              membuang perubahan ini.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                ref={continueRef}
                type="button"
                onClick={keepEditing}
                className={buttonClass}
              >
                Lanjutkan mengedit
              </button>
              <button type="button" onClick={onClose} className={buttonClass}>
                Buang perubahan
              </button>
            </div>
          </div>
        ) : (
          <>
            <form
              id="creation-form"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                if (step < 2) next();
                else void submit();
              }}
              className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5"
            >
              <h3
                ref={headingRef}
                tabIndex={-1}
                className="text-base font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
              >
                {stages[step]}
              </h3>
              {reloadMessage && (
                <p role="status" className="text-sm text-slate-700">
                  {reloadMessage}
                </p>
              )}
              {step === 0 && (
                <>
                  <p className="text-sm text-slate-600">
                    Pilih tujuan untuk produk dengan satuan berbeda. Semua
                    satuan akan memakai persediaan yang sama.
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    {(["new", "existing"] as const).map((mode) => (
                      <button
                        type="button"
                        key={mode}
                        aria-pressed={targetMode === mode}
                        onClick={() => changeMode(mode)}
                        className={`${buttonClass} flex-1 ${targetMode === mode ? "border-blue-600 bg-blue-50 text-blue-800" : "text-slate-700"}`}
                      >
                        {mode === "new"
                          ? "Buat grup baru"
                          : "Gabungkan ke grup yang ada"}
                      </button>
                    ))}
                  </div>
                  {targetMode === "new" ? (
                    <div className="text-sm font-semibold">
                      <label htmlFor="creation-name">Nama grup</label>
                      <input
                        id="creation-name"
                        required
                        data-error-key="name"
                        value={displayName}
                        onChange={(event) => setDisplayName(event.target.value)}
                        aria-invalid={!!errors.name}
                        aria-describedby={
                          errors.name ? "error-name" : undefined
                        }
                        className={fieldClass}
                      />
                      {errors.name && (
                        <span
                          id="error-name"
                          className="mt-1 block text-sm text-red-700"
                        >
                          {errors.name}
                        </span>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="text-sm font-semibold">
                        <label htmlFor="creation-destination">
                          Grup tujuan
                        </label>
                        <select
                          id="creation-destination"
                          data-error-key="destination"
                          required
                          value={targetGroupId}
                          onChange={(event) => changeTarget(event.target.value)}
                          aria-invalid={!!errors.destination}
                          aria-describedby={
                            errors.destination ? "error-destination" : undefined
                          }
                          className={fieldClass}
                        >
                          <option value="">Pilih grup</option>
                          {groups.map((group) => (
                            <option key={group.id} value={group.id}>
                              {group.displayName} ({group.variantCount} satuan)
                            </option>
                          ))}
                        </select>
                      </div>
                      {errors.destination && (
                        <p
                          id="error-destination"
                          className="text-sm text-red-700"
                        >
                          {errors.destination}
                        </p>
                      )}
                      {loading && (
                        <p role="status" className="text-sm text-slate-600">
                          Memuat grup tujuan...
                        </p>
                      )}
                      {loadError && (
                        <div role="alert">
                          <p className="text-sm text-red-700">{loadError}</p>
                          <button
                            type="button"
                            onClick={() => setRetry((value) => value + 1)}
                            className={`${buttonClass} mt-2`}
                          >
                            Coba lagi
                          </button>
                        </div>
                      )}
                      {!loading &&
                        !loadError &&
                        !groups.length &&
                        !targetGroupId && (
                          <p className="text-sm text-slate-600">
                            Belum ada grup stok. Pilih Buat grup baru untuk
                            memulai.
                          </p>
                        )}
                      {target && (
                        <div className="space-y-2 border-l-2 border-blue-600 pl-3">
                          <p className="font-semibold">{target.displayName}</p>
                          <p className="text-sm">
                            Satuan acuan: {target.baseUnit}
                          </p>
                          <p className="text-sm">
                            {target.variants.length} anggota • Stok bersama:{" "}
                            {number(target.baseStock)} {target.baseUnit}
                          </p>
                          <ul className="space-y-1 text-sm text-slate-600">
                            {target.variants.map((member) => (
                              <li key={member.id}>
                                {member.name} ({member.unit})
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
              {step === 1 && (
                <>
                  {targetMode === "new" ? (
                    <div className="text-sm font-semibold">
                      <label htmlFor="creation-source">Sumber stok</label>
                      <select
                        id="creation-source"
                        data-error-key="source"
                        value={sourceProductId}
                        onChange={(event) => {
                          const id = event.target.value;
                          setQuantities((current) =>
                            rebaseCreationQuantities(
                              members,
                              sourceProductId,
                              id,
                              current,
                            ),
                          );
                          setSourceProductId(id);
                          setErrors({});
                        }}
                        className={fieldClass}
                        aria-invalid={!!errors.source}
                        aria-describedby={`source-help${errors.source ? " error-source" : ""}`}
                      >
                        {products.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.name} ({number(product.stock)}{" "}
                            {product.unit})
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="border-l-2 border-blue-600 pl-3">
                      <p className="font-semibold">
                        Stok mengikuti grup tujuan
                      </p>
                      <p className="text-sm">
                        Sumber stok: {source?.name} (
                        {number(source?.stock ?? 0)} {source?.unit})
                      </p>
                    </div>
                  )}
                  <p id="source-help" className="text-sm text-slate-600">
                    {targetMode === "new"
                      ? "Stok bersama mengikuti produk sumber yang Anda pilih. Stok semua produk tidak dijumlahkan."
                      : "Stok bersama mengikuti satuan acuan grup tujuan. Stok produk yang masuk tidak ditambahkan."}
                  </p>
                  {errors.source && (
                    <p id="error-source" className="text-sm text-red-700">
                      {errors.source}
                    </p>
                  )}
                  {members.map((product) => {
                    const old =
                      targetMode === "existing" &&
                      target?.variants.find(
                        (member) => member.id === product.id,
                      );
                    const productError = errors[product.id];
                    const groupId =
                      product.stockGroupId ?? product.stockGroup?.id;
                    return (
                      <div
                        key={product.id}
                        className="space-y-2 border-b border-slate-200 pb-4"
                      >
                        <p className="font-semibold">{product.name}</p>
                        <p className="break-words text-xs text-slate-600">
                          {product.sku} • {product.unit} • Stok sekarang:{" "}
                          {number(product.stock)} {product.unit}
                        </p>
                        {(groupId || product.stockGroup) &&
                          (targetMode === "new" ||
                            (groupId && groupId !== targetGroupId)) && (
                            <p className="text-sm text-amber-800">
                              Produk ini akan berpindah dari{" "}
                              {product.stockGroup?.displayName
                                ? `grup ${product.stockGroup.displayName}`
                                : "grup stok sebelumnya"}
                              . Stok grup sebelumnya tidak ditambahkan.
                            </p>
                          )}
                        {product.id === sourceProductId ? (
                          <p className="text-sm text-slate-600">
                            Sumber stok • 1 {product.unit} = 1 {product.unit}
                          </p>
                        ) : old ? (
                          <p className="text-sm text-slate-600">
                            Anggota grup tujuan • 1 {product.unit} ={" "}
                            {number(old.unitMultiplierToBase)} {source?.unit}
                          </p>
                        ) : (
                          <label className="block text-sm font-semibold">
                            1 {product.unit} =
                            <input
                              aria-label={`Konversi ${product.name}`}
                              required
                              type="number"
                              min="0"
                              step="any"
                              inputMode="decimal"
                              data-error-key={product.id}
                              value={quantities[product.id] ?? ""}
                              onChange={(event) =>
                                setQuantities((current) => ({
                                  ...current,
                                  [product.id]: event.target.value,
                                }))
                              }
                              aria-invalid={!!productError}
                              aria-describedby={`quantity-help-${product.id}${productError ? ` error-${product.id}` : ""}`}
                              className={fieldClass}
                            />
                            <span
                              id={`quantity-help-${product.id}`}
                              className="mt-1 block font-normal text-slate-600"
                            >
                              {source?.unit} dalam 1 {product.unit}
                            </span>
                          </label>
                        )}
                        {productError && (
                          <p
                            id={`error-${product.id}`}
                            className="text-sm text-red-700"
                          >
                            {productError}
                          </p>
                        )}
                      </div>
                    );
                  })}
                  <label className="block text-sm font-semibold">
                    Catatan (opsional)
                    <textarea
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      className={`${fieldClass} min-h-20`}
                    />
                  </label>
                </>
              )}
              {step === 2 && (
                <>
                  <div className="space-y-1 border-l-2 border-blue-600 pl-3">
                    <p className="font-semibold">
                      {targetMode === "new" ? displayName : target?.displayName}
                    </p>
                    <p className="text-sm">
                      Sumber stok: {source?.name} • {number(source?.stock ?? 0)}{" "}
                      {source?.unit}
                    </p>
                    <p className="text-sm">
                      Stok bersama: {number(preview.baseStock ?? 0)}{" "}
                      {preview.baseUnit} • {preview.rows.length} satuan
                    </p>
                  </div>
                  <p className="text-sm text-slate-600">
                    Stok tiap satuan adalah hasil konversi, bukan stok tambahan.
                    Server memvalidasi data terkini saat menyimpan.
                  </p>
                  {preview.rows.some((row) => row.changed) && (
                    <p className="text-sm font-semibold text-amber-800">
                      Stok beberapa produk akan berubah sesuai hasil konversi di
                      bawah.
                    </p>
                  )}
                  <ul className="space-y-4">
                    {preview.rows.map((row) => (
                      <li
                        key={row.id}
                        className="space-y-1 border-b border-slate-200 pb-3"
                      >
                        <p className="font-semibold">
                          {row.name} ({row.unit})
                        </p>
                        <p className="text-sm text-slate-600">
                          1 {row.unit} = {number(row.quantity)} {source?.unit}
                        </p>
                        <p className="text-sm">
                          Sekarang: {number(row.before)} {row.unit}
                        </p>
                        <p className="text-sm font-semibold">
                          Setelah disimpan: {number(row.after)} {row.unit}
                        </p>
                      </li>
                    ))}
                  </ul>
                  {note && (
                    <p className="break-words text-sm text-slate-600">
                      Catatan: {note}
                    </p>
                  )}
                </>
              )}
              {errors.group && (
                <p role="alert" className="text-sm text-red-700">
                  {errors.group}
                </p>
              )}
              {error && (
                <div role="alert" className="space-y-2 text-sm text-red-700">
                  <p>{error}</p>
                  {conflict && (
                    <>
                      <p>
                        Data berubah sejak dimuat. Draft tetap tersimpan. Muat
                        ulang data, lalu tinjau stok dan konversi sebelum
                        mencoba lagi.
                      </p>
                      <button
                        type="button"
                        disabled={isRefreshing}
                        onClick={() => void refreshData()}
                        className={buttonClass}
                      >
                        {isRefreshing
                          ? "Memuat ulang..."
                          : "Muat ulang data dan tinjau konversi"}
                      </button>
                    </>
                  )}
                </div>
              )}
            </form>
            <footer className="flex gap-3 border-t border-slate-200 bg-white px-5 py-4">
              {step > 0 && (
                <button
                  type="button"
                  disabled={isSaving || isRefreshing}
                  onClick={() => {
                    setErrors({});
                    setStep(step - 1);
                  }}
                  className={buttonClass}
                >
                  Kembali
                </button>
              )}
              <button
                type="submit"
                form="creation-form"
                disabled={
                  isSaving ||
                  isRefreshing ||
                  (step === 2 &&
                    (conflict ||
                      !!Object.keys(preview.errors).length ||
                      loading ||
                      !!loadError))
                }
                className={`${buttonClass} flex-1 border-blue-700 bg-blue-700 text-white`}
              >
                {isSaving
                  ? "Menyimpan..."
                  : step < 2
                    ? "Berikutnya"
                    : targetMode === "new"
                      ? "Buat grup stok"
                      : "Gabungkan ke grup stok"}
              </button>
            </footer>
          </>
        )}
      </div>
    </dialog>
  );
}

export const BulkStockGroupDrawer: React.FC<BulkStockGroupDrawerProps> = ({
  open,
  ...props
}) => (open ? <CreationDialog {...props} /> : null);
export default BulkStockGroupDrawer;
