import type {
  AssistantClientAction,
  AssistantExportFormat,
  AssistantModalId,
  AssistantReportPeriod,
} from "../types/assistant";

const PENDING_MODAL_ACTION_KEY = "pos:assistant:pending-modal-action";

export const ASSISTANT_OPEN_MODAL_EVENT = "pos:assistant-open-modal";

export interface AssistantActionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): unknown;
  removeItem(key: string): unknown;
}

interface AssistantClientActionRuntime {
  currentPath: string;
  dispatchModal(modal: AssistantModalId): void;
  navigate(route: string): void;
  storage: AssistantActionStorage;
  exportFinancialReport(
    period: AssistantReportPeriod,
    format: AssistantExportFormat,
  ): Promise<unknown>;
  exportCustomerRecap(
    period: AssistantReportPeriod,
    format: AssistantExportFormat,
  ): Promise<unknown>;
}

function normalizePath(path: string) {
  const normalized = path.split("?")[0]?.replace(/\/$/, "") || "/";
  return normalized || "/";
}

function isModalAction(value: unknown): value is Extract<AssistantClientAction, { kind: "open_modal" }> {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Extract<AssistantClientAction, { kind: "open_modal" }>>;
  return candidate.kind === "open_modal"
    && typeof candidate.modal === "string"
    && typeof candidate.route === "string";
}

export async function executeAssistantClientAction(
  action: AssistantClientAction,
  runtime: AssistantClientActionRuntime,
): Promise<string> {
  if (action.kind === "open_modal") {
    if (normalizePath(runtime.currentPath) === normalizePath(action.route)) {
      runtime.dispatchModal(action.modal);
      return "Form berhasil dibuka";
    }

    runtime.storage.setItem(PENDING_MODAL_ACTION_KEY, JSON.stringify(action));
    runtime.navigate(action.route);
    return "Membuka halaman dan form yang diminta";
  }

  if (action.kind === "export_financial_report") {
    await runtime.exportFinancialReport(action.period, action.format);
    return "File laporan keuangan berhasil disiapkan";
  }

  await runtime.exportCustomerRecap(action.period, action.format);
  return "File rekap pelanggan berhasil disiapkan";
}

export function consumePendingAssistantModalAction({
  route,
  modal,
  storage,
}: {
  route: string;
  modal: AssistantModalId;
  storage: AssistantActionStorage;
}): Extract<AssistantClientAction, { kind: "open_modal" }> | null {
  const serialized = storage.getItem(PENDING_MODAL_ACTION_KEY);
  if (!serialized) return null;

  try {
    const parsed = JSON.parse(serialized) as unknown;
    if (
      !isModalAction(parsed)
      || parsed.modal !== modal
      || normalizePath(parsed.route) !== normalizePath(route)
    ) {
      return null;
    }
    storage.removeItem(PENDING_MODAL_ACTION_KEY);
    return parsed;
  } catch {
    storage.removeItem(PENDING_MODAL_ACTION_KEY);
    return null;
  }
}
