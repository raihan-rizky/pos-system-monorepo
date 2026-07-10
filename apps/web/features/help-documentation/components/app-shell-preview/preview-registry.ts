import type { HelpStepVisual } from "../help-visual-registry";
import type { PreviewRenderer } from "./types";
import { AssistantPreview } from "./pages/AssistantPreview";
import { CustomersPreview } from "./pages/CustomersPreview";
import { FinancePreview } from "./pages/FinancePreview";
import { HistoryPreview } from "./pages/HistoryPreview";
import { InventoryPreview } from "./pages/InventoryPreview";
import { PosPreview } from "./pages/PosPreview";
import { ProductionPreview } from "./pages/ProductionPreview";
import { ProductsPreview } from "./pages/ProductsPreview";
import { SalespersonsPreview } from "./pages/SalespersonsPreview";
import { SettingsPreview } from "./pages/SettingsPreview";
import { ShiftPreview } from "./pages/ShiftPreview";
import { SuppliersPreview } from "./pages/SuppliersPreview";

export const PREVIEW_RENDERERS: Record<HelpStepVisual["page"], PreviewRenderer> = {
  settings: SettingsPreview,
  history: HistoryPreview,
  pos: PosPreview,
  products: ProductsPreview,
  inventory: InventoryPreview,
  suppliers: SuppliersPreview,
  customers: CustomersPreview,
  finance: FinancePreview,
  shift: ShiftPreview,
  production: ProductionPreview,
  salespersons: SalespersonsPreview,
  assistant: AssistantPreview,
};

const settingsState = (target: string) => {
  if (target === "settings-whatsapp-tab") return "settings-whatsapp";
  if ([
    "settings-rbac-tab",
    "settings-rbac-summary",
    "settings-rbac-matrix",
    "settings-permission-checkbox",
    "settings-review-save",
    "settings-save",
  ].includes(target)) return "settings-rbac";
  return "settings-store";
};

const historyState = (target: string) => {
  if (target === "history-detail-panel") return "history-detail";
  if (target === "history-approval-actions") return "history-approval";
  if ([
    "history-action-menu",
    "history-print-button",
    "history-surat-jalan-action",
    "history-invoice-date-action",
    "history-upload-proof",
    "history-debt-payment",
  ].includes(target)) return "history-action-menu";
  return "history-list";
};

const productsState = (target: string) => {
  if (target === "products-import") return "products-import-menu";
  if (target === "products-special-price-tab") return "products-special-prices";
  if (target === "products-stock-group-tab") return "products-group-activity";
  if (target === "products-price-history-tab") return "products-price-history";
  if (target === "products-price-action") return "products-price-modal";
  if (target === "products-edit-action") return "products-edit-drawer";
  return "products-catalog";
};

const inventoryState = (target: string) => {
  if (target === "inventory-update-stock") return "inventory-update-modal";
  if (target === "inventory-damaged") return "inventory-damaged-modal";
  if (target === "inventory-weekly-proof") return "inventory-weekly-proof-modal";
  if (target === "inventory-matching") return "inventory-matching-modal";
  if (target === "inventory-tasks") return "inventory-tasks";
  if (target === "inventory-inbound") return "inventory-inbound";
  if (target === "inventory-stock-log-tab") return "inventory-stock-log";
  if (target === "inventory-approval-actions") return "inventory-approval";
  if (target === "inventory-out-log") return "inventory-out-log";
  if (target === "inventory-correction") return "inventory-correction";
  if (target === "inventory-surat-jalan") return "inventory-surat-jalan";
  return "inventory-summary";
};

const suppliersState = (target: string) => {
  if (target === "suppliers-add") return "suppliers-form-open";
  if (["suppliers-create-request", "suppliers-add-products", "suppliers-request-quantity"].includes(target)) return "suppliers-request-open";
  if (target === "suppliers-approve") return "suppliers-approve-open";
  if (target === "suppliers-shopping-tab") return "suppliers-shopping";
  return "suppliers-list";
};

const customersState = (target: string) => {
  if (target === "customers-add") return "customers-add-modal";
  if (target === "customers-filter-debt" || target === "customers-debt-tab") return "customers-debt";
  if (target === "customers-profile") return "customers-profile";
  if (target === "customers-history-tab") return "customers-history";
  if (target === "customers-pay-debt") return "customers-payment-open";
  return "customers-list";
};

const financeState = (target: string) => {
  if (["finance-date-filter", "finance-export"].includes(target)) return "finance-report";
  if (["finance-expense-create", "finance-expense-form", "finance-proof-url", "finance-save"].includes(target)) return "finance-expense-form-open";
  return "finance-cash-flow";
};

const shiftState = (target: string) => {
  if (["shift-open", "shift-opening-cash"].includes(target)) return "shift-open-modal";
  if (["shift-close", "shift-closing-cash"].includes(target)) return "shift-close-modal";
  if (target === "shift-edit") return "shift-edit-modal";
  return "shift-history";
};

const productionState = (target: string) => target === "production-whatsapp"
  ? "production-whatsapp-confirm"
  : "production-board";

const salespersonsState = (target: string) => {
  if (target === "salespersons-add") return "salespersons-add-modal";
  if (target === "salespersons-detail") return "salespersons-detail-open";
  return "salespersons-list";
};

const assistantState = (target: string) => target === "assistant-button"
  ? "assistant-closed"
  : "assistant-open";

const STATE_RESOLVERS: Record<HelpStepVisual["page"], (target: string) => string> = {
  settings: settingsState,
  history: historyState,
  pos: (target) => ["pos-payment-modal", "pos-payment-method", "pos-invoice-date", "pos-print"].includes(target) ? "pos-payment" : "pos-catalog",
  products: productsState,
  inventory: inventoryState,
  suppliers: suppliersState,
  customers: customersState,
  finance: financeState,
  shift: shiftState,
  production: productionState,
  salespersons: salespersonsState,
  assistant: assistantState,
};

export function resolvePreviewState(page: HelpStepVisual["page"], target: string) {
  return STATE_RESOLVERS[page](target);
}

