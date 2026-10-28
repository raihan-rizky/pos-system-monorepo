"use client";

import React, { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { QueryErrorResetBoundary, useQueryClient } from "@tanstack/react-query";
import { ErrorBoundary } from "react-error-boundary";
import type { StockGroupDetail, StockInputMode } from "../api/stock-group-api";
import { fetchStockGroupDetail, StockGroupMutationError } from "../api/stock-group-api";
import {
  stockGroupDetailKey,
  useSuspenseStockGroupDetail,
  useUpdateSharedStock,
  useUpdateConversionRate,
  useUpdateVariantPrice,
  useAddVariant,
} from "../hooks/useStockGroup";
import {
  additionResult,
  conversionResult,
  conversionHasChanges,
  parseNumber,
  priceValid,
  quantitiesEqual,
  type PriceDraft,
} from "../workspace-drafts";
import {
  SummaryPanel,
  ConversionPanel,
  PricingPanel,
  AdditionPanel,
} from "./WorkspacePanels";
import type { PriceRoundingSettings } from "@/features/product-price-rounding/rounding";
import { DEFAULT_PRICE_ROUNDING_SETTINGS } from "@/features/product-price-rounding/rounding";
import { usePriceRoundingSettings } from "@/features/product-price-rounding/hooks/usePriceRoundingSettings";
import { GroupPricingPanel } from "./GroupPricingPanel";
import { invalidatePricingQueries } from "../invalidate-pricing-queries";
import { StockGroupHistory } from "./StockGroupHistory";

export type StockGroupSaveReason =
  "shared-stock" | "conversion-rate" | "variant-price" | "variant-added";
type WorkspaceTab =
  "summary" | "unitManagement" | "pricing" | "newVariant" | "history";
export interface StockGroupWorkspaceContentProps {
  roundingSettings?: PriceRoundingSettings;
  onPricingApplied?: () => void | Promise<void>;
  onPricingDirtyChange?: (dirty: boolean) => void;
  onPricingBusyChange?: (busy: boolean) => void;
  detail: StockGroupDetail;
  canUpdateStock: boolean;
  canUpdateProducts?: boolean;
  canCreateProducts?: boolean;
  canRequestStockChange?: boolean;
  onInventoryNavigate?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
  sharedStock: string;
  stockInputMode: StockInputMode;
  stockVariantProductId: string;
  note: string;
  isSaving: boolean;
  unitActionsBlocked?: boolean;
  savingMessage?: string | null;
  successMessage?: string | null;
  onClose: () => void;
  onSharedStockChange: (value: string) => void;
  onStockInputModeChange: (value: StockInputMode) => void;
  onStockVariantProductIdChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  onSaveSharedStock: () => void;
  activeTab?: WorkspaceTab;
  onActiveTabChange?: (tab: WorkspaceTab) => void;
  conversionDraft?: {
    editMode: "PAIR" | "DIRECT";
    baseProductId: string;
    fromProductId: string;
    fromQuantity: string;
    toProductId: string;
    toQuantity: string;
    mode: "KEEP_SHARED_STOCK" | "PRESERVE_SOURCE_STOCK";
    directMultipliers: Record<string, string>;
    directMultipliersEdited?: boolean;
  };
  onConversionDraftChange?: (
    draft: StockGroupWorkspaceContentProps["conversionDraft"],
  ) => void;
  onSaveConversion?: () => void;
  priceDrafts?: Record<string, PriceDraft>;
  onPriceDraftChange?: (productId: string, draft: PriceDraft) => void;
  onSavePrice?: (productId: string) => void;
  newVariantDraft?: {
    pricingMode?: "AUTO" | "MANUAL";
    adjustment?: "none" | "discount" | "markup";
    percent?: string;
    unit: string;
    price: string;
    costPrice: string;
    stock: string;
    minStock: string;
    conversionFromQuantity: string;
    conversionToProductId: string;
    conversionToQuantity: string;
    note: string;
  };
  onNewVariantDraftChange?: (
    draft: StockGroupWorkspaceContentProps["newVariantDraft"],
  ) => void;
  onAddVariant?: () => void;
  statuses?: Record<string, { error?: string; success?: string }>;
  stockChanged?: boolean;
  conversionChanged?: boolean;
  priceChanged?: Record<string, boolean>;
}
export function buildUnitManagementDraft(
  detail: StockGroupDetail,
): NonNullable<StockGroupWorkspaceContentProps["conversionDraft"]> {
  const first = detail.variants[0]?.id ?? "",
    second = detail.variants[1]?.id ?? first;
  const baseProductId =
    detail.variants.find(
      (v) =>
        v.unit.trim().toLowerCase() === detail.baseUnit.trim().toLowerCase(),
    )?.id ?? first;
  const pair = detail.conversionPairs?.[0];
  return {
    editMode: "PAIR",
    baseProductId,
    fromProductId: pair?.fromProductId ?? second,
    fromQuantity: String(pair?.fromQuantity ?? 1),
    toProductId: pair?.toProductId ?? baseProductId,
    toQuantity: String(
      pair?.toQuantity ??
        detail.variants.find((v) => v.id === second)?.unitMultiplierToBase ??
        1,
    ),
    mode: "KEEP_SHARED_STOCK",
    directMultipliers: Object.fromEntries(
      detail.variants.map((v) => [v.id, String(v.unitMultiplierToBase)]),
    ),
  };
}
const tabs: { id: WorkspaceTab; label: string }[] = [
  { id: "summary", label: "Ringkasan" },
  { id: "unitManagement", label: "Satuan" },
  { id: "pricing", label: "Harga" },
  { id: "newVariant", label: "Tambah satuan" },
  { id: "history", label: "Riwayat" },
];

export function StockGroupWorkspaceContent(
  props: StockGroupWorkspaceContentProps,
) {
  const activeTab = props.activeTab ?? "summary";
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [stockEditorOpen, setStockEditorOpen] = useState(false);
  const tabId = `stock-group-${props.detail.id}`;
  return (
    <div className="flex max-h-[90dvh] min-h-0 w-full flex-col overflow-hidden rounded-2xl bg-white text-slate-900">
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-4 py-4 sm:px-6">
        <div className="min-w-0">
          <h2 id={`${tabId}-title`} className="break-words text-lg font-bold">
            {props.detail.displayName}
          </h2>
          <p className="mt-1 text-sm text-slate-700">
            Stok bersama:{" "}
            <strong>
              {props.detail.baseStock} {props.detail.baseUnit}
            </strong>{" "}
            • {props.detail.variants.length} satuan
          </p>
        </div>
        <button
          type="button"
          onClick={props.onClose}
          aria-label="Tutup"
          className="min-h-11 min-w-11 shrink-0 rounded-xl border border-slate-300 px-3 font-semibold focus-visible:outline-blue-600"
        >
          ✕
        </button>
      </header>
      <div
        role="tablist"
        aria-label="Pengelola grup stok"
        className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-200 px-4 py-2 sm:px-6"
      >
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            ref={(el) => {
              tabRefs.current[index] = el;
            }}
            type="button"
            role="tab"
            id={`${tabId}-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls={`${tabId}-panel`}
            tabIndex={activeTab === tab.id ? 0 : -1}
            className={`min-h-11 shrink-0 rounded-lg px-3 text-sm font-semibold focus-visible:outline-blue-600 ${activeTab === tab.id ? "bg-blue-700 text-white" : "text-slate-700 hover:bg-slate-100"}`}
            onClick={() => props.onActiveTabChange?.(tab.id)}
            onKeyDown={(event) => {
              const next =
                event.key === "ArrowRight"
                  ? (index + 1) % tabs.length
                  : event.key === "ArrowLeft"
                    ? (index + tabs.length - 1) % tabs.length
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? tabs.length - 1
                        : null;
              if (next !== null) {
                event.preventDefault();
                props.onActiveTabChange?.(tabs[next].id);
                tabRefs.current[next]?.focus();
              }
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${tabId}-panel`}
        aria-labelledby={`${tabId}-${activeTab}`}
        className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6"
      >
        {props.savingMessage && (
          <p
            role="status"
            className="mb-4 rounded-xl bg-blue-50 p-3 text-sm text-blue-900"
          >
            {props.savingMessage}
          </p>
        )}
        {props.successMessage && (
          <p
            role="status"
            className="mb-4 rounded-xl bg-green-50 p-3 text-sm text-green-800"
          >
            {props.successMessage}
          </p>
        )}
        {activeTab === "summary" && (
          <SummaryPanel
            {...props}
            onActiveTabChange={props.onActiveTabChange ? (tab) => {
              props.onActiveTabChange?.(tab);
              tabRefs.current[tabs.findIndex((item) => item.id === tab)]?.focus();
            } : undefined}
            isSaving={props.isSaving || !!props.unitActionsBlocked}
            editorOpen={stockEditorOpen}
            onOpenEditor={() => setStockEditorOpen(true)}
          />
        )}
        {activeTab === "unitManagement" && <ConversionPanel {...props} isSaving={props.isSaving || !!props.unitActionsBlocked} />}
        {props.detail.pricing ? <div hidden={activeTab !== "pricing"}><GroupPricingPanel roundingSettings={props.roundingSettings} detail={props.detail} canUpdate={!!props.canUpdateProducts && !props.isSaving} onApplied={props.onPricingApplied ?? (() => {})} onDirtyChange={props.onPricingDirtyChange} onBusyChange={props.onPricingBusyChange} /></div> : activeTab === "pricing" && <><p className="mb-3 text-sm text-amber-900">Data harga grup belum tersedia. Muat ulang data sebelum mengubah harga.</p><PricingPanel {...props} canUpdateProducts={false} /></>}
        {activeTab === "newVariant" && <AdditionPanel {...props} isSaving={props.isSaving || !!props.unitActionsBlocked} />}
        {activeTab === "history" && (
          <StockGroupHistory groupId={props.detail.id} />
        )}
      </div>
    </div>
  );
}

interface ModalProps {
  initialTab?: WorkspaceTab;
  stockGroupId: string;
  onClose: () => void;
  canUpdateStock: boolean;
  canUpdateProducts?: boolean;
  canCreateProducts?: boolean;
  canRequestStockChange?: boolean;
  onSaved: (reason?: StockGroupSaveReason) => void;
}
export function StockGroupWorkspaceModal(props: ModalProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeRequest = useRef<() => void>(props.onClose);
  useEffect(() => {
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const el = dialog.current;
    el?.showModal();
    return () => {
      el?.close();
      opener?.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      aria-label="Pengelola grup stok"
      onCancel={(event) => {
        event.preventDefault();
        closeRequest.current();
      }}
      className="m-auto max-h-[94dvh] w-[calc(100%_-_1rem)] max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-xl backdrop:bg-slate-950/50"
    >
      <QueryErrorResetBoundary>
        {({ reset }) => (
          <ErrorBoundary
            onReset={reset}
            fallbackRender={({ resetErrorBoundary }) => (
              <div className="space-y-4 p-5">
                <p role="alert" className="text-red-800">
                  Gagal memuat grup stok. Silakan coba lagi.
                </p>
                <button
                  type="button"
                  className="min-h-11 rounded-xl border px-4"
                  onClick={resetErrorBoundary}
                >
                  Coba lagi
                </button>
                <button
                  type="button"
                  className="min-h-11 rounded-xl border px-4"
                  onClick={props.onClose}
                >
                  Tutup
                </button>
              </div>
            )}
          >
            <Suspense
              fallback={
                <div role="status" className="p-5 text-sm text-slate-700">
                  Memuat grup stok...
                </div>
              }
            >
              <StockGroupWorkspaceDataFetcher
                {...props}
                closeRequest={closeRequest}
                dialog={dialog}
              />
            </Suspense>
          </ErrorBoundary>
        )}
      </QueryErrorResetBoundary>
    </dialog>
  );
}
const serialize = (value: unknown) => JSON.stringify(value);
const conversionSnapshot = (draft: NonNullable<StockGroupWorkspaceContentProps["conversionDraft"]>) =>
  serialize({ ...draft, editMode: undefined, directMultipliersEdited: undefined });
function priceDefaults(detail: StockGroupDetail) {
  return Object.fromEntries(
    detail.variants.map((v) => [
      v.id,
      {
        price: String(v.price),
        costPrice: v.costPrice == null ? "" : String(v.costPrice),
        note: "",
      },
    ]),
  );
}
function additionDefaults(
  detail: StockGroupDetail,
): NonNullable<StockGroupWorkspaceContentProps["newVariantDraft"]> {
  return {
    pricingMode: "AUTO",
    adjustment: "none",
    percent: "0",
    unit: "",
    price: "",
    costPrice: "",
    stock: "0",
    minStock: "5",
    conversionFromQuantity: "1",
    conversionToProductId: detail.variants[0]?.id ?? "",
    conversionToQuantity: "1",
    note: "",
  };
}

function StockGroupWorkspaceDataFetcher({
  stockGroupId,
  initialTab = "summary",
  onClose,
  canUpdateStock,
  canUpdateProducts = false,
  canCreateProducts = false,
  canRequestStockChange = false,
  onSaved,
  closeRequest,
  dialog,
}: ModalProps & {
  closeRequest: React.MutableRefObject<() => void>;
  dialog: React.RefObject<HTMLDialogElement | null>;
}) {
  const { data: roundingSettings = DEFAULT_PRICE_ROUNDING_SETTINGS } = usePriceRoundingSettings();
  const { data: detail } = useSuspenseStockGroupDetail(stockGroupId);
  const detailContext = useRef(detail);
  const queryClient = useQueryClient();
  const [sharedStock, setSharedStock] = useState(String(detail.baseStock)),
    [stockInputMode, setStockInputMode] = useState<StockInputMode>("BASE"),
    [stockVariantProductId, setStockVariantProductId] = useState(
      detail.variants[0]?.id ?? "",
    ),
    [note, setNote] = useState("");
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(initialTab);
  const [conversionDraft, setConversionDraft] = useState(() =>
    buildUnitManagementDraft(detail),
  );
  const [priceDrafts, setPriceDrafts] = useState<Record<string, PriceDraft>>(
    () => priceDefaults(detail),
  );
  const [newVariantDraft, setNewVariantDraft] = useState(() =>
    additionDefaults(detail),
  );
  const [snapshots, setSnapshots] = useState(() => ({
    stock: detail.baseStock,
    conversion: conversionSnapshot(buildUnitManagementDraft(detail)),
    prices: priceDefaults(detail),
    addition: serialize(additionDefaults(detail)),
  }));
  const [statuses, setStatuses] = useState<
    NonNullable<StockGroupWorkspaceContentProps["statuses"]>
  >({});
  const [saving, setSaving] = useState<string | null>(null),
    [unitRefresh, setUnitRefresh] = useState<"pending" | "failed" | "ready" | null>(null),
    [conflict, setConflict] = useState(false),
    [decision, setDecision] = useState<"close" | "reload" | "inventory" | null>(null);
  const saveLock = useRef(false),
    pricingLock = useRef(false),
    unitRefreshRequired = useRef(false),
    confirmation = useRef<HTMLDialogElement>(null);
  const stockMut = useUpdateSharedStock(stockGroupId),
    conversionMut = useUpdateConversionRate(stockGroupId),
    priceMut = useUpdateVariantPrice(stockGroupId),
    addMut = useAddVariant(stockGroupId);
  useEffect(() => () => {
    if (unitRefreshRequired.current) {
      queryClient.removeQueries({ queryKey: stockGroupDetailKey(stockGroupId), exact: true });
    }
  }, [queryClient, stockGroupId]);
  const stockMultiplier =
    stockInputMode === "BASE"
      ? 1
      : (detail.variants.find((v) => v.id === stockVariantProductId)
          ?.unitMultiplierToBase ?? NaN);
  const stockBase =
    parseNumber(sharedStock) === null
      ? null
      : Number(sharedStock) * stockMultiplier;
  const stockChanged = stockBase === null || !quantitiesEqual(stockBase, snapshots.stock);
  const conversionDirty = conversionSnapshot(conversionDraft) !== snapshots.conversion;
  const conversionChanged = conversionDirty && conversionHasChanges(detail, conversionDraft);
  const priceChanged = Object.fromEntries(
    Object.entries(priceDrafts).map(([id, draft]) => [
      id,
      serialize(draft) !== serialize(snapshots.prices[id]),
    ]),
  );
  const [pricingDirty, setPricingDirty] = useState(false);
  const [pricingBusy, setPricingBusy] = useState(false);
  const handlePricingBusyChange = useCallback((busy: boolean) => {
    pricingLock.current = busy;
    setPricingBusy(busy);
  }, []);
  const dirty =
    pricingDirty || stockChanged ||
    !!note.trim() ||
    conversionDirty ||
    Object.values(priceChanged).some(Boolean) ||
    serialize(newVariantDraft) !== snapshots.addition;

  useEffect(() => {
    if (dialog.current)
      dialog.current.setAttribute(
        "aria-label",
        `Grup stok ${detail.displayName}`,
      );
    const previous = detailContext.current;
    if (previous === detail) {
      if (unitRefresh === "ready") {
        unitRefreshRequired.current = false;
        setUnitRefresh(null);
      }
      return;
    }
    detailContext.current = detail;
    const stockContextChanged = previous.baseUnit !== detail.baseUnit ||
      previous.baseStock !== detail.baseStock ||
      previous.variants.some((v) => v.unitMultiplierToBase !== detail.variants.find((next) => next.id === v.id)?.unitMultiplierToBase);
    if (stockContextChanged) {
      const oldMultiplier = stockInputMode === "BASE" ? 1 : previous.variants.find((v) => v.id === stockVariantProductId)?.unitMultiplierToBase ?? NaN;
      const amount = parseNumber(sharedStock);
      const oldBaseAmount = amount === null ? null : amount * oldMultiplier;
      const newBaseInOldUnits = previous.variants.find((v) => v.unit.trim().toLowerCase() === detail.baseUnit.trim().toLowerCase())?.unitMultiplierToBase ?? NaN;
      const selected = detail.variants.find((v) => v.id === stockVariantProductId);
      const nextMode = stockInputMode === "VARIANT" && selected && selected.unit.trim().toLowerCase() !== detail.baseUnit.trim().toLowerCase() ? "VARIANT" : "BASE";
      const nextMultiplier = nextMode === "BASE" ? 1 : selected!.unitMultiplierToBase;
      const nextBaseAmount = oldBaseAmount !== null && quantitiesEqual(oldBaseAmount, snapshots.stock)
        ? detail.baseStock
        : oldBaseAmount === null ? null : oldBaseAmount / newBaseInOldUnits;
      if (nextBaseAmount !== null) setSharedStock(Number.isFinite(nextBaseAmount / nextMultiplier) ? String(nextBaseAmount / nextMultiplier) : "");
      setStockInputMode(nextMode);
      setSnapshots((current) => ({ ...current, stock: detail.baseStock }));
    }
    // A newly added unit receives defaults; existing drafts survive detail refreshes.
    const defaults = priceDefaults(detail);
    setPriceDrafts((current) => ({ ...defaults, ...current }));
    setSnapshots((current) => ({
      ...current,
      prices: { ...defaults, ...current.prices },
    }));
    if (unitRefresh === "ready") {
      unitRefreshRequired.current = false;
      setUnitRefresh(null);
    }
  }, [detail, dialog, sharedStock, snapshots.stock, stockInputMode, stockVariantProductId, unitRefresh]);
  useEffect(() => {
    closeRequest.current = () => {
      if (!saveLock.current && !pricingLock.current) {
        if (dirty) setDecision("close");
        else onClose();
      }
    };
  }, [closeRequest, dirty, onClose]);
  useEffect(() => {
    if (decision) confirmation.current?.showModal();
    else confirmation.current?.close();
  }, [decision]);

  async function save(
    section: string,
    reason: StockGroupSaveReason,
    mutate: () => Promise<unknown>,
    acknowledge: () => void,
  ) {
    if (saveLock.current || pricingLock.current || conflict || (unitRefreshRequired.current && reason !== "variant-price")) return;
    saveLock.current = true;
    setSaving(section);
    setStatuses((current) => ({ ...current, [section]: {} }));
    try {
      await mutate();
      if (reason === "conversion-rate") unitRefreshRequired.current = true;
      acknowledge();
      onSaved(reason);
      if (reason === "conversion-rate") await refreshUnits();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Gagal menyimpan. Silakan coba lagi.";
      setStatuses((current) => ({ ...current, [section]: { error: message } }));
      if (error instanceof StockGroupMutationError && error.status === 409)
        setConflict(true);
    } finally {
      saveLock.current = false;
      setSaving(null);
    }
  }
  async function refreshUnits() {
    setUnitRefresh("pending");
    try {
      await queryClient.fetchQuery({
        queryKey: stockGroupDetailKey(stockGroupId),
        queryFn: () => fetchStockGroupDetail(stockGroupId),
        staleTime: 0,
        retry: false,
      });
      setUnitRefresh("ready");
    } catch {
      setUnitRefresh("failed");
    }
  }
  function success(section: string, message: string) {
    setStatuses((current) => ({ ...current, [section]: { success: message } }));
  }
  function saveSharedStock() {
    if (
      !canUpdateStock ||
      stockBase === null ||
      !Number.isFinite(stockBase) ||
      !stockChanged
    )
      return;
    const submittedBase = stockBase;
    void save(
      "stock",
      "shared-stock",
      () =>
        stockMut.mutateAsync({
          sharedStock: Number(sharedStock),
          stockInput:
            stockInputMode === "BASE"
              ? { mode: "BASE" }
              : { mode: "VARIANT", variantProductId: stockVariantProductId },
          note: note.trim() || undefined,
        }),
      () => {
        setSnapshots((current) => ({ ...current, stock: submittedBase }));
        setNote("");
        success("stock", "Stok akhir tersimpan");
      },
    );
  }
  function saveConversion() {
    const result = conversionResult(detail, conversionDraft);
    if (!canUpdateProducts || !conversionChanged || !result.payload) return;
    const submitted = {
      ...conversionDraft,
      directMultipliers: Object.fromEntries(result.resolved!.variants.map((v) => [v.id, String(v.unitMultiplierToBase)])),
      directMultipliersEdited: false,
    };
    void save(
      "conversion",
      "conversion-rate",
      () => conversionMut.mutateAsync(result.payload!),
      () => {
        setConversionDraft(submitted);
        setSnapshots((current) => ({ ...current, conversion: conversionSnapshot(submitted) }));
        success("conversion", "Konversi satuan tersimpan");
      },
    );
  }
  function savePrice(productId: string) {
    const draft = priceDrafts[productId];
    if (
      !canUpdateProducts ||
      !draft ||
      !priceValid(draft) ||
      !priceChanged[productId]
    )
      return;
    const submitted = { ...draft, note: "" };
    void save(
      `price-${productId}`,
      "variant-price",
      () =>
        priceMut.mutateAsync({
          productId,
          payload: {
            price: Number(draft.price),
            costPrice: draft.costPrice.trim() ? Number(draft.costPrice) : null,
            priceChangeNote: draft.note.trim() || undefined,
          },
        }),
      () => {
        setPriceDrafts((current) => ({ ...current, [productId]: submitted }));
        setSnapshots((current) => ({
          ...current,
          prices: { ...current.prices, [productId]: submitted },
        }));
        success(
          `price-${productId}`,
          `Harga ${detail.variants.find((v) => v.id === productId)?.unit ?? "satuan"} tersimpan`,
        );
      },
    );
  }
  function handleAddVariant() {
    const result = additionResult(detail, newVariantDraft);
    if (!canCreateProducts || !result.payload) return;
    void save(
      "addition",
      "variant-added",
      () => addMut.mutateAsync(result.payload!),
      () => {
        const fresh = additionDefaults(detail);
        setNewVariantDraft(fresh);
        setSnapshots((current) => ({ ...current, addition: serialize(fresh) }));
        success("addition", "Satuan baru tersimpan");
      },
    );
  }
  async function reload() {
    if (saveLock.current || pricingLock.current) return;
    setDecision(null);
    saveLock.current = true;
    setSaving("reload");
    try {
      const next = await fetchStockGroupDetail(stockGroupId);
      detailContext.current = next;
      queryClient.setQueryData(stockGroupDetailKey(stockGroupId), next);
      const prices = priceDefaults(next),
        conversion = buildUnitManagementDraft(next),
        addition = additionDefaults(next);
      setSharedStock(String(next.baseStock));
      setStockInputMode("BASE");
      setStockVariantProductId(next.variants[0]?.id ?? "");
      setNote("");
      setPriceDrafts(prices);
      setConversionDraft(conversion);
      setNewVariantDraft(addition);
      setSnapshots({
        stock: next.baseStock,
        prices,
        conversion: conversionSnapshot(conversion),
        addition: serialize(addition),
      });
      setStatuses({});
      setConflict(false);
    } catch (error) {
      setStatuses((current) => ({
        ...current,
        reload: {
          error: error instanceof Error ? error.message : "Gagal memuat ulang.",
        },
      }));
    } finally {
      saveLock.current = false;
      setSaving(null);
    }
  }
  return (
    <div className="flex max-h-[90dvh] min-h-0 flex-col">
      {unitRefresh && (
        <div role={unitRefresh === "failed" ? "alert" : "status"} className="space-y-2 bg-amber-50 p-4 text-sm text-amber-900">
          {unitRefresh === "failed" ? (
            <>
              <p>Konversi tersimpan, tetapi data satuan terbaru belum berhasil dimuat. Draft Anda tetap disimpan. Aksi stok dan satuan menunggu data terbaru.</p>
              <button type="button" className="min-h-11 rounded-xl border border-amber-500 px-4 font-semibold" onClick={() => void refreshUnits()}>
                Coba muat ulang satuan
              </button>
            </>
          ) : <p>Memuat data satuan terbaru...</p>}
        </div>
      )}
      {conflict && (
        <div
          role="alert"
          className="space-y-2 bg-amber-50 p-4 text-sm text-amber-900"
        >
          <p>
            Data grup berubah. Draft Anda tetap disimpan. Muat ulang untuk
            memeriksa data terbaru.
          </p>
          <button
            type="button"
            className="min-h-11 rounded-xl border border-amber-500 px-4 font-semibold"
            disabled={!!saving}
            onClick={() => setDecision("reload")}
          >
            Muat ulang data
          </button>
        </div>
      )}
      {statuses.reload?.error && (
        <p role="alert" className="p-4 text-red-800">
          {statuses.reload.error}
        </p>
      )}
      <StockGroupWorkspaceContent
        roundingSettings={roundingSettings}
        detail={detail}
        onPricingDirtyChange={setPricingDirty}
        onPricingBusyChange={handlePricingBusyChange}
        onPricingApplied={async () => { await invalidatePricingQueries(queryClient); onSaved("variant-price"); }}
        canUpdateStock={canUpdateStock}
        canUpdateProducts={canUpdateProducts}
        canCreateProducts={canCreateProducts}
        canRequestStockChange={canRequestStockChange}
        onInventoryNavigate={(event) => {
          if (saveLock.current || pricingLock.current || dirty) {
            event.preventDefault();
            if (!saveLock.current && !pricingLock.current) setDecision("inventory");
          }
        }}
        sharedStock={sharedStock}
        stockInputMode={stockInputMode}
        stockVariantProductId={stockVariantProductId}
        note={note}
        isSaving={!!saving || pricingBusy || conflict}
        unitActionsBlocked={unitRefresh !== null}
        savingMessage={saving ? "Menyimpan perubahan..." : null}
        onClose={() => closeRequest.current()}
        onSharedStockChange={setSharedStock}
        onStockInputModeChange={setStockInputMode}
        onStockVariantProductIdChange={setStockVariantProductId}
        onNoteChange={setNote}
        onSaveSharedStock={saveSharedStock}
        activeTab={activeTab}
        onActiveTabChange={setActiveTab}
        conversionDraft={conversionDraft}
        onConversionDraftChange={(draft) => {
          if (draft) setConversionDraft(draft);
        }}
        onSaveConversion={saveConversion}
        priceDrafts={priceDrafts}
        onPriceDraftChange={(id, draft) =>
          setPriceDrafts((current) => ({ ...current, [id]: draft }))
        }
        onSavePrice={savePrice}
        newVariantDraft={newVariantDraft}
        onNewVariantDraftChange={(draft) => {
          if (draft) setNewVariantDraft(draft);
        }}
        onAddVariant={handleAddVariant}
        statuses={statuses}
        stockChanged={stockChanged}
        conversionChanged={conversionChanged}
        priceChanged={priceChanged}
      />
      <dialog
        ref={confirmation}
        aria-label={
          decision === "reload"
            ? "Muat ulang dan buang draft?"
            : "Buang perubahan?"
        }
        onCancel={(event) => {
          event.preventDefault();
          setDecision(null);
        }}
        className="m-auto w-[calc(100%_-_2rem)] max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl backdrop:bg-slate-950/50"
      >
        <h3 className="text-lg font-bold text-slate-900">
          {decision === "reload"
            ? "Muat ulang dan buang draft?"
            : "Masih ada perubahan yang belum disimpan"}
        </h3>
        <p className="mt-2 text-sm text-slate-700">
          {decision === "reload"
            ? "Data terbaru akan menggantikan draft yang belum disimpan."
            : decision === "inventory"
              ? "Lanjutkan mengedit atau buang perubahan sebelum membuka Inventori."
              : "Lanjutkan mengedit atau buang perubahan sebelum menutup."}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            autoFocus
            type="button"
            className="min-h-11 rounded-xl border border-slate-300 px-4 font-semibold"
            onClick={() => setDecision(null)}
          >
            Lanjutkan mengedit
          </button>
          <button
            type="button"
            className="min-h-11 rounded-xl bg-blue-700 px-4 font-semibold text-white"
            onClick={() => {
              if (decision === "reload") void reload();
              else if (decision === "inventory") window.location.assign("/inventory");
              else onClose();
            }}
          >
            {decision === "reload"
              ? "Buang draft dan muat ulang"
              : decision === "inventory"
                ? "Buang perubahan dan buka Inventori"
                : "Buang perubahan"}
          </button>
        </div>
      </dialog>
    </div>
  );
}
